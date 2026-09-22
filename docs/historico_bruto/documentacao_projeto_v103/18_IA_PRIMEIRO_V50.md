# Sofia OS v50 — IA Primeiro

## Objetivo

A v50 corrige a ordem de responsabilidade da conversa. A inteligência artificial interpreta a mensagem antes de o backend tentar executar qualquer ação semântica. O backend deixa de ser um classificador de linguagem natural e passa a ser o validador e executor determinístico do plano produzido pela IA.

## Ordem da conversa

1. **Barreira local de segredos explícitos.** Antes de qualquer chamada, o servidor bloqueia apenas credenciais/segredos inequivocamente perigosos (por exemplo, chave de API ou senha) para impedir que sejam enviados a um modelo. Essa barreira não tenta decidir se a mensagem é compromisso, diário, tarefa ou conversa.
2. **Interpretador de IA primeiro.** A mensagem é enviada ao interpretador semântico da Sofia. Ele devolve JSON estruturado com intenção, confiança, ação explícita, necessidade de contexto, sensibilidade e opções de esclarecimento.
3. **Ambiguidade vira pergunta, não ação.** Se houver mais de uma ação plausível ou faltar informação essencial, a IA devolve `clarify`. A interface mostra a pergunta e até três botões imediatamente, além de permitir resposta livre. Nenhuma escrita é executada nessa etapa.
4. **Contexto só quando necessário.** Se a IA disser que precisa de contexto, o servidor recupera apenas registros relevantes e permitidos, entrega-os novamente à IA e pede um plano final.
5. **Rota final.** A própria interpretação da IA recomenda Compartilhado ou Privado. Contexto já marcado como privado pode apenas elevar a rota; nunca é rebaixado para Compartilhado.
6. **Backend valida.** O backend valida datas, horários, IDs, estados, permissões e campos obrigatórios. Ele não reinterpreta linguagem natural.
7. **Backend executa.** Somente depois de intenção suficientemente clara/confirmada o backend grava tarefas, compromissos, memórias e demais ações locais implementadas.

## Exemplo obrigatório

Mensagem: `hoje eu tenho um aniversario de um colega pra ir as 19hrs no capao`

Resultado esperado da interpretação:
- intenção: `clarify`
- ação explícita: `false`
- sensibilidade: `personal_non_sensitive`
- rota final recomendada: `shared`
- nenhuma tarefa/compromisso criado ainda
- pergunta neutra: `O que você quer que eu faça com isso?`
- opções: `Adicionar aos compromissos`, `Criar tarefa / lembrete`, `Só estou contando`

Ao escolher um botão, a resposta volta para a IA. A IA reinterpreta o pedido original junto com a escolha e somente então produz um plano executável.

## Por que o interpretador usa o Filtro Privado

Existe uma limitação inevitável em qualquer arquitetura de IA em nuvem: para decidir se um texto desconhecido é sensível, algum modelo precisa lê-lo. Se esse primeiro modelo fosse o projeto Compartilhado, um texto sensível já teria sido enviado para a rota errada antes da classificação. Por isso, a v50 usa uma chamada curta do **Filtro Privado como interpretador inicial** e só depois decide se a resposta principal e o contexto permitido podem usar o Filtro Compartilhado.

Consequência: o Filtro Privado precisa estar configurado para que o modo IA-primeiro opere com a proteção proposta. Essa primeira chamada gera algum consumo privado, embora a resposta principal possa depois usar o Compartilhado. Um futuro interpretador local/on-device pode eliminar esse custo inicial sem abrir mão da privacidade.

## O backend não deve voltar a fazer

- classificar `hoje eu` como Diário;
- inferir compromisso por regex;
- inferir tarefa por uma lista crescente de palavras;
- escolher Diário Pessoal sem pedido explícito;
- executar quando a ação estiver subentendida;
- mandar uma mensagem para Compartilhado depois que contexto privado tiver sido recuperado.

## Botões de sugestão

Botões são uma extensão da pergunta da IA, não decisões do backend. Eles aparecem quando a IA devolve `clarify`. A pessoa pode clicar ou escrever livremente. O clique também é reinterpretado pela IA antes da execução.

## Responsabilidade de cada camada

**IA:** significado, intenção, ambiguidade, necessidade de contexto, sensibilidade semântica, sugestão de ações.

**Backend:** autenticação, proteção de segredos explícitos, persistência, limites, permissões, validação de schema/campos, idempotência, execução de capacidades reais e auditoria.

**Interface:** exibir pergunta, botões, estado e resultado sem antecipar uma categoria que o usuário não escolheu.
