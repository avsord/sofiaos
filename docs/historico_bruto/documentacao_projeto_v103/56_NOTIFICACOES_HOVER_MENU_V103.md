# v103 — sino no hover e tipografia do menu

- O listener do sino agora é ligado logo após a criação do popover, antes das rotinas mais pesadas da interface.
- O hover usa `pointerenter` e `mouseenter` como redundância e mantém a tolerância ao mover o cursor para a janela.
- O clique continua abrindo a mesma prévia.
- O cache do front foi atualizado para v103.
- Os textos **Início** e **Resumo** usam o mesmo tamanho dos demais itens do menu lateral.
