# Master — Sofia OS 0.3.43

Estado em 06/10/2026. Repositório: avsord/sofiaos. Branch de trabalho: work/sofia-refinements-043.

## Situação de entrega

**0.3.43, código Android 48, JÁ FOI PUBLICADA como release estável em 06/10/2026 às 17:17:08 de São Paulo (2026-10-06T20:17:08Z).** TypeScript, 229 testes do aplicativo e 212 testes do servidor passaram. O servidor 0.3.43 já foi publicado e os novos recursos foram confirmados em /health.

Fonte do APK atual: 69518a52ab3c5c311180edc1d3bf87068972c337. Execução: 37523400802, job 112474211843, workflow Sofia Android 0.3.43 validated native shell update. A execução terminou SUCCESS, incluindo a aceitação Android completa, publicação e descoberta em Verificar atualizações. A compilação JavaScript/Hermes e a verificação da assinatura passaram. O shell Android previamente compilado em 32815e5fad1648a792d8c66d38ff9812ef95027f foi reutilizado: todos os arquivos nativos, recursos e bibliotecas foram comparados byte a byte. Apenas Home.tsx mudou no aplicativo, desativando nestedScrollEnabled no ScrollView do Início. O pacote continua com com.avsord.sofiaapp, versão 0.3.43/código 48 e o mesmo certificado.

Correções encontradas na aceitação: keyboardShouldPersistTaps=always nos ancestrais do editor para o negrito receber o toque; teste de teclado condicionado à presença real do IME; leitura da instrumentação após fechar o modal nativo; retorno ao Início considerando a posição preservada de rolagem. A atualização acidental após uma puxada moderada foi identificada no caminho de nested scrolling: SwipeRefreshLayout acumula distância integral nesse caminho, diferente do fator 0,5 do toque direto. A rolagem aninhada foi desativada apenas no Início; a aceitação continua exigindo que a puxada moderada não atualize e que a longa atualize. Nenhuma verificação Android foi removida.

Canal GitHub: tag sofia-android-v0.3.43, asset Sofia-OS.apk uploaded, 52.126.011 bytes. Release não draft nem prerelease. SHA-256: b570c15ef776d96bc1c8a32760a52d4beffb62c355f810e7a2cb0dad0875836c.

APK: https://github.com/avsord/sofiaos/releases/download/sofia-android-v0.3.43/Sofia-OS.apk

Execução aprovada: https://github.com/avsord/sofiaos/actions/runs/37523400802

Atualização descoberta pelo cliente 0.3.42 em Ajustes > Verificar atualizações. Não entregar 0.3.42 nem o APK QA-ONLY-full-fixture.apk como atualização.

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

O usuário autorizou explicitamente a publicação novamente em 06/10/2026. accept_deploy foi aceito. Deployment 2daa256b-793c-4beb-bb01-a4712969436c terminou SUCCESS às 18:51 UTC (15:51 São Paulo). Fonte efetivamente implantada: 0e746b06c313072baf7eed58af9828d8b01b9620, branch work/sofia-refinements-043. Volume existente foi montado e o restore gate confirmou início normal com chave preservada. A checagem HTTP confirmou md_upgrade=0.3.43 e task_description_format, selected_task_context e agenda_priority ativos. Não continuar dizendo que a autorização está pendente.

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
- Aceitação Android ampliada: instalação sobre APK anterior, assinatura, 500 eventos, gestos e limites de rolagem, notificações, Cápsulas, Listas, salvar descrição em negrito, levar tarefa ao chat, botão de descer, retorno das páginas e segurar data para criar compromisso. Resultado confirmado SUCCESS na execução 37523400802. A puxada moderada foi ignorada, a longa atualizou, gestos curtos rápidos e lentos passaram, 500 eventos renderizaram sem exceção fatal e a assinatura anterior foi preservada.

## Próximo passo

Entrega concluída. Ao continuar em outro chat, partir desta release e conferir a versão instalada antes de investigar qualquer novo relato. Preservar mensagens e todos os dados nas próximas atualizações. Não republicar o binário desta tag com outra fonte: alterações futuras precisam de nova versão/código Android e nova aceitação. O servidor e o APK possuem commits diferentes, registrados acima, e ambos foram publicados com sucesso.

## Continuidade anterior

0.3.42 alinhou Listas inteiro à Biblioteca, com Todos por padrão, busca, filtros e criação no +. Corrigiu a fila compartilhada de notificações de Cápsulas e Agenda e o reparo dos lembretes. O servidor publicado anteriormente já inclui recorrências Google e Cápsulas. Não dizer que recorrências Google ainda aguardam a autorização antiga.

A conexão unificada Google Drive/Gmail dentro da Sofia continua sendo outra frente; conectar o plugin do ChatGPT não implementa OAuth dentro do aplicativo. Não declarar essa frente concluída.
