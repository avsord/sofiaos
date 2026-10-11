# Relatório real do celular do dono — Sofia 0.3.113 (versionCode 118), 2026-10-11

Capturado 9,1 s depois da abertura (`sinceRevealMs 9106`), por isso `data` zerado e `pending: hidratar:13, count:history:8`. Não é defeito.
Teste do dono: abrir e mexer rápido nas abas (5 toques de menu registrados; arrasto entre abas não aparece em `taps`).

| | 0.3.112 | 0.3.113 | meta |
|---|---|---|---|
| maior bloqueio nos 5 s | 899 ms | 607 ms | ≤ 300 |
| bloqueios > 250 ms nos 5 s | 5 | 7 | ≤ 1 |
| montagem Conversa / Agenda / Apps | 385 / 248 / 247 | 288 / 206 / 227 | — |

## Linha do tempo das montagens (início = fim − duração, ms desde a abertura)
Conversa 1001–1289 · Páginas 1797–1817 · Apps 2027–2254 · Agenda 2560–2766 · Perfil 2642–2695.
A pré-montagem em segundo plano da 0.3.113 só podia começar em ~2500 ms (espera) + 300 ms (fila). **Todas as montagens aconteceram antes disso:
foram causadas pelo gesto do usuário** (toque numa aba não montada, ou início de arrasto, que monta as vizinhas de forma síncrona em `TabPager.begin`).

## Leitura
1. A espera de 2,5 s da 0.3.113 foi um erro de desenho: empurrou todas as montagens para dentro do gesto.
2. O que sobra é o custo da PRIMEIRA montagem de Conversa/Agenda/Apps (≈ 200–290 ms cada). Falta saber o que dentro de cada tela pesa:
   0.3.114 mede `chat:list`, `chat:composer`, `agenda:month`.
3. Fatos de código relacionados: `Composer` cria um gravador de áudio nativo ao montar a Conversa e o consulta a cada 120 ms
   enquanto a aba existir (`useAudioRecorder` + `useAudioRecorderState(recorder,120)`); o app prefere congelar um instante a mostrar página em branco
   (`TabPager`: salto nativo só para tela já montada).
