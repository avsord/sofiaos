# Sofia OS v81 — Recuperação conversacional

A v81 muda a regra de falha da interpretação semântica.

## Regra principal

A Sofia não deve bloquear o usuário quando não tiver certeza do significado do pedido.

- Se o pedido puder ser respondido sem ação, ela responde normalmente.
- Se a ação estiver clara e tecnicamente válida, ela executa.
- Se a intenção ou algum detalhe necessário estiver ambíguo, ela pergunta de forma curta e natural.
- Erros de parser/JSON/schema não são expostos ao usuário como resposta conversacional.
- Nenhuma ação é executada durante a recuperação até a intenção ficar segura.
- Erros reais de conexão, autenticação, quota ou configuração continuam sendo tratados como erros técnicos.

## Robustez de Structured Outputs

O parser aceita JSON puro, bloco ```json``` e um objeto JSON completo envolvido por texto curto. Não há eval nem execução de código.

## Validação do backend

Se um plano continuar incompleto após tentativas de correção, a Sofia deixa de lançar bloqueio de plano e passa a pedir o detalhe que falta.
