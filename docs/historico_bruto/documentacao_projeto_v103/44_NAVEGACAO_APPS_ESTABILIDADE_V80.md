# Sofia OS v80 — Navegação APPS e estabilidade do Resumo

## Lateral
- Início e Resumo ficam sempre visíveis, fora do grupo recolhível.
- CENTRAL foi renomeado para APPS.
- APPS contém Tarefas, Compromissos, Listas, Biblioteca, Estudos e Diário Pessoal.
- Chat mantém o ícone à esquerda e centraliza o nome no botão.
- PARTICULAR mantém a mesma identidade e recebe espaçamento vertical simétrico em relação aos blocos vizinhos.

## Estabilidade do Início / Resumo
- Atualizações de Agenda e exclusões não devem reconstruir a Home inteira.
- O viewport do Resumo é ancorado durante mutações e restaurado por múltiplos frames para neutralizar ajustes tardios do navegador.
- overflow-anchor é desativado nas áreas dinâmicas do Início.
- Widgets têm geometria estável no desktop; a lista interna rola sem alterar a altura do card.
- Exclusões limpam feedback global obsoleto e desfocam o controle removido antes da mutação.

## Composer
- Texto e seta do botão Enviar permanecem brancos inclusive no estado disabled.
