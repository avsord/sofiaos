# Sofia OS v46 — Checkpoint de produto e implementação

Data: 19/09/2026.

## O que mudou

A v46 consolida as decisões tomadas depois da v45, sem substituir os módulos anteriores nem fingir que integrações externas já estão conectadas.

### Experiência do usuário
- A tela principal passa a ser **Início**.
- Início reúne uma barra compacta de conversa, sino de notificações e widgets de tamanho padronizado.
- No modo usuário, **Nova conversa** volta ao Início; o histórico completo permanece uma ferramenta da visão de desenvolvimento.
- Menus principais do usuário: **Tarefas, Compromissos, Listas, Biblioteca, Estudos e Diário Pessoal**, além de espaços personalizados que podem ser criados manualmente ou pela Sofia após confirmação.
- A interface do usuário não mostra normalmente Fluxo Ativo, memória técnica, contexto, filtros de IA, diagnósticos ou roteamento.

### Visão de desenvolvimento
A visão interna mantém **Panorama técnico, Conversa, Fluxo Ativo, Memória, Estudos, Acervo, Safe Chat, Conexões e Configuração**. Nesta etapa de desenvolvimento, Pedro pode alternar entre as duas visões; uma versão pública deverá bloquear esse acesso para usuários comuns.

### Fluxo Ativo
Fluxo Ativo é a representação interna do que está em movimento no ecossistema. Não é apenas lista de tarefas. Pode incluir tarefa, projeto, sonho/intenção, compromisso, rotina, item para comprar, monitoramento, checklist de saída, aprovação, automação, solicitação, oportunidade/candidatura e outros tipos definidos no catálogo.

Correções de nomenclatura:
- Mercado e Farmácia são listas distintas.
- “Ciclo mensal” é frequência de Rotinas/Recorrências, não uma categoria própria.
- “Automação externa planejada” é um estado/propriedade, não uma categoria isolada.
- Demanda vira **Solicitação**.
- Candidatura pertence a **Oportunidades**.
- Saída/conferência vira **Checklist de saída**.

### Estudos
Cursos e aulas continuam sendo modos da mesma Sofia. **Acompanhar um curso significa acompanhar progresso**, não preço: nível, progresso, dificuldades, pontos fortes, evidências e próximo passo. Monitoramento de preço continua ligado a compras.

### Biblioteca e Listas
Biblioteca reúne filmes, músicas/trilhas, vídeos para assistir, leituras/livros, receitas, referências e outros itens de acervo. Esses conteúdos são compartilháveis por padrão quando forem gerais; qualquer conteúdo pessoal, confidencial ou proprietário continua Privado.

Em Listas, Comprar é o cadastro principal. Black Friday é ocasião/filtro e monitoramento é uma capacidade ligada ao mesmo produto. Mercado e Farmácia não compartilham estado automaticamente.

### Histórico, memória e contexto
- **Histórico**: registro bruto cronológico do que aconteceu.
- **Memória**: registros persistentes e curados que merecem ser lembrados.
- **Contexto**: pacote temporário de mensagens, memórias e registros relevantes escolhido para responder ao pedido atual.

O Filtro Compartilhado também pode usar contexto, desde que todo o contexto enviado seja geral e autorizado. Contexto não é exclusivo do Filtro Privado.

### Roteamento de IA
O uso normal é automático e invisível:
- **Filtro Compartilhado**: conteúdo claramente geral e autorizado.
- **Filtro Privado**: conteúdo pessoal, sensível, confidencial, de terceiros ou incerto.
- Na dúvida, Privado.

A decisão de rota, se foi automática/manual e se houve contexto ficam registradas para auditoria. O usuário pode corrigir uma classificação e essa correção cria uma regra local revisável para casos semelhantes.

### Safe Chat
O antigo cofre de Meditações evolui para **Safe Chat**. Dentro dele há categorias como Diário Pessoal, Meditação e Registro Protegido. Título e conteúdo são cifrados antes do armazenamento persistente. Quando há chamada de IA, somente o Filtro Privado é utilizado.

A interface não promete anonimato, segurança absoluta ou criptografia ponta a ponta. O texto correto é “conteúdo armazenado de forma criptografada”.

### AVSORD
Grafia de trabalho: **AVSORD**.
- AVSORD: Estúdio de Criação e Tecnologia.
- AVSORD Studio: publicidade, motion design, 3D, audiovisual e direção visual.
- AVSORD Technology: Sofia, Anchor Track e futuros produtos de software.
- “Labs” foi descartado por transmitir caráter experimental demais.
- Enjoy The Void permanece independente.

## Limites reais desta versão
A v46 não afirma que WhatsApp real, Calendar, Drive, Gmail, Slack, NFS-e, pagamentos, Uber ou publicação de portfólio estejam conectados. As estruturas locais servem para preservar intenção, estado e critérios de aceite até a integração correspondente existir e ser testada.
