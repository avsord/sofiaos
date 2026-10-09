# LEIA V107

Objetivo: corrigir o posicionamento visual do preview de notificações sem alterar a arquitetura nem remover documentação.

Correção: o painel do sino passa a ser ancorado pelo lado direito usando `left: 100%` + `translateX(-100%)`, abrindo para a esquerda e evitando corte na borda direita do navegador.

Regra de preservação mantida: nenhuma documentação histórica/bruta é apagada para simplificar o projeto.
