# Sofia OS v71 - Contexto, Agenda e Interface

A v71 refina a interface e torna o contexto da mini Sofia mais natural sem isolar o restante do cérebro.

## Alterações principais

- APLICATIVOS DA SOFIA inicia fechado por padrão.
- Abrir/fechar o menu não altera a largura útil da sidebar nem desloca o botão Chat.
- Ícones dos aplicativos ficam alinhados à esquerda, menores, padronizados e sem movimento no hover.
- Ícones do composer/chat usam SVGs consistentes e não mudam geometria ao alternar estado.
- Microcontroles das páginas (adicionar bloco, arrastar, metadados e ações inline) deixam de herdar o visual de botão/pílula global e mantêm medidas fixas.
- Templates extras adicionados durante o desenvolvimento foram removidos. Permanecem apenas: Página em branco, Ideias, Tarefas, Links/Referências, Equipamentos, Produção de conteúdo, Clientes/CRM, Pesquisa e Compras.
- Após uma ação da Sofia criar/alterar compromisso, a Agenda é recarregada imediatamente, sem F5.
- Ao abrir a mini Sofia dentro de uma página, a página atual vira uma prioridade contextual suave.
- No contexto reduzido, a Sofia recebe identidade/localização da página; no contexto ampliado, também recebe conteúdo e estrutura.
- A página aberta nunca substitui uma intenção explícita nem impede o uso do restante da memória e das ferramentas da Sofia.

## Regra de contexto

Prioridade prática: pedido explícito do usuário -> conversa atual -> página aberta para referências implícitas como “aqui”/“esta página” -> restante do cérebro/memória.

## Validação

A release deve passar a suíte completa, teste de atualização v70 -> v71, rollback, preservação de `.env`, dados e `INICIAR_SOFIA.cmd` personalizado, manifesto de integridade e validação do ZIP.
