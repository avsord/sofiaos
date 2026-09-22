# Sofia OS v84 — alterações completas

Esta entrega preserva as correções acumuladas da v83 e inclui o novo conjunto solicitado em 21/09/2026.

## O que mudou

- Controles do topo das páginas Particular continuam fixos durante a rolagem.
- O sino de notificações abre uma mini janela ancorada; **Ver todas as notificações** abre a página completa agrupada por área.
- O Início ganhou o botão flutuante **Topo** para voltar rapidamente ao começo sem depender dos scrolls internos dos widgets.
- O uso Privado agora mostra tokens mensais da própria instalação, entrada, saída, requisições e a mesma barra em degradê usada pelo Compartilhado. O valor em USD continua sendo uma estimativa local quando as tarifas estão configuradas.
- Imagens copiadas podem ser coladas com `Ctrl+V` no chat principal, no chat do modo desenvolvedor e na Sofia das páginas Particular. A Sofia recebe a imagem no Filtro Privado e consegue analisá-la junto da mensagem.
- Imagens do chat ficam temporárias por padrão; podem ser salvas explicitamente em uma página Particular.
- Imagens também podem ser coladas diretamente em páginas Particular.
- Imagens salvas na página podem ser redimensionadas pelos quatro cantos, mantendo proporção, e reposicionadas por arraste. O arquivo original não perde resolução.

## Atualização

1. Pare a Sofia com `Ctrl+C`.
2. Extraia este ZIP.
3. Execute `ATUALIZAR_SOFIA.cmd`.
4. O atualizador preserva `.env`, memória, dados, backups e o `INICIAR_SOFIA.cmd` personalizado.
5. Depois, abra `INICIAR_SOFIA.cmd` na pasta `SOFIA-OS`.
