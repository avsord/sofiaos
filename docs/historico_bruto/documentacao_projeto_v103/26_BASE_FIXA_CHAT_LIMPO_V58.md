# Sofia OS v58 — Base fixa, espaços opt-in e Chat limpo

## Estrutura padrão

A Sofia abre com os menus padrão da interface pública. Esses menus pertencem ao produto e não dependem de espaços personalizados.

A seção **Seus Espaços** começa vazia em uma instalação nova. Espaços personalizados são criados somente quando a pessoa quiser, manualmente ou por uma ação da Sofia confirmada/explicitamente solicitada. Uma atualização não remove espaços existentes.

## Chat limpo por visita

O histórico visual do Chat da Home é tratado como uma sessão de interface. Atualizar a página ou voltar à Sofia em uma nova visita não restaura automaticamente a conversa anterior no painel público.

Isso não apaga a memória estrutural da Sofia, tarefas, compromissos, registros, biblioteca ou outros dados persistentes. O histórico bruto permanece disponível para auditoria no modo desenvolvedor. Uma nova conversa de backend só é criada quando a pessoa envia a primeira mensagem da nova sessão.

## Início ↔ Resumo

Início e Resumo continuam sendo duas posições da mesma página. O clique usa uma animação própria por `requestAnimationFrame`, com easing contínuo e duração proporcional à distância, evitando o salto instantâneo causado por reposicionamentos durante o carregamento da Home. Rolagem manual interrompe a animação e o destaque do menu acompanha a seção visível.

## Chat

O botão principal passa a se chamar apenas **Chat**, sem o sinal de `+`. Na interface pública, clicar nele limpa a sessão visual atual e volta ao topo. No modo desenvolvedor, o histórico técnico continua disponível.
