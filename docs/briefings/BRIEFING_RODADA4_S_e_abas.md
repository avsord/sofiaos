# Sofia OS — Rodada 4: S sem fase parada + abas sem branco e sem delay

Base: `sofia-app-android`, HEAD `653c87d` (0.3.105 + correções R8). Candidato
manual `[manual-apk]`, sem publicar. Duas partes independentes: se uma falhar,
reportar qual e entregar a outra.

---

## Parte A — O S nasce animado, sem fase parada

### Causa (confirmada no código)

O overlay nativo só é criado em `setOnExitAnimationListener`
(`SofiaLaunchOverlay.kt`, ~linha 61). O Android só chama esse callback depois
que o app desenha o primeiro frame (~280–420 ms após o início do processo).
Até lá, quem aparece na tela é o ícone ESTÁTICO do sistema
(`windowSplashScreenAnimatedIcon` = `@drawable/sofia_launch_mark`, definido em
`values-v31/sofia-splash.xml` por `plugins/with-sofia-logo.cjs`). Resultado:
S parado durante essa janela, depois o overlay começa o scale. É exatamente o
que o Pedro vê.

O ícone animado do sistema (`sofia_launch_mark_animated`) não resolve: no
celular real do Pedro ele não anima visivelmente (S nasceu parado e depois
pulou, com o PR #8), então não se pode depender dele.

### Mudança

Quem aparece antes do callback deixa de ser um S estático. O overlay passa a
ser o único dono do S, e ele entra já em movimento.

1. **Ícone do sistema transparente.** Em `plugins/with-sofia-logo.cjs`, gerar
   `drawable/sofia_launch_mark_empty.xml`: copiar o vetor de
   `sofia_launch_mark.xml` mantendo exatamente `width`, `height`,
   `viewportWidth` e `viewportHeight` (192dp/192), mas SEM nenhum `<path>`
   visível (ou com `android:fillAlpha="0"`). A geometria do ícone do sistema
   não pode mudar, porque `start()` calcula posição e tamanho do overlay a
   partir de `icon.width` e `getLocationOnScreen`. Apontar
   `windowSplashScreenAnimatedIcon` para `@drawable/sofia_launch_mark_empty`.
   O bitmap do overlay continua rasterizando `R.drawable.sofia_launch_mark`
   (linha ~78) — não mexer nisso.
2. **Fade-in do S dentro do overlay.** Em `SofiaEarlySplashSurface.onDraw`
   (~linha 333), desenhar o bitmap com alpha crescente nos primeiros 140 ms:
   `paint.alpha = (255 * min(1f, (now - startedAt) / 140f)).toInt()`. O fundo
   roxo continua opaco desde o primeiro frame. O scale segue a curva atual
   (`SofiaLaunchMotion.scaleAt`, 0,70 → 1,00 em 650 ms) começando em
   `motionStart = now`, como já está. Efeito: a tela é só roxo até o primeiro
   frame do app; depois o S surge já crescendo. Nunca existe S estático.
3. Constante `S_FADE_IN_MS = 140L` em `SofiaLaunchMotion.java`, para ajuste
   fino sem caçar número no Kotlin.
4. **Testes:** as asserções que hoje exigem `@drawable/sofia_launch_mark` como
   ícone do sistema (`startup-speed-066.test.cjs`, `startup-fade-060.test.cjs`,
   e a checagem semântica do CI) passam a exigir `sofia_launch_mark_empty`.
   Mudar SOMENTE o nome esperado. Não afrouxar nenhum limite de tempo. Manter
   a checagem "R8-proof" por semântica de view, não por nome de classe.
5. Android < 12 (caminho `windowBackground`/`splashscreen_logo`): não alterar.

Limite honesto, para constar no relatório: com esse desenho o S aparece ~300 ms
depois do toque (quando o app desenha o primeiro frame), e não imediatamente.
Antes disso a tela é roxa lisa, o que coincide com a animação de abertura do
próprio launcher. A única forma de ter S visível no frame zero é o ícone
animado do sistema, que não funcionou no aparelho do Pedro.

---

## Parte B — Abas: sem branco e sem delay no primeiro toque

### Causa 1: Páginas aparece em branco (e até com o aviso "Sua primeira página")

- `Pages.tsx` (linha ~34) inicia a lista com `api.cached('/workspace/entities?limit=100&kind=user_page&q=&offset=0')`.
- O cache de abertura (`startup-snapshot.ts`, `launchRead`, linha ~13) guarda só
  `/tasks, /home, /md/dashboard, /workspace/catalog, /chat-sync/current` e a
  agenda do mês. A lista de páginas NÃO está lá de propósito (evita decifrar o
  histórico grande antes da Home).
- O arquivo completo só é carregado por `api.hydrate()` quando acontece a
  primeira requisição (`api.ts` linhas ~70, 85, 126), ou seja, DEPOIS do
  primeiro render da aba. Resultado: a lista nasce `[]`.
- Pior: `ready` vira `true` assim que os rascunhos locais são lidos
  (`Pages.tsx` ~linha 78), antes do servidor responder, e a linha ~189
  (`ready && !pages.length`) mostra o aviso "Sua primeira página" por alguns
  instantes. Isso é falso para quem já tem páginas.

### Causa 2: delay no primeiro toque nos menus

`startup-mounts.ts` monta as 5 abas secundárias uma por frame logo após o
reveal. Cada montagem é pesada (`Workspace.tsx` 46 KB, `Chat.tsx` 29 KB,
`Pages.tsx` 27 KB, mais o `require()` do módulo). A thread JS fica ocupada
justamente na janela em que o Pedro começa a tocar nos menus, e o toque espera.

### Mudanças

1. **Hidratar o cache completo logo após o reveal, antes do aquecimento.** Em
   `App.tsx`/`startup-mounts.ts`: quando `visible` e `auth` forem verdadeiros,
   `await api.hydrate()` UMA vez, e só então liberar a cadeia de montagens
   das abas. Está fora do caminho crítico de abertura (acontece depois do fade),
   então não deve mexer em `SYSTEM_CALLBACK/UI/DATA`. Registrar no log
   `SOFIA_HYDRATE_MS` para o custo ficar visível.
2. **Não mostrar estado vazio antes de o primeiro carregamento terminar.** Em
   `Pages.tsx`, criar `loaded` (true quando a primeira `load()` resolveu OU
   quando havia cache no estado inicial). Trocar a condição da linha ~189 para
   `ready && loaded && !pages.length`. Enquanto `!loaded` e sem cache, mostrar
   o esqueleto neutro/vazio sem texto, nunca "Sua primeira página". Auditar
   Chat (lista de conversas), Apps/Workspace e Agenda pelo mesmo padrão
   "estado vazio antes do primeiro load" e corrigir onde existir.
3. **O aquecimento cede ao toque do usuário.** Em `startup-mounts.ts`: quando
   `active` mudar (toque em aba), cancelar a cadeia de `requestAnimationFrame`
   imediatamente, montar a aba tocada com prioridade (já acontece), e retomar o
   aquecimento só após 500 ms sem novo toque. Ordem de aquecimento: chat,
   pages, agenda, apps, profile.
4. **Instrumentação:** logar `SOFIA_TAB_TAP_TO_FRAME_MS` (toque → primeiro
   frame da aba de destino) por aba, separando "primeiros 3 s após o reveal" de
   "depois". Reportar os números antes/depois.

### Critério de aceite da Parte B

- Com cache existente, tocar em Páginas logo após abrir mostra a lista na hora,
  sem tela em branco e sem o aviso de "primeira página".
- Instalação nova (sem cache): estado neutro de carregamento, nunca o aviso de
  vazio, e a lista aparece quando o servidor responde.
- Toque em qualquer menu nos primeiros 3 s: sem atraso perceptível; reportar
  `SOFIA_TAB_TAP_TO_FRAME_MS`.
- `SYSTEM_CALLBACK`, `UI` e `DATA` (5 aberturas frias) sem piora em relação à
  0.3.105. Reportar os três valores.

---

## Preservar

Assinatura e package `com.avsord.sofiaapp`, versionCode crescente, prefixo
`sofia-android-v`, R8 ativo e as regras keep atuais, APK só arm64-v8a, gate
`sofia-home-data-ready`, fade de 95 ms, concorrência do CI (PR #5), login,
histórico, banco, Railway e atualizador. Não afrouxar teste nenhum. Não
publicar no atualizador sem aprovação do Pedro. Reportar compilado, smoke e
publicado separadamente.
