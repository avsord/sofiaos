# Sofia OS v90 — ícones de ações fixos na tela

Esta versão corrige somente o comportamento dos três controles da página Particular (`+`, engrenagem e `…`) sem remover as alterações acumuladas anteriores.

## Correção

- O container `#userPageFloatingActions` passa a usar `position: fixed`.
- A regra final não acompanha mais o `scroll` da página Particular.
- No desktop, os controles mantêm 22 px do topo e ficam alinhados à borda direita da shell, inclusive quando a janela ultrapassa 1700 px.
- No mobile, permanecem em 8 px do topo e da direita.
- O bloco continua fora do `.scroll-panel`, portanto o conteúdo rola por baixo enquanto os três botões ficam imóveis.

## Causa corrigida

A v89 terminava o CSS com uma sobrescrita `position: absolute`, substituindo a regra `fixed` da v88. A v90 adiciona uma regra final e explícita com `position: fixed`, que prevalece na cascata.

## Atualização

1. Feche a Sofia com `Ctrl+C`.
2. Extraia o ZIP.
3. Execute `ATUALIZAR_SOFIA.cmd`.
4. O atualizador valida `MANIFESTO_V90.json` por SHA-256 e cria backup para rollback.

A atualização preserva `.env`, memória, `data/`, anexos, backups, exports, `node_modules`, credenciais e `INICIAR_SOFIA.cmd` personalizado.
