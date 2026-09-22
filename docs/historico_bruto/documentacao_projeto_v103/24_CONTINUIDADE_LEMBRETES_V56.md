# Sofia OS v56 — Continuidade de lembretes

## Objetivo

Corrigir esclarecimentos em várias etapas sem permitir que a ação já entendida mude de tipo no meio do fluxo. O caso reproduzido foi: monitoramento + lembrete para a Black Friday, depois escolha de horário, seguida de erro `Falta uma data clara para registrar esse compromisso.`

## Causa raiz

Na v55, quando uma resposta gerava uma nova pergunta de esclarecimento, a nova pendência usava a resposta intermediária como origem. Assim, depois de `os dois`, a pendência de horário podia considerar `os dois` como pedido original em vez de manter a mensagem que continha produto, Black Friday e intenção completa.

Além disso, se a IA devolvesse um tipo de ação diferente no turno seguinte, o backend ainda podia validar esse novo tipo. Isso permitia um drift semântico: `create_reminder` podia reaparecer como `create_commitment`.

## Correções

1. A cadeia de esclarecimentos mantém o `source_message_id` da mensagem raiz até o fluxo terminar.
2. Quando uma pendência já contém ações estruturadas, essas ações formam a estrutura de continuidade. O backend pode completar campos estruturados devolvidos pela IA, mas não troca silenciosamente o tipo da ação.
3. Se a IA interpretar a resposta temporal com o tipo errado, data/hora válidas podem preencher o campo temporal que estava faltando na ação pendente, preservando `reminder` ou `commitment` original.
4. Se a resposta ainda não trouxer horário exato, o backend volta a perguntar em vez de executar e estourar erro.
5. Para falta apenas de horário, os botões de atalho agora usam valores exatos: `09:00`, `15:00` e `19:00`. O valor escolhido é guardado como patch interno estruturado; a interface não recebe nem pode inventar esse patch.
6. O interpretador foi instruído a manter a intenção de escrita quando a ação está clara e falta somente um campo obrigatório. `clarify` fica reservado principalmente para ambiguidade da própria ação.
7. Lembrete continua sendo lembrete; compromisso continua sendo compromisso. Uma resposta de horário não pode, sozinha, mudar um para o outro.
8. A execução composta continua atômica.

## Atualização visual

A interface permanece com `Chat` no botão lateral. Os assets agora são referenciados com `?v=56`, reduzindo a chance de o navegador reutilizar `app.js` ou `style.css` antigos depois de recarregar. Uma aba que já estava aberta antes da atualização ainda precisa ser recarregada.

## Arquitetura preservada

A IA continua sendo a camada semântica. O backend não tenta classificar linguagem natural por palavras-chave. A nova proteção trabalha sobre o plano estruturado já produzido pela IA e sobre opções estruturadas geradas pelo próprio backend para completar campos obrigatórios.
