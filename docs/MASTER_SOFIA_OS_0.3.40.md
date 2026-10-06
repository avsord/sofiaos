# MASTER — Sofia OS 0.3.40

Atualizado em 5 de outubro de 2026 (São Paulo). Preserve mensagens, páginas, Biblioteca, sessões, banco, volume e conexão Google.

## Entrega atual

**APK 0.3.40/code45 JÁ PUBLICADO em 05/10/2026 às 22:41:11 (São Paulo), 06/10/2026 01:41:11 UTC.**

- Release pública, draft=false/prerelease=false: https://github.com/avsord/sofiaos/releases/tag/sofia-android-v0.3.40
- Download final: https://github.com/avsord/sofiaos/releases/download/sofia-android-v0.3.40/Sofia-OS.apk
- Asset Sofia-OS.apk uploaded, 51.504.708 bytes; SHA-256 b7823066416ccaee2457d198da594eb3ba94da0ffd02710524b01f3e2c633c59.
- Pacote com.avsord.sofiaapp; mesmo certificado SHA-256 fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. Instalar como atualização, sem desinstalar nem limpar os dados.
- Fonte final c72033c24c7a931fd3976d1955a82670540ec87a; APK compilado inicialmente em eee0e5f2f2a3720b8b5eb363b18e8c7746331507, com árvore SOFIA_APP idêntica verificada na recuperação. Nenhum APK QA foi publicado.
- Execução 37399356515, job112062815495 SUCCESS: https://github.com/avsord/sofiaos/actions/runs/37399356515
- Android PASS: isolamento das bordas da lista, refresh moderado ignorado/longa puxada funcional, gestos curtos rápidos e lentos, voltar do sistema inerte nos seis menus, ponte de alarmes, dois avisos programados, marcar dose, histórico, editor e nova rotina. Testes anteriores de agenda/temas/Biblioteca/notas também passaram.
- Descoberta da 0.3.40 pelos atualizadores antigo e novo PASS. Disponível em Ajustes > Verificar atualizações.
- Correção adicional: na direção claramente horizontal, o guard nativo libera a reserva do filho vertical para o pager assumir o gesto com o ciclo nativo de drag completo. Calendário, lista de compromissos e bordas do sistema permanecem reservados.
- Validação inicial Android passou após conceder a permissão de notificações no emulador e aguardar a tela de login com limite e evidências, em vez de uma pausa fixa de oito segundos. A tentativa anterior não havia alcançado os testes do app.


## Cápsulas — escopo entregue

- Novo app Cápsulas nos Apps e widget Cápsulas no Início, reordenável/removível como Tarefas. O suporte do servidor adiciona o widget uma vez, preservando a escolha posterior de removê-lo.
- Nome, tipo (remédio, fitoterápico, suplemento), descrição, dose informada pelo usuário, um a oito horários diários distintos, primeiro dia e último dia opcional.
- Caixa marca somente aquela dose/dia/horário, que desaparece das pendências. A rotina permanece para amanhã e as demais doses continuam visíveis. Toque no texto abre detalhes, sem marcar como tomada.
- Rótulo vermelho somente a partir do horário da dose e enquanto pendente. O relógio é atualizado no widget sem recarregar toda a tela.
- Aviso no horário, com antecedência opcional de 0 a 1440 minutos. Com 30 minutos há dois avisos, antes e na hora. Antecedência não antecipa a cor vermelha.
- Histórico privado persistido no mesmo servidor, consulta dos últimos 30 dias no aplicativo e desfazer. Arquivar/pausar interrompe as doses futuras sem apagar o histórico. Não sugerir dose ou orientação médica no cadastro.
- Planos são entidades capsule; marcações são capsule_dose, com índice único por proprietário/plano/dia/horário e operação transacional/idempotente em /api/mobile/md/capsules/doses. Sem tabela nova ou alteração do formato de backup; exportação/importação existente inclui os novos registros.
- Agenda Google não recebe registros de cápsulas. Não reutilizar tarefas nem eventos Google como registro de tomada.
- Lembretes locais via expo-notifications, canal sofia-capsules e prefixo separado sofia-capsule:. Reservados por sessão; marcar uma dose retira seus avisos sem retirar amanhã ou os de outras doses. Renovados ao abrir/usar o app. Até 256 avisos futuros e janela de 30 dias adiante; o aviso no aplicativo informa quando há limite. Não afirmar cobertura indefinida se o aplicativo deixar de ser usado.
- Android pede permissão de notificações; módulo SofiaAlarms verifica alarmes exatos e abre a permissão específica com um botão quando necessário. SCHEDULE_EXACT_ALARM adicionado. Sem prometer pontualidade caso o Android negue permissão ou restrinja bateria.
- Backend publicado com commit e9b1e7bc3f6d97a8c29c77f1f59909df31d91d9d; deploy Railway SUCCESS e health confirmou md_upgrade0.3.40/capsules:true. Mantidos volume, chaves, comando restore-gate e deploy manual pinado. Ajustes posteriores na UI/testes não exigiram outro deploy.
- Verificações locais: TypeScript PASS, 217 testes do app PASS e 203 do servidor PASS, mais um teste HTTP autenticado de ponta a ponta com preservação de mensagem/página. Testes cobrem antecedência + horário, fronteira da cor, aviso atravessando meia-noite, marcação de uma dose sem afetar outra/amanhã, pausa, validação, idempotência, desfazer e exportação/importação.

## Gestos da 0.3.39 — preservar

- Sem barras de rolagem na Agenda e na lista de compromissos.
- A lista consome rolagem e impulso nos extremos, sem mover Início ou disparar seu refresh. Guard nativo bloqueia os ancestrais somente durante o gesto e restaura seus valores ao concluir/cancelar.
- Puxada do Início exige limiar nativo de 112 dp, em vez de 64 dp.
- Voltar do Android não percorre os seis menus; bordas reservadas ao sistema não acionam o pager. Navegação explícita e hierarquia interna de páginas continuam disponíveis.

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

A execução corretiva 040 recupera os APKs de produção e QA da tentativa anterior somente após verificar SHA-256 e igualdade exata da árvore SOFIA_APP com o commit compilado. Essa recuperação é específica da 040; não copiar o ID fixo de artefato/commit para a próxima versão. A publicação mantém os mesmos bytes que passaram na validação nativa.

Usar a branch completa work/sofia-refinements-040 para continuar. O snapshot release/sofia-android-v... é somente o aplicativo sobre main, não é o baseline do servidor. O próximo APK exige versão0.3.41/code46; não substituir um APK publicado sob a mesma versão. Instalação como atualização mantém o mesmo pacote e certificado; não desinstalar nem limpar dados.
