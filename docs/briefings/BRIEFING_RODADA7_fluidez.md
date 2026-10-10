# Sofia OS — Rodada 7: "o toque sempre vence" (substitui a Rodada 6)

Leia antes `docs/PLANO_FLUIDEZ.md` (estratégia e causas com prova). A Rodada 6
**não deve ser executada**; o painel de diagnóstico dela foi incorporado aqui
(Parte C). Se ela já foi iniciada, pare e recomece por este briefing.

Base: `sofia-app-android` no HEAD atual (≥ `c9be56a`, 0.3.107). Um candidato
`[manual-apk]`. Não publicar. Atualizar MASTER (seções 7, 8, 9 e 10) no mesmo PR.

Escopo desta rodada: camadas 1 e 2 do plano, painel, e medição com usuário
pesado (só relatório). **Fora do escopo:** virtualizar listas e dividir o
histórico (Rodada 8), transformar o orçamento em reprovação (Rodada 9),
mexer em splash/overlay, mover o pager no toque.

---

## Parte A — Agendador (código pronto, testado)

Arquivos deste pacote, copiar exatamente:

- `SOFIA_APP/src/lib/idle-work.ts` — `createIdleWork()` e a instância `idleWork`
  (silêncio de 800 ms, folga 50 ms, atraso inicial 300 ms).
- `SOFIA_APP/tests/idle-work-108.test.cjs` — 9 testes, incluídos no script `test`
  do `SOFIA_APP/package.json`. Validados também por mutação (ignorar toques
  derruba 3 testes; tirar a folga derruba 2).

Ligações:

1. `idleWork.start()` uma única vez no reveal (o efeito de `App.tsx` que preenche
   `nativeRevealAt`).
2. `idleWork.noteInput()` em `onTouchStartCapture` da `View` raiz do app e no
   início de arrasto do `TabPager` (`onScrollBeginDrag`, onde hoje chama
   `selection.current.beginDrag()`). Sem `setState`.
3. Passar pela fila, como tarefas pequenas:
   - `api.hydrate()` → tarefa `hidratar`, prioridade 2, `deadlineMs: 8000`;
   - pré-renderização de cada aba (Parte B) → `prerender:<aba>`, prioridade 4;
   - pré-busca para o cache de cada aba → `prefetch:<aba>`, prioridade 6
     (só GET que alimenta `snapshots.remember`, sem `setState` de tela);
   - levantar e mover para a fila tudo que hoje começa nos primeiros segundos
     após o reveal e não é necessário para desenhar a Home (inventário de
     notificações, `BackgroundServices`, gravações do snapshot que façam
     `JSON.stringify` grande, prefetch opcional). **Reportar a lista do que foi
     movido e do que ficou de fora, com o motivo.**
4. Se alguma tarefa medir > 50 ms (o painel mostra), reportar; dividir fica para a
   Rodada 8.

## Parte B — Abas dentro de `<Activity>`

O projeto usa React 19.2.3 e RN 0.86.3; o `<Activity>` faz parte do React desde
a 19.2 e chegou ao React Native na 0.83. Importar de `'react'`.

1. **Onde:** no `TabPager.tsx`, envolver o **conteúdo** de cada página, não a
   página: `<View style={[styles.page,{width}]}><Activity mode={...}>{child}</Activity></View>`.
   A caixa da página mantém a largura (o pager continua deslizando certo).
2. **Quem fica visível:** a aba ativa. Durante um arrasto, também as vizinhas
   para onde o dedo pode ir (marcar no início do arrasto, desmarcar quando
   assentar). Validar em vídeo que deslizar não mostra vizinha em branco. Se
   mostrar, deixar as vizinhas imediatas sempre visíveis e reportar o custo.
3. **Pré-renderização:** uma aba só entra na árvore (dentro de `Activity`
   escondida) quando a tarefa `prerender:<aba>` rodar no `idleWork`. Isso
   substitui a cadeia de `requestAnimationFrame` do `startup-mounts.ts`. Aba
   tocada antes disso entra na hora, já visível, como hoje. Manter a ordem
   chat, pages, agenda, apps, profile.
4. **Efeitos agora rodam só com a aba visível.** Isso elimina, sem código por
   tela, a rede e os timers de abas escondidas. Em troca, **todo efeito de aba
   precisa aguentar limpar ao esconder e rodar de novo ao mostrar**. Auditoria
   obrigatória das telas secundárias e seus filhos. Riscos já identificados:
   - `Pages.tsx` linha ~106: a limpeza chama
     `store.flushAll().finally(()=>store.dispose())`. Com Activity isso roda a
     cada vez que a aba é escondida. Garantir que mostrar de novo recupera o
     store e os rascunhos (ou que o dispose só ocorra na desmontagem real).
     Teste obrigatório: editar uma página, trocar de aba, voltar, conferir que o
     texto e o rascunho continuam.
   - Áudio tocando na Conversa ao trocar de aba: a limpeza pode parar a
     reprodução. Reportar o comportamento observado; não decidir sozinho.
   - Gravação e resposta em andamento já bloqueiam a troca (`locked`); manter.
   - Ouvintes de teclado, `AppState`, `subscribeSystemChanged` e intervalos devem
     ser limpos e recriados sem duplicar.
5. **O toque que mostra a aba não pode travar** (preocupação do Pedro): ao ficar
   visível, a aba desenha na hora com o que está em `api.cached(...)`; o primeiro
   carregamento de rede da aba espera **350 ms** depois de ficar visível
   (helper único, cancelado se a aba for escondida antes). Pontos conhecidos:
   `Workspace.tsx` ~93, ~95, ~121; `Pages.tsx` o `load()` após ler rascunhos;
   `Agenda.tsx` ~20; verificar `Chat.tsx` e `Profile.tsx`. Nunca tela em branco
   e nunca "Sua primeira página" falso (manter `loaded`).
6. **Remover** o que ficou redundante (cadeia de rAF e espera de 500 ms do
   `startup-mounts.ts`), mantendo os testes de regressão atualizados, sem
   afrouxar o que eles garantem.

## Parte C — Painel de diagnóstico (oculto) e chave Novo/Antigo

Igual à Rodada 6, Parte 1, com estes acréscimos:

- Acesso: Perfil, 5 toques no texto da versão. "Copiar relatório" com
  `expo-clipboard`.
- Medidas: bloqueios da thread JS (atraso de um intervalo de 50 ms) nos 0–5 s
  após o reveal e na sessão: contagem > 50, > 100 e > 250 ms, maior, os 5
  maiores com os eventos que os sobrepõem; toque → aba por aba; tempo de
  montagem por aba (`MountTimer` com `useLayoutEffect`, **não** `React.Profiler`);
  registros do `idleWork` (`records()`: nome, início, duração, se foi forçada
  por prazo); duração do `JSON.parse` do histórico.
- **Tamanho dos dados do usuário:** quantidade de páginas, entidades,
  conversas, mensagens em cache e bytes do arquivo de histórico. Serve para
  calibrar o usuário de teste pesado (Parte D) em 3× o volume real.
- **Chave Modo Novo / Antigo**, gravada em `AsyncStorage`, lida depois do reveal,
  vale na próxima abertura fria. Antigo = comportamento exato da 0.3.107.
  Padrão: Novo. Será removida na Rodada 9.

## Parte D — Usuário pesado no CI (só medir nesta rodada)

A semente atual do smoke (`tools/manual-apk-smoke.py`) cria cerca de 75
registros. Criar um perfil **pesado**, ao lado do atual, sem dado real:

- 600 páginas em até 3 níveis, com 20 blocos cada;
- 1.500 entidades em Apps distribuídas nos tipos existentes;
- 30 conversas com 300 mensagens cada;
- 12 meses de agenda com 600 eventos e 300 tarefas.

Roteiro em cada modo (Antigo e Novo), 5 aberturas frias cada: toques via adb em
Páginas, Conversa, Agenda e Apps aos 0,5 s, 1 s, 1,5 s e 2 s após o reveal;
depois os mesmos toques após 6 s. Reportar os números brutos do painel (via
logcat `SOFIA_PERF_*` com os mesmos valores), não só medianas.

**O modo Antigo precisa mostrar o problema com o usuário pesado.** Se não
mostrar, a semente ainda é pequena: aumentar e reportar.

## Critérios de aceite (modo Novo, usuário pesado, emulador)

- Nos 0–5 s após o reveal com os toques roteirizados: **nenhum** bloqueio > 100
  ms (meta: nenhum > 50 ms). Se não atingir, reportar os números e o evento
  responsável; não declarar resolvido.
- Toque → aba: p95 ≤ 100 ms.
- `SYSTEM_CALLBACK`, `UI`, `DATA`: no máximo +30 ms em relação à 0.3.107.
- Páginas: sem branco, sem "primeira página" falso, rascunho preservado ao
  trocar de aba e voltar.
- Suíte completa sem afrouxar nada, incluindo os 9 testes do `idleWork`.

## Atualizar o MASTER no mesmo PR

- Seção 7: decisão "Arquitetura de fluidez: o toque sempre vence" apontando
  para `docs/PLANO_FLUIDEZ.md`.
- Seção 8: as 5 regras permanentes do plano.
- Seção 9: Rodada 8 (virtualização + histórico fragmentado) e Rodada 9
  (orçamento reprovador com 3× o volume real; remover modo Antigo).
- Seção 10: linha desta rodada com os números do usuário pesado.

## Roteiro do Pedro no celular

1. Instalar por cima. 2. Perfil → 5 toques na versão → **Modo Antigo**.
3. Fechar o app por completo, abrir e, assim que a Home aparecer, tocar rápido em
Páginas, Conversa, Agenda e Apps. 4. Perfil → 5 toques → "Copiar relatório" →
colar no chat. 3 vezes. 5. Trocar para **Modo Novo** e repetir 3 vezes.
