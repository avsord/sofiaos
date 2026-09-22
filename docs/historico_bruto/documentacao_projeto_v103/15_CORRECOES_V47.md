# Sofia OS v47 — correções de Safe Chat, Diário e roteamento

## Decisões aplicadas

- Safe Chat é um **modo da conversa normal**, acessível no rodapé esquerdo do compositor da Home.
- Ativar Safe Chat **não envia conteúdo ao Diário Pessoal**.
- Diário Pessoal continua sendo um **espaço protegido e criptografado separado**.
- No chat normal, a Sofia pode detectar indícios de Diário/Meditação e **perguntar antes de guardar**. Nada é salvo no Diário por essa sugestão sem ação do usuário.
- As decisões de Filtro Compartilhado/Filtro Privado continuam automáticas no uso normal e deixam metadados de auditoria na visão de desenvolvimento.
- A chave `OPENAI_API_KEY` já existente na instalação de Pedro é migrada para o **Filtro Compartilhado**, conforme a decisão deste projeto. Isso remove o bloqueio genérico de “Configure as rotas” para conteúdo geral.
- Conteúdo privado nunca faz fallback silencioso para o Compartilhado. Se a chave privada não estiver configurada, a Sofia informa isso claramente e não envia a mensagem à rota errada.
- O Filtro Compartilhado pode operar inicialmente com o teto local de tokens mesmo sem tarifa monetária cadastrada. Nesse caso, a interface não afirma conhecer o custo real. O Filtro Privado continua exigindo orçamento local antes da primeira chamada.

## Comportamento do Safe Chat

- O botão funciona como toggle visual.
- A mensagem e a resposta são armazenadas cifradas no cofre sob a categoria `Safe Chat`, não em `Diário Pessoal`.
- O contexto da sessão atual pode ser enviado pelo navegador ao backend apenas para a conversa protegida em andamento.
- Retomar e ler entradas antigas continua exigindo a autorização do cofre.
- Se o cofre ainda não estiver configurado, a interface leva o usuário ao Diário Pessoal para configurar a proteção.

## Diário Pessoal no chat normal

A detecção local reconhece sinais explícitos (“guarde no diário”, “meditação: ...”) e alguns sinais fortes de relato pessoal. Quando houver dúvida, o comportamento é sugestão — não classificação definitiva. O botão `Guardar no Diário` grava a fala do usuário no cofre criptografado. A resposta da IA não é salva no Diário automaticamente.

## Compromisso local

Foi incluído um primeiro parser local para frases simples como “Sofia eu tenho um aniversário do meu colega Pedro hoje às 19hrs”. Esse caso registra o compromisso sem depender de uma chamada à IA e não cria evento externo no Google Calendar.
