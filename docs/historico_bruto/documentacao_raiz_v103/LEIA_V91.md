# Sofia OS v91 — ações realmente fixas na viewport

A v90 alterou a regra CSS para `position: fixed`, mas o container dos três botões ainda permanecia dentro do `main`. Nesta versão a correção deixa de depender só da cascata CSS.

## O que mudou

- `#userPageFloatingActions` foi movido para fora de `.shell`/`main` e agora é filho direto de `body`.
- `body > .user-page-floating-actions` usa `position: fixed` e `z-index: 1000`.
- O JavaScript reforça o portal com `ensureUserPageActionsViewportLayer()`: se o elemento aparecer dentro de outro container, ele é movido de volta para `document.body`.
- Desktop mantém 22 px do topo e alinhamento à borda direita da shell.
- Mobile mantém 8 px do topo e da direita.
- O estado `hidden` continua respeitado fora da página Particular.

## Atualização

1. Feche a Sofia com `Ctrl+C`.
2. Extraia o ZIP.
3. Execute `ATUALIZAR_SOFIA.cmd`.
4. O atualizador valida `MANIFESTO_V91.json`, cria backup do código anterior e preserva `.env`, `data/`, memória, anexos, backups, exports, `node_modules`, credenciais e `INICIAR_SOFIA.cmd` personalizado.
