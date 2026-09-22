# Sofia OS v62 — ciclo completo IA → backend → IA

## Princípio central

A Sofia não é um conjunto de comandos interpretados pelo backend. Ela é uma assistente conversacional que decide semanticamente o que está acontecendo antes de qualquer ferramenta local ser executada.

Fluxo obrigatório no modo normal:

**Usuário → IA → Usuário → IA → … → plano pronto → backend → resultado técnico → IA → Usuário**

A conversa pode ter quantos turnos forem necessários. Nem todo turno precisa virar uma ação.

## 1. Entrada do usuário sempre volta para a IA

Texto livre, respostas curtas, correções, pronomes, confirmações e cliques em botões entram no mesmo motor de diálogo. Exemplos como `sim`, `não`, `todos`, `os dois`, `isso`, `ele`, `de manhã` não são comandos independentes do backend; são atos de diálogo cujo significado depende do contexto.

A exceção anterior à IA é a barreira local de segredos explícitos/credenciais. Ela existe para evitar que uma chave ou senha seja enviada a qualquer modelo. O modo local técnico também permanece uma escolha explícita que não chama a IA.

## 2. A IA decide se conversa, pergunta ou executa

O schema do turno inclui:

- `intent`: resposta, esclarecimento ou capacidade desejada;
- `ready_for_backend`: indica que o plano está semanticamente completo;
- `execution_confirmed`: confirmação explícita para operação destrutiva;
- `pending_state`: mantém, substitui ou resolve um estado pendente;
- `clarification`: pergunta e opções criadas pela própria IA;
- `action` / `actions`: plano estruturado para as ferramentas.

Se a IA ainda não entendeu, ela devolve `clarify`. O backend apenas guarda a pendência e mostra a pergunta/opções exatamente como produzidas pela IA. Ele não inventa perguntas de fallback.

## 3. Botão é resposta, não comando

Um botão da interface nunca chama diretamente uma ação como `deleteAll()` ou `createTask()`.

O clique envia à IA:

- o texto escolhido pelo usuário;
- o ID e o significado estrutural da opção;
- a pergunta pendente;
- o pedido original;
- o contexto recente da conversa.

A IA reinterpreta tudo e pode perguntar de novo, responder sem executar, alterar o plano ou liberar a execução.

## 4. Backend só recebe plano pronto

Uma ação só pode chegar ao executor quando a IA marcou `ready_for_backend=true`. O executor também exige a marca interna de autoridade semântica criada pelo motor de IA.

Para ações destrutivas, `execution_confirmed=true` é obrigatório. A confirmação é compreendida pela IA; o backend apenas verifica que a confirmação estruturada existe.

O backend não usa confiança baixa, palavras-chave ou regex para decidir que “seria melhor perguntar”. Se a IA quer perguntar, ela deve devolver `clarify`.

## 5. Validação técnica volta para a IA

Mesmo um plano semanticamente claro pode ser tecnicamente inválido: data fora do formato, ID inexistente, lista ausente, pai ambíguo, conflito de vínculo etc.

Nessa situação:

1. o backend **não executa**;
2. produz somente um diagnóstico técnico estruturado;
3. esse diagnóstico volta para a IA em `sofia_validation_turn_v62`;
4. a IA decide o próximo passo;
5. se precisar de uma pessoa, a própria IA formula a nova pergunta.

Portanto, mensagens técnicas do backend não viram fala direta da Sofia.

## 6. Resultado da execução também volta para a IA

Depois de executar, o backend retorna fatos: tipo da operação, itens realmente criados/alterados, estado, destino visual e resumo factual da execução.

Esses fatos entram numa segunda chamada conversacional. A IA recebe `RESULTADO TÉCNICO DO BACKEND` e só então escreve a resposta visível, sem poder afirmar sucesso além do que o backend comprovou.

O backend pode produzir resumos internos para transportar fatos, mas nunca é a voz final da interface.

## 7. Responsabilidades

### IA

- entender linguagem natural;
- manter continuidade;
- resolver referências e elipses;
- distinguir conversa de ação;
- decidir quando precisa perguntar;
- criar perguntas e opções;
- interpretar respostas e botões;
- selecionar capacidades;
- estruturar o plano;
- recomendar rota de privacidade;
- decidir quando o plano está pronto;
- transformar resultado técnico em resposta natural.

### Backend

- autenticação;
- proteção local de segredos explícitos;
- permissões;
- validação de schema;
- IDs e integridade referencial;
- datas/horários já estruturados;
- confirmação estruturada de destrutivos;
- persistência;
- transações e rollback;
- auditoria e limites;
- execução de capacidades reais;
- retorno factual do resultado.

O backend pode **vetar**; não pode **reinterpretar**.

## 8. Invariantes testáveis

A v62 adiciona testes para provar que:

- uma pergunta de esclarecimento nasce da IA;
- um botão volta para o mesmo planejador de diálogo;
- um plano inválido tecnicamente retorna para a IA antes de qualquer pergunta;
- nenhuma escrita ocorre enquanto o plano ainda está incompleto;
- o resultado factual do backend passa por uma resposta de IA antes de chegar ao usuário;
- o executor rejeita plano sem `ready_for_backend`;
- destrutivos sem `execution_confirmed` são rejeitados;
- uma pergunta lateral pode manter uma ação pendente;
- não existem classificadores especiais de confirmação/pendência no backend;
- segredos explícitos continuam bloqueados antes de qualquer chamada externa.

## 9. Regra para novas capacidades

Toda nova ferramenta da Sofia deve seguir o mesmo contrato:

1. descrever a capacidade/schema para a IA;
2. deixar a IA decidir quando usar;
3. deixar a IA conversar até possuir informação suficiente;
4. liberar um plano estruturado;
5. validar/executar no backend;
6. devolver fatos técnicos para a IA;
7. deixar a IA falar com o usuário.

Não adicionar `if (texto contém X) então faça Y` no backend para compensar uma ferramenta nova.
