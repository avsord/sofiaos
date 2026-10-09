# Filtros, contexto e Safe Chat

## Filtros
**Filtro Compartilhado** é destinado a conteúdo geral e autorizado. **Filtro Privado** é destinado a conteúdo pessoal, sensível, confidencial, de terceiros ou incerto. O roteamento padrão é automático e conservador: na dúvida, Privado.

A Sofia não trata os filtros como locais de armazenamento diferentes. Memórias e histórico continuam no repositório local da Sofia, com marcação de privacidade. Os filtros são rotas de saída para a IA.

## Contexto
Contexto é o pacote temporário montado para uma resposta. Pode conter mensagens recentes, memórias e registros relacionados. A Sofia deve enviar apenas o mínimo necessário e compatível com a rota escolhida.

O Filtro Compartilhado pode usar contexto compartilhável. O Filtro Privado pode usar contexto privado e compartilhável. Registros técnicos marcados como local não entram em nenhuma chamada de IA.

## Feedback e aprendizagem
Se o usuário disser que uma mensagem deveria ter sido Privada ou Compartilhada, a Sofia registra a correção e pode criar uma regra local por termos relacionados. Essas regras são revisáveis; não substituem a política conservadora de segurança.

## Safe Chat
Safe Chat é uma área de armazenamento cifrado e conversa reservada. O conteúdo é cifrado antes da persistência no banco. Para leitura histórica, exige autorização temporária do cofre. Se houver resposta de IA, usa somente o Filtro Privado.

Categorias atuais:
- Diário Pessoal;
- Meditação;
- Registro Protegido.

Não use este recurso como gerenciador de senhas ou local para chaves de API. O sistema bloqueia padrões reconhecíveis de credenciais antes de persistir ou enviar.
