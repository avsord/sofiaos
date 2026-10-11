# Relatório real do celular do dono — Sofia 0.3.114 (versionCode 119), 2026-10-11

Capturado 13,5 s depois da abertura. Celular com SoC Unisoc (aparece como `vendor.unisoc` no logcat): CPU modesta, JavaScript lento.
Primeira medição com a montagem separada por dentro.

## Primeiros 5 s
Maior bloqueio 693 ms; 5 bloqueios acima de 250 ms (iguais à 0.3.113: R12 só removeu a espera e mediu).

## Montagem por dentro (ms desde a abertura; todas terminam no mesmo commit)
- **Conversa 315**: corpo 12 + lista (render) 93 + **campo de digitação + restante + commit 209**.
- **Agenda 362**: **corpo da Agenda antes do calendário 154 (JS puro: expansão de recorrências, prioridade, filtros)** + mês (render + commit) 208.
- Apps 247 · Perfil 50 · Páginas 22.

## Toque até o quadro
Primeiras visitas: Apps 924, Agenda 458, Páginas 212. Visitas seguintes: Conversa 81–137, Agenda 102–119, Perfil 135–185, Páginas 182–204,
**Início 282–440**, Apps 498 (2ª visita).

## Gravação do histórico
1 `snapshot:write` em 13 s (1867 ms; ~174 ms de bloqueio no início). Antes: 11 em 185 s. A regra da 0.3.113 funciona.
`parse:history` 110 ms (bloqueio de 126 ms aos 2,4 s).

## Leitura
1. O maior item identificável é a Agenda: 154 ms de JavaScript antes do calendário. `expandAgenda` fazia ~13 chamadas a `Intl.formatToParts`
   por evento recorrente por expansão (medido em Node: 1.908 chamadas para 150 eventos com horário) e o widget do Home repete a conta
   (`expandAgenda` por compromisso). Ainda NÃO está provado que isso explica os 154 ms: 0.3.115 mede `agenda:expand`/`agenda:priority`/`home:expand`.
2. Conversa: não dá para separar o gravador de áudio do commit; 0.3.115 mede `composer:recorder`.
3. Voltar ao Início custa 282–440 ms a cada vez: ainda sem atribuição.
