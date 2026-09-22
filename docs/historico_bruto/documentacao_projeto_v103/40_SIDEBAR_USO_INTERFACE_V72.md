# Sofia OS v72 - Sidebar, Uso e Alinhamento

A v72 corrige problemas visuais observados após a v71 sem alterar o comportamento de memória, contexto ou dados do usuário.

## Correções

- A sidebar do modo usuário passa a usar uma única rolagem vertical, evitando o corte de APLICATIVOS DA SOFIA e PARTICULAR.
- O menu interno deixa de criar uma segunda scrollbar que deslocava elementos ao abrir/fechar.
- O botão Chat mantém o ícone à esquerda, mas o texto fica centralizado no espaço total do botão.
- O título APLICATIVOS DA SOFIA começa na mesma régua horizontal de PARTICULAR.
- O cartão de Uso compartilhado ganha botão de fechar.
- Após alterar o alerta de tokens, a interface consulta novamente o estado real e atualiza limite, percentual, restante e barra sem F5.
- O gradiente da barra passa a representar a posição real na escala verde -> amarelo -> vermelho, em vez de comprimir todas as cores dentro do trecho preenchido.
- Mensagens antigas de alerta no rodapé do composer deixam de permanecer quando o cartão de uso já foi atualizado.

## Regras preservadas

- O alerta de tokens continua sem bloquear conversas.
- `.env`, chaves, memória, dados, páginas, anexos e `INICIAR_SOFIA.cmd` personalizado devem ser preservados pelo atualizador.
- O menu APLICATIVOS DA SOFIA continua fechado por padrão.
- A página aberta continua funcionando como prioridade contextual suave para a mini Sofia, sem isolar o restante do cérebro.
