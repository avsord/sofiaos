# Sofia OS v60 — Conversa contínua e estado pendente

## Problema

Até a v59, uma resposta a uma pergunta da própria Sofia ainda podia voltar ao planejador sem uma proteção suficiente do estado do diálogo. Isso permitia que uma frase como `Sim, excluir todos`, enviada depois de uma confirmação de exclusão, fosse reinterpretada como um pedido novo.

Esse comportamento não era uma limitação necessária do modelo. Era uma falha de orquestração: o backend não estava preservando com força suficiente **o ato conversacional que já estava em andamento**.

## Arquitetura da v60

A conversa passa a ter quatro responsabilidades separadas:

1. **Planejador semântico** — entende o pedido novo, a intenção, os alvos, os campos e a rota de privacidade.
2. **Resolvedor de estado pendente** — quando a Sofia fez uma pergunta, classifica a resposta somente em relação àquela pergunta: confirmar, cancelar, fornecer informação, responder uma alternativa, mudar o pedido, fazer uma pergunta ou permanecer incerto.
3. **Executor determinístico** — recebe uma ação já estruturada e valida/executa a capacidade local. Ele não transforma linguagem natural em outra intenção.
4. **Gerador de resposta natural** — em conversa comum, produz a fala final da Sofia separadamente do JSON interno de planejamento.

## Regra principal

Uma resposta curta nunca deve ser interpretada isoladamente quando existe uma pergunta pendente.

Exemplos:

- `sim` → resposta à confirmação anterior;
- `não` → recusa/cancelamento da ação pendente;
- `os dois` → referência às alternativas recém-oferecidas;
- `isso` / `ele` / `todos` → referência resolvida com o diálogo recente;
- `de manhã` → informação temporal ligada ao campo que a Sofia acabou de perguntar;
- `na verdade...` → alteração do plano anterior, não uma segunda ação acumulada por acidente.

## Exclusões destrutivas

`delete_commitments` é uma intenção própria. Ela usa `scope`:

- `all` — todos os compromissos;
- `active` — compromissos ativos;
- `single` — um compromisso identificado.

A ação sempre exige confirmação. Depois que a confirmação está aberta:

- uma resposta confirmatória executa a ação armazenada;
- uma recusa cancela a pendência;
- uma pergunta é respondida sem fechar a pendência;
- uma mudança explícita pode alterar o pedido;
- uma classificação ambígua **não volta ao planejador geral**. Em confirmação destrutiva, a v60 usa uma segunda leitura restrita a confirmar/cancelar/incerto; se continuar incerta, preserva a confirmação.

Isso impede que `Sim, excluir todos` seja reinterpretado como `create_commitment` com título `Todos os compromissos`.

## Resposta natural

O JSON estruturado continua necessário para execução segura, mas deixou de servir como resposta final do Chat em turnos conversacionais comuns. O fluxo é:

`mensagem → plano estruturado → contexto/rota → resposta natural`

Assim, o schema pode continuar rígido sem obrigar a voz da Sofia a parecer um formulário.

## Continuidade

O planejador recebe uma janela maior de conversa recente, além do pedido original e do plano pendente quando houver esclarecimento. O backend conserva o tipo de ação já estabelecido durante preenchimento de campos, evitando drift como lembrete virar compromisso.

## Responsabilidades

**IA:** significado, intenção, relação entre turnos, correções, referências, linguagem natural e resposta conversacional.

**Backend:** autenticação, persistência, validação de schema/campos, proteção de segredos explícitos, confirmação destrutiva, idempotência, execução, limites e auditoria.

A camada determinística existe para tornar a IA executável e segura, não para substituir a compreensão semântica por listas de palavras.
