# Sofia OS v91 — camada de viewport para ações da página

## Problema

A correção anterior dependia apenas de `position: fixed`, mas o container continuava aninhado na árvore visual do aplicativo. Isso deixava a solução dependente da forma como o navegador criava o containing block e da árvore efetivamente carregada.

## Solução v91

O container `#userPageFloatingActions` passou a ser um portal de viewport: filho direto de `body`, fora de `.shell`, `main` e `#tab-userpage`. O CSS final usa o seletor `body > .user-page-floating-actions`. O runtime chama `ensureUserPageActionsViewportLayer()` antes de exibir a página Particular e repara automaticamente o parent caso uma árvore antiga seja carregada.

Assim o scroll do documento da página Particular move somente o conteúdo; os três controles mantêm sua posição visual.
