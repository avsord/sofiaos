# LEIA V121

## Correção
A navegação entre `Resumo -> Agenda -> Início` agora termina sempre no topo do Início. A causa era o scroll antigo do Resumo poder atualizar `state.startSection` durante a reentrada na página antes do próximo frame de navegação.

A v121 mantém um destino de navegação imutável durante essa transição.
