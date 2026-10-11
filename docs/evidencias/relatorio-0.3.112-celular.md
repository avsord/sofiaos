# Relatório real do celular do dono — Sofia 0.3.112 (versionCode 117), 2026-10-11

Origem: Perfil → 5 toques na versão → "Copiar relatório". Só tempos e contagens. `errors: []`, `lastError: null`
(o erro de áudio não ocorreu). Volume: 3 páginas, 517 entidades, 7 conversas, 96 mensagens, histórico 4.044.079 bytes.
Teste do dono: abrir, tocar rápido nas abas por ~5 s.

## Primeiros 5 s após a abertura
- 11 bloqueios acima de 100 ms; 5 acima de 250 ms; maior 899 ms.
- Maiores: 899 ms (entrada), 869 ms (módulo Apps), 792 ms (módulo Conversa), 501 ms (módulo Agenda), 255 ms (módulo Perfil).

## Montagem de cada aba (primeira vez)
Conversa 385 ms · Agenda 248 ms · Apps 247 ms · Perfil 55 ms · Páginas 21 ms.

## Toque até o quadro (15 toques)
86 a 305 ms; mediana ~200 ms. Conversa 86–286, Páginas 169–235, Agenda 102–235, Apps 171–251, Perfil 111–305, Início 255.

## Tarefas ociosas
- `hidratar` 1301 ms (assíncrono), `parse:history` 86 ms, `count:history` 15 ms (já fora da abertura).
- `snapshot:write`: **11 gravações em 185 s**, cada uma 1,5–2,0 s de duração, e **cada uma coincide com um bloqueio de JS de ~190–240 ms no seu início**
  (62335, 65466, 67014, 120471, 125501, 180256, 182320, 185461 ms).

## Leitura
1. Os bloqueios dos primeiros segundos são a montagem das abas (render síncrono, não fatiado) somada à hidratação e ao toque.
2. A regravação repetida do histórico causa travadas de ~200 ms durante o uso, bem depois da abertura.
3. Cada troca de aba custa ~100–300 ms de JS mesmo com a aba já montada (reexibição e re-render ao ativar): ainda não corrigido; próximo alvo.
