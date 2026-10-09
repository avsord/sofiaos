# Sofia OS v55 — Chat sem duplicação

## Objetivo

Corrigir o fluxo de conversa da Home sem voltar a classificar linguagem natural no backend. A IA continua interpretando intenção e o backend continua responsável por validar os campos antes de executar.

## Botão Chat

O botão lateral **Nova conversa** passa a se chamar **Chat**. Conversas vazias também usam `Chat` como título temporário; ao receber a primeira mensagem, o histórico continua trocando esse título temporário pelo começo da mensagem, como já acontecia com `Nova conversa`.

## Perguntas de esclarecimento sem duplicação

Uma pergunta de esclarecimento é salva no histórico como mensagem da Sofia e também possui metadados próprios para os botões. Antes da v55, a Home renderizava as duas representações ao mesmo tempo e o texto aparecia duas vezes.

Na v55, quando existe um esclarecimento pendente, a Home identifica a mensagem histórica correspondente e mostra somente o cartão interativo da Sofia, com:

- identificação **Sofia**;
- a pergunta uma única vez;
- os botões disponíveis;
- resposta livre pelo campo de mensagem.

O histórico persistente não é apagado nem alterado para conseguir isso; a correção é de apresentação.

## “Os dois” e outras respostas a esclarecimentos

O interpretador recebe explicitamente o pedido original, o plano pendente, as opções oferecidas e a resposta atual. A instrução da IA reforça que expressões como **“os dois”**, **“ambos”** e **“as duas”** se referem às opções imediatamente anteriores e, quando representam duas ações compatíveis, devem ser preservadas como `compound`.

Ao clicar em um botão, a opção estruturada (`id`, rótulo e significado) também é enviada ao interpretador. Isso reduz a dependência do texto visível do botão.

## Validação antes de gravar

A v55 acrescenta pré-validação determinística de data/hora para compromissos e lembretes. Se uma ação já entendida estiver sem um campo obrigatório, o backend não tenta executá-la nem transforma a ausência em erro técnico: ele volta para `clarify` e pergunta apenas o dado faltante.

Exemplo: monitorar um produto + criar lembrete para a Black Friday, mas sem horário.

1. A IA entende as duas ações.
2. O backend identifica que o lembrete ainda não tem horário.
3. Nenhuma das duas ações é gravada ainda.
4. A Sofia pergunta qual horário usar para o lembrete.
5. Depois da resposta, a IA completa o plano e as duas ações são executadas.

O plano pendente preserva as ações já entendidas para a resposta seguinte.

## Ações compostas atômicas

A execução `compound` agora roda dentro de uma transação externa. Se uma ação posterior falhar por qualquer validação inesperada, as ações anteriores daquela mesma execução são revertidas. Isso evita estados pela metade, como monitoramento criado mas lembrete ausente.

## Mensagens corretas de validação

A rotina compartilhada de data/hora agora recebe o tipo do registro. Assim, falta de horário em um lembrete informa **lembrete**, e falta de horário em um compromisso informa **compromisso**.

## Pendências supersedidas

Quando uma resposta a uma pergunta gera uma nova pergunta de esclarecimento, a pendência anterior é marcada como resolvida e somente a nova permanece aberta. Isso evita várias pendências concorrentes para o mesmo fluxo.
