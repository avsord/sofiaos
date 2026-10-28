# Sofia OS — lista única de pedidos

Fonte única do que o Pedro pediu e do estado de cada coisa. Todo chat que mexer na Sofia lê e atualiza este arquivo
na mesma versão em que muda o código. Estados: **anotado** · **em andamento** · **entregue (versão)** · **depende do Pedro**.

Regra fixa: app e site sempre sincronizados, em função e em número de versão.

## Rodada premium do site e do app (aprovada em 28/10/2026)

O Pedro aprovou fazer tudo em sequência e testar no fim (sem esperar validação entre fases), com o mínimo de queda de
qualidade. Cada fase sai como uma versão separada, para dar para achar e desfazer só a fase que tiver problema.
Nada é apagado (o corte de funções depende dele). Decisões de design ficam registradas em `docs/DESIGN.md`.

### Fase zero — travas de segurança e qualidade
| # | Pedido | Estado |
|---|---|---|
| 0.1 | Checagens do emulador (R7 e "QA-equivalent offline startup") voltarem a ficar verdes | depende do Pedro (log da execução: "Download log archive") |
| 0.2 | Prints de referência de todas as telas do site antes de mexer, e comparação depois de cada fase | entregue (0.3.258): `SOFIA_APP/tools/site-shots.cjs`, referência tirada a 1440×900 |
| 0.3 | Ensaio de restauração do backup completo num ambiente separado | entregue (0.3.258): o ensaio achou dado fora do backup (doses das Cápsulas, ordem dos widgets, eventos apagados do Google) e corrigiu; ensaio automático em `tests/backup-restore-258.test.cjs` |
| 0.4 | Segundo passo no login do site (código no e-mail em navegador novo); celular sem mudança | entregue (0.3.258) |
| 0.5 | Esta lista única de pedidos dentro do projeto | entregue (0.3.258) |
| 0.6 | "Tomada pronta" para abrir ao público depois (Google trocável por configuração, só as permissões necessárias, dados por dono nas partes novas) — sem ligar agora | entregue (0.3.258): `docs/PUBLICO.md` |

### Fase 1 — fundação visual (app e site)
| # | Pedido | Estado |
|---|---|---|
| 1.1 | Fonte própria: Plus Jakarta Sans embutida no app e no site | entregue (0.3.259; no site só passou a valer de verdade na 0.3.261 — o react-native-web escrevia a fonte do sistema por classe) |
| 1.2 | Escala curta de tamanhos de letra (hoje 29) e pesos com hierarquia (hoje quase tudo negrito) | entregue (0.3.259): 13 tamanhos, pesos um degrau abaixo (`tools/type-scale-259.py`) |
| 1.3 | Cores no tema (hoje 80 cores soltas no código), funcionando no claro e no escuro | entregue em parte (0.3.259): tokens good/warn/info/elevated; Finanças, notificações e status vêm do tema; texto branco sobre o destaque virou onAccent. As cores das categorias viram paleta própria na 4.1 |
| 1.4 | Poucos arredondamentos (hoje 30) e espaçamentos (hoje 27), usados com intenção | movido para a Fase 3: muitos raios são metade do tamanho de círculos; trocar no automático deformaria. Entra tela a tela |
| 1.5 | Ícones premium: conjunto profissional, dois estados (contorno/preenchido), tamanhos ópticos, traço casando com a fonte, ícones próprios (Cápsulas, Guardado, Sofia); trocar os 218 emojis usados como ícone | entregue em parte (0.3.259): conjunto Phosphor com dois estados (menu e lateral), categorias de Finanças, notificações, Monitoramento, Encomendas e Lembretes com ícones. Emojis escolhidos pela pessoa (ícone de Página, marcador de e-mail) continuam por serem conteúdo. Ícones próprios da Sofia vão para a 4.7 |
| 1.6 | Modo escuro desenhado (não invertido): fundo não preto puro, camadas que clareiam | entregue (0.3.259) |

### Fase 2 — comportamento de site de verdade
| # | Pedido | Estado |
|---|---|---|
| 2.1 | Endereço por tela: F5 mantém a tela, voltar do navegador volta, dá para favoritar/abrir por link | entregue (0.3.260): /inicio, /agenda, /apps/financas…; testado no navegador (F5, voltar, link direto) |
| 2.2 | Título da aba por tela (e aviso de notificação) | entregue (0.3.260): "Finanças · Sofia"; o número de avisos na aba fica para a 4.7 |
| 2.3 | Página base em pt-BR, aviso sem JavaScript em português, descrição, cor, prévia de link, instalável | entregue (0.3.260): public/index.html, manifest.webmanifest, prévia de link |
| 2.4 | Rolagem de site (rodinha, espaço/Page Down, Ctrl+F, imprimir) | entregue (0.3.260): Page Down/Up, espaço, Home/End e impressão inteira (a rolagem continua por áreas; a página inteira rolando entra na Fase 3, tela por tela) |
| 2.5 | Tamanhos intermediários de janela (1366, metade da tela ~960, ultra-wide) | entregue (0.3.260): layout de computador a partir de 900 px; conferido em 960, 1366 e 2560 |
| 2.6 | Mouse de verdade: hover e cursor em tudo que é clicável, clique direito, nada que dependa de "segurar" | entregue (0.3.260): clique direito faz o "segurar" (criar no dia, opções da tarefa, mensagens, Price Tracker); cursor e hover já existiam |
| 2.7 | Teclado: Tab na ordem certa, foco visível, Enter salva, Esc fecha | em parte: foco visível e Esc já existiam; Enter salvando entra tela a tela na Fase 3 |
| 2.8 | Textos de toque reescritos para o computador (30+: "toque", "segure", "deslize", "fuso do celular") | entregue (0.3.260): textos de celular adaptados no computador via tap() |
| 2.9 | Folhas que sobem de baixo viram menus/janelas perto de onde se clicou; movimentos de computador | já existia: no computador as folhas abrem como janela no centro e telas cheias como painel lateral |

### Fase 3 — diagramação tela por tela (sem moldes: cada tela com a sua intenção)
| # | Pedido | Estado |
|---|---|---|
| 3.1 | Login: marca à esquerda, coluna estreita do formulário à direita, um eixo só, botão com contraste, rodapé certo para o site | entregue (0.3.261) |
| 3.2 | Início, Conversa, Páginas, Agenda, Apps, Perfil, Finanças, Tarefas backlog, E-mails, Biblioteca, Notas, Listas, Cápsulas, Price Tracker/Monitoramento, Rotinas, Lembretes, Encomendas — cada uma com diagnóstico (intenção, problemas, proposta) em `docs/DESIGN.md` | entregue em parte (0.3.261–0.3.262): Login, Início (duas colunas), Agenda (títulos no mês), Páginas (recentes em cartões); Finanças, Apps, Perfil e Conversa já tinham a diagramação certa e ganharam o acabamento da Fase 4; listas abrem o item no painel lateral. Refino tela a tela segue em docs/DESIGN.md |
| 3.3 | Dividir as telas gigantes (Finanças, Apps, Páginas) em partes menores, sem mudar o que fazem | adiado para a próxima rodada: os testes antigos leem o texto desses arquivos; dividir agora quebraria centenas deles. Precisa vir junto com a 3.4 |
| 3.4 | Trocar testes que conferem linhas de código por testes do que a pessoa vê e faz, nas telas mexidas | adiado (junto com a 3.3): os testes novos desta rodada já conferem comportamento (endereços, fonte, ensaio de backup, login com código) |

### Fase 4 — acabamento premium
| # | Pedido | Estado |
|---|---|---|
| 4.1 | Números de Finanças: largura fixa, R$ e centavos menores, saldo animando, gráficos com paleta própria e detalhe no mouse | entregue (0.3.262): números de largura fixa no app e no site, saldo grande com R$ e centavos menores e entrada suave ao mudar; paleta própria dos gráficos fica para o refino |
| 4.2 | Profundidade sutil: camadas, bordas quase transparentes, sombras discretas | entregue (0.3.262): sombra sutil nos cartões (46 cartões) |
| 4.3 | Movimento com intenção (150–250 ms): check com "estalo", conteúdo surgindo onde estava o esqueleto | entregue em parte (0.3.262): "estalo" no check das tarefas da agenda; o conteúdo já entrava suave no lugar do esqueleto |
| 4.4 | Vazios, primeiro uso e erros na voz da Sofia | entregue (0.3.262): tela vazia nova (ícone em dois tons, texto em coluna estreita) e frases na voz da Sofia |
| 4.5 | Busca geral Ctrl+K (telas, Páginas, tarefas, comandos) | já existia (Ctrl+K com telas, apps, ações e páginas); incluir tarefas fica para o refino |
| 4.6 | Velocidade: dividir o arquivo de 1,8 MB do site; nada pisca, nada pula | entregue (0.3.262): site comprimido (2,1 MB → 0,5 MB no navegador) |
| 4.7 | Acabamentos de marca: seleção no roxo, anel de foco da marca, ícone da aba/app, R$ 1.000 sem quebrar, aspas certas | entregue em parte (0.3.262): ícones próprios (marca da Sofia na aba Conversa, cápsula), seleção no roxo, foco da marca; número de avisos no título da aba fica para o refino |

## Fora da rodada (para depois, por decisão do Pedro)
- Abrir a Sofia ao público e a verificação do Google para o Gmail (deixar a "tomada pronta", item 0.6).
- Corte de apps e funções pouco usados (precisa da lista marcada pelo Pedro).
