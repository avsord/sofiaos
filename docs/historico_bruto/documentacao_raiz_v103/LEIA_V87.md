# Sofia OS v87 — interface estável, notificações e Uso Privado atualizado

Esta entrega parte da v86 e mantém as correções e recursos acumulados. A v87 concentra as mudanças pedidas após o teste visual da v86, sem apagar dados locais do usuário.

## O que mudou

- **Ações do topo das páginas Particular:** `+`, engrenagem e `…` ficam fixos na viewport e agora permanecem centralizados na área útil. O scroll da página não leva os botões junto.
- **PARTICULAR no mesmo padrão de APPS:** o cabeçalho ganhou o mesmo bloco arredondado, altura, fundo, espaçamento e alinhamento visual de APPS. As páginas, como `Enjoy the Void`, continuam abaixo dele.
- **Toolbar da imagem:** `Editar imagem`, link, comentário e demais ações aparecem em **uma única linha horizontal abaixo da imagem**, fora do frame. A barra continua flutuante e não empurra o conteúdo.
- **Troca Compartilhado / Privado sem flicker:** clicar em **Privado** atualiza somente o cartão de Uso da Sofia. O chat não é remontado e a posição da conversa não deve subir.
- **Privado com dados financeiros oficiais:** com `OPENAI_ADMIN_KEY`, tokens/requisições são sincronizados pelo Usage da organização e o gasto em USD é obtido pelo endpoint oficial de **Costs**, em vez de depender apenas da estimativa local.
- **Centro de notificações:** o sino abre uma janela flutuante; quando houver muitas notificações ela possui scroll interno. Sem itens, mostra `Sem notificações no momento.`. `Ver todas as notificações` abre a página geral agrupada por área/app, com mais detalhes e acesso ao registro relacionado.

## Como atualizar

1. Feche a Sofia com `Ctrl+C` se ela estiver aberta.
2. Extraia este ZIP em uma pasta normal do Windows.
3. Execute `ATUALIZAR_SOFIA.cmd`.
4. O atualizador valida `MANIFESTO_V87.json`/SHA-256 antes de substituir código e cria backup para rollback.
5. Depois, abra o `INICIAR_SOFIA.cmd` da instalação `SOFIA-OS`.

## Preservação

A atualização não substitui `.env`, memória, `data/`, anexos, backups, exports, `node_modules`, credenciais nem um `INICIAR_SOFIA.cmd` personalizado.

## Sobre o Uso Privado

Para reproduzir números oficiais da organização, configure em Configurações a credencial **Uso da OpenAI · chave Admin da organização** (`OPENAI_ADMIN_KEY`). Sem a chave Admin, a Sofia continua mostrando a telemetria local e deixa isso explícito.

Na v87, o Privado usa o Usage oficial para tokens/requisições e o Costs oficial para o gasto monetário quando a chave Admin está disponível. O limite/alerta configurado na Sofia continua sendo um controle visual local e não altera o limite real de cobrança da conta OpenAI.

## Validação

A suíte completa da v87 possui **454 testes**, todos aprovados nesta entrega. Há testes específicos para os controles fixos/centralizados, PARTICULAR, toolbar da imagem, troca para Privado sem remontar o chat, Costs oficial e notificações.

Consulte `validacao/RELATORIO_TESTES_V87.md`.
