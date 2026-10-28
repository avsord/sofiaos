# Sofia OS — decisões de design por tela (site no computador)

Regra do Pedro: nada de moldes. Cada tela tem intenção, proporção e formato próprios. Para cada uma: o que ela é,
o que está errado hoje e a solução. O celular não muda com estas decisões (exceto quando dito). Estado de cada tela
fica em `docs/PEDIDOS.md` (Fase 3).

## Login — entregue na 0.3.261
- Intenção: entrar rápido, uma vez; é o primeiro contato com a Sofia (momento de marca, não de trabalho).
- Problema: era o login do celular esticado — campos de ~1.850 px, botão pequeno num canto, "Esqueceu a senha?" a
  quase 2.000 px do campo, rodapé em outro eixo, texto de celular ("não depende do WhatsApp").
- Solução: tela dividida. Esquerda (mais larga): marca em fundo violeta profundo, título grande, uma frase. Direita:
  coluna de 400 px centralizada na vertical — "Entrar", e-mail, senha, "Esqueceu a senha?" logo abaixo da senha,
  botão na largura do formulário, Privacidade/Termos no pé. Rótulos em caixa normal (também no celular).

## Início — entregue na 0.3.262 (primeira parte)
- Feito: no computador, o dia (Agenda do Início) na coluna principal (≈2/3) e os widgets empilhados ao lado (≈1/3).
- Intenção: o painel do dia — o que tenho hoje, o que está pendente, como estão as coisas. Olhar rápido, não trabalhar.
- Problema: grade de widgets do celular; a Agenda ocupa uma faixa larga com metade vazia; widgets com alturas
  desencontradas; texto de erro longo solto no fim.
- Solução: duas colunas de leitura (≈ 2/3 e 1/3). Coluna principal: o dia (compromissos de hoje e amanhã em lista
  com horário à esquerda) e Tarefas backlog. Coluna lateral: mini calendário do mês, Meta, Price Tracker. Avisos de
  erro viram uma faixa discreta no topo, não um parágrafo no fim.

## Agenda — entregue na 0.3.262
- Feito: no computador cada dia do mês é uma célula alta com até 3 compromissos (horário + título, cor da prioridade), "+N mais", hoje marcado no número; datas com só a primeira letra maiúscula ("Outubro de 2026").
- Intenção: planejar — ver o mês e cuidar do dia escolhido.
- Problema: o mês ocupa ~1/3 e o painel do dia fica vazio e estreito; o "+" grande isolado no canto.
- Solução: mês grande à esquerda (células com os títulos dos compromissos, não só pontos), painel do dia à direita com
  lista por horário; criar pelo "+" do painel do dia e pelo clique direito na data.

## Finanças
- Intenção: saber como está o dinheiro agora e registrar movimentos.
- Problema: uma coluna estreita centralizada com muito vazio dos lados; abas pequenas; o cartão do Saldo e o
  Histórico disputam a mesma coluna.
- Solução: Resumo com o cartão do Saldo/Previsto/Controle numa faixa de cartões e o Histórico ao lado (lista com
  data, descrição, categoria e valor alinhado à direita com números de largura fixa). Abas como navegação de topo.

## Apps
- Intenção: escolher um espaço.
- Problema: cartões em 4 colunas de largura total com muito texto pequeno; bom no geral.
- Solução: manter a grade, com cartões de altura igual e ícone maior; título e descrição com mais respiro.

## Tarefas backlog, Listas, Biblioteca, Notas, Lembretes, Cápsulas, E-mails
- Intenção: lista + detalhe (escolher um item e mexer nele).
- Problema: listas estreitas no meio da tela; abrir um item troca a tela inteira.
- Solução: lista à esquerda com busca e filtros no topo; o item aberto aparece no painel lateral (já existe o painel
  lateral para telas cheias), sem perder a lista de vista.

## Conversa
- Intenção: conversar com a Sofia.
- Solução: coluna de leitura de ~720 px centralizada (60–80 caracteres por linha), caixa de mensagem fixa embaixo na
  mesma largura; lista de conversas à esquerda quando houver espaço.

## Páginas
- Intenção: ler e escrever.
- Solução: árvore de páginas à esquerda; documento em coluna de ~720 px, capa em largura total do documento.

## Perfil
- Intenção: ajustes, raramente.
- Solução: menu de seções à esquerda (já existe) e conteúdo em coluna de ~640 px; botões perigosos separados no fim.

## Entregue na 0.3.263
- Conversa: lista de conversas numa coluna à esquerda (≥1180 px), busca e "+ Nova conversa"; leitura centralizada à direita.
- Tarefas backlog, Biblioteca, Notas e Listas: cartões em duas colunas no computador largo (≥1200 px) e menu do botão direito.
- Páginas (documento): sem cabeçalho repetido no computador — o caminho e o título já estão na barra de cima; fica uma faixa fina com o estado e as ferramentas.
- Cápsulas: seletor Hoje/Todas/Histórico com largura limitada. Perfil: rótulos sem caixa alta. E-mails: ícone no lugar do emoji.
- Finanças: decisão de manter as duas colunas (saldo/controle à esquerda, histórico à direita), que já atendem a intenção; ganhou números fixos, saldo com centavos menores, gráfico com detalhe no mouse e menu do botão direito nos lançamentos.
- Apps, Lembretes e Encomendas: decisão de manter (grade/lista já na largura certa).
