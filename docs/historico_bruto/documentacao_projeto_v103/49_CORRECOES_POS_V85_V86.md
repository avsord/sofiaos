# Sofia OS v86 — correções pós-v85

## Problemas reproduzidos e correções

### Árvore Particular
O nó da página carregava a classe genérica `selected`, que no CSS histórico possui fundo roxo global. Isso fazia a linha inteira receber a seleção e podia comprimir o botão interno. Na v86 o nó estrutural não usa mais essa classe e o estado ativo pertence somente a `.space-tree-button.active`. A grade lateral foi estabilizada em `28px / conteúdo / 28px`.

### Seleção de imagem
A toolbar contextual era `display:none` no fluxo e passava a `display:flex` ao selecionar. Essa mudança alterava a altura do bloco no mesmo clique e causava salto/flicker. A v86 posiciona a toolbar como overlay absoluto, em duas colunas, sem participar do layout. A legenda vazia também permanece oculta e o drag só ativa depois de 5px de movimento.

### Ações da página
Os botões `+`, engrenagem e `…` estavam dentro de `#tab-userpage`, que é o elemento rolável. Mesmo com CSS `position:fixed`, o comportamento ainda variava com o contexto de layout. Na v86 os controles ficam em `#userPageFloatingActions`, irmão do painel rolável e filho direto de `main`, com posição absoluta relativa à área principal.

### Tokens do Privado
Até a v85 o Privado exibia somente reservas/uso que a própria instalação da Sofia havia registrado. Isso não era equivalente ao painel completo da OpenAI. A v86 usa, quando disponível, `OPENAI_ADMIN_KEY` para consultar o Usage oficial de Responses/Chat Completions da organização.

- `Data Sharing/Incentive service tier` → Compartilhado;
- demais service tiers → Privado;
- agrupamento por `service_tier` e `model`;
- Privado: mês UTC corrente;
- Compartilhado: dia UTC corrente.

Sem Admin key, a interface não finge sincronização: identifica os números como locais e orienta a configurar a chave Admin.
