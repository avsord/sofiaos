# Sofia OS v73 - Uso, Filtros, Chat e Agenda

A v73 consolida o medidor **Uso da Sofia** e corrige dois estados visuais intermitentes observados na Home.

## Uso da Sofia

O cartão de uso passa a ter dois filtros independentes:

- **Compartilhado** - mede tokens consumidos contra uma cota total fixa configurada na instalação.
- **Privado** - mede custo em USD contra um teto financeiro local configurável. O padrão desta release é **US$ 10,00**.

O seletor do cartão não altera consumo nem reinicia contadores. Ele só troca a visão apresentada.

### Compartilhado

- A porcentagem exibida é `tokens usados / total fixo`.
- O total fixo continua em `sharedIncentiveDailyTokens`.
- O alerta percentual é independente do uso e fica em `sharedUsageAlertPercent`.
- Dizer à Sofia “me alerta em 70% no compartilhado” move apenas o ponto de alerta.
- O preenchimento da barra continua representando o consumo real desde 0 até 100% da cota.

### Privado

- A porcentagem exibida é `custo estimado / teto financeiro`.
- O teto padrão é **US$ 10,00** (`privateUsageTotalUSD`).
- O alerta percentual é independente (`privateUsageAlertPercent`).
- Dizer “me alerta em 90% no privado” altera somente o marcador de alerta.
- O custo local depende dos preços configurados na instalação; sem preços válidos, a interface identifica o valor como estimativa.
- O teto local da Sofia **não modifica o spend limit real da conta OpenAI**. O limite real precisa ser configurado pelo proprietário no painel da OpenAI Platform.

## Barra e degradê

- O degradê mantém uma escala fixa de 0 a 100%: verde -> amarelo -> laranja -> vermelho.
- A largura preenchida usa a porcentagem real consumida.
- Um marcador separado indica o ponto de alerta.
- Mudar o alerta não muda artificialmente a cor, o consumo ou o total.
- Valores acima de 100% permanecem representáveis numericamente, enquanto a barra visual fica limitada ao fim da escala.

## Linguagem natural

A IA pode interpretar solicitações como:

- “mostra meu uso”;
- “mostra o uso privado”;
- “mostra compartilhado e privado”;
- “me alerta em 90% no privado”;
- “coloca o compartilhado em 70%”.

A interpretação continua IA-first: o backend apenas valida e aplica a alteração estruturada.

## Chat

O cartão de esclarecimento da Sofia não pode herdar fundo preto no tema claro. A v73 remove o fundo escuro hardcoded e força o componente a usar as superfícies do tema atual, com fallback claro explícito.

## Resumo / Agenda

Cabeçalhos de widgets com rolagem interna, como **Agenda**, passam a ser `sticky`: título, subtítulo e ações permanecem visíveis enquanto apenas o corpo da lista rola.

## Compatibilidade

- Consultas antigas de uso continuam expondo os campos legados esperados pelas versões anteriores.
- Alertas absolutos em tokens acima de 100 continuam disponíveis como compatibilidade legada.
- `.env`, memória, `data/`, anexos, páginas e `INICIAR_SOFIA.cmd` personalizado permanecem protegidos pelo atualizador.
