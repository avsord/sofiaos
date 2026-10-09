# Sofia OS v85 — alterações completas

Data da release: 21/09/2026

A v85 mantém as mudanças da v84 e implementa o conjunto acumulado solicitado depois dela.

## 1. Imagens nas páginas Particular

### Seleção e escala

- Clicar na imagem seleciona o bloco e mostra as alças de redimensionamento.
- As alças só existem visualmente enquanto a imagem estiver selecionada, sendo movida ou redimensionada.
- Clicar fora, selecionar outro elemento ou pressionar `Esc` remove a seleção e esconde imediatamente as alças.
- O bloco não fica preso no estado **Adicionar legenda** depois de perder a seleção.
- O redimensionamento continua pelos quatro cantos, preservando a proporção por padrão.
- Reposicionar a imagem continua sendo possível sem regravar/destruir o arquivo original.

### Menu contextual da imagem

Ao selecionar uma imagem aparecem ações próprias:

- **Editar imagem** — legenda, texto alternativo e restauração de tamanho/posição;
- **Adicionar link / Editar link** — o link fica associado à imagem, pode ser alterado e pode ser removido deixando o campo vazio;
- **Adicionar comentário / Editar comentário** — comentário associado exclusivamente à imagem;
- **Abrir link**, quando houver link válido.

O comentário é oculto por padrão. Ele só aparece quando a própria imagem está selecionada e volta a ficar oculto ao clicar fora ou pressionar `Esc`.

## 2. Chat principal

O chat da Sofia no Início foi centralizado no container de conteúdo para eliminar o deslocamento lateral observado na v84.

## 3. Exclusão rápida

O antigo aspecto de “botão + X” foi unificado em um único controle visual `×`, sem um segundo botão redundante ao redor.

## 4. Template Kanban / Tarefas em quadro

A visualização em quadro foi reorganizada para ficar compacta e próxima do fluxo do Notion:

- colunas lado a lado;
- largura e espaçamento reduzidos;
- cabeçalho em chip/pílula com status e contagem;
- fundo suave por status;
- `+ Nova página` dentro de cada coluna;
- cartões clicáveis;
- estados padrão: **Não iniciada** (neutro/cinza), **Prioridade** (vermelho/rosa) e **Concluído** (verde).

A coluna genérica **Sem grupo** só aparece quando realmente houver registros sem status/grupo.

## 5. Novo template Páginas/Lista

Foi adicionado um template de coleção voltado a conteúdos como Comandos, Addons, Vídeos, Canais, anotações e outras bases de páginas.

Estrutura inicial:

- **Guidance** recolhível;
- **Pinned Notes**;
- helper de edição/comandos;
- **Recently Added**;
- **Recently Updated**.

Os itens da coleção são páginas reais dentro da visualização. Clicar em um item abre uma página/modal ampla com:

- título grande editável;
- propriedades;
- corpo de conteúdo editável;
- rolagem interna;
- atualização refletida de volta na coleção.

As visualizações podem compartilhar a mesma fonte de dados para evitar cópias independentes do mesmo registro.

## 6. Templates preservam o ícone da página

Aplicar qualquer template altera apenas estrutura, blocos, propriedades e views. O emoji/ícone já escolhido para a página não é trocado automaticamente.

## 7. Notificações

- Clicar no sino abre imediatamente a mini janela, antes mesmo do término da consulta ao backend.
- Durante a consulta, o popover continua presente em estado de carregamento.
- Se não houver itens, aparece **Sem notificações**.
- A ação **Ver todas as notificações** continua disponível inclusive no estado vazio.
- A página completa reúne notificações de todas as áreas e as organiza por área/categoria.

## 8. Agenda

O nome visível **Compromissos** foi substituído por **Agenda**. No menu lateral a ordem oficial é:

1. Agenda
2. Tarefas

A funcionalidade de eventos/lembretes existente foi preservada.

### Tarefas datadas na Agenda

Toda tarefa com data passa a integrar automaticamente a Agenda sem exigir um evento duplicado.

Cada tarefa mostra:

- label azul de origem/status: `Tarefa > A fazer`, `Tarefa > Ativa`, `Tarefa > Concluída` etc.;
- prioridade separada, quando definida:
  - **Importante** — vermelho;
  - **Médio** — azul;
  - **Leve** — verde.

Data, status e prioridade usados pela Agenda são derivados do registro real da tarefa, evitando uma segunda cópia manual.

## 9. Prioridade em três níveis

O armazenamento de tarefas ganhou `priority_level` com os níveis `important`, `medium`, `light` e `none`. A migração mantém compatibilidade com o antigo booleano de prioridade e o novo campo faz parte de exportação/restauração de backup.

## 10. Subpáginas

Cada item de página na seção Particular possui um `+` para criar uma subpágina diretamente vinculada àquela página.

- subpáginas aparecem indentadas no menu;
- pais com filhos podem ser expandidos/recolhidos;
- subpáginas também possuem `+`, permitindo novos níveis;
- a página pai mantém seu conteúdo normal;
- dentro da página pai, filhos aparecem como links/itens internos clicáveis.

## 11. Modo default de página

O menu `...` da página possui **Modo default**. Nesta release, “default” significa o formato básico de página, e não “definir a página que abre primeiro”.

Ao confirmar o modo default:

- mantém o título da página para o usuário poder editar;
- remove template e estrutura pré-preenchida;
- volta a um corpo em branco;
- limpa capa e emoji personalizados;
- volta ao ícone padrão de documento/folha `🗎`;
- capa e emoji continuam opcionais e podem ser adicionados novamente.

Se houver conteúdo/template/ícone/capa, a Sofia pede confirmação antes da limpeza para evitar perda acidental.

## 12. Compatibilidade com v84

Continuam presentes:

- topo fixo das páginas Particular;
- botão de voltar ao topo;
- uso Compartilhado/Privado com barras de degradê e dados próprios;
- colagem de imagens com `Ctrl+V`;
- análise de imagem pela Sofia;
- salvamento opcional em página;
- redimensionamento e reposicionamento sem reduzir o arquivo original.

## Atualização segura

`ATUALIZAR_SOFIA.cmd` usa o manifesto da v85 e valida SHA-256 dos arquivos de código distribuídos antes da primeira troca. O código anterior é salvo em backup para rollback. `.env`, `data`, memória, credenciais e demais arquivos protegidos não entram na substituição.
