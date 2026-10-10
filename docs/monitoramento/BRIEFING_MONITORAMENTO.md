# Sofia OS — Monitoramento de preços: coleta no aparelho

**Restrição definida pelo Pedro:** nenhum registro de aplicativo em loja nenhuma
(sem OAuth do Mercado Livre, sem chave de API). O mecanismo precisa ser geral,
valendo para qualquer loja que o navegador consiga abrir.

Isso elimina o caminho servidor→loja para a maioria dos casos (IP de datacenter
bloqueado, preço renderizado por JavaScript) e deixa um caminho só, que é
justamente o que as extensões de navegador fazem: **ler a página já renderizada,
no aparelho do próprio usuário**.

## O que JÁ existe e não deve ser reescrito

Confirmado lendo o código em `sofia-app-android`:

- Entidade `monitor` no catálogo (`src/core/catalog.js`), tabela `observations`,
  job `monitor` no `Scheduler` (`src/services/scheduler.js`).
- `workspace.observe()` (`src/core/workspace.js`) já valida preço, frete,
  variante/moeda, recusa observação do futuro, deduplica por `source_key`, e
  dispara notificação de oportunidade por: preço-alvo, queda percentual e
  **menor total histórico** (`new_low`).
- `api.observe(id, input)` e `api.observations(id)` já existem em
  `SOFIA_APP/src/lib/api.ts`.
- `PriceWidget`, `PricePlot` e `priceGeometry` já desenham o gráfico cartesiano
  tempo × preço, com escala automática ou faixa manual.
- `StoreComparison` (`SOFIA_APP/src/components/DashboardWidgets.tsx`) já compara
  lojas: ordena da mais barata, gráfico por loja, link clicável, e marca com
  "★ Principal" a loja igual a `monitor.data.preferred_url`.

**Não refazer nada disso.** A feature está quase pronta na interface.

## Os três buracos reais

### 1. O backend não conhece dois campos que o app já usa

`preferred_url` e `line_color` aparecem no código do app mas NÃO existem na
definição do kind `monitor` em `src/core/catalog.js`. Os campos atuais são:
`target_id, variant, currency, target_price, drop_percent, new_low, method,
feed_url, price_path, variant_path, currency_path, shipping_path,
interval_minutes, consent`.

Adicionar ao catálogo:
- `preferred_url` (url) — a loja principal, o link que o usuário colou primeiro.
- `line_color` (text) — cor da linha no gráfico, opcional.
- `source_urls` (textarea, uma URL por linha) — as demais lojas do mesmo produto.

### 2. Não existe leitura de página de loja

Entra o extrator anexado: `extract-price.js` (+ `extract-price.test.js`,
11 testes passando com jsdom).

Ele roda **dentro da WebView**, sobre o documento já renderizado. Lê, nessa
ordem: JSON-LD `schema.org/Offer` (inclusive dentro de `@graph`), microdata
`itemprop`, meta `product:price:amount`/`og:price:amount` e, só se nada
estruturado existir, texto visível com confiança baixa.

Retorna `{found, needsConfirmation, best, candidates}`. A regra central:
**nunca registra sozinho quando duas fontes discordam ou quando a leitura é
palpite**. Nesse caso o app mostra os candidatos e o usuário escolhe. Depois da
primeira confirmação, guardar a origem escolhida (`origin`) no monitor e reusar
para aquela loja nas próximas consultas.

Dependência nova: `react-native-webview` (instalar com `expo install`, não com
npm direto). É dependência nativa, exige prebuild. A WebView fica invisível,
carrega a URL, roda o extrator por `injectedJavaScript`, devolve o resultado por
`onMessage` e é desmontada. Nunca deixar a WebView montada em tela visível.

### 3. A coleta precisa ser disparada

Hoje o `Scheduler` só consulta `feed_url` (singular, só JSON). Mantê-lo como
está — ele continua servindo para quem tiver um feed JSON legítimo.

Acrescentar a coleta pelo aparelho: quando o app abre e a Home já está visível
(nunca antes, para não competir com a abertura), percorrer os monitores ativos,
visitar `preferred_url` + `source_urls` numa WebView invisível, uma de cada vez,
e chamar `api.observe()` para cada preço lido com sucesso.

Limitar: no máximo uma coleta por monitor a cada `interval_minutes`, sequencial,
nunca em paralelo, e abortar tudo se o usuário sair da Home.

## Busca de outras lojas com confirmação do usuário (decidido com o Pedro)

Decisão explícita do Pedro: **sem registrar aplicativo em nenhuma loja**
(nada de OAuth do Mercado Livre nem chave de API). Então a busca por outras
lojas do mesmo produto também roda pelo aparelho, em WebView, igual à leitura
de preço — nunca por API de parceiro.

Entra `find-store-links.js` (+ `find-store-links.test.js`, 8 testes passando):
dado o documento de uma página de resultados de busca já carregada e um
domínio-alvo, devolve links que apontam pra esse domínio, filtrando ruído
óbvio (login, carrinho, ajuda, categoria rasa) e nunca oferecendo a própria
loja de origem como "outra loja". Também extrai o título do produto a partir
do JSON-LD (mais confiável que o `<title>` da aba, que geralmente é o nome da
loja) e um `slugify()` para montar URL de busca.

**Fluxo de adicionar produto:**
1. Usuário cola o link da loja principal.
2. WebView lê preço (`extract-price.js`) e título (`productTitle`).
3. Para cada loja em `source_urls` candidatas (lista abaixo), abrir a URL de
   busca interna daquela loja com o título extraído, numa WebView invisível.
4. Rodar `findStoreLinks` sobre o resultado, mostrar os candidatos numa tela
   simples: nome do link + loja, com imagem se o `<a>` tiver `img[alt]`.
5. **Usuário marca quais são o mesmo produto.** Sem seleção, sem pré-marcar
   "o primeiro resultado" como certo — a tela não assume nada.
6. Os confirmados viram `source_urls` do monitor; o link original continua
   sendo `preferred_url`.

**Padrões de URL de busca interna — confirmar cada um testando de verdade,
não assumir que está certo:**

| Loja | Padrão (a validar) | Confiança |
|---|---|---|
| Kabum | `kabum.com.br/busca/<slug>` | Confirmado (documentação pública de scraper) |
| Mercado Livre | `lista.mercadolivre.com.br/<slug>` | Alta, mas validar — ML muda estrutura com frequência |
| Pichau | `pichau.com.br/busca?q=<termo>` ou `/search?q=` | Não confirmado |
| AliExpress | `aliexpress.com/wholesale?SearchText=<termo>` | Não confirmado, e provavelmente bloqueia WebView automatizada |
| Shopee | busca costuma depender de JS pesado, sem URL simples | Não confirmado, risco alto de não funcionar |

Se a URL de busca de uma loja não existir ou não funcionar, usar como
alternativa um motor de busca geral restrito ao domínio (`site:dominio.com.br
<termo>`) e aplicar `findStoreLinks` do mesmo jeito — o extrator não depende
de qual página carregou, só do HTML renderizado.

## Ordem de implementação sugerida

1. Campos novos no catálogo (`preferred_url`, `source_urls`, `line_color`) e
   migração compatível. Sem isso o resto não tem onde salvar.
2. Integrar `extract-price.js` no app + `react-native-webview`, com uma tela de
   teste manual: colar URL, ver o que o extrator achou. Validar em Kabum,
   Pichau, Mercado Livre, AliExpress e Shopee, e **anotar quais funcionam**.
3. Fluxo de adicionar produto: colar link → WebView lê preço e título →
   mostrar candidatos → usuário confirma → cria o `monitor` com
   `preferred_url` e `source_urls` já preenchido pelos confirmados.
4. Validar loja por loja da tabela acima no aparelho real, antes de ativar
   a lista inteira por padrão — começar só com Kabum e Mercado Livre, que são
   os de maior chance, e ir acrescentando conforme confirmar.
5. Coleta automática em segundo plano, com os limites acima.

## Limites a declarar honestamente ao usuário

- A coleta só acontece com o app aberto. Se ficar dias sem abrir, o histórico
  daquele produto tem buraco. Mostrar isso na tela, não esconder.
- Algumas lojas não vão funcionar. Shopee e AliExpress são os casos mais
  prováveis de falhar mesmo pelo aparelho. Quando falhar, dizer qual loja falhou
  e preservar o histórico anterior — nunca registrar preço chutado.
- Descoberta automática do mesmo produto em outras lojas NÃO faz parte disto.
  O usuário cola um link por loja. Não prometer casamento automático de produto.

## Restrições gerais

Preservar assinatura, package, `sofia-home-data-ready`, overlay Kotlin,
concorrência do CI (PR #5) e o ícone estático (PR #6). Não mexer no
`safe-feed.js`, que continua válido para feeds JSON. Não subir APK como
publicado sem aprovação do Pedro.
