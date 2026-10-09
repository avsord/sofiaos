# Sofia OS v54 — Navegação fluida

## Objetivo

Corrigir a navegação da Home sem alterar o motor semântico da Sofia. **Início** e **Resumo** são duas posições da mesma página, não duas rotas independentes.

## Estado da navegação

A interface mantém `startSection` com dois valores: `top` e `summary`. O estado visual do menu é derivado desse valor quando `tab-start` está visível.

- clicar em **Início** seleciona `top` e rola o painel interno para `scrollTop = 0`;
- clicar em **Resumo** seleciona `summary` e rola o painel interno até `homeSummary`;
- a rolagem manual recalcula a seção ativa;
- a Home não é recarregada apenas para mudar entre Início e Resumo.

Isso evita a condição anterior em que `Resumo` chamava `setTab('start')`, mantinha Início destacado e disputava a rolagem com uma atualização assíncrona da Home.

## Layout

O aviso global é posicionado sobre o conteúdo e não participa mais do fluxo da página. Assim, erros de servidor/API não deslocam o chat e os widgets. O cartão principal da Home não usa mais `max-height`; a rolagem principal pertence ao painel `tab-start`.

## Exclusão

A interface oferece exclusão direta onde o usuário gerencia o item: cards gerais, Agenda, Listas e página personalizada. A operação continua passando por `DELETE /api/entities/:id`; o backend recusa exclusão quando ainda existem referências.

## Rede

O transporte HTTPS mantém conexões persistentes, mas não cria um timeout de socket de 30 s concorrente com o timeout de 90 s da chamada da API. O prazo é controlado pelo `AbortSignal` da requisição. Não há repetição automática de chamada, para evitar duplicidade e consumo inesperado.
