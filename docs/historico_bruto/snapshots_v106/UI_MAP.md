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
- Aparência/abertura por hover: `public/ui-current.css` (bloco v105)
- Dados, marcar como lida e central detalhada: `public/app.js` (`renderNotificationsPopover`, `loadNotificationsPage`)

## Preservação documental v106
- Histórico bruto: `docs/historico_bruto/`
- Contexto para novo chat: `docs/CONTEXTO_NOVO_CHAT.md`
- Guia completo atual: `docs/GUIA_MASTER_COMPLETO.md`
- A ferramenta de simplificação não deve remover documentos.
