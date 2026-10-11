# Validação ao vivo da concorrência — PR #5

## Escopo

Autorizada pelo proprietário após a revisão do commit `0ca24d6a14b7b4ab92d6f16cd53fbd7e7c5b04bd`. Esta rodada integra a política de concorrência e verifica sua execução real, sem alterar código funcional, backend, assinatura, package ou critérios de aprovação do aplicativo.

Merge aplicado à branch `sofia-app-android`: `7ade44c9c00a3686d9702e935f120021de99cce9`.

## Protocolo

1. O merge dispara a execução A: `38023211449`, job de build `114128467020`.
2. Confirmar pela API que A está em andamento e que a etapa de planejamento passou. Isso foi observado antes deste commit.
3. Este commit documental dispara B na mesma branch, enquanto A ainda está em andamento. Não há cancelamento manual de A: sua substituição deve ser feita pelo grupo `sofia-android-build-${{ github.ref }}`.
4. Consultar os jobs e as anotações de A e B. O sucesso desta verificação exige cancelamento automático de A e início de B, identificados por SHA, IDs e timestamps. Um mero no-op por `remote != head` não basta.
5. Registrar a evidência observada em comentário no PR #5, sem criar commits adicionais apenas para consultar andamento.

## Proteções e interpretação

- Usa-se o modo candidato manual existente; os testes rápidos e as verificações de identidade permanecem habilitados.
- Nenhum commit desta rodada aprova uma publicação. O job `release` mantém grupo independente e não cancelável.
- Esta validação não mede a velocidade de abertura do app nem aprova um APK.
- Se o teste de cancelamento estiver concluído, qualquer interrupção deliberada da execução B para evitar recompilação redundante deve ser registrada separadamente; ela não conta como evidência de cancelamento automático.
- O estado final, os IDs de B e os resultados ficam no comentário de execução do PR #5. Este arquivo documenta o protocolo, não declara antecipadamente que o experimento passou.
