# Sofia OS v59 — Espaços hierárquicos e editor em blocos

A v59 corrige a separação entre **Espaços** e **Páginas** e transforma as páginas personalizadas em uma área editável por blocos, inspirada na lógica do Notion.

## Estrutura de Espaços

- **Espaço** é o nível raiz criado em **Seus Espaços**.
- **Página** vive dentro de um Espaço ou de outra Página.
- **Subpágina** pode ser criada dentro de uma Página.
- A sidebar renderiza essa hierarquia em árvore, em vez de misturar tudo no mesmo nível.
- Quando a Sofia recebe “crie uma página Ideias dentro de Enjoy the Void”, ela deve criar `Enjoy the Void → Ideias`, não um segundo espaço raiz chamado Ideias.
- Se o pai solicitado não existir, a operação falha de forma segura; a página não é criada solta no nível raiz.

## Migração do caso da v58

A migração v59 procura apenas o caso seguro em que uma `user_page` raiz criada pela v58 possui mensagem de origem explícita dizendo que era uma página/subpágina **dentro de** outro espaço raiz existente. Nessa situação, ela corrige `parent_id` e `node_type` automaticamente. Não há reorganização genérica por palavras-chave.

## Editor por blocos

A página personalizada passa a ter um editor em blocos com:

- título editável diretamente na página;
- texto;
- título 1 e título 2;
- lista com marcadores;
- lista numerada;
- checklist;
- citação;
- divisor;
- botão `+` para adicionar blocos;
- menu `/` para trocar/criar tipos de bloco;
- `Enter` para criar o próximo bloco;
- remoção de bloco vazio com `Backspace`;
- alça de arraste para reordenar;
- salvamento automático;
- links para subpáginas dentro da página atual.

Isso implementa a **lógica fundamental de edição por blocos**. Não pretende ainda reproduzir todas as funções do Notion, como databases avançados, fórmulas, colaboração em tempo real e dezenas de tipos de embed.

## Chat

O Chat público passa a obedecer a uma regra de sessão mais precisa:

- trocar entre Início, Resumo, Tarefas, Biblioteca, Espaços etc. **não limpa a conversa**;
- clicar em **Chat** durante a mesma visita também não limpa a conversa;
- atualizar/recarregar a página inicia uma nova sessão visual e limpa as mensagens exibidas;
- sair do site e voltar em uma nova visita também inicia uma nova sessão visual;
- memória, registros, tarefas, compromissos, Biblioteca e Espaços continuam persistentes.

## Rolagem

No desktop a aplicação passa a ocupar a altura real do viewport (`100dvh`) e o `body` deixa de criar uma segunda rolagem externa. A área principal mantém uma única rolagem vertical. Em dispositivos móveis, a página volta ao fluxo natural.
