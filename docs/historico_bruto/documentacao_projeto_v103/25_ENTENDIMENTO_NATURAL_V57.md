# Sofia OS v57 — Entendimento natural em esclarecimentos

## Problema reproduzido

Depois de a Sofia já entender duas ações — monitorar um produto e criar um lembrete para a Black Friday — o sistema perguntava data e horário. O usuário respondia de forma natural:

`quero na data que acontece o black friday e pode ser o primeiro horario da manha`

Mesmo assim, a Sofia podia repetir exatamente a mesma pergunta.

## Causa raiz

A v56 preservava o tipo da ação no backend, mas ainda enviava cada resposta de esclarecimento para o mesmo planejador geral usado no início de uma conversa. O schema desse planejador continuava permitindo `clarify`, `respond`, `create_commitment` e outras intenções. Portanto, o modelo ainda tinha liberdade estrutural para reinterpretar um turno cujo objetivo deveria ser apenas completar campos.

Ao mesmo tempo, as instruções eram conservadoras demais com tempo: exigiam data `YYYY-MM-DD` e horário `HH:MM`, mas não davam uma política explícita para expressões determinísticas como “na Black Friday” ou “primeiro horário da manhã”. Quando a interpretação devolvia os campos vazios, o validador via exatamente o mesmo estado anterior e produzia a mesma pergunta.

## Correção arquitetural

### 1. Modo de completar campos

Se a pendência já contém uma ou mais ações estruturadas, o Core passa essas ações como `lockedActions` ao interpretador.

O motor constrói um schema específico para o turno:

- uma única ação pendente: o `intent` fica restrito àquela ação;
- múltiplas ações pendentes: o `intent` fica restrito a `compound`;
- o número de itens de `actions` fica preso ao número de ações já compreendidas;
- `clarify` e tipos concorrentes deixam de ser saídas válidas desse turno.

A IA continua interpretando a linguagem natural, mas não decide novamente **o que** o usuário queria fazer. Ela apenas completa **dados** daquilo que já foi decidido.

### 2. Referências temporais determinísticas

O interpretador recebe referências de tempo da sessão. Nesta versão, a próxima Black Friday é calculada deterministicamente como a sexta-feira posterior à quarta quinta-feira de novembro. Para 19/09/2026, a referência enviada é `2026-11-27`.

A referência não classifica a fala do usuário. A IA ainda decide se a expressão do usuário realmente se refere à Black Friday; o backend apenas disponibiliza um fato calendárico exato para evitar que um dado derivável seja tratado como desconhecido.

### 3. Períodos do dia

Quando a pessoa explicitamente aceita um período amplo, a Sofia usa horários-padrão:

- manhã → `09:00`;
- tarde → `15:00`;
- noite → `19:00`.

Assim, “de manhã” ou “primeiro horário da manhã” não obrigam uma pergunta artificial por `HH:MM`. Se o usuário indicar um horário exato, esse valor tem prioridade.

## Arquitetura preservada

A regra continua sendo:

**IA interpreta → backend preserva/valida a estrutura → backend executa.**

Não foi adicionado um classificador semântico por regex para detectar “Black Friday”, “manhã” ou intenção de lembrete. O backend não decide que uma frase significa uma ação. Ele limita o espaço de saída quando a ação já foi definida e fornece referências objetivas de calendário.
