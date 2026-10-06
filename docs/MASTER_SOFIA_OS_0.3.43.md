# Master — Sofia OS 0.3.43

Estado em 06/10/2026. Repositório: avsord/sofiaos. Branch de trabalho: work/sofia-refinements-043.

## Situação de entrega

A última release estável publicada continua sendo 0.3.42, código Android 47. **0.3.43, código 48, ainda não foi publicada.** O código foi implementado e os testes locais passaram. O APK foi compilado na execução 37479988326. A aceitação falhou em uma ação automática de teclado; a revalidação 37496001135 salvou a descrição com sucesso mas tentou ler a instrumentação atrás do modal nativo. A execução 37514479960 corrige as duas verificações e reutiliza os mesmos APKs, hash e fonte. A validação completa ainda precisa passar. Não entregar 0.3.42 como se fosse 0.3.43.

Fonte em validação: 517d58acb4d41b47349a7f29602684597b79e3e7. Identidade Android: com.avsord.sofiaapp. Atualização pelo mesmo canal GitHub, tag esperada sofia-android-v0.3.43 e asset Sofia-OS.apk. Manter a assinatura existente; o workflow compara os certificados antes de permitir publicação.

## Pedidos implementados nesta rodada

| Pedido | Implementação |
| --- | --- |
| Descer a conversa | Botão flutuante quando o usuário sobe o histórico; descida animada. O botão fica oculto durante a descida automática. |
| Prioridade na Agenda | Seleção de Sem prioridade, Leve, Média e Importante. Cores nos cartões e pontos dos calendários completo e do Início. Dias podem mostrar múltiplos níveis. |
| Voltar de subpágina | Usa o caminho de entrada, incluindo botão, gesto interno e Voltar do Android. Entrada direta pela árvore retorna ao menu Páginas; entrada por uma página retorna à página anterior. |
| Tarefa como assunto da Sofia | Segurar uma tarefa oferece Levar para conversa. Também há botão nos detalhes do Início. Mostra contexto removível no chat. Texto e áudio enviam selected_task_id. |
| Ordem das tarefas | Ordem por criação, mais recentes primeiro; editar descrição, título ou prioridade não muda a posição. |
| Descrição formatada | Editor nativo com negrito, itálico, sublinhado, riscado, código, cor e grifo; seleção de trecho e estilos para digitação. Leitura mostra os estilos. |
| Formatar pela conversa | update_record com description_format aplica estilos mantendo ID e texto. A IA pode escolher trecho ou descrição inteira. |
| Segurar data no Início | Abre criação de compromisso na data escolhida na Agenda. |
| Salto/piscada ao passar pelo chat | Reativação e geometria inalterada não provocam rolagem. A altura do teclado continua sendo medida fora da tela sem rolar a conversa escondida. Novas mensagens e resposta crescente seguem descendo. |

## Servidor publicado nesta rodada

O usuário autorizou explicitamente a publicação novamente em 06/10/2026. accept_deploy foi aceito. Deployment 2daa256b-793c-4beb-bb01-a4712969436c terminou SUCCESS às 18:51 UTC (15:51 São Paulo). Fonte efetivamente implantada: 0e746b06c313072baf7eed58af9828d8b01b9620, branch work/sofia-refinements-043. Volume existente foi montado e o restore gate confirmou início normal com chave preservada. A checagem HTTP dos novos recursos será feita antes da publicação do APK. Não continuar dizendo que a autorização está pendente.

Configuração preservada:

- Projeto 745fe84e-589f-4ce0-8173-4204fa6d6ae3.
- Ambiente 428b54ed-beb9-4af2-9166-dba83766638b.
- Serviço 6fa5039a-d8ec-4651-8921-7cc01fd36f84.
- Volume c93817c3-425f-4849-9ce3-df892558606c montado em /sofia.
- Start command node tools/restore-gate.cjs.
- Watch pattern __manual_deploy_only__/**; deploy permanece manual e fixado em commit.
- Fonte anterior preservada para rastreio: 5561178a2b931633aecbd4e2903f1b6e0190da0c, deployment 360612b3-cead-46ca-867a-470204bd9784.

Não mexer em volume, credenciais, OAuth, backup de produção ou restore gate. Não restaurar backup antigo e não apagar mensagens para atualizar. A migração acrescenta task_details.description_document, mantendo o texto plano em description. Backups antigos recebem documento vazio; exportação, importação e reabertura preservam a formatação. Alterar outros campos preserva o documento; trocar texto por cliente antigo limpa apenas a formatação obsoleta.

selected_task_id é resolvido no banco a cada turno, com checagem de proprietário. Contexto local não vai para a IA e o contexto de tarefa força a rota privada. A seleção não altera o registro; apenas o pedido explícito do usuário autoriza sua edição. Prioridade de compromisso é um campo próprio de dados e a importação Google preserva os dados locais existentes.

Após deploy, /health deve indicar md_upgrade=0.3.43, task_description_format=true, selected_task_context=true e agenda_priority=true. O workflow bloqueia a publicação do APK se esses recursos não estiverem ativos, mesmo que o Android tenha passado.

## Verificações

- TypeScript completo aprovado.
- Aplicativo: 229 testes aprovados, incluindo retorno por caminho, múltiplas cores no dia, preservação de estilos e ausência de rolagem na reativação do chat.
- Servidor: 212 testes aprovados. Inclui persistência/reabertura/exportação, formatação pela Sofia, entrada inválida recusada sem alteração, ordem após edição, contexto real da tarefa, prioridades de compromissos e transporte mobile de texto e áudio.
- Aceitação Android ampliada: instalação sobre APK anterior, assinatura, 500 eventos, gestos e limites de rolagem, notificações, Cápsulas, Listas, salvar descrição em negrito, levar tarefa ao chat, botão de descer, retorno das páginas e segurar data para criar compromisso. O resultado nativo ainda deve ser confirmado na execução mais recente.

## Próximo passo

1. Concluir a validação Android e inspecionar qualquer falha real antes de liberar.
2. Deployment já SUCCESS; confirmar /health com os três novos recursos.
3. Publicar o APK exatamente validado. Para reutilizar um artefato, verificar SOURCE_COMMIT, hash, assinatura e versão/código; nunca publicar o APK QA-ONLY-full-fixture.apk.
4. Confirmar release estável, published_at, asset uploaded com tamanho positivo, atualização descoberta pelo cliente antigo e novo, e validação Android success.
5. Atualizar este master com os IDs finais, hash, tamanho, publicação e link direto. Só então dizer que 0.3.43 JÁ FOI PUBLICADA.

## Continuidade anterior

0.3.42 alinhou Listas inteiro à Biblioteca, com Todos por padrão, busca, filtros e criação no +. Corrigiu a fila compartilhada de notificações de Cápsulas e Agenda e o reparo dos lembretes. O servidor publicado anteriormente já inclui recorrências Google e Cápsulas. Não dizer que recorrências Google ainda aguardam a autorização antiga.

A conexão unificada Google Drive/Gmail dentro da Sofia continua sendo outra frente; conectar o plugin do ChatGPT não implementa OAuth dentro do aplicativo. Não declarar essa frente concluída.
