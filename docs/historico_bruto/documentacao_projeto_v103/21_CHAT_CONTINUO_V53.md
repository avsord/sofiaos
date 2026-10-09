# Sofia OS v53 — Chat Contínuo

## Objetivo
Transformar a tela Início em uma conversa contínua comparável ao uso cotidiano de WhatsApp/ChatGPT, sem perder a arquitetura IA Primeiro.

## Mudanças centrais
- A primeira interpretação da IA recebe as mensagens recentes da mesma conversa para resolver pronomes, elipses e referências como “ele”, “isso”, “aquele produto” e “depois”.
- A busca em memória mais antiga só ocorre quando a conversa recente não basta.
- Pedidos com múltiplas ações podem produzir um plano `compound`; nenhuma segunda ação deve ser descartada.
- A Home renderiza o histórico da conversa em bolhas, e não somente a última resposta.
- A mensagem do usuário aparece imediatamente; enquanto a API trabalha, a interface mostra estado de digitação.
- Para GPT-5.6, as chamadas técnicas usam `reasoning.effort=none` para reduzir latência quando compatível.
- O backend continua validando e executando; não volta a inferir a intenção por palavras-chave.
- Compromisso, lembrete e tarefa continuam entidades distintas.
- O painel Agenda reúne compromissos e lembretes sem fundi-los.
- A ficha de um registro oferece Excluir ao usuário; ferramentas técnicas continuam restritas ao modo Desenvolvedor.
- Resumo continua sendo uma âncora dentro de Início; clicar novamente em Início volta ao topo.

## Exemplo obrigatório de continuidade
Turno 1: “Você conhece o Redmi Pad 2?”
Turno 2: “Depois quero monitorar ele e criar um lembrete para Black Friday.”

A Sofia deve manter “ele = Redmi Pad 2”. Se faltar data/hora para o lembrete, deve perguntar apenas o que ainda falta, sem perguntar novamente qual é o produto.

## Limites honestos
Uma resposta de nuvem não pode ter latência literalmente zero. A v53 reduz chamadas redundantes e melhora a percepção de velocidade mostrando a mensagem e o estado de resposta imediatamente. A latência real ainda depende da rede e da OpenAI.
