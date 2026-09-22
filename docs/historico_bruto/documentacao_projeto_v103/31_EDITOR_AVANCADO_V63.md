# Sofia OS v63 — editor avançado de páginas

## Objetivo

A v63 transforma as páginas dos Espaços em um editor de blocos mais próximo do fluxo de trabalho do Notion, sem abandonar a arquitetura local da Sofia. O conteúdo continua pertencendo ao registro `user_page`; criar um bloco não cria entidades paralelas desnecessárias.

## Blocos disponíveis

O menu `/` e o botão `+` passam a oferecer:

- Texto;
- Título 1, 2, 3 e 4;
- Página nova dentro da página atual;
- vínculo para página existente;
- lista com marcadores;
- lista numerada;
- lista de tarefas/checklist;
- lista de alternantes (toggle);
- código com seletor de linguagem e copiar;
- citação;
- frase de destaque/callout com ícone;
- equação em bloco;
- divisor;
- imagem local;
- arquivo local;
- link/bookmark;
- tabela simples;
- data;
- vínculo com tarefa;
- vínculo com compromisso/lembrete da Agenda;
- bloco “Perguntar à Sofia”.

## Rich text

Ao selecionar texto dentro de um bloco textual, a interface abre uma barra contextual com:

- transformação do tipo de bloco;
- negrito;
- itálico;
- sublinhado;
- tachado;
- código inline;
- destaque;
- link;
- equação inline;
- comentário;
- limpar formatação.

O HTML salvo é sanitizado no cliente e validado novamente no backend. Tags executáveis, handlers `on*`, `javascript:` e elementos como `script`, `iframe`, `object`, `embed`, `form` e `svg` são recusados no conteúdo rich text.

## Operação dos blocos

O menu do grip (`⋮⋮`) permite transformar, duplicar, mover para cima, mover para baixo ou excluir o bloco. Arrastar e soltar continua disponível.

Atalhos Markdown no início do bloco:

- `# ` → Título 1;
- `## ` → Título 2;
- `### ` → Título 3;
- `#### ` → Título 4;
- `- ` ou `* ` → lista com marcadores;
- `1. ` → lista numerada;
- `[] ` ou `[ ] ` → checklist;
- `> ` → citação;
- três crases + espaço → código.

`Enter` cria o próximo bloco e `Shift + Enter` mantém quebra dentro do mesmo bloco. Um bloco vazio pode ser removido com Backspace.

## Mídia local

Imagens e arquivos são anexados ao próprio registro da página e entram nos backups locais. O limite permanece 10 MB por arquivo e 50 MB no total da instalação nesta etapa.

Formatos adicionados à lista local segura: WebP, GIF, Markdown, CSV, JSON e ZIP, além dos formatos já aceitos. SVG/HTML executável não são aceitos como imagem inline.

A rota de leitura de anexos possui modo `inline=1`, que preserva o MIME real para renderizar imagens dentro da página; o download comum continua saindo como `application/octet-stream`.

## Integração com a Sofia

Uma página pode vincular registros reais da Sofia sem duplicá-los. Os blocos de tarefa e Agenda guardam referência ao registro correspondente. O bloco “Perguntar à Sofia” leva o texto do bloco para o Chat junto do caminho da página, mas não envia automaticamente: o usuário ainda pode revisar a mensagem antes do envio.

## Compatibilidade

Páginas antigas da v59–v62 continuam sendo lidas. Blocos antigos (`text`, `heading1`, `heading2`, `bullet`, `number`, `todo`, `quote`, `divider`) permanecem válidos e recebem os novos campos apenas quando editados.

## Limites desta versão

A v63 não tenta reproduzir todo o Notion. Ainda não há:

- banco de dados relacional completo com fórmulas/rollups;
- colaboração multiusuário em tempo real;
- histórico de edição por bloco com autoria colaborativa;
- renderizador matemático completo tipo KaTeX/MathJax;
- embeds arbitrários de terceiros;
- colunas livres e layouts complexos por drag-and-drop.

Esses itens podem ser adicionados depois sem mudar o contrato básico de `user_page + blocks_json`.
