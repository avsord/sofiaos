# Sofia OS — MASTER (fonte única de verdade)

Este é o único documento de continuidade que vale. Qualquer agente (Claude,
ChatGPT ou outro) começa aqui. Os documentos antigos (`docs/MASTER.md`,
`docs/GUIA_MASTER_COMPLETO.md`, `docs/CONTEXTO_NOVO_CHAT.md`,
`PROMPT_CONTINUAR_SOFIA.md`, `Comando atual.md`,
`docs/startup-navigation-handoff.md`) são históricos. Este é o ponto de entrada; código, logs e instruções atuais do dono devem ser conferidos se houver divergência, e o MASTER corrigido com evidências.

Este arquivo **não guarda valores que mudam sozinhos** (HEAD, versão, release
publicada). Eles são lidos ao vivo pelos comandos da seção 3 e dependem de uma
consulta atual bem-sucedida. O que muda por decisão humana (pendências, decisões,
diário) precisa ser atualizado no mesmo PR de cada rodada — regra no `AGENTS.md`.
O teste protege a estrutura, não a veracidade ou a atualização automática da narrativa.
O MASTER não guarda senhas, tokens ou chaves: leitura pública não concede escrita
no GitHub nem acesso ao Railway, banco, contas ou serviços de terceiros. Cada novo
ambiente precisa de seus próprios conectores/permissões; confirme-os antes de agir.

---

## 1. O dono e a forma de trabalhar

- O dono (Pedro) não é desenvolvedor. Responder em português, com explicação
  clara e decisões apresentadas como escolhas concretas.
- Quer velocidade: fazer uma pergunta só quando a resposta mudar o trabalho.
  Não reabrir decisões já registradas na seção 7.
- Honestidade com prova: verificar no código/histórico antes de afirmar,
  admitir erro com evidência, nunca prometer APK que não pode entregar.
- Ele testa no celular físico. O relato dele vale mais que o emulador do CI;
  os dois já divergiram (ver seção 6).

## 2. O projeto

- **Sofia OS**, "Personal AI OS": app Android React Native/Expo
  (`com.avsord.sofiaapp`) + backend Node/Express/SQLite na Railway.
- **Branch de entrega:** `sofia-app-android`. App em `SOFIA_APP/`, backend em `src/`.
- **Stack:** Expo ~57, React Native 0.86, Hermes, R8 ligado
  (`expo-build-properties`) desde a 0.3.105. APK do dono só arm64-v8a.
- **Abas:** Início, Conversa, Páginas, Agenda, Apps, Perfil.
- **Funcionalidades:** conversa com áudio transcrito e anexos; Páginas estilo
  Notion (hierarquia, blocos, templates, capas); Agenda com recorrência;
  Tarefas; Biblioteca/Listas; Cápsulas com notificação; central de
  notificações; temas; privacidade/Safe Chat/Diário; onboarding WhatsApp
  Business (pendente na Meta); monitoramento de preços (parcial, seção 7.2).

## 3. Estado vivo — sempre ler ao vivo, nunca confiar em número escrito

Antes dos comandos abaixo, consulte **[ESTADO_VIVO.md](https://raw.githubusercontent.com/avsord/sofiaos/sofia-state/ESTADO_VIVO.md)** na branch separada `sofia-state`. O workflow `Sofia estado vivo` gera esse *snapshot* após pushes em `sofia-app-android`: versão, último HEAD, releases, PRs, resultados disponíveis e alertas de possível defasagem do MASTER. A versão do snapshot não é necessariamente o resultado final de uma compilação ainda em andamento; confira a execução ao vivo para aprovar ou entregar um APK.

Se a branch ainda não existir, o arquivo estiver desatualizado ou a consulta falhar, use os comandos/conectores abaixo. O detector sinaliza alterações de código sem atualização do MASTER, mas não substitui a revisão das decisões humanas. Para um agente novo, o protocolo inicial está em [SOFIA_KEY.md](SOFIA_KEY.md).

```bash
git clone --branch sofia-app-android https://github.com/avsord/sofiaos.git
cd sofiaos
git log --oneline -15
node -e "const c=require('./SOFIA_APP/app.json').expo; console.log({version:c.version,versionCode:c.android.versionCode,package:c.android.package})"

# Requer GitHub CLI autenticado e dependências JS do app instaladas (npm ci).
# Só consulta: não executa delivery.cjs prepare, não compila nem publica.
# Usa a mesma seleção de releases do atualizador, não a ordem do Atom feed.
gh api --paginate --slurp 'repos/avsord/sofiaos/releases?per_page=100' | node -e "const fs=require('node:fs'); const pages=JSON.parse(fs.readFileSync(0,'utf8')); if(!Array.isArray(pages)||!pages.every(Array.isArray))throw Error('Listagem incompleta'); const rows=pages.flat(); const load=require('./SOFIA_APP/tests/load-ts.cjs'); const u=load('src/lib/update.ts'); const current=require('./SOFIA_APP/app.json').expo.version; console.log(JSON.stringify({codigo:current,publicada:u.newestPublishedUpdate(rows,'0.0.0'),ofertaParaVersaoDoCodigo:u.newestPublishedUpdate(rows,current)},null,2));"
gh pr list --repo avsord/sofiaos --state all --base sofia-app-android --limit 5 --json number,title,state,updatedAt,headRefName,baseRefName
gh run list --repo avsord/sofiaos --branch sofia-app-android --limit 5 --json databaseId,headSha,status,conclusion,workflowName
```

Sem git, gh ou rede no terminal, use os conectores GitHub disponíveis para ler
os mesmos arquivos, releases, PRs e execuções. Ausência de permissão/rede não
significa ausência de release ou de resultado: reporte o que não foi verificado.
Para saber a oferta ao celular, use a versão realmente instalada, que pode ser
diferente da versão do código. Código mais novo que a release indica trabalho
não publicado; não prova que já exista um APK aprovado ou sequer compilado.

## 4. Papéis

- **Arquiteto/revisor (Claude):** lê o repositório, diagnostica, escreve diff
  exato e briefing, revisa o que o executor entregou (rodando testes, conferindo
  merge e hashes). Na sessão que originou este pacote, o Claude relatou ausência de Android SDK, bloqueio do Maven do Google e ausência de escrita no GitHub. Isso descreve aquela sessão, não todos os modelos ou contas; cada agente deve verificar suas ferramentas atuais.
- **Executor (ChatGPT ou quem tiver escrita no GitHub):** aplica, dispara o CI,
  baixa artefatos, entrega o APK, relata.
- O dono faz a ponte entre os dois.
- Um executor, uma rodada, um escopo por vez. Nunca dois agentes mexendo no
  mesmo arquivo ao mesmo tempo.

## 5. Pipeline de entrega

Workflow: `.github/workflows/sofia-native-047-update.yml`. Dispara em push na
`sofia-app-android` que toque `SOFIA_APP/**` ou o próprio workflow. A classificação de arquivos não-runtime não basta para garantir ausência de APK: `delivery.cjs prepare` compara todas as mudanças desde a última release publicada. Um commit documental pode reencontrar alterações antigas do aplicativo. Nesta instalação documental, validar os testes em branch isolada e promover com `[skip ci]`, sem os marcadores de candidato/publicação; não alterar o pipeline Android nem usá-lo para validar documentação. Essa exceção não vale para mudanças de runtime.

| Marcador no commit | Efeito |
|---|---|
| `[manual-apk]` | APK candidato para o dono testar. **Não publica.** |
| `[manual-apk] [no-tests]` | Iteração rápida. Só em passos intermediários; o candidato final roda completo. |
| `[approved-apk]` sem `[manual-apk]` | Publicação no atualizador. **Só depois do "aprovado" explícito do dono.** |

- `SOFIA_APP/tools/delivery.cjs prepare` decide a próxima versão e reescreve
  `app.json`, `package.json`, lock e `src/lib/update.ts` **antes** dos testes.
- Concorrência: job `build` cancelável por branch; job `release` em grupo
  separado, não cancelável. Travado por `SOFIA_APP/tools/native-delivery-test.py`.
- O APK do dono é só `arm64-v8a`. Há uma cópia QA universal (`QA-ONLY-manual-universal.apk`) para o smoke manual x86_64 e uma compilação de fixture (`QA-ONLY-full-fixture.apk`) no fluxo completo. Ambas mantêm `arm64-v8a,x86_64`. DEX, JS/Hermes, bibliotecas ARM64 e assinatura da cópia manual são comparados com o APK do dono. Smoke dessa cópia não é execução do APK ARM64 no celular.

## 6. Abertura do app — como funciona (não reinventar)

- Não existe S em JavaScript ativo: `LaunchSAnimation.tsx` é código morto e um
  teste garante que não seja montado no `App.tsx`.
- O S é nativo: `SOFIA_APP/plugins/native/SofiaLaunchOverlay.kt`,
  `SofiaLaunchMotion.java` (curva 0,70 → 1,00 em 650 ms),
  `SofiaLaunchTransition.java` (máquina de estados), instalados por
  `plugins/with-sofia-logo.cjs` e `plugins/with-sofia-launch.cjs`.
- O overlay nasce no `setOnExitAnimationListener`, que o Android chama quando o
  app desenha o primeiro frame (~280–420 ms). Antes disso aparece o splash do
  sistema.
- O ícone **animado** do sistema (AnimatedVectorDrawable/SurfaceView) custou
  111 ms (A/B controlado, PR #6) e 132 ms (PR #8), e no celular do dono não
  animou visivelmente ("nasce parado e pula"). Não depender dele.
- Fade de saída 95 ms. Revelação exige o marcador `sofia-home-data-ready`
  (bit 8): a Home não abre com tarefas/agenda vazias. **Não remover.**
- Pré-aquecimento de shader (0.3.99–0.3.103) foi testado e revertido. **Não
  reintroduzir.**
- Rodada 4: ícone inicial transparente no Android 12+, mantendo a geometria; o S surge no overlay com fade-in de 140 ms e escala nativa. Há uma fase inicial roxa sem S; não prometer S visível/animado no frame zero. O caminho Android anterior a 12 foi preservado.
- Cache de abertura: `SOFIA_APP/src/lib/startup-snapshot.ts`. `launchRead` só
  guarda rotas da Home; o restante hidrata por `api.hydrate()`.

## 7. Decisões fechadas

### 7.1 Arquitetura
- Reescrita nativa completa (estilo Telegram) **não** está aprovada. Antes,
  medir quanto da abertura é custo de JavaScript. Se for o gargalo, migrar uma
  tela por vez, começando pela Home. O APK do Telegram foi analisado: activity
  única, motor gráfico C++ próprio de 21 MB, não portável para RN.

### 7.2 Monitoramento de preços
- Já existe: entidade `monitor` (`src/core/catalog.js`), tabela `observations`,
  job no `src/services/scheduler.js`, `workspace.observe()` com alertas por
  preço-alvo, queda percentual e menor total histórico (`new_low`), e na UI
  `PriceWidget`, `priceGeometry` e `StoreComparison` (lojas ordenadas, ★
  Principal via `monitor.data.preferred_url`).
- Faltam: campos `preferred_url`, `line_color`, `source_urls` no catálogo;
  leitura de página de loja (`safe-feed.js` só aceita JSON); coleta de várias
  fontes.
- **Sem registro de aplicativo em loja nenhuma** (sem OAuth, sem chave de API).
- Coleta **no aparelho**, em WebView invisível, sobre a página renderizada
  (`react-native-webview` via `npx expo install`).
- Lojas desejadas: Mercado Livre, AliExpress, Pichau, Kabum, Shopee e outras.
  Busca interna confirmada só no Kabum (`/busca/<termo>`); demais a confirmar
  no aparelho. Shopee e AliExpress são as de maior risco.
- Outras lojas do mesmo produto: **o app busca e o dono confirma os links.**
  Sem casamento automático de produto.
- Código pronto e testado em `docs/monitoramento/` (`npm install && npm test`,
  19 testes). Briefing de implementação no mesmo diretório.
- Limite declarado ao dono: a coleta só ocorre com o app aberto.

## 8. Regras que não se quebram

- Preservar assinatura, package `com.avsord.sofiaapp`, versionCode crescente,
  prefixo `sofia-android-v`, login, histórico, SQLite e Railway. Instalação por
  cima; nunca limpar dados.
- Não afrouxar teste para passar. Se um teste trava um valor, mudar teste e
  código juntos mantendo a proteção.
- Não publicar candidato sem o "aprovado" do dono. Relatar separado:
  compilado / smoke aprovado ou reprovado / publicado sim ou não.
- Uma variável por experimento ao investigar desempenho.
- R8 quebrando em runtime → regra keep em `extraProguardRules`, nunca desligar
  o R8 inteiro.
- Não mover os documentos históricos: `sofia-mobile-backend.yml` e
  `tools/apply-mobile-v138.cjs` dependem dos nomes deles.

## 9. Pendências (atualizar a cada rodada)

1. **Rodada 5 (0.3.107) compilada, smoke QA aprovado; confirmar primeiros toques no celular** — aquecimento depois da Home sem aguardar histórico, Shell sem rerender ao concluir hidratação. A/B em emulador: DATA 956 → 975 ms (+19 ms); nos quatro primeiros toques, três eventos nativos registrados, incluindo Páginas ainda não montada (um salto protegido). Portanto, ausência total de delay no aparelho físico **não comprovada**. APK candidato manual, não publicado; [execução 38080609693](https://github.com/avsord/sofiaos/actions/runs/38080609693) e [evidências PR #15](https://github.com/avsord/sofiaos/pull/15#issuecomment-6101539253).
2. **Rodada 4 implementada; confirmar no celular** — briefing histórico em `docs/briefings/BRIEFING_RODADA4_S_e_abas.md`. Conferir o candidato existente antes de recompilar: S entrando em movimento, Páginas com cache sem falso aviso de primeira página e resposta aos toques nos primeiros segundos. O build e o smoke QA da rodada terminaram com sucesso (registro na seção 10); isso não substitui o aceite físico.
2. **Validar R8 no celular**: login, conversa, páginas, agenda, notificação de
   cápsula, alarmes, secure store, atualizador.
3. **Publicar no atualizador** o primeiro candidato aprovado pelo dono.
4. **Medir o custo de JavaScript na abertura** (pré-requisito da seção 7.1).
5. **Monitoramento de preços** (seção 7.2).
6. **Organização do código**: arquivos comprimidos (`Workspace.tsx` 46 KB,
   `Chat.tsx` 29 KB, `Pages.tsx` 27 KB). Reformatar sem mudar comportamento.
7. **Padronização e bugs antigos** (conferir no código antes, podem já estar
   resolvidos): "Anotações → Notas", "Novo caderno → Nova pasta", câmera do
   perfil em círculo, labels de Perfil/Aparência/Segurança na página Apps,
   gesto Agenda→Apps→Agenda, scroll do chat com teclado, sessão expirando em
   12 h, filtro privado preservado em updates.

## 10. Diário de rodadas (só acrescentar; uma linha por rodada)

| Data | Versão | PR | O quê | Resultado |
|---|---|---|---|---|
| 2026-10-10 | 0.3.104 | #5 | CI: build cancelável por branch, publicação protegida | Validado ao vivo |
| 2026-10-10 | 0.3.104 | #6 | A/B ícone do sistema estático vs animado | Estático −111 ms (DATA) |
| 2026-10-10 | 0.3.104 | #7 | Abas pré-aquecidas após o reveal; toque protegido | Melhorou; dono ainda vê delay/branco |
| 2026-10-10 | 0.3.104 | #8 | Ícone animado de volta para "S desde o início" | Reprovado: +132 ms; no celular nasce parado e pula |
| 2026-10-10 | 0.3.105 | #9, #10 | R8, APK só arm64, ícone estático, curva reinicia no handoff | APK 51,6 → 26,25 MB; dono: S ainda parado no início; abas com delay/branco |
| 2026-10-10 | 0.3.106 | — | Rodada 4: S único, restauração de cache e aquecimento que cede aos toques; base `ef3a6f7` | [Execução 38070454563](https://github.com/avsord/sofiaos/actions/runs/38070454563) concluída com sucesso; validação física pendente, sem aprovação OTA |
| 2026-10-10 | — | — | Instalação do MASTER permanente, prompt fixo e guardião de estrutura | Commit exclusivamente documental/testes; ver resultado no PR de instalação, sem novo APK |

| 2026-10-10 | 0.3.106 | #14 | Protocolo SOFIA_KEY e estado vivo automático em branch independente; guardas de segredo e aprovação | Validado no workflow 38078156195; nenhum APK novo |
| 2026-10-10 | 0.3.107 | #15 | Aquecer abas após Home sem esperar histórico e sem rerender geral; manter navegação nativa protegida | [CI 38080609693](https://github.com/avsord/sofiaos/actions/runs/38080609693) compilação e smoke QA aprovados; DATA +19 ms vs 0.3.106 no mesmo emulador; primeiros toques ainda com aba não montada; físico pendente, OTA não publicado |

## 11. Lições de erro (para calibrar quem chegar)

- Afirmou-se que havia "dois S" (JS + nativo); o JS era código morto.
- A fila do GitHub Actions é 1 em andamento + 1 pendente, não ilimitada.
- Constante existir no código ≠ ser exigida: conferir a condição que usa.
- Antes de trocar um valor de configuração, procurar teste que o trava.
- Antes de comparar versões, achar o commit realmente versionado como tal.
- O CI reescreve a versão antes dos testes: teste que compara versão fixa quebra.
- Emulador ≠ celular. Animação e tempo precisam do relato do dono.
