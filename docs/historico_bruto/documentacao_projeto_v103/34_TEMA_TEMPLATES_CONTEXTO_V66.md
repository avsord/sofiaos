# Sofia OS v66 - Tema global, coleções e Sofia contextual

## Objetivo

A v66 evolui a interface e as páginas sem mudar o princípio central da Sofia: a IA continua sendo a autoridade semântica, enquanto o backend valida e executa.

## Tema global

Aparência agora possui três modos:

- **Sistema** (padrão): acompanha `prefers-color-scheme` do navegador/sistema operacional e reage a mudanças enquanto a Sofia está aberta.
- **Claro**: tema claro inspirado na linguagem visual limpa do Notion - fundo branco, sidebar cinza-clara, texto `#37352f`, superfícies `#f7f7f5` e bordas suaves.
- **Escuro**: mantém a identidade escura já existente da Sofia.

A escolha manual fica salva em `localStorage` e é aplicada antes do CSS principal para reduzir flash de tema incorreto na abertura.

## Sidebar

Os símbolos dos itens de navegação usam uma coluna fixa à direita, mantendo alinhamento consistente entre Tarefas, Compromissos, Listas, Biblioteca, Estudos e Diário Pessoal.

## Páginas e subpáginas

- O breadcrumb superior representa a hierarquia real de páginas e é clicável em todos os níveis.
- Excluir uma `user_page` exclui recursivamente suas subpáginas e sub-subpáginas.
- Relações internas da própria árvore não bloqueiam a exclusão recursiva.
- Referências externas à árvore continuam protegidas para evitar remoção silenciosa de conteúdo utilizado fora dela.

## Templates de coleção

A página continua aceitando blocos livres, mas a v66 adiciona um bloco `collection` com propriedades e visualizações reais.

Templates principais:

- **Ideias - database**: Nome, Criado, Status, Tags e Projeto; views de tabela, lista e galeria.
- **Tarefas - quadro**: Kanban por Status, tabela alternativa e cards arrastáveis entre colunas.
- **Links / referências**: Nome, Categoria, URL e Created time; tabela e cards.
- **Equipamentos / inventário**: Equipamento, Modelo, Valor, Link, Local e Estado.

Os templates antigos de Notas, Projeto, Reunião, Pesquisa, Conteúdo, Compras e Planejamento semanal continuam disponíveis.

## Undo/redo

No editor de página:

- `Ctrl+Z` / `Cmd+Z`: desfazer.
- `Ctrl+Y`: refazer.
- `Ctrl+Shift+Z` / `Cmd+Shift+Z`: refazer.

O histórico cobre o estado da página/blocos durante a sessão do editor.

## Mini Sofia contextual

Fora do Início, a interface exibe uma bolha da Sofia no canto inferior direito. Ao abrir:

- usa a mesma conversa da sessão;
- mostra o contexto da área atual;
- em `user_page`, envia ID, caminho hierárquico, título, propósito e blocos atuais como contexto interno;
- referências como “aqui”, “esta página” e “nessa página” podem ser resolvidas pela IA;
- alterações simples na página atual devem usar `update_record` no mesmo ID, nunca criar uma página duplicada.

O contexto da página pode ser removido no próprio mini-chat para uma conversa global.

## Limitação externa

A v66 não ativa automaticamente pesquisa aberta na Internet dentro da instalação local. O mini-chat já possui contexto e capacidade de operar os dados locais; pesquisa web exige uma ferramenta/provedor externo explicitamente habilitado e auditado. A Sofia não deve alegar que pesquisou a Internet sem uma ferramenta real.
