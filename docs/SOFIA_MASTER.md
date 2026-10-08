# Sofia OS — Master operacional
Atualizada em 08/10/2026. Esta é a porta de entrada do projeto. A master completa de continuidade e os originais históricos são materiais de consulta, não leitura integral obrigatória a cada pedido.

## 1. Leitura mínima
Leia o resumo corrente, as instruções aplicáveis e a linha pertinente abaixo. Reutilize o que já leu quando não houve mudança de SHA. Procure o histórico somente para resolver uma dúvida, dependência, regressão ou conflito específico.

| Pedido | Ler |
|---|---|
| Documentação ou regra | Este mapa, Sofia Delta e trecho afetado. Sem APK. |
| Tela, menu ou gesto | Componente afetado, contrato do comportamento e testes correspondentes. |
| Abertura/fade | `startup-navigation-handoff.md`, `SofiaLaunchOverlay.kt`, `SofiaLaunchTransition.java`, Home e caminho local de dados. |
| Android/entrega | Identidade atual, execução pertinente, regras de assinatura e instalação por cima. |
| Backend/integração | Contrato e persistência do serviço afetado; não pressupor conexão real a partir do roadmap. |
| Contexto antigo | Somente capítulo ou commit pertinente em `historico_bruto`/master antiga. |

## 2. Sofia Delta
Aplicar [sofia-delta.md](sofia-delta.md): menor caminho válido até a entrega, mudanças consolidadas, testes proporcionais, artefato identificável e reaproveitamento compatível. Não recompilar o mesmo APK para consultar status ou obter uma evidência que depende de aparelho físico.

O pedido atual autoriza entrega manual de um único APK de produção, sem publicar no atualizador. A marca `[manual-apk]` no commit de entrega seleciona esse caminho: testes de código, build de produção, identidade/assinatura e instalação por cima com smoke nativo do mesmo APK. Não gera o APK separado de QA e não chama a publicação. Isso não equivale à aceitação física nem à suíte autenticada completa; registrar esses limites no relatório. Publicação oficial mantém os gates existentes.

## 3. Estado e estrutura
App Expo/React Native em `SOFIA_APP`; backend/SofiaCore Node e persistência no servidor. Mesmos dados autorizados em web/app. Repositório `avsord/sofiaos`, branch de entrega `sofia-app-android`. Pacote `com.avsord.sofiaapp`, canal `sofia-android-v`, certificado preservado, versionCode crescente. Não limpar dados, sessão, mensagens, páginas ou caches saudáveis.

Última publicação conferida antes desta alteração: 0.3.57. Candidato anterior: 0.3.60/code65, fonte `60ee20d7a6333cf235d60cb1ff5acb877817d285`; teste físico ausente. Correção atual: coordenar prontidão e callback da splash; adiar monitoramentos e meses adjacentes até a transição. Consultar o handoff e o resultado da execução antes de anunciar o novo APK.

## 4. Histórico e precedência
`docs/historico_bruto`, checkpoints e masters anteriores permanecem preservados. Orientações antigas para “ler o conjunto” não são uma obrigação rotineira; este mapa substitui essa interpretação. Regras atuais explícitas e evidência da versão correta prevalecem sobre instruções históricas superadas. Proposta, código implementado, APK compilado, aceitação no aparelho e publicação são estados distintos.

## 5. Manutenção
Ao concluir, atualizar somente estado, seção afetada, evidências e pendências; acrescentar o delta ao histórico. Não reconstruir toda a master a cada alteração pequena. Em novo Work, começar pelo resumo curto e consultar estes módulos sob demanda. Master/APK não substituem backup dos dados vivos.
