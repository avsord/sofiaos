# Comprar, Black Friday e monitoramentos — v45

## Um item, várias visões

Em Fluxo Ativo → Comprar, crie produto com modelo/variante exata, loja, URL, preço-alvo, ocasião e ano. Black Friday é uma ocasião/label do mesmo item, não outra lista independente. O acompanhamento pode começar antes de novembro. Criar monitor aponta para o item existente; cursos externos também podem ter monitor de preço.

Em Monitoramentos, escolha manual ou feed JSON autorizado. Manual permite registrar preço, frete, moeda, variante, fonte e data observada. Observe a mesma variante: armazenamento, ml, cor/tamanho quando relevantes. O histórico sinaliza baixo observado local, queda percentual ou cruzamento de meta, sem alegar preço anterior ao início da coleta. Não converte moeda nem prova confiabilidade do vendedor.

Um produto pode ter muitos monitores/fontes, mas cada série mantém alvo, variante e moeda. Depois da primeira observação, não é permitido mudar o escopo daquela série. Oportunidades e notificações têm deduplicação e origem. Não existe compra automática ao cair de preço.

## Coleta automática que funciona nesta versão

O agendador consulta exclusivamente um endereço HTTPS público que ofereça JSON e cujo uso você autorizou. Não raspa automaticamente Mercado Livre, Amazon, Shopee, AliExpress, Instagram, grupos ou páginas HTML arbitrárias. Não usa cookies, login, captcha, proxy de evasão ou credenciais na URL.

No monitor, informe o feed e o caminho de cada campo: por exemplo preço `product.price`, variante `product.variant`, moeda `product.currency` e frete `product.shipping`. A fonte precisa devolver números e identificadores consistentes. Campos ausentes, moeda/variante divergentes ou falha de rede geram erro e aviso, não um preço inventado.

Ative o consentimento e o estado ativo. Intervalo mínimo local: 15 minutos. O processo roda no PC, não como automação deste chat. Desligar o PC pausa as consultas; quando voltar, o job retoma sem criar retroativamente observações perdidas. A frequência da coleta não usa IA por si só.

Há proteções contra destinos locais/privados, redirecionamentos, respostas grandes e URL com segredo reconhecido. A fonte é consultada com resolução DNS conferida, tamanho e timeout limitados. A disponibilidade, autorização e estabilidade do feed continuam sendo dependências externas. Os testes usaram feeds simulados, não compras ou lojas reais.

## Mercado, farmácia e receitas

As listas conservam itens pendentes, indisponíveis e comprados, com datas/versões. Gerar lista de uma receita usa seus ingredientes reais, preservando quantidade escrita. A Sofia não sabe o estoque doméstico sem informação sua e não inventa porções. Marcar comprado é registro do que você informou, não prova de pagamento.

Avisos ficam na central do painel. WhatsApp e e-mail de oportunidades só poderão ser ativados após integração real e autorização específica. Cadastros de automação não ligam um conector que ainda não existe.
