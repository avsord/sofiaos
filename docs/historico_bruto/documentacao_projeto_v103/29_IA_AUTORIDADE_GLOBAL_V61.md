# Sofia OS v61 — IA como autoridade semântica global

## Princípio central

Na Sofia OS, a IA fica acima do backend em toda decisão de significado. Isso não vale apenas para exclusões ou respostas curtas: vale para conversa, memória, tarefas, lembretes, compromissos, monitoramentos, listas, Biblioteca, Estudos, Espaços/Páginas, consultas, navegação, privacidade e ações compostas.

Fluxo obrigatório:

**usuário → IA interpreta → backend valida → backend executa → Sofia responde**

O backend não pode transformar palavras em intenção por conta própria. Ele não escolhe uma ação porque encontrou uma palavra-chave, não troca lembrete por compromisso, não decide que uma frase curta é um novo objeto e não cria uma categoria com base em regex de linguagem natural.

## O que o backend ainda pode fazer

O backend continua soberano em controles não semânticos:

- bloquear credenciais/segredos explícitos antes de qualquer chamada de IA;
- autenticação e permissões;
- validar schema, IDs, datas e horários já estruturados;
- exigir confirmação para operações destrutivas;
- checar existência, unicidade e vínculos de registros;
- aplicar transações e rollback;
- persistir e executar capacidades locais;
- impedir que contexto privado seja rebaixado para rota compartilhada;
- registrar auditoria e limites de uso.

Esses controles podem **vetar** ou pedir correção de um plano, mas não podem inventar outro significado para a mensagem do usuário.

## Autoridade verificável

Planos semânticos produzidos pelo motor de IA recebem uma marca interna de autoridade. O executor local recusa uma ação sem essa marca. Isso impede que um trecho futuro de backend monte diretamente `create_task`, `create_commitment`, `delete_commitments` ou outra intenção e a execute como se tivesse sido compreendida pela IA.

A marca não é um mecanismo de segurança criptográfica; é uma invariável arquitetural interna e testável. A segurança real continua dependendo das validações, permissões e barreiras locais.

## Estado pendente e botões

Respostas a perguntas pendentes passam pela IA antes da execução. Isso inclui texto livre e clique em botão. O botão é dado estrutural confiável da interface, mas o backend não usa o ID do botão como substituto da interpretação conversacional.

Confirmações destrutivas continuam recebendo uma leitura estreita extra quando necessário. Essa leitura também é feita pela IA; o backend apenas impede que a ação destrutiva seja executada sem confirmação válida.

## Privacidade

A rota semântica é recomendada pela IA. Correções feitas pelo usuário são armazenadas como exemplos para a IA interpretar no futuro, e não como uma regra automática criada pelo backend a partir de algumas palavras da frase.

A primeira interpretação permanece no Filtro Privado para evitar enviar conteúdo ainda não classificado ao Filtro Compartilhado. Contexto já privado só pode elevar a proteção.

## Matching de registros

O backend não usa mais aproximações textuais amplas como `título contém termo` para decidir silenciosamente qual compromisso ou produto o usuário quis dizer. Depois de a IA estruturar o alvo, o backend usa correspondência determinística; se houver ausência ou ambiguidade, a ação não é adivinhada.

## Regra de manutenção

Qualquer capacidade futura da Sofia deve seguir o mesmo contrato. Adicionar uma nova ferramenta significa:

1. expor a capacidade e seu schema ao motor de IA;
2. deixar a IA escolher quando e como usá-la;
3. validar deterministicamente o plano;
4. executar somente o plano autorizado;
5. nunca adicionar um classificador paralelo de linguagem no backend.
