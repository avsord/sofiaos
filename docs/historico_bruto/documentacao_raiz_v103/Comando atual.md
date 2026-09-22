# Sofia OS v103 - Estado atual do projeto

## Regra central da Sofia

**Usuário -> IA interpreta -> IA conversa/pergunta se necessário -> usuário responde -> IA interpreta novamente -> plano estruturado -> backend valida/executa -> resultado técnico -> IA -> resposta natural.**

A IA é a autoridade semântica global. O backend valida, protege, persiste e executa; não deve competir com a IA reinterpretando linguagem natural.

Se a intenção ainda estiver ambígua, a Sofia deve continuar a conversa em linguagem natural e pedir somente o esclarecimento mínimo necessário. Não expor JSON, parser, schema ou erro interno ao usuário quando houver recuperação conversacional possível.

## Versão atual

- Produto: **Sofia OS v103**
- Core: **103.0.0**
- Package: **1.52.0**
- Banco SQLite esperado após migração: `PRAGMA user_version = 7`
- Snapshot de backup atual: schema 6

## Atualização e preservação obrigatórias

Sempre preservar em atualização:

- `.env` e chaves;
- `data/`, memória e anexos;
- backups e exports;
- configurações e preferências do usuário;
- páginas Particular e seu conteúdo;
- `INICIAR_SOFIA.cmd` personalizado;
- dados que não pertençam ao código gerenciado.

O atualizador da v103 usa `MANIFESTO_V103.json`, valida SHA-256 antes de alterar a instalação, cria backup do código anterior e oferece rollback por `REVERTER_ATUALIZACAO.cmd`.

## Interface principal

### Menu lateral

- Início e Resumo continuam acima da seção recolhível APPS.
- Dentro de APPS, **Agenda aparece acima de Tarefas**.
- O nome visível antigo **Compromissos** foi substituído por **Agenda**.
- PARTICULAR continua separado dos módulos do sistema e seu cabeçalho usa o mesmo bloco visual de APPS.
- Páginas do usuário formam uma árvore hierárquica com indentação e expandir/recolher.
- Cada página possui `+` ao lado para criar subpágina; subpáginas também podem criar novos níveis.

### Início / chat principal

- Chat principal fica centralizado no container do conteúdo.
- Thread e composer permanecem separados.
- Botão Enviar mantém conteúdo branco nos estados previstos.
- Botão rápido de retorno ao topo continua disponível.
- Widgets internos podem ter scroll próprio sem impedir o retorno ao topo da página.

### Controles de página

- Controles do topo das páginas Particular permanecem no canto superior direito original em uma camada de viewport filha direta de `body`; nenhum scroll da página pode deslocá-los.
- Ícone padrão de página é uma folha/documento simples (`🗎`).
- Emoji/ícone e capa são opcionais.
- Templates nunca alteram automaticamente o emoji/ícone já escolhido.
- `...` possui **Modo default** para voltar ao formato básico: título editável, corpo em branco, sem template/conteúdo pré-preenchido, com capa Lavanda padrão e ícone padrão de documento.
- Se Modo default remover conteúdo/template/capa/ícone existente, exigir confirmação antes da limpeza.

## Páginas e subpáginas

- `create_user_page` é usado apenas quando a criação de página é realmente explícita.
- Para editar a página atual, usar as ferramentas semânticas existentes (`append_page_block`, `append_page_structure`, `edit_page_block`, `delete_page_block`) e preservar o mesmo ID.
- A página pai continua sendo uma página normal; subpáginas não substituem seu conteúdo.
- Quando houver filhos, a página pai também mostra links/itens internos clicáveis para essas subpáginas.
- Breadcrumb deve refletir a hierarquia real.

## Imagens em chats e páginas

### Chat

- Chat principal, chats contextuais e Sofia nas páginas Particular aceitam imagem colada via `Ctrl+V`.
- Mostrar prévia e permitir remoção antes do envio.
- A Sofia pode compreender/analisar a imagem junto da mensagem quando a rota suportar visão.
- A imagem do chat é temporária por padrão; só é salva permanentemente quando o usuário pedir.
- O usuário pode salvar a imagem na página/área Particular correspondente.

### Página Particular

- Imagem pode ser colada diretamente na página.
- Pode ser redimensionada pelas quatro alças dos cantos mantendo proporção por padrão.
- Pode ser reposicionada por arraste.
- Tamanho/posição de apresentação não devem destruir/reduzir o arquivo original salvo.
- Ao tirar a seleção, as alças desaparecem imediatamente.
- Clique fora, seleção de outro bloco ou `Esc` encerram a edição e impedem o estado travado de legenda.

### Menu contextual da imagem

Ao selecionar a imagem, mostrar em **uma única linha horizontal flutuante abaixo do frame**, sem empurrar o documento:

- **Editar imagem**;
- **Adicionar/Editar link**;
- **Adicionar/Editar comentário**;
- **Abrir link**, quando aplicável.

O link pertence à imagem e pode ser alterado/removido. O comentário pertence à imagem e fica **oculto por padrão**, aparecendo somente enquanto a imagem está selecionada. Ao clicar fora ou pressionar `Esc`, comentário, toolbar e alças somem.

## Templates de páginas

### Regra global

Aplicar template modifica estrutura, blocos, propriedades e views, mas **preserva o ícone/emoticon atual da página**.

### Banco de ideias / anotações

Permanece disponível e editável.

### Tarefas em quadro / Kanban

Visualização inspirada na estrutura compacta do Notion:

- colunas lado a lado;
- cabeçalho em chip/pílula + contagem;
- `+ Nova página` em cada coluna;
- cartões clicáveis;
- status padrão:
  - **Não iniciada**: cinza/neutro;
  - **Prioridade**: vermelho/rosa;
  - **Concluído**: verde;
- `Sem grupo` só aparece se houver itens realmente sem grupo/status.

### Páginas / Lista

Template de coleção para Comandos, Addons, Vídeos, Canais e bases semelhantes:

- Guidance recolhível;
- Pinned Notes;
- Recently Added;
- Recently Updated;
- páginas/linhas compartilhando a mesma fonte quando necessário;
- clique no item abre página/modal ampla com título, propriedades e corpo editável;
- modal possui rolagem interna e salva alterações na coleção real.

## Agenda

Agenda reúne eventos/lembretes e também tarefas com data.

### Tarefas datadas

Toda tarefa com `due_at` aparece automaticamente na Agenda, sem criar cópia manual de compromisso.

Exibir duas labels independentes:

1. origem/status em azul: `Tarefa > [status]`, por exemplo `Tarefa > A fazer`, `Tarefa > Ativa`, `Tarefa > Concluída`;
2. prioridade:
   - **Importante**: vermelho;
   - **Médio**: azul;
   - **Leve**: verde.

A Agenda lê os dados da tarefa real, de modo que mudanças de data/status/prioridade se reflitam nela.

### Prioridade de tarefa

- `priority_level`: `none | important | medium | light`.
- Compatibilidade com o booleano legado `priority` é mantida.
- Campo participa do backup/restore.

## Notificações

- Passar o mouse sobre o sino abre um preview pequeno e flutuante; clique também pode mantê-lo aberto para acessibilidade.
- O ponteiro pode entrar na janela sem flicker; a janela fecha ao sair quando foi aberta por hover.
- Se não houver itens: mostrar **Você não tem notificações.**
- Muitas notificações usam scroll interno, sem mover a página.
- Ação textual **Ver todas** permanece disponível mesmo vazio e abre a central completa.
- A página ampliada reúne todas as notificações, separa primeiro por área e depois por origem, com estado, data, categoria, importância, vínculo e ações.
- O preview não deve travar nem ficar silencioso se o backend demorar/falhar.

## Exclusão rápida

Quando um item possuir apenas ação de remover, usar **um único controle `×`**, sem renderizar visualmente “um botão e um X” como dois controles diferentes.

## Uso da Sofia

Existem filtros **Compartilhado** e **Privado**, cada um com dados próprios.

### Compartilhado

- exibe tokens usados, total/referência, restante e porcentagem;
- alertas são informativos e não bloqueiam conversa;
- barra representa uso real na escala verde -> amarelo/laranja -> vermelho;
- marcador de alerta é independente do uso.

### Privado

- deve ter a mesma riqueza visual/informacional do Compartilhado;
- leitura mensal de tokens incluindo entrada, saída e requisições; com `OPENAI_ADMIN_KEY`, usar Usage oficial da organização;
- dados privados não podem ser espelho falso do Compartilhado: usar a fonte privada real;
- com `OPENAI_ADMIN_KEY`, sincronizar o gasto em USD pelo Costs oficial; usar estimativa local apenas como fallback claramente identificado;
- mesma barra de degradê e lógica de alerta do Compartilhado.

## Voz

Pipeline normal:

**microfone -> áudio original -> transcrição -> mesma IA -> backend se necessário -> resposta.**

O áudio continua visualmente como áudio; a transcrição é usada internamente. Safe Chat mantém o fluxo protegido já implementado.

## Mini Sofia / contexto

- Mini Sofia recebe página aberta como prioridade contextual suave, sem perder o cérebro/contexto global.
- Quando aplicável, recebe page_id, path, `available_pages` e estrutura/conteúdo atual.
- Ações executadas devem refletir imediatamente na interface sem depender de F5.

## Feedback, tema e editor

- Tema global Sistema / Claro / Escuro continua preservado.
- Modo claro segue a hierarquia visual já adotada, inspirada em interfaces documentais do Notion, com azul para ações primárias.
- Feedback comum não deve abrir barra lateral desnecessária.
- `Ctrl+Z/Y` do editor continua funcional.
- Tabelas/áreas densas mantêm scroll local quando necessário, sem criar deslocamentos do viewport principal.

## Pendências conhecidas que não devem ser fingidas

- Pesquisa aberta na Internet ainda exige ferramenta/provedor real quando não houver integração disponível.
- Waveform de áudio atual é visual, não cálculo real de amplitude, salvo implementação futura.
- Não redistribuir arte proprietária de emoji; usar Unicode nativo ou assets licenciáveis/abertos.
- Leituras organizacionais completas da OpenAI dependem das credenciais/permissões realmente configuradas.

## Protocolo de validação por release

Antes de entregar:

1. incrementar versão;
2. criar testes específicos da mudança;
3. rodar a suíte completa;
4. validar sintaxe dos arquivos críticos;
5. validar atualização e rollback;
6. preservar dados protegidos;
7. gerar manifesto SHA-256;
8. verificar o ZIP final;
9. atualizar `LEIA_PRIMEIRO.md`, `Comando atual.md`, `PROMPT_CONTINUAR_SOFIA.md` e relatório de testes;
10. entregar ZIP com link clicável.

## Checkpoint v84 preservado

- notificações em popover + página completa por área;
- botão Topo;
- controles de página fixos;
- Privado equivalente visualmente ao Compartilhado;
- imagens via Ctrl+V nos chats/páginas;
- análise e salvamento opcional de imagem;
- resize/movimento de imagens preservando o original.

## Checkpoint v85

- correção completa do estado de seleção/legenda das imagens;
- toolbar contextual com edição, link e comentário oculto;
- centralização do chat principal;
- exclusão rápida unificada em `×`;
- Kanban compacto com Concluído verde;
- novo template Páginas/Lista com modal de página;
- templates preservam emoji/ícone;
- sino sempre abre e mostra estado vazio + acesso às notificações completas;
- Compromissos renomeado para Agenda;
- Agenda acima de Tarefas;
- tarefas datadas aparecem na Agenda com origem/status e prioridade em três níveis;
- páginas ganham criação/hierarquia de subpáginas;
- Modo default volta a página para o formato básico com ícone de documento e confirmação destrutiva;
- migração do banco para user_version 7 e backup schema 6;
- versão atual: **85.0.0**.


## Checkpoint v86

- versão atual: **Sofia OS v86 / Core 86.0.0 / package 1.37.0**;
- árvore PARTICULAR não usa mais a classe global `selected` no nó estrutural; seleção fica no botão e o item Enjoy the Void mantém largura correta;
- toolbar de imagem é overlay absoluto em duas linhas/duas colunas conforme necessário, sem alterar o fluxo nem causar flicker;
- legenda vazia não aparece ao clicar na foto e o drag só começa após movimento real;
- controles `+`, engrenagem e `…` foram movidos para fora do painel rolável e ficam presos ao `main`;
- Uso Privado/Compartilhado pode sincronizar tokens e requisições com o endpoint oficial de Usage da organização usando `OPENAI_ADMIN_KEY`;
- Configurações permite validar/salvar uma chave Admin separada; sem ela, a interface identifica os valores como locais;
- atualizador da release usa `MANIFESTO_V86.json` e continua preservando `.env`, dados, memória, anexos, backups e `INICIAR_SOFIA.cmd` personalizado.


## Checkpoint v88

- versão atual: **Sofia OS v88 / Core 88.0.0 / package 1.39.0**;
- `+`, engrenagem e `…` das páginas Particular permanecem no canto superior direito original e ficam fixos na viewport, sem acompanhar scroll;
- cabeçalho PARTICULAR segue o mesmo padrão visual do bloco APPS;
- toolbar da imagem é uma linha horizontal flutuante abaixo da imagem, fora do frame e sem reflow;
- alternar Compartilhado/Privado atualiza somente o cartão de uso, preservando o thread e a posição do scroll;
- Privado sincroniza tokens/requisições pelo Usage e, com chave Admin, gasto pelo endpoint oficial Costs; fallback local continua explicitamente identificado;
- sino abre preview pequeno no hover; vazio mostra `Nenhuma notificação no momento.`; `Ver todas as notificações` leva à página ampliada organizada por origem/área e com detalhes;
- atualizador usa `MANIFESTO_V88.json` e preserva `.env`, dados, memória, anexos, backups, exports e `INICIAR_SOFIA.cmd` personalizado;
- suíte completa: **460/460 testes aprovados**.
