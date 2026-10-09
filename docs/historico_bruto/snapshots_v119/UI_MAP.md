# UI MAP — pontos mais editados

Use este arquivo para chegar rapidamente aos locais mais comuns.

## Sidebar
- `#primaryUserNav`: Início e Resumo.
- `#appsMenu`: Agenda, Tarefas, Listas, Biblioteca, Estudos e Diário.
- `#particularMenuToggle` / `#userPagesNav`: páginas particulares.
- Ajustes novos de tamanho/espaçamento: `public/ui-current.css`.

## Notificações
- Botão do sino: `#startNotifications` em `public/index.html`.
- Preview/hover: funções `bindStartNotificationsHover`, `openNoticesDialogAt`, `renderNotificationsPopover` em `public/app.js`.
- Página detalhada: `loadNotificationsPage` em `public/app.js`.
- Estilos existentes: buscar `notifications-` em `public/style.css`.

## Páginas particulares
- Estrutura/renderização: buscar `userPage`, `notion-` e `space-tree` em `public/app.js` e `public/style.css`.

## Versão e cache
Ao criar uma nova versão, atualizar:
- `src/config/sofia.js`;
- `src/server.js`;
- `public/index.html` (título, cache e rodapé);
- `package.json` / `package-lock.json`;
- teste atual em `tests/current-ui.test.cjs`.


### Sino / notificações
- Estrutura e fallback de hover: `public/index.html` (`notificationsHoverShell`)
- Aparência/abertura por hover e posicionamento atual: `public/ui-current.css` (bloco v107)
- Dados, marcar como lida e central detalhada: `public/app.js` (`renderNotificationsPopover`, `loadNotificationsPage`)

## Preservação documental v106
- Histórico bruto: `docs/historico_bruto/`
- Contexto para novo chat: `docs/CONTEXTO_NOVO_CHAT.md`
- Guia completo atual: `docs/GUIA_MASTER_COMPLETO.md`
- A ferramenta de simplificação não deve remover documentos.

## Correção visual v107
- O preview do sino é ancorado à direita do botão e se projeta para a esquerda, evitando overflow na borda direita.
- Não mover essa regra de volta para a área histórica do `style.css`; ajustes atuais do popover devem ficar em `public/ui-current.css`.


## Correção visual v109
- layout principal das páginas: `public/app.js` em `renderNotionPage`;
- centralização dos botões do topo e limpeza visual: `public/ui-current.css` (bloco v109);
- ações secundárias concentradas em `showUserPageActions()` no `public/app.js`.


## Correção visual v110
- capa, ícones e hover de linhas vazias: `public/ui-current.css` (bloco v110).


## Correção visual v111
- espaçamento do gutter do editor: `public/ui-current.css` (bloco v111).


## v117
- largura/X dos itens do Resumo: `public/ui-current.css`;
- estado padrão de subpáginas: `pageTreeExpanded` em `public/app.js`.


## Agenda v118
- estrutura: `public/index.html` em `#tab-commitments`;
- lógica/viewer: `public/app.js` em `loadCommitments` / `renderAgendaViewer`;
- layout: `public/ui-current.css` no bloco v118.


## v119 — Agenda interativa
- interação/criação/drag do calendário: `public/app.js`, funções `agendaCreateAt`, `agendaMoveRowToDay`, `agendaRenderMonth`;
- layout visual do calendário e formulários: `public/ui-current.css`;
- metadados de sync de tarefas: `src/memory/migration119.js` + `src/memory/store.js`.
