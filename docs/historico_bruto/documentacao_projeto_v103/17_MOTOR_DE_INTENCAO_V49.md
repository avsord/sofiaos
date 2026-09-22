# Sofia OS v49 — Motor de Intenção

## Motivo da mudança

As versões anteriores tentavam reconhecer algumas ações do chat com expressões regulares e palavras-chave no backend. Esse desenho gerou um erro importante: uma frase descritiva, como “hoje eu tenho um aniversário de um colega para ir às 19h no Capão”, podia ser tratada como ordem para criar compromisso ou como sugestão de Diário Pessoal, embora o usuário não tivesse pedido nenhuma dessas ações.

A v49 troca essa arquitetura. Em conversa normal, a compreensão semântica acontece primeiro na IA; o backend deixa de tentar adivinhar linguagem natural e passa a validar e executar planos estruturados.

## Fluxo de uma mensagem

1. A camada local de privacidade escolhe Filtro Compartilhado ou Filtro Privado antes de enviar conteúdo à IA. Na dúvida de privacidade, usa Privado.
2. O Motor de Intenção envia a mensagem ao modelo com Structured Outputs e recebe um plano JSON validável: intenção, confiança, necessidade de contexto, dados extraídos e possível esclarecimento.
3. Se o modelo disser que precisa de contexto, o Core recupera somente o necessário e permitido. Se o contexto exigir mais proteção, a rota é elevada para Privado; nunca é rebaixada silenciosamente.
4. Se houver ambiguidade de ação, falta de dado essencial ou baixa confiança, nenhuma ação é executada. A Sofia pergunta e apresenta até três botões de sugestão, além da possibilidade de resposta livre.
5. A resposta do usuário ao esclarecimento volta ao Motor de Intenção junto do pedido original.
6. Somente quando o plano final está claro o backend valida os campos e executa a operação local.

## Responsabilidades

### IA
- compreender intenção e entidades;
- decidir se contexto é necessário;
- formular pergunta neutra quando a intenção não estiver definida;
- transformar linguagem natural em um plano estruturado;
- responder conversacionalmente quando não existe ação local.

### Backend
- validar tipos, campos, datas e estados;
- preservar privacidade e limites financeiros;
- executar somente ações suportadas;
- impedir execução ambígua;
- persistir histórico, intenção, decisão de rota e resultado;
- nunca fingir que uma integração externa foi executada.

## Exemplo de ambiguidade

Entrada:

> hoje eu tenho um aniversario de um colega pra ir as 19hrs no capao

Comportamento v49:

- não cria compromisso;
- não cria diário;
- não cria tarefa;
- pergunta “O que você quer que eu faça com isso?”;
- oferece, por exemplo: “Adicionar aos compromissos”, “Criar tarefa / lembrete” e “Só estou contando”.

## Diário Pessoal e Safe Chat

O chat normal não sugere Diário Pessoal automaticamente. Diário Pessoal e Safe Chat são escolhas explícitas na experiência protegida. Uma reflexão comum permanece uma conversa comum, a menos que o usuário decida registrá-la na área protegida.

## Contexto

Contexto não é sinônimo de memória. É o pacote temporário de informações necessário para responder ao pedido atual. Pode conter mensagens recentes, memória, tarefa, curso ou outro registro autorizado. Tanto Compartilhado quanto Privado podem usar contexto; o material determina a rota.

## Interface

- `Início` continua como Home do usuário.
- `Resumo` aparece logo abaixo de Início e apenas rola a própria Home até a seção de widgets.
- A caixa de conversa em Início foi ampliada.
- Perguntas de esclarecimento aparecem dentro da largura do chat e não deslocam o cabeçalho.
- `Fluxo Ativo`, Memória técnica e histórico de roteamento continuam no modo Desenvolvedor.
- Usuário final não precisa escolher filtro em cada mensagem.
- Listas têm botão `+` para criar listas personalizadas.

## Auditoria

A v49 adiciona:
- `intent_decisions`: plano estruturado e confiança usados para cada mensagem;
- `pending_intents`: esclarecimentos que ainda aguardam resposta;
- linha de auditoria de rota e contexto já existente.

Isso permite descobrir depois não só o que foi feito, mas por que o sistema pediu confirmação ou qual intenção foi executada.

## Meta

Em 19/09/2026 o usuário relatou que a verificação empresarial da Meta foi aprovada. Isso não significa que o número real do WhatsApp ou o Embedded Signup estejam concluídos. Esses itens continuam como não conectados até teste real.
