# Sofia OS v84 — imagens, notificações, uso e navegação

Esta versão preserva as correções acumuladas da v83 e adiciona as mudanças solicitadas em 21/09/2026.

## Notificações

- O sino abre uma mini janela ancorada, no padrão de popover usado em sites, sem bloquear a página inteira.
- A mini janela mostra os avisos recentes e possui **Ver todas as notificações**.
- A visão completa continua em uma página própria e agrupa as notificações por área.
- Os controles do cabeçalho das páginas Particular permanecem fixos durante a rolagem.

## Voltar ao topo

- O Início mostra um botão flutuante **Topo** depois que a página é rolada.
- Ele volta para o começo da página sem depender dos scrolls internos dos widgets.

## Uso Compartilhado e Privado

- O Privado passa a usar contadores mensais reais registrados pelas chamadas da própria instalação da Sofia: entrada, saída, total de tokens e requisições.
- Compartilhado e Privado usam a mesma barra visual em degradê e apresentam detalhes equivalentes sempre que a métrica possui um limite correspondente.
- No Privado, a barra financeira usa o crédito total configurado. O total em tokens é mostrado separadamente porque não existe um teto de tokens privado configurado equivalente à cota do Compartilhado.
- O valor em USD é uma estimativa local quando as tarifas do modelo estão configuradas; a Sofia não inventa um total da conta da OpenAI que ela não consiga consultar.

## Imagens no chat

- É possível copiar uma imagem e colar com `Ctrl+V` no chat do Início, no chat do modo desenvolvedor e na Sofia aberta dentro das páginas Particular.
- Formatos aceitos: PNG, JPEG, WEBP e GIF.
- A mensagem aceita até 4 imagens, 10 MB por imagem e 30 MB no total do turno.
- A imagem aparece em prévia antes do envio e pode ser removida.
- A Sofia recebe o conteúdo visual junto da mensagem pelo Filtro Privado.
- A imagem do chat não é salva permanentemente por padrão.
- O botão **Salvar em Particular** permite escolher uma página; dentro de uma página Particular, a mini Sofia oferece **Salvar nesta página**.

## Imagens nas páginas Particular

- Também é possível colar uma imagem diretamente na página com `Ctrl+V`.
- Ao selecionar a imagem, surgem quatro alças nos cantos.
- Arrastar qualquer canto redimensiona a imagem mantendo a proporção original.
- Arrastar a própria imagem permite reposicioná-la horizontalmente dentro da página.
- A página salva apenas `display_width` e `display_x`; o anexo original não é recompactado nem perde resolução por causa do redimensionamento visual.
