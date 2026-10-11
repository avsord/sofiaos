# Sofia OS — Rodada 7.1: fechar o agendador e transformar o teste pesado em medida

Base: `sofia-app-android` HEAD `39121fd` (0.3.108, R7 integrada). Escopo pequeno,
um candidato `[manual-apk]`, sem publicar. **Não iniciar R8 neste commit.**
Atualizar MASTER (seções 9 e 10) no mesmo PR.

Contexto verificado pelo Claude (reproduzido, não só lido):
- Agendador no repositório: 16/17 testes da suíte ampliada. A falha restante é
  o prazo (`deadlineMs`) só ser olhado na cabeça da fila.
- A falha é **ativa** neste app: `snapshot:write` (prioridade 9, prazo 8 s),
  `notifications:inventory`, `capsules:inventory`, `agenda:inventory`
  (prioridade 7, prazo 8 s) e `background-services:mount` (prioridade 7, prazo
  5 s) ficam atrás de `prerender:*` (4) e `prefetch:*` (6), que não têm prazo.
  Com toques contínuos, esses prazos não são cumpridos.

## 1. Agendador corrigido (código pronto)

- Substituir `SOFIA_APP/src/lib/idle-work.ts` pelo deste pacote. Ele cobre a
  barreira de folga (`nextAllowedAt`, que substitui o `nextRunAt` já integrado)
  e o prazo por entrada: com prazo vencido, escolhe o mais antigo; sem prazo
  vencido, prioridade e ordem de chegada. Folga de 50 ms e atraso inicial
  continuam valendo; o prazo ainda pode vencer a regra de silêncio.
- Acrescentar `SOFIA_APP/tests/idle-work-adversarial.test.cjs` (8 casos) ao
  script `test`. Os 9 testes de `idle-work-108.test.cjs` e os da integração
  ficam intactos. Aceite: suíte ampliada 17/17 e a suíte completa do app.
- Janela de interação: hoje só o **início** do toque/arrasto renova os 800 ms.
  Um arrasto contínuo maior que isso deixa a fila andar durante o gesto.
  Renovar também em `onScroll`/movimento do `TabPager` e das listas, sem
  `setState` e sem interferir nos eventos do pager. Teste: simular movimento
  contínuo por 3 s e verificar que nenhuma tarefa roda.

## 2. Teste pesado: de "passa/falha" para "quanto demora"

`SOFIA_APP/tools/fluency-heavy-smoke.py`, função `correctness`, linha ~76-78:
hoje espera 0,5 s fixos e exige `'Página QA'` na árvore. Isso vira falha
binária sem dizer se a lista demora 0,6 s ou nunca aparece.

- Trocar a espera fixa por **polling** da árvore (a cada 100 ms) até
  `'Página QA'` aparecer, com teto de 8 s. Registrar `pages_first_content_ms`
  (do toque até a lista) por modo e por trial no JSON e no log `SOFIA_PERF_*`.
- A asserção reprova **só** se: o aviso falso "Sua primeira página" aparecer, ou
  a lista não aparecer em 8 s. A meta (≤ 1000 ms) é reportada como status do
  objetivo, sem reprovar nesta rodada.
- Reportar **em qual modo** a falha original ocorreu (Novo ou Antigo), e os
  valores de `pages_first_content_ms` dos 5 trials de cada modo.
- Capturar também a árvore em 1,5 s e 3 s quando a lista ainda não estiver
  visível, para distinguir "ainda montando" de "não carregou".
- Se a causa for o `afterVisible` de 350 ms somado ao carregamento da semente
  pesada, dizer quanto de cada um.

## 3. Relatório (obrigatório)

Compilado / smoke normal / smoke pesado / publicado, separados, com os números
brutos. Dizer explicitamente se `Heavy page list not visible` foi falha do app
ou de temporização do teste, com a evidência.

## Preservar

Tudo do MASTER, a chave Novo/Antigo (padrão Novo), proteção de rascunhos de
Páginas e a regra de nunca afrouxar teste. Não implementar R8 nem R9 aqui.
