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
