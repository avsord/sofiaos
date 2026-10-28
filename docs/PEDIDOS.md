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
| 1.3 | Cores no tema (hoje 80 cores soltas no código), funcionando no claro e no escuro | entregue (0.3.259–0.3.263): status no tema (claro/escuro) e nenhuma cor solta nas telas — o resto vem de uma paleta única (src/lib/palette.ts) |
| 1.4 | Poucos arredondamentos (hoje 30) e espaçamentos (hoje 27), usados com intenção | entregue tela a tela na Fase 3 (cartões, sombras e raios revistos nas telas redesenhadas); círculos mantêm o raio de metade do tamanho |
| 1.5 | Ícones premium: conjunto profissional, dois estados (contorno/preenchido), tamanhos ópticos, traço casando com a fonte, ícones próprios (Cápsulas, Guardado, Sofia); trocar os 218 emojis usados como ícone | entregue (0.3.259–0.3.263): conjunto Phosphor com dois estados, ícones próprios (Sofia, cápsula, Guardado) e nenhum emoji no lugar de ícone na interface; emojis escolhidos pela pessoa (ícone de Página, marcador de e-mail) continuam por serem conteúdo |
| 1.6 | Modo escuro desenhado (não invertido): fundo não preto puro, camadas que clareiam | entregue (0.3.259) e conferido tela por tela no claro e no escuro (0.3.263) |

### Fase 2 — comportamento de site de verdade
| # | Pedido | Estado |
|---|---|---|
| 2.1 | Endereço por tela: F5 mantém a tela, voltar do navegador volta, dá para favoritar/abrir por link | entregue (0.3.260): /inicio, /agenda, /apps/financas…; testado no navegador (F5, voltar, link direto) |
| 2.2 | Título da aba por tela (e aviso de notificação) | entregue (0.3.260–0.3.263): título por tela e número de avisos, ex.: "(3) Finanças · Sofia" |
| 2.3 | Página base em pt-BR, aviso sem JavaScript em português, descrição, cor, prévia de link, instalável | entregue (0.3.260): public/index.html, manifest.webmanifest, prévia de link |
| 2.4 | Rolagem de site (rodinha, espaço/Page Down, Ctrl+F, imprimir) | entregue (0.3.260–0.3.263): teclado, impressão e rodinha rolando a área principal de qualquer lugar da tela |
| 2.5 | Tamanhos intermediários de janela (1366, metade da tela ~960, ultra-wide) | entregue (0.3.260): layout de computador a partir de 900 px; conferido em 960, 1366 e 2560 |
| 2.6 | Mouse de verdade: hover e cursor em tudo que é clicável, clique direito, nada que dependa de "segurar" | entregue (0.3.263) e conferido no navegador: hover visível, cursor, menu do botão direito em Finanças, Tarefas, Páginas, Notas, Biblioteca, Listas, Lembretes, Encomendas, E-mails, Agenda, Cápsulas e Price Tracker; "segurar" virando clique direito |
| 2.7 | Teclado: Tab na ordem certa, foco visível, Enter salva, Esc fecha | entregue (0.3.263) e conferido no navegador: Tab na ordem (e-mail → senha → mostrar senha → esqueceu a senha), anel de foco, Enter confirma, Esc fecha |
| 2.8 | Textos de toque reescritos para o computador (30+: "toque", "segure", "deslize", "fuso do celular") | entregue (0.3.260): textos de celular adaptados no computador via tap() |
| 2.9 | Folhas que sobem de baixo viram menus/janelas perto de onde se clicou; movimentos de computador | entregue (0.3.263): janelas pequenas abrem perto do clique; movimentos mais curtos no computador |

### Fase 3 — diagramação tela por tela (sem moldes: cada tela com a sua intenção)
| # | Pedido | Estado |
|---|---|---|
| 3.1 | Login: marca à esquerda, coluna estreita do formulário à direita, um eixo só, botão com contraste, rodapé certo para o site | entregue (0.3.261) |
| 3.2 | Início, Conversa, Páginas, Agenda, Apps, Perfil, Finanças, Tarefas backlog, E-mails, Biblioteca, Notas, Listas, Cápsulas, Price Tracker/Monitoramento, Rotinas, Lembretes, Encomendas — cada uma com diagnóstico (intenção, problemas, proposta) em `docs/DESIGN.md` | entregue (0.3.261–0.3.263): Login, Início, Agenda, Páginas (lista e documento), Conversa (lista ao lado), listas em duas colunas (Tarefas, Biblioteca, Notas, Listas), Cápsulas, Perfil, E-mails; Finanças, Apps, Lembretes e Encomendas mantêm a diagramação, que já atende a intenção (ver docs/DESIGN.md) |
| 3.3 | Dividir as telas gigantes (Finanças, Apps, Páginas) em partes menores, sem mudar o que fazem | entregue (0.3.263): Finanças (280 mil → partes de até 71 mil caracteres), Apps e Price Tracker divididos com tools/split-screen.py, sem mudar o que fazem |
| 3.4 | Trocar testes que conferem linhas de código por testes do que a pessoa vê e faz, nas telas mexidas | entregue (0.3.263): os testes antigos leem as telas inteiras mesmo divididas (tests/split-sources.cjs) e entraram testes de comportamento (endereços e compressão no servidor, ensaio de backup, login com código, menus) |

### Fase 4 — acabamento premium
| # | Pedido | Estado |
|---|---|---|
| 4.1 | Números de Finanças: largura fixa, R$ e centavos menores, saldo animando, gráficos com paleta própria e detalhe no mouse | entregue (0.3.262–0.3.263): números fixos, saldo com R$ e centavos menores, gráfico de 6 meses com detalhe ao passar o mouse; cores das categorias na paleta única |
| 4.2 | Profundidade sutil: camadas, bordas quase transparentes, sombras discretas | entregue (0.3.262): sombra sutil nos cartões (46 cartões) |
| 4.3 | Movimento com intenção (150–250 ms): check com "estalo", conteúdo surgindo onde estava o esqueleto | entregue (0.3.262–0.3.263): estalo no check, movimentos curtos no computador, conteúdo entrando no lugar do esqueleto |
| 4.4 | Vazios, primeiro uso e erros na voz da Sofia | entregue (0.3.262): tela vazia nova (ícone em dois tons, texto em coluna estreita) e frases na voz da Sofia |
| 4.5 | Busca geral Ctrl+K (telas, Páginas, tarefas, comandos) | entregue (0.3.263): Ctrl+K com telas, apps, ações, páginas e tarefas (abre a tarefa) |
| 4.6 | Velocidade: dividir o arquivo de 1,8 MB do site; nada pisca, nada pula | entregue (0.3.262–0.3.263): site comprimido e dividido em partes (arquivo principal 2,17 MB → 1,62 MB antes da compressão; ~0,4 MB comprimido) |
| 4.7 | Acabamentos de marca: seleção no roxo, anel de foco da marca, ícone da aba/app, R$ 1.000 sem quebrar, aspas certas | entregue (0.3.262–0.3.263): seleção no roxo, anel de foco, aspas tipográficas, ícones próprios, avisos no título. O ícone do app (o "S") foi mantido: é a marca, e um novo depende da sua escolha |

## Fora da rodada (para depois, por decisão do Pedro)
- Abrir a Sofia ao público e a verificação do Google para o Gmail (deixar a "tomada pronta", item 0.6).
- Corte de apps e funções pouco usados (precisa da lista marcada pelo Pedro).

## Conferência no navegador (0.3.263)
`SOFIA_APP/tools/site-verify.cjs` — 18 de 18 itens OK: Tab na ordem, avisos no título, hover, Ctrl+K encontra e abre tarefa, menu do botão direito em 9 telas, janela perto do clique, rodinha de qualquer lugar, detalhe no gráfico, nenhuma página com erro. Achou e corrigiu: avisos no título não apareciam (contagem fora do lugar), Ctrl+K não abria a tarefa se a tela ainda carregava, Notas aberta por link direto ficava vazia.
