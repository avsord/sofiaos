# Sofia OS v86 — correções pós-v85

Esta entrega parte da v85 e preserva todas as alterações acumuladas anteriores. A v86 corrige os problemas observados no uso real da v85 sem remover os recursos já aprovados.

## Correções desta entrega

- **Botão Enjoy the Void / árvore Particular:** removido o conflito com a classe global `selected` que pintava o nó inteiro de roxo e esmagava/truncava o botão. A seleção agora fica somente no botão da página, com largura e colunas estáveis.
- **Imagens sem flicker:** selecionar uma foto não injeta mais toolbar/legenda no fluxo da página. A toolbar é flutuante, não empurra o conteúdo e o arraste só começa depois de movimento real do ponteiro.
- **Sem barras escuras:** blocos/imagem/área de resize permanecem transparentes; legenda vazia não aparece ao selecionar; o contorno de seleção é sutil e as alças não têm transição que pisque.
- **Toolbar da foto em duas linhas:** o menu contextual fica em grade estável de duas colunas/linhas conforme necessário, sem provocar salto de layout.
- **Ícones + / ⚙ / … realmente fixos:** os controles foram retirados do container que rola e agora ficam em uma camada própria do `main`, portanto o scroll da página Particular não move os botões.
- **Tokens do Privado sincronizáveis com a OpenAI:** foi adicionada leitura do endpoint oficial de Usage da organização para Responses/Chat Completions. O Privado usa os tiers que não são Data Sharing/Incentive; o Compartilhado usa o tier de Data Sharing/Incentive.
- **Chave Admin de Usage:** Configurações agora aceita uma terceira credencial, `Uso da OpenAI · chave Admin da organização`, validada diretamente no endpoint de Usage e salva como `OPENAI_ADMIN_KEY`. Sem essa chave, a Sofia deixa explícito que só consegue mostrar os tokens registrados localmente pela própria instalação.

## Importante sobre os números de tokens

Uma chave normal de projeto não pode consultar o Usage total da organização. Para a Sofia reproduzir os números do painel da OpenAI, configure uma chave **Admin da organização da OpenAI Platform** em Configurações → Chaves dos projetos → **Uso da OpenAI · chave Admin da organização**. Se `OPENAI_ADMIN_KEY` já existir no `.env`, a sincronização é usada automaticamente.

A sincronização de tokens consulta `GET /v1/organization/usage/completions`, agrupando por `service_tier` e `model`. O teto/alerta financeiro em USD continua sendo uma proteção local configurável; a leitura de tokens/requisições passa a usar a OpenAI quando a chave Admin estiver disponível.

## Como atualizar

1. Feche a Sofia com `Ctrl+C` se ela estiver aberta.
2. Extraia este ZIP em uma pasta normal do Windows.
3. Execute `ATUALIZAR_SOFIA.cmd`.
4. O atualizador valida o manifesto/hash antes de alterar a instalação e cria backup do código substituído.
5. Depois da atualização, abra o `INICIAR_SOFIA.cmd` da sua pasta `SOFIA-OS`.

## Preservação

A atualização não substitui `.env`, memória, `data/`, anexos, backups, exports, `node_modules`, credenciais nem o `INICIAR_SOFIA.cmd` personalizado.

## Validação

A suíte completa da v86 possui **447 testes** cobrindo a regressão acumulada e as novas correções. Consulte `validacao/RELATORIO_TESTES_V86.md`.
