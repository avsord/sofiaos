# Sofia OS v77 — templates, widgets e refinamentos

## Templates
A galeria de templates de página foi reduzida aos dois modelos solicitados:

1. **Banco de ideias / anotações** — tabela com as visualizações “Todas as anotações”, “Por curso”, “Literatura 455” e “Lista simples”.
2. **Tarefas em quadro** — Kanban com as colunas “Não iniciada” e “Prioridade”.

As coleções permitem criar, editar e excluir propriedades, criar/editar/excluir visualizações, renomear o banco e arrastar cartões entre colunas do quadro.

## Interface
- “APLICATIVOS DA SOFIA” passa a se chamar **CENTRAL DE APLICATIVOS**.
- Páginas da seção PARTICULAR usam a mesma régua vertical dos itens laterais, sem alterar o cabeçalho PARTICULAR.
- Texto e seta do botão Enviar permanecem brancos.

## Resumo
- Reordenação de widgets não aciona auto-scroll vertical.
- Soltar sobre o widget vizinho altera a ordem corretamente.
- Atualizações de Agenda/Tarefas usam atualização parcial dos widgets para evitar flicker da Home inteira.
