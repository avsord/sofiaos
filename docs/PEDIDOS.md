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
| 1.1 | Fonte própria: Plus Jakarta Sans embutida no app e no site | anotado |
| 1.2 | Escala curta de tamanhos de letra (hoje 29) e pesos com hierarquia (hoje quase tudo negrito) | anotado |
| 1.3 | Cores no tema (hoje 80 cores soltas no código), funcionando no claro e no escuro | anotado |
| 1.4 | Poucos arredondamentos (hoje 30) e espaçamentos (hoje 27), usados com intenção | anotado |
| 1.5 | Ícones premium: conjunto profissional, dois estados (contorno/preenchido), tamanhos ópticos, traço casando com a fonte, ícones próprios (Cápsulas, Guardado, Sofia); trocar os 218 emojis usados como ícone | anotado |
| 1.6 | Modo escuro desenhado (não invertido): fundo não preto puro, camadas que clareiam | anotado |

### Fase 2 — comportamento de site de verdade
| # | Pedido | Estado |
|---|---|---|
| 2.1 | Endereço por tela: F5 mantém a tela, voltar do navegador volta, dá para favoritar/abrir por link | anotado |
| 2.2 | Título da aba por tela (e aviso de notificação) | anotado |
| 2.3 | Página base em pt-BR, aviso sem JavaScript em português, descrição, cor, prévia de link, instalável | anotado |
| 2.4 | Rolagem de site (rodinha, espaço/Page Down, Ctrl+F, imprimir) | anotado |
| 2.5 | Tamanhos intermediários de janela (1366, metade da tela ~960, ultra-wide) | anotado |
| 2.6 | Mouse de verdade: hover e cursor em tudo que é clicável, clique direito, nada que dependa de "segurar" | anotado |
| 2.7 | Teclado: Tab na ordem certa, foco visível, Enter salva, Esc fecha | anotado |
| 2.8 | Textos de toque reescritos para o computador (30+: "toque", "segure", "deslize", "fuso do celular") | anotado |
| 2.9 | Folhas que sobem de baixo viram menus/janelas perto de onde se clicou; movimentos de computador | anotado |

### Fase 3 — diagramação tela por tela (sem moldes: cada tela com a sua intenção)
| # | Pedido | Estado |
|---|---|---|
| 3.1 | Login: marca à esquerda, coluna estreita do formulário à direita, um eixo só, botão com contraste, rodapé certo para o site | anotado |
| 3.2 | Início, Conversa, Páginas, Agenda, Apps, Perfil, Finanças, Tarefas backlog, E-mails, Biblioteca, Notas, Listas, Cápsulas, Price Tracker/Monitoramento, Rotinas, Lembretes, Encomendas — cada uma com diagnóstico (intenção, problemas, proposta) em `docs/DESIGN.md` | anotado |
| 3.3 | Dividir as telas gigantes (Finanças, Apps, Páginas) em partes menores, sem mudar o que fazem | anotado |
| 3.4 | Trocar testes que conferem linhas de código por testes do que a pessoa vê e faz, nas telas mexidas | anotado |

### Fase 4 — acabamento premium
| # | Pedido | Estado |
|---|---|---|
| 4.1 | Números de Finanças: largura fixa, R$ e centavos menores, saldo animando, gráficos com paleta própria e detalhe no mouse | anotado |
| 4.2 | Profundidade sutil: camadas, bordas quase transparentes, sombras discretas | anotado |
| 4.3 | Movimento com intenção (150–250 ms): check com "estalo", conteúdo surgindo onde estava o esqueleto | anotado |
| 4.4 | Vazios, primeiro uso e erros na voz da Sofia | anotado |
| 4.5 | Busca geral Ctrl+K (telas, Páginas, tarefas, comandos) | anotado |
| 4.6 | Velocidade: dividir o arquivo de 1,8 MB do site; nada pisca, nada pula | anotado |
| 4.7 | Acabamentos de marca: seleção no roxo, anel de foco da marca, ícone da aba/app, R$ 1.000 sem quebrar, aspas certas | anotado |

## Fora da rodada (para depois, por decisão do Pedro)
- Abrir a Sofia ao público e a verificação do Google para o Gmail (deixar a "tomada pronta", item 0.6).
- Corte de apps e funções pouco usados (precisa da lista marcada pelo Pedro).
