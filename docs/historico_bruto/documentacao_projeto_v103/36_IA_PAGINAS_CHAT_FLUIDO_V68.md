# Sofia OS v68 - IA em páginas e chat fluido

## Objetivo

A v68 corrige a integração entre a IA, páginas personalizadas e o estado visual da interface.

## Regras centrais

- A IA continua sendo a autoridade semântica global.
- Adicionar conteúdo em uma página existente não pode criar uma página nova.
- Páginas possuem ferramentas semânticas próprias: `append_page_block`, `edit_page_block` e `delete_page_block`.
- O backend valida IDs, blocos, schema e persistência; ele não reinterpreta linguagem natural.
- A página nomeada explicitamente pelo usuário vence o contexto visual atual; expressões como "aqui" e "nesta página" usam `ui_context.page_id`.

## Contrato visual de páginas

`user_page` passa a aceitar e persistir:

- `icon`;
- `icon_mode` (`default`, `emoji`, `icon`, `upload`);
- `cover_type`;
- `cover_value`;
- `cover_attachment_id`.

Ícone é opcional. Sem escolha explícita, a interface usa o ícone padrão de documento.

## Sincronização da interface

Após uma ação da Sofia que cria, edita ou exclui página/bloco:

- a árvore `PARTICULAR` é atualizada imediatamente;
- a página atual é recarregada se necessário;
- um detalhe aberto para um registro excluído é fechado;
- não é necessário recarregar o navegador.

## Chat

O chat principal e a mini Sofia usam áreas de histórico roláveis com composer estável. O mini chat tem altura máxima ligada ao viewport para evitar mensagens cortadas.

## Tema claro e feedback

A hierarquia clara segue superfícies distintas para fundo, cards, campos e botões. Toasts/avisos são compactos e posicionados no canto inferior direito.
