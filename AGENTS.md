# Sofia OS — entrega de alterações

## Pedido de alteração inclui entrega
Quando o usuário pede para corrigir ou alterar a Sofia, implemente, valide e publique a atualização aplicável no mesmo trabalho. Não espere outro pedido de “atualizar”, “subir”, “gerar APK” ou “enviar”. Não peça confirmação repetida para a publicação já solicitada. Uma conversa sobre ideias, por si só, não autoriza implementação.

## Padrão de trabalho: Sofia Delta
Use o padrão [Sofia Delta](docs/sofia-delta.md) em cada alteração: selecionar o caminho de menor tempo total entre os que cumprem o pedido e os critérios de aceite.
- Retome `docs/startup-navigation-handoff.md`, o head e a execução relevante; leia apenas o código e os logs necessários ao delta. Reuse leituras atuais da mesma sessão.
- Classifique o pedido antes de compilar: documentação, processo/testes, runtime Android, backend/web ou retomada de artefato existente. Não gere APK para registrar instruções.
- Faça a menor mudança completa, com validação proporcional antes do build. Não acrescente refatorações ou novas dependências sem causa demonstrada.
- Reuse o APK exato e os resultados válidos quando nenhuma entrada do build mudou. Se um teste ou critério mudou, revalide-o; nunca atribua aprovação antiga à nova condição.
- Preserve caches saudáveis. Limpeza deve ser específica, motivada por evidência e comparada antes/depois; não apague dados do app, sessão ou histórico. Cache interno da OpenAI não é controlável por este repositório.
- Registre tempo de investigação/edição e tempo de CI separadamente. Percentual de melhoria exige medições comparáveis; 70% é uma meta, não garantia.
- Não encerre com promessa de acompanhamento em segundo plano. Diferencie instrução registrada, código alterado, candidato compilado e APK publicado.

## Fonte correta e entrega atômica
- Antes de editar, leia a branch atual e a maior versão Android publicada. Não republique uma base antiga com número novo. Preserve funcionalidades e dados existentes.
- Faça o conjunto de alterações em uma branch de trabalho baseada na versão atual. Promova o conjunto completo para `sofia-app-android` em um único commit ou avanço fast-forward protegido pelo SHA observado. Nunca faça uma publicação parcial por arquivo.
- Se o usuário acrescentar pedidos durante o trabalho, incorpore-os ao conjunto ainda não promovido; não reinicie repetidamente uma compilação por mudanças parciais.
- `sofia-app-android` é a branch de entrega automática Android. Não atualize `main`, Railway, banco de dados ou serviços externos apenas para entregar um APK.

## Publicação automática
O workflow `.github/workflows/sofia-native-047-update.yml` tem nome de arquivo histórico, mas não deve ser duplicado a cada versão. `SOFIA_APP/tools/delivery.cjs` escolhe a próxima versão, sincroniza identidade/lock/updater/testes de identidade e impede colisões ou downgrade. O commit de alteração dispara o fluxo completo sem confirmação adicional.

O fluxo preserva a compilação em andamento, mantém apenas a solicitação pendente mais recente, usa cache Gradle e não recompila APK por alterações exclusivas de documentação, testes ou do próprio processo. Os testes de comportamento, instalação por cima, assinatura, servidor compatível e descoberta da atualização continuam obrigatórios. Não retire testes nem masque falhas para publicar rápido.

Se houver erro, investigue a etapa e o log, corrija no trabalho atual e reexecute somente o necessário. Use os relatórios de etapas; não faça consultas em loop a cada poucos segundos. Não afirme estar corrigindo ou acompanhando em segundo plano depois de encerrar a conversa.

## Critério de concluído
“Publicado” exige release real, `Sofia-OS.apk` disponível, hash/assinatura verificados e descoberta pelo atualizador confirmada. Entregue o link do APK, versão, resumo do que entrou e status verdadeiro. Commit, branch, build iniciado e APK de teste NÃO equivalem a entrega publicada. Se a execução ainda estiver pendente ou falhar, declare isso e a etapa exata; não invente previsão ou sucesso.

As atualizações preservam `com.avsord.sofiaapp`, canal `sofia-android-v`, assinatura e versionCode crescente. Nunca desinstale, limpe armazenamento, apague histórico/páginas, afrouxe autenticação ou redeploye backend com armazenamento temporário para resolver publicação. Mudanças de backend só quando fazem parte da solicitação e com verificação prévia de persistência/backup.
