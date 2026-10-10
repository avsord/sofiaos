# R7 — escolhas de implementação e limites

## Movido para a fila
Hidratação do arquivo completo; montagem oculta de cada aba; prefetch GET cache-only; montagem de BackgroundServices; primeira leitura de notificações/agenda/cápsulas; primeira consulta automática de atualização; bootstrap opcional após a Home; gravação automática de snapshot; consumidores de scheduleIdleTask (catálogo/widgets/monitores da Home).

## Mantido fora, por segurança/escopo
- Dados mínimos da Home/Agenda, autenticação e assinatura: requisitos de abertura, não otimizações opcionais.
- Envio de mensagem, salvar/excluir pedido pelo usuário, rascunhos e flush ao sair: não podem ser atrasados indefinidamente.
- Hidratação demandada por tela agora visível, paginação e ações explícitas: prioridade do usuário.
- Intervalos periódicos após abertura (notificações e checagem de atualização), ouvintes do sistema e configuração de permissões: mantidos e limpos por seus proprietários; suspender um listener necessário a alarmes poderia perder ações.
- Conexões só são carregadas ao abrir manualmente seu card, não havia efeito de montagem a transferir.
- Áudio: o código antigo já silencia reprodução quando Conversa deixa de ser ativa. Gravação/envio mantém locked. Observação sonora física não é substituída pelos testes.
- JSON.parse e render de listas grandes continuam síncronos; são R8. Agendador não preempta uma tarefa iniciada. Duração assíncrona de tarefa inclui espera de I/O e não equivale a CPU bloqueada.

## Activity e primeiro toque
Caixas de largura fixa preservadas. Somente conteúdo é oculto; vizinhas aparecem enquanto há arrasto. Salto nativo para conteúdo oculto é protegido: o commit React revela antes de mover. O controle Antigo mantém a máscara histórica e recebe o smoke legado de 24 saltos; Novo recebe o benchmark pesado e teste de rascunho/swipe, sem fingir que as proteções legadas medem sua arquitetura.

## Medição
Intervalo de 50ms mede atraso JS. Toque→frame parte do recebimento do handler JS e não inclui o tempo anterior de espera no JS; o bloqueio do loop complementa essa limitação. MountTimer mede render inicial→primeiro commit visível, podendo incluir espera oculta, não CPU pura; spans module:* medem carregamento síncrono. Relatório tem contagens sem conteúdo/IDs. Nenhum React.Profiler no app.

## Semente pesada
600 páginas/12000 blocos,1500 entidades,30 conversas/9000 mensagens,12 meses/600 eventos/300 tarefas. Reaplicada em cada trial para que a política existente de evicção de cache não reduza artificialmente a carga. Volume real do usuário desconhecido. A semente de 2× existe para investigar controle Antigo fraco; não se altera limite de importação do app para fazer teste caber.

## Desvio documentado do pacote
As nove verificações do idleWork foram copiadas. Uma tarefa enfileirada durante o cooldown podia rearmar o timer antes dos 50ms; nextRunAt corrige isso. Caso novo e mutações confirmam a proteção. O nome de evento RN usado na raiz é onStartShouldSetResponderCapture (retorna false), mais onTouchStart/Move, porque não existe onTouchStartCapture no contrato nativo utilizado.

## Aprovação
Compilar e passar smoke não prova os orçamentos nem performance no celular. CI registra RAW e status de objetivos sem reduzi-los; ultrapassar meta implica relatar a tarefa/aba, não declarar resolvido. R8/R9 não implementadas.
