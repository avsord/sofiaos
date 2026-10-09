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


## v122 — scrollbar da sidebar
- regra final: `public/ui-current.css`, bloco v122;
- a área rolável principal é `.sidebar`, com fallback visual para `#userNavigation`.


## v126 — WhatsApp Business
- `public/app.js` → `loadConnections()` adiciona o botão **Conectar WhatsApp Business** no card WhatsApp/Meta.
- `public/whatsapp-connect.html` + `.js` + `.css` → tela pública mínima para Embedded Signup/coexistência.
- `src/core/http-handler.js` → rotas públicas mínimas de health, privacy, webhook e onboarding; restante do painel continua local/privado.


## v127 — WhatsApp Business / CSP
- `/whatsapp/connect` mantém o mesmo visual e fluxo da v126.
- A política de conteúdo da rota permite os requests do SDK oficial da Meta necessários ao Embedded Signup sem abrir scripts inline.

## v128 — WhatsApp Business / callback Meta
- `public/whatsapp-connect.js` → `FB.login` recebe callback síncrono compatível com o SDK; a troca do código continua assíncrona dentro do callback.
- Mantém coexistência por `whatsapp_business_app_onboarding` e não altera o painel privado.


## v129 — site público / Meta
- página institucional: `public/site.html` → `/site`;
- termos: `public/terms.html` → `/terms`;
- exclusão de dados: `public/data-deletion.html` → `/data-deletion`;
- rotas e cabeçalhos públicos: `src/core/http-handler.js`.

## v130 — login do painel online
- página de login é renderizada pelo backend em `src/core/http-handler.js` (`loginPage`).
- `/login`, `/auth/login` e `/logout` ficam no handler; a raiz `/` no Railway exige sessão.
- senha: `SOFIA_LOGIN_PASSWORD` em `src/config/runtime.js` (somente variável de ambiente; nunca hardcoded).
- `public/site.html` possui o botão **Entrar na Sofia OS** para `/login`.

## v131 — conta e sessão
- `public/index.html` → menu **Proprietário** no rodapé da sidebar e card **Conta e sessão** em Configuração.
- `public/app.js` → sair do dispositivo, encerrar todas as sessões e redirecionar ao login quando a sessão expira.
- `src/core/http-handler.js` → estados do login, sessão atual no bootstrap, logout atual e logout global.
- `public/login.js` → mostrar/ocultar senha, aviso de Caps Lock e estado de envio do formulário.


### Conta do usuário — v132
Rodapé da sidebar: avatar/iniciais + nome do proprietário. Menu: Meu perfil, Conta e configurações, Site público, Sair. Clique fora/Esc fecha o menu. Configuração contém Meu perfil e Segurança e sessão.

### Autenticação — v133
- `/login`: campos **E-mail** e **Senha**, mostrar/ocultar senha, Caps Lock e link **Esqueceu a senha?**.
- `/forgot-password`: solicita o e-mail; resposta é neutra para não revelar existência de contas.
- `/reset-password?token=...`: permite definir e confirmar nova senha quando o token é válido.
- Configuração > Meu perfil: **E-mail de login e recuperação**.
- Configuração > Segurança e sessão: **Alterar senha**, status da recuperação por e-mail, sair deste dispositivo e encerrar todas as sessões.
