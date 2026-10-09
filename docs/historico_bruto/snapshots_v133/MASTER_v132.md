# MASTER — Sofia OS v109

Este é o mapa principal do código atual. A partir da v106, **simplificação nunca significa apagar histórico**.

## Regra permanente de preservação

- A documentação histórica/bruta deve permanecer dentro do próprio projeto/pacote.
- Nunca apagar, reduzir, reescrever ou substituir o histórico original para "deixar leve".
- Quando algo antigo não precisar ficar na área ativa, mover para `docs/historico_bruto/` preservando o conteúdo original.
- Testes versionados antigos podem sair de `tests/` para acelerar a suíte, mas devem ser preservados em `docs/historico_bruto/testes_arquivados_local/` ou em snapshots já incluídos.
- A documentação atual pode ser consolidada para navegação rápida, porém a documentação bruta continua disponível como fonte de verdade histórica.

## Para continuar em um novo chat

Leia primeiro:
1. `docs/CONTEXTO_NOVO_CHAT.md`
2. `docs/GUIA_MASTER_COMPLETO.md`
3. este `docs/MASTER.md`
4. `docs/UI_MAP.md`

Quando precisar entender por que algo existe ou recuperar decisões antigas, consulte `docs/historico_bruto/`.

## Comando oficial para iniciar

```powershell
Set-Location "$HOME\SOFIA-OS"
& "$HOME\SOFIA-OS\INICIAR_SOFIA.cmd"
```

## Mapa rápido do código atual

| Área | Arquivo / pasta | Uso |
|---|---|---|
| Estrutura da interface | `public/index.html` | HTML e pontos de montagem |
| Ajustes visuais novos | `public/ui-current.css` | Primeira escolha para mudanças pequenas de UI |
| CSS legado/base | `public/style.css` | Base visual acumulada; mexer somente quando necessário |
| Lógica do navegador | `public/app.js` | Estado, navegação, páginas e interações |
| Servidor | `src/server.js` | Inicialização HTTP |
| Rotas/API | `src/core/http-handler.js`, `src/core/api45.js` | Endpoints e transporte |
| Regras centrais | `src/core/sofia-core.js` | Orquestração principal |
| Memória | `src/memory/` | SQLite, schema e migrações |
| Serviços | `src/services/` | IA, backup, privacidade, agenda, áudio e uso |
| Dados locais | `data/` | Não editar nem substituir em atualizações |
| Testes ativos | `tests/` | Regressões essenciais atuais |
| Histórico integral | `docs/historico_bruto/` | Documentação e testes históricos preservados |

## Regra para editar mais rápido

1. Mudança apenas visual: tente primeiro `public/ui-current.css`.
2. Mudança de comportamento no navegador: procure pelo ID/texto da interface em `public/app.js`.
3. Mudança de dados/API: procure a rota em `src/core/http-handler.js` e siga para o serviço correspondente.
4. Use os documentos atuais para navegação rápida; use o histórico bruto para decisões e contexto acumulado.
5. Não alterar `.env`, `data/`, `backups/`, memória, banco ou chaves durante atualizações de código.

## Estado atual de UI

- `Início` e `Resumo` usam a mesma régua visual dos itens de `APPS`.
- O sino usa um `notification-hover-shell`; o hover/foco abre a prévia e `Ver todas` abre a central detalhada.
- A página completa de notificações organiza os itens por área e origem.

## v106

A principal mudança da v106 é de manutenção/documentação: o master continua enxuto na área ativa, mas todo o histórico documental recuperado da v103 foi reintegrado ao pacote em `docs/historico_bruto/`. O atualizador e a ferramenta de simplificação não removem documentação.

## v107

Correção visual isolada no preview do sino: o painel continua dentro do `notification-hover-shell`, mas a ancoragem passa a abrir o painel para a esquerda do botão, evitando corte na lateral direita. Nenhum documento histórico foi removido.


## v109
- interface das páginas normais e subpáginas ficou mais limpa, no espírito do Notion;
- barra de ações redundantes sob o título saiu da tela principal;
- capa passou a ser editada clicando na própria capa, com botão só no hover;
- lista de subpáginas virou uma lista de cartões leves;
- botões flutuantes do topo foram centralizados e movidos um pouco para cima;
- documentação bruta foi mantida integralmente.


## v109
- a diagramação de páginas foi corrigida para seguir com mais fidelidade o layout do Notion;
- os botões do topo saíram do centro e foram para a área superior direita;
- o ícone ficou alinhado à esquerda abaixo da capa;
- a seção de subpáginas deixou o visual de cartão pesado e passou a uma lista mais leve.


## v110
- capa voltou ao topo como antes;
- ícones da página e ações superiores voltaram ao visual anterior;
- placeholders e ação de adicionar bloco só aparecem no hover, como no Notion.


## v111
- corrigido o espaçamento entre os controles do bloco e o texto/placeholder;
- mantido o comportamento de hover da v110.


## v117
- itens do Resumo ocupam a largura inteira e o X fica sobreposto dentro da faixa;
- seta de APPS padronizada com PARTICULAR;
- documentação bruta preservada.


## v117
- itens do Resumo ocupam toda a largura útil com X sobreposto;
- subpáginas iniciam recolhidas depois de recarregar ou abrir novamente;
- documentação bruta segue preservada.


## v118
- Agenda refeita como calendário mensal + programação cronológica.
- Eventos, lembretes, tarefas datadas e outros registros com data aparecem no mesmo viewer.
- Filtros por origem e navegação Hoje/mês anterior/próximo.
- Subpáginas continuam fechadas por padrão após reload.
- Documentação bruta preservada.


## v119
- Agenda passou de viewer para calendário interativo;
- clique em dia vazio cria Evento, Tarefa ou Lembrete;
- clique em item existente edita a entidade de origem;
- drag entre dias altera a data na própria origem;
- formulário de Tarefa foi rediagramado;
- metadados de provider/external IDs foram preparados para futura sincronização bidirecional com Google Calendar;
- Google Calendar ainda não é chamado nesta versão.


## v120 — correção da tela Tarefas
A v119 removeu acidentalmente `loadTaskCards()` e os helpers de prioridade. A v120 restaura essas funções e adiciona teste de regressão para evitar o erro `loadTaskCards is not defined`.


## v121 — navegação Início/Resumo
- `Início` deve sempre abrir no topo, independentemente da última posição do Resumo antes de sair para Agenda/Tarefas/etc.
- `Resumo` só deve ser aberto quando o usuário clicar explicitamente em Resumo.


## v122
- barra de scroll da lateral de menus passa a permanecer visível em desktop;
- aparência fina/discreta inspirada no Notion;
- não depende de hover para o thumb aparecer;
- mantém o mesmo comportamento ao abrir páginas e subpáginas.


## v126 — Railway + Meta + WhatsApp Business em coexistência
- GitHub é a fonte oficial/versionada do código; Railway executa o servidor Node 24/7.
- Supabase permanece planejado para dados estruturados/índices; Google Drive para arquivos brutos; Next.js/Vercel é a direção futura da interface, não uma migração obrigatória desta etapa.
- URL pública atual do backend: `https://sofiaos.up.railway.app`.
- Rotas públicas mínimas: `/health`, `/privacy`, `/webhook` e `/whatsapp/connect`. O painel e as APIs privadas continuam protegidos.
- O webhook da Meta usa `WHATSAPP_VERIFY_TOKEN`; `META_APP_SECRET`, tokens e chaves nunca entram no Git.
- O número atual já usa WhatsApp Business. Não usar o fluxo normal que exige desconexão/migração. A conexão correta é o Embedded Signup em coexistência.
- O botão `Conectar WhatsApp Business` abre `/whatsapp/connect` e lança `FB.login` com `extras.featureType = whatsapp_business_app_onboarding`, `sessionInfoVersion = 3`, `response_type = code` e a configuração de login existente.
- App ID público padrão: `1617872666710770`; Configuration ID público padrão: `1590251151959449`. Ambos podem ser sobrescritos por `META_APP_ID` e `META_LOGIN_CONFIG_ID`. Nenhum segredo é hardcoded.
- O resultado do onboarding registra somente IDs não secretos em `data/whatsapp-onboarding.json`. Se `META_APP_SECRET` estiver configurado, o servidor valida a troca do código sem devolver o token ao navegador.
- App Review: após o fluxo real funcionar, gravar o cadastro/conexão para demonstrar `whatsapp_business_management` e retornar à análise da Meta.
- Requisito futuro já definido: antes de expor o painel da Sofia pelo domínio público, implementar login obrigatório; a URL pública atual não deve expor agenda ou dados privados.
- Entregável futuro: PDF/playbook técnico da AVSORD documentando a construção da Sofia do início ao deploy e integrações.


## v127 — correção CSP do Embedded Signup
- O teste público da v126 carregava a página, mas a CSP da própria Sofia bloqueava `https://connect.facebook.net/app_config/json/...` e estilos inline usados pelo SDK oficial da Meta.
- Em `/whatsapp/connect`, `connect-src` agora permite `https://connect.facebook.net` e `https://web.facebook.com`; `style-src` permite apenas CSS inline, sem liberar script inline.
- Mantido `featureType: whatsapp_business_app_onboarding`, sem trocar para o fluxo normal de migração.
- Teste de regressão valida explicitamente essas diretivas CSP.

## v128 — callback compatível com o SDK da Meta
- Após a v127 remover os bloqueios CSP, o Console do Edge expôs o erro do SDK `Expression is of type asyncfunction, not function`.
- A causa era `FB.login(async response => ...)`: o SDK valida o callback como `Function` normal e rejeita `AsyncFunction` antes de abrir o popup.
- v128 passa uma função normal ao `FB.login` e executa a finalização assíncrona dentro dela, preservando `response_type: code`, `config_id` e `featureType: whatsapp_business_app_onboarding`.
- O `403` de `/favicon.ico` não participa do fluxo do WhatsApp e pode ser tratado separadamente.


## v129 — site público para verificação de acesso da Meta
- Nova rota pública `/site` apresenta a Sofia OS, o serviço SaaS, o uso autorizado do WhatsApp Business, responsável, país e contato.
- Novas rotas `/terms` e `/data-deletion` fornecem Termos de Serviço e instruções de exclusão de dados.
- `/privacy` foi atualizado para refletir o responsável, o contato e a Railway como provedora de infraestrutura.
- O painel principal continua privado; a v129 não expõe Agenda, memória, conversas ou APIs privadas.
- URL indicada para o campo **Provide a link to your website** da Verificação do acesso: `https://sofiaos.up.railway.app/site`.

## v130 — login do painel online
- `https://sofiaos.up.railway.app` deixa de responder `LOCAL_ONLY` para o proprietário: sem sessão, redireciona a `/login`; com sessão válida, abre o painel.
- A senha do painel vem somente de `SOFIA_LOGIN_PASSWORD` no Railway/.env e nunca é empacotada nem enviada ao navegador.
- Sessões são opacas, armazenadas somente em memória do servidor e entregues em cookie `HttpOnly; Secure; SameSite=Lax`; expiram em 12 horas e também após reinício/deploy.
- APIs e arquivos privados exigem sessão no Railway; CSRF/origem continuam validados nas operações do painel.
- Rotas públicas exigidas pela Meta (`/site`, `/privacy`, `/terms`, `/data-deletion`, `/health`, `/webhook`, `/whatsapp/connect`) continuam públicas.
- O acesso local continua restrito a loopback e não depende do login remoto.
- Esta autenticação é single-owner/admin. Multiusuário exige contas, autorização e isolamento real de dados antes de ser liberado.

## v131 — conta, sessão e saída
- O painel ganha um menu de conta no rodapé da barra lateral, com acesso a configurações, site público e botão **Sair**.
- Configurações ganha o card **Conta e sessão**, com saída do dispositivo atual e **Encerrar todas as sessões**.
- `/logout` apaga a sessão atual e volta à tela de login com confirmação visual.
- A Sofia redireciona automaticamente a `/login?expired=1` quando uma API detecta sessão expirada, evitando o painel ficar preso em erro 401.
- A tela de login passa a ter mostrar/ocultar senha, aviso de Caps Lock, estados de senha errada, limite de tentativas, sessão expirada e logout concluído, além de links para site, privacidade e termos.
- Continua single-owner/admin. Não foram criados cadastro público, recuperação por e-mail ou múltiplas contas porque ainda não existe isolamento multiusuário no backend.


## v132 — Perfil do proprietário e menu de conta
- Menu do usuário fecha ao clicar fora, pressionar Esc ou escolher uma ação.
- Perfil editável do proprietário com nome e e-mail; padrão desta instalação: Pedro Silva / sofiaos.core@gmail.com.
- O menu mostra nome e iniciais do perfil e oferece Meu perfil, Conta e configurações, Site público e Sair.
- Segurança e sessões permanecem separadas; senha não é exibida nem salva pelo perfil.
