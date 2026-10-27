# Diagnóstico do site no computador (≥1024 px)

Levantamento pelo código (não por prints): onde cada tela ainda foi escrita só para celular.
Contagem inicial (0.3.250): folhas de baixo / botões de largura total / textos de toque / segurar.

| Arquivo | Achado (0.3.250) | Situação |
|---|---|---|
| Base: Button, IconButton, ModuleHeader | 50 px de altura, largura total, ícones de 44 px, sem hover | Feito na 0.3.251 |
| Base: MotionModal (tela cheia) | 14 telas cheias (editores) | Feito na 0.3.251: painel lateral |
| Base: Sheet | folha de baixo | Feito na 0.3.250: janela central |
| Textos de toque (35 em 14 arquivos) | “Toque”, “Segure”, “ao tocar” | Feito na 0.3.251 (tap) |
| Pages.tsx | capa e barra presas numa coluna de 980 px | Feito na 0.3.251 |
| NotebookBlock.tsx | pastas em 2 cartões de 48% | Feito na 0.3.251: cartões fixos |
| Workspace.tsx (editor de tarefa) | Modal cru de tela cheia | Feito na 0.3.251: painel lateral |
| Finance.tsx | 20 folhas, 24 botões, abas no topo, Resumo em 1 coluna, botão flutuante | Resumo em 2 colunas e + no topo feitos na 0.3.252; pendente: Contas/Lançamentos/Cartões em tabela |
| Chat.tsx (web) | mensagens de cabeça para baixo | Corrigido na 0.3.252 |
| Profile.tsx | abas grandes e coluna única | Menu lateral na 0.3.252 |
| Monitoring.tsx | lista de produtos em cartões; ações por segurar | Pendente: tabela de produtos (preço atual, menor, variação), clique direito |
| Mail.tsx | caixa em lista única | Pendente: 3 colunas (contas, lista, e-mail aberto) |
| Workspace.tsx (Tarefas) | lista de toque | Pendente: tabela com colunas, ordenação e filtros |
| PageTreeList.tsx | mover página só por segurar (8 pontos) | Pendente: arrastar direto com o mouse |
| Chat.tsx | selecionar mensagens por segurar | Pendente: clique direito / Shift+clique |
| Agenda.tsx | criar no dia por segurar | Pendente: duplo clique no dia; visão de semana |
| Composer.tsx | cancelar gravação deslizando | Pendente: botão Cancelar no computador |
| Clique direito (geral) | não existe | Pendente: menu de contexto nos itens que hoje usam segurar |

## Fundação (0.3.253)
| Causa raiz | Situação |
|---|---|
| Tamanhos de celular fixos no código (texto, controles, espaços, cantos) | Feito: camada de escala de computador (src/web), sem mudar as telas |
| Rolagem presa numa coluna (barra no meio da tela) | Feito: rolagem na largura toda, conteúdo centralizado (ContentWidth) |
| Telas em uma coluna só | Em andamento: Início, Finanças, Agenda e Perfil já em colunas; faltam E-mails (3 colunas), Tarefas/Price Tracker/Contas em tabela |
