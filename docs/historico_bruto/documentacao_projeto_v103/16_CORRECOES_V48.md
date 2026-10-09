# Sofia OS v48 — Compromissos antes de Diário

## Correção principal
A frase natural "hoje eu tenho um aniversário de um colega pra ir às 19h no Capão" não pode ser tratada como Diário Pessoal só porque começa com "hoje eu".

A v48 aplica esta ordem:
1. Detectar primeiro intenções operacionais locais (compromissos, tarefas, listas e outros registros estruturados).
2. Se houver compromisso com data/horário, registrar em **Compromissos** e disponibilizar na **mini agenda**.
3. Preservar o local quando informado.
4. Só avaliar Diário Pessoal se a mensagem não tiver sido reconhecida como outra intenção operacional.
5. Diário Pessoal exige sinal reflexivo/pessoal mais específico ou pedido explícito para guardar no diário.

## Limite atual
O compromisso é local na Sofia OS. A v48 não declara sincronização com Google Calendar; isso continua dependente da integração futura.
