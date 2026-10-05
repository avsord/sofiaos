# MASTER — Sofia OS 0.3.39

Atualizado em 5 de outubro de 2026. Preserve mensagens, páginas, Biblioteca, sessões, banco e conexão Google.

## Estado da entrega

- Repositório: https://github.com/avsord/sofiaos
- Branch completa: `work/sofia-refinements-039`.
- Fonte do APK: `d4170d7112612d4d373efb2582bf45f2b89f8fba`; árvore `6231c8e165d0cbac65d31d11179e58bd208c3b36`.
- **APK 0.3.39 PUBLICADO em 05/10/2026 às 20:11:19 de São Paulo (23:11:19Z).** VersionCode44, pacote com.avsord.sofiaapp. Release sem draft/prerelease, asset Sofia-OS.apk uploaded, 51.465.252 bytes.
- Execução SUCCESS, incluindo aceitação Android e descoberta pelo atualizador antigo e novo: https://github.com/avsord/sofiaos/actions/runs/37385052352
- APK: https://github.com/avsord/sofiaos/releases/download/sofia-android-v0.3.39/Sofia-OS.apk
- SHA-256: `b37d966683187a85b13d602a344b128eed45a64fbdd98428d83686f5fcee503c`.
- Android PASS: extremos da lista sem mover Início, puxada moderada ignorada, puxada deliberada atualiza, gestos curtos nos dois sentidos, bordas e voltar inertes nos seis menus. Fluxos anteriores também passaram.
- Atualização disponível em Ajustes > Verificar atualizações. Instalar sobre o app existente; não desinstalar nem limpar dados.
- Backend permanece no deploy SUCCESS do commit `3fa3237896384f4cf92da02e73012872f58d1d59`. Esta atualização é somente do aplicativo.

## Correções da 0.3.39

- Barras de rolagem ocultas na Agenda e na lista de compromissos do mini calendário.
- A lista de compromissos consome sua própria rolagem, inclusive no começo e no final. O guard nativo desabilita temporariamente os ancestrais verticais e o refresh durante o gesto, restaura seus valores ao terminar/cancelar e impede doação de movimento ou impulso por nested scrolling.
- O Início exige uma puxada deliberada para atualizar: limiar nativo de 112 dp, em vez de 64 dp. A rolagem normal continua disponível fora da lista.
- Voltar do Android é consumido nos seis menus principais. Faixas laterais reservadas ao gesto de sistema não acionam o pager. A navegação explícita e o retorno dentro da hierarquia de páginas continuam disponíveis.
- Mantém a troca curta entre menus fora das bordas e a proteção horizontal do calendário da 0.3.38.
- TypeScript PASS e 213 testes do app PASS. Nenhum deploy, migração ou alteração de dados do servidor nesta versão.

## Agenda e menus da 0.3.38 — preservar

- Guard nativo reserva o calendário antes de ACTION_DOWN; não combinar com bloqueio JS duplicado no Android.
- Troca de mês acompanha o dia selecionado, limitando-o ao último dia válido do mês, e atualiza os compromissos sem um segundo toque.
- Cache mensal compartilhado por sessão, pré-carregamento de meses vizinhos, deduplicação, retenção em falha e consulta a cada dois segundos enquanto refresh_pending, até 60 consultas por ciclo ativo.
- Leituras de eventos não esperam catálogo. Não limpar cache na troca de tela.

### Agenda vazia por timeout — corrigido no servidor

O primeiro deploy de recorrências passou na comparação de eventos, mas GET `/api/mobile/agenda?month=...` aguardava a sincronização completa. Além disso, cada abertura após 30 segundos invalidava a janela e podia reexpandir quatro anos. O celular cancelava a leitura aos 20 segundos; os logs mostraram HTTP 499. As ocorrências existiam, mas a tela não recebia a resposta no prazo.

- GET agenda agora lê os compromissos já salvos e solicita atualização em segundo plano (`requestMonth`), sem aguardar Google.
- Requisições simultâneas são unificadas, falhas têm espera antes de repetir, e abrir um mês já coberto não invalida a expansão.
- `expandSeries` evita janelas sobrepostas desnecessárias e só marca como carregadas as janelas efetivamente processadas.
- Resposta traz `refresh_pending` para uma janela nova. Clientes antigos ignoram esse campo. A corretiva 0.3.38 consulta automaticamente o mês ativo enquanto a importação está pendente; sem bloquear a leitura inicial.
- Backend: **199 testes PASS**, incluindo leitura imediata durante sincronização lenta, preservação em falha, cache e nenhuma duplicação.
- Verificação real após deploy: cinco ocorrências do dia 5 retornam uma única vez, iguais aos IDs Google anteriormente comparados. Consultas de outubro, novembro e dezembro passaram.
- Primeiro tempo medido no servidor: 228 ms. Consultas simultâneas e novas consultas do celular depois do deploy retornaram HTTP 200 em menos de um segundo, em vez dos 20 segundos seguidos de cancelamento. O tempo de rede do ambiente de diagnóstico é maior e não é a latência do servidor.
- **Mensagens e itens da Biblioteca preservados por IDs/hashes**; Google conectado, sem erro ou aviso na sincronização. Nenhum backup restaurado, dado limpo ou chave trocada.


## Infraestrutura e preservação

- Banco `/sofia/data/sofia.sqlite`; chaves `/sofia/secure`; backups `/sofia/backups`; start `node tools/restore-gate.cjs`.
- Deploys pinados e manuais. Não presumir que push publica o servidor.
- Nunca trocar `SOFIA_CALENDAR_TOKEN_KEY`, refresh tokens, client ID/secret ou volume para resolver falha de agenda. Não restaurar backup sobre registros atuais.
- A correção 035 impede que shutdown esconda conversas pessoais como paused; mantém conversas apagadas/pausadas manualmente como estavam. Não regredir `src/memory/store.js` e `src/services/chat-sync.js`.
- Sessão diagnóstica desta etapa revogada e token local removido. Sessões diagnósticas futuras também devem ser revogadas ao terminar. Não colocar credenciais, tokens, banco, backup privado ou logs pessoais no GitHub ou no master.

## Funcionalidades anteriores a preservar

- App nativo Expo/React Native em `SOFIA_APP`; backend Node/SQLite. Supabase conectado como ferramenta não significa migração do banco.
- Tema claro 05:00/escuro 19:00, horários configuráveis e modos Sistema/Claro/Escuro.
- Navegação por toque imediato, telas mantidas durante troca, menu acompanha posição nativa; sem apagar cache durante refresh.
- Chat: anexos por clipe, teclado sem cortar o compositor, histórico compartilhado, exclusão por seleção, rolagem Y animada acompanhando crescimento de respostas.
- Início: título Tarefas, filtro Todas por padrão; toque no conteúdo abre detalhes/edição e somente a caixa conclui. Mini calendário usa seis linhas fixas.
- Biblioteca: tudo por padrão, áreas temáticas versus propriedade/marca/projeto, categorias derivadas dos registros, estrelas e filtros adaptados, Nova área no final do +.
- Páginas: caderno e folha distintos, hierarquia estável, ícones, editor Notion, salvamento preservando IDs, undo/redo, títulos sem placeholders permanentes.
- Notas: `LeafEditor` compartilhado; `leaf_document` junto ao texto simples, mantendo propriedades, revisões e o mesmo registro. Backend com esse campo já publicado; confirmar experiência no aparelho.
- Agenda: recorrências Google importadas por `events.instances`, migração única do token legado, exceções, cancelamentos, fuso, dia inteiro e paginação. Sem corte global em 500. Importa o calendário selecionado, não todos os calendários da conta automaticamente.
- Notificações: painel nasce no sino, fundo com fade; sheets compartilham movimento suave.
- Tarefa: Sofia interpreta prioridade explicitamente solicitada; não voltar a salvar tudo como sem prioridade.
- Monitoramento de produtos: prioriza link informado e sua cor no gráfico; compara fontes verificáveis da mesma variante. Não inventar preço nem prometer cobertura de toda a internet.

## Pendências separadas

- Exportar uma nova série local como RRULE Google ainda exige capability `calendar_recurrence`; importação de séries existentes está implementada. Não prometer exportação recorrente completa.
- OAuth unificado Drive/Gmail dentro da Sofia ainda precisa implementação/validação; instalar conectores no ChatGPT não implementa isso no aplicativo.
- Validar fluidez no aparelho do usuário, sem inventar medição de FPS ou latência de toque.


## Continuidade

Usar a branch completa work/sofia-refinements-039, não o snapshot do aplicativo como baseline do servidor. App 0.3.39/versionCode44 mantém pacote com.avsord.sofiaapp e certificado de atualização. A próxima alteração do aplicativo exige versão 0.3.40/code45; não substituir um APK publicado sob a mesma versão. Publicar somente após aceitação Android, manifest, assinatura e verificação da descoberta pelo atualizador. O teste de interface usa transporte sintético e não substitui a verificação da conta Google real ou a avaliação de fluidez no aparelho do usuário.
