# Prompt para continuar o desenvolvimento da Sofia OS em um novo chat

Estou continuando o desenvolvimento da Sofia OS em um chat novo.

Quero que você trabalhe neste projeto com padrão de entrega profissional e completo.

## Regras de trabalho

1. Antes de alterar qualquer coisa, analise profundamente o problema e o código existente. Não faça remendos superficiais quando o problema for estrutural.

2. Quando eu apontar um bug ou pedir uma função nova:
   - descubra a causa real;
   - verifique se o problema pode existir em outros pontos;
   - corrija a arquitetura quando necessário;
   - não faça uma solução específica apenas para a frase ou cenário que eu mostrei se a regra deveria valer para toda a Sofia.

3. Na Sofia, a IA deve estar sempre acima do backend semanticamente:

   **Usuário -> IA interpreta -> IA conversa/pergunta se necessário -> usuário responde -> IA interpreta novamente -> quando estiver entendido, IA envia plano estruturado ao backend -> backend valida/executa -> resultado técnico volta para a IA -> IA responde naturalmente ao usuário.**

   O backend NÃO deve tentar interpretar linguagem natural ou competir com a IA.

   O backend deve cuidar de:
   - validação;
   - segurança;
   - permissões;
   - persistência;
   - integridade;
   - execução;
   - resultados reais.

4. Preserve sempre os dados e configurações existentes durante atualizações:
   - `.env`;
   - chaves;
   - memória;
   - pasta `data`;
   - espaços e páginas do usuário;
   - configurações;
   - `INICIAR_SOFIA.cmd` personalizado;
   - outros dados locais que não pertençam ao código da versão.

5. Sempre incremente a versão do projeto quando houver alteração de código ou comportamento do produto.
   Exemplo: `v65 -> v66 -> v67`.
   Não sobrescreva uma versão anterior como se fosse a mesma. Alterações apenas de documentação podem permanecer na versão atual, desde que isso seja informado claramente.

6. Antes de me entregar:
   - execute toda a suíte de testes;
   - crie testes específicos para os bugs/funções que eu pedi;
   - teste regressões;
   - teste cenários adversariais quando fizer sentido;
   - teste atualização da versão anterior para a nova;
   - teste reversão/rollback;
   - confirme que dados do usuário continuam intactos;
   - confira o pacote final;
   - se houver manifesto/hash, valide os arquivos do pacote.

7. Não diga que algo está "perfeito", "sem erros" ou "100% garantido" se isso não puder ser realmente comprovado. Seja transparente sobre o que foi testado e o que depende de APIs, credenciais ou ambiente real.

8. Não quero apenas código solto ou instruções para eu montar. Quando a tarefa permitir, entregue o pacote COMPLETO pronto para uso/atualização.

## Formato obrigatório da entrega

Ao terminar cada versão, quero receber:

### A) ZIP completo

- Nome claro, por exemplo: `Sofia_OS_v64_Nome_da_Versao.zip`.
- Pronto para instalar/atualizar.
- Link direto e clicável para download na resposta. Nunca entregue apenas o caminho local `/mnt/data/...`.

### B) LEIA_PRIMEIRO.md

Explique:
- o que mudou;
- como instalar;
- como atualizar;
- cuidados;
- comportamento esperado;
- limitações conhecidas.

### C) Comando atual.md

Mantenha/documente:
- estado atual do projeto;
- arquitetura vigente;
- decisões importantes;
- regras globais da Sofia;
- pendências relevantes;
- protocolo de desenvolvimento e entrega;
- informações necessárias para continuar o trabalho em outro chat sem perder contexto.

### D) Relatório de testes

Crie algo como:

`validacao/RELATORIO_TESTES_V64.md`

O relatório deve registrar:
- versão;
- alterações validadas;
- testes novos;
- regressão;
- quantidade total de testes;
- aprovados;
- falhas;
- teste de atualização;
- teste de rollback;
- preservação de dados;
- limitações do teste;
- qualquer integração externa não testada com credenciais reais.

### E) Resposta final no chat

Quero que a resposta final siga este padrão:

> Fechei a Sofia OS vXX - Nome da versão.
>
> [Baixar Sofia OS vXX]

Depois explique de forma clara:
- o problema encontrado;
- a causa real;
- o que foi alterado;
- como ficou o comportamento;
- melhorias adicionais feitas;
- resultado dos testes;
- atualização/rollback;
- o que foi preservado.

No final, coloque também:

> [Ver relatório completo da vXX]

Se houver outros arquivos importantes, forneça os links também.

## Durante o desenvolvimento

Pode me atualizar brevemente sobre descobertas importantes, por exemplo:
- "encontrei a causa";
- "isso era estrutural";
- "a regressão passou";
- "estou validando atualização".

Mas só considere a tarefa concluída quando tiver:

**código final + ZIP + documentação + relatório + testes.**

## Regras de continuidade

- Se eu enviar uma versão anterior em ZIP, trabalhe a partir dela e preserve tudo que já funciona. Não recrie o projeto do zero sem necessidade.
- Se eu enviar prints de erros, use-os para reproduzir e entender o comportamento, mas investigue também o código para encontrar a causa real.
- Se uma mudança que eu pedir representar uma regra geral da Sofia, implemente-a GLOBALMENTE, e não apenas naquele exemplo específico.
- Botões e opções da interface não devem pular a IA: a seleção do usuário volta para a IA interpretar no contexto da conversa.
- O backend não conversa diretamente com o usuário. Ele devolve resultados técnicos para a IA, e a IA produz a resposta final natural.
- O backend pode vetar operações inválidas, inseguras ou sem permissão, mas não deve reinterpretar o significado da fala do usuário.

Agora vou enviar a versão atual e explicar o que quero alterar.


## Regras atuais de interface a preservar

- Listas e Biblioteca são módulos fixos do menu; a personalização é interna.
- Feedback temporário deve aparecer na parte inferior e desaparecer automaticamente.
- Em Comprar, grupos são propriedade real e itens podem mudar de grupo sem duplicação.
- Ao gerar qualquer arquivo, sempre fornecer link clicável de download no chat.

- O tema é global e deve preservar os modos Sistema/Claro/Escuro; Sistema acompanha o navegador/OS.
- O modo claro atual usa linguagem visual inspirada no Notion, seguindo a paleta clara do Notion, com azul para ações primárias.
- Páginas podem conter coleções/databases e o breadcrumb deve refletir a hierarquia real.
- Alterações feitas em uma página atual devem preservar o mesmo ID; nunca criar duplicata para representar edição.
- Mini Sofia em outras áreas deve receber contexto da interface atual sem perder acesso ao contexto global.
- Ctrl+Z/Y do editor deve continuar funcional.

## Estado adicional a partir da v68

- Páginas possuem ferramentas semânticas próprias: `append_page_block`, `edit_page_block` e `delete_page_block`.
- Nunca usar `create_user_page` para representar uma edição dentro de uma página existente.
- Ícone/capa são metadados reais de página e precisam existir no contrato de frontend, backend, backup e reabertura.
- Ícone é opcional; sem escolha, usar o ícone padrão de documento.
- Ações da Sofia que mudam a estrutura devem atualizar a interface imediatamente, sem depender de F5.
- Mini chat e chat principal devem manter thread rolável e composer estável, sem cortar mensagens.
- Mensagem de voz estilo WhatsApp foi implementada na v69: áudio visual + transcrição interna + mesmo pipeline IA-first. Pesquisa web aberta continua pendente e não deve ser fingida.


## Estado adicional a partir da v69

- O Filtro Compartilhado usa `gpt-5.6-terra` por padrão.
- Tokens e chamadas locais são alertas/auditoria, não bloqueios. O alerta pessoal pode ser alterado pela Sofia.
- A instalação está configurada com referência de 2,5 milhões de tokens/dia UTC para o incentivo compartilhado confirmado pelo proprietário; isso não substitui o Usage real da OpenAI.
- A Sofia responde perguntas de uso com dados desta instalação; Usage organizacional completo é opcional via `OPENAI_ADMIN_KEY`.
- Chat principal e mini Sofia aceitam mensagens de voz. O áudio permanece áudio visualmente; a transcrição vai para a IA internamente.
- Safe Chat transcreve por rota separada e não persiste o áudio normal em `voice_messages`.
- `append_page_structure` deve ser usado quando o usuário pede uma estrutura dentro de uma página existente. Não fazer pergunta redundante sobre criar subpágina quando o alvo já foi resolvido.
- Páginas seguem estrutura documental inspirada no Notion: capa full-width, ícone discreto, título, propriedades, blocos/coleções e ações de topo semânticas.
- Não redistribuir assets proprietários de emoji da Apple; usar Unicode nativo ou packs licenciáveis.


## Checkpoint v71

A v71 mantém tudo da v70 e adiciona: menu APLICATIVOS DA SOFIA fechado por padrão e geometricamente estável; ícones laterais menores/alinhados à esquerda/sem hover móvel; controles do chat padronizados; correção global de microcontroles do editor; remoção dos templates não solicitados; atualização imediata da Agenda após compromissos criados/alterados pela Sofia; e contexto ambiente da mini Sofia. Quando a mini Sofia é aberta numa página, essa página é uma prioridade contextual suave. Mesmo com contexto reduzido ela recebe a identidade/localização da página; no modo ampliado recebe também conteúdo/estrutura. Isso não deve superar a intenção explícita nem desligar o restante da memória/cérebro.

A versão atual é 71.0.0. O pacote deve preservar `.env`, dados, memória, páginas, anexos e `INICIAR_SOFIA.cmd` personalizado durante atualização.


## Checkpoint v72

A v72 mantém tudo da v71 e corrige o acabamento da sidebar e do uso compartilhado: a lateral inteira rola como uma única superfície para não cortar APLICATIVOS DA SOFIA/PARTICULAR; Chat mantém ícone à esquerda e texto centralizado; o cabeçalho APLICATIVOS DA SOFIA segue a mesma régua de PARTICULAR; o cartão de uso pode ser fechado; e qualquer mudança do alerta pessoal precisa atualizar imediatamente limite, porcentagem, restante e gradiente com uma nova leitura do estado real, sem depender de F5. O alerta continua informativo e nunca bloqueia conversas.

A versão atual é 72.0.0. O pacote deve preservar `.env`, dados, memória, páginas, anexos e `INICIAR_SOFIA.cmd` personalizado durante atualização.


## Checkpoint v73

A v73 mantém tudo da v72 e consolida **Uso da Sofia** em dois filtros. **Compartilhado** mede tokens usados contra uma cota total fixa e possui alerta percentual independente. **Privado** mede custo em USD contra um teto financeiro local (padrão US$ 10,00) e também possui alerta percentual independente. Alterar o alerta para 70%, 90% etc. move apenas o marcador: não altera o uso, não reinicia contadores e não muda o total. O preenchimento/degradê sempre representa o uso real de 0 a 100%. O teto privado local não muda o spend limit real da conta OpenAI; isso precisa ser configurado pelo proprietário na OpenAI Platform.

A v73 também impede o card de esclarecimento da Sofia de ficar preto no tema claro e torna sticky o cabeçalho dos widgets com rolagem interna, como Agenda.

A versão atual é 73.0.0. O pacote deve preservar `.env`, dados, memória, páginas, anexos e `INICIAR_SOFIA.cmd` personalizado durante atualização.


## Checkpoint v77

- Versão atual: **Sofia OS v77**.
- CENTRAL DE APLICATIVOS substitui o nome anterior.
- Templates de página: manter somente **Banco de ideias / anotações** e **Tarefas em quadro**.
- Widgets do Resumo são reordenáveis sem auto-scroll e atualizações pontuais não devem reconstruir a Home inteira.

## Checkpoint v78

- Versão atual: **Sofia OS v78**.
- O medidor **Privado** usa **US$ 5,00** como total configurado desta instalação. O default legado de US$ 10,00 é migrado uma única vez se nunca tiver sido personalizado.
- Perguntas sobre o Privado devem abrir/selecionar o cartão visual **Uso da Sofia > Privado**, não responder apenas com números em texto.
- A barra ocupa a largura completa, tem altura estável e usa a escala integral verde -> amarelo -> laranja -> vermelho. Uso atual e alerta são marcadores distintos.
- Permanecem somente dois templates: **Banco de ideias / anotações** e **Tarefas em quadro**, ambos editáveis.
- Preservar drag dos widgets sem auto-scroll, troca entre vizinhos, atualização parcial do Resumo sem flicker, CENTRAL DE APLICATIVOS e botão Enviar branco.


## Checkpoint v80

- Versão atual: **Sofia OS v80**.
- **Início** e **Resumo** ficam fora da seção recolhível e sempre visíveis.
- A seção recolhível chama-se **APPS** e contém os demais módulos.
- Chat mantém o ícone à esquerda e o texto centralizado.
- PARTICULAR mantém o nome e a estrutura, com espaçamento vertical simétrico em relação aos blocos vizinhos.
- O botão Enviar mantém texto/seta brancos inclusive em `disabled`.
- Atualizações de Agenda/exclusões no Resumo devem ser incrementais e preservar o viewport por múltiplos frames, sem flicker ou salto.
- `overflow-anchor` fica desativado nas áreas dinâmicas do Início para evitar compensação automática do navegador.
- Permanecem os dois templates: Banco de ideias/anotações e Tarefas em quadro.


## Checkpoint v81

- Versão consolidada da etapa: **Sofia OS v81**.
- Se a interpretação estruturada falhar ou o plano continuar ambíguo, a Sofia deve continuar conversando: responder se for apenas uma pergunta ou pedir o menor esclarecimento necessário.
- Não exibir JSON, parser, schema ou erro interno como resposta ao usuário quando houver recuperação conversacional possível.
- Ações continuam bloqueadas tecnicamente até ficarem claras; a conversa não é bloqueada.

## Checkpoint v83

- Versão consolidada da etapa: **Sofia OS v83**.
- Correções de legibilidade do card de resposta/esclarecimento no tema claro.
- Timeouts de turno/cliente para impedir loading eterno.
- Resumo devolve o scroll à página quando o usuário rola para cima no limite do widget.
- APPS mantém espaçamento uniforme.
- Controles de página Particular ficam fixos e hitboxes dos ícones não vazam para fora do ícone.
- Títulos/nomes próprios não recebem spellcheck/autocorreção visual indevida.

## Checkpoint v84

- Versão consolidada da etapa: **Sofia OS v84**.
- Notificações em mini janela com acesso à página completa agrupada por área.
- Botão rápido de retorno ao topo do Início.
- Uso Privado com tokens mensais e apresentação equivalente ao Compartilhado, incluindo barra de degradê.
- Chats e páginas Particular aceitam imagem colada via `Ctrl+V`.
- A Sofia pode analisar a imagem; o chat não salva permanentemente por padrão.
- Imagens podem ser salvas na página, redimensionadas pelos quatro cantos e reposicionadas sem destruir o arquivo original.

## Checkpoint v85

- Versão atual: **Sofia OS v85 / Core 85.0.0 / package 1.36.0**.
- Imagem selecionada mostra alças e toolbar contextual; ao clicar fora/pressionar `Esc`, alças, comentário e toolbar desaparecem e o bloco não fica preso em “Adicionar legenda”.
- Toolbar da imagem: Editar imagem, Adicionar/Editar link, Adicionar/Editar comentário e Abrir link quando houver. Comentário fica oculto fora da seleção.
- Chat principal centralizado no container.
- Controle de remoção simples usa um único `×`.
- Tarefas em quadro segue visual Kanban compacto, com **Não iniciada**, **Prioridade** e **Concluído** verde, chips de status/contagem e `+ Nova página` em cada coluna.
- Novo template **Páginas/Lista**: Guidance, Pinned Notes, Recently Added/Updated e itens que abrem em página/modal editável com propriedades e corpo.
- Aplicar template nunca muda automaticamente o emoji/ícone atual.
- Sino de notificações abre sempre; sem itens mostra **Sem notificações** e mantém **Ver todas as notificações**. A página completa separa tudo por área/categoria.
- Nome visível **Compromissos** foi substituído por **Agenda**. Na sidebar, Agenda fica acima de Tarefas.
- Tarefas com data entram automaticamente na Agenda e exibem label azul `Tarefa > status` mais prioridade independente: Importante vermelho, Médio azul, Leve verde.
- Cada página possui `+` para subpágina; a lateral mostra árvore indentada e expandível/recolhível; pais também listam filhos internamente.
- Menu `...` possui **Modo default** no sentido de página básica: corpo em branco, sem template, título editável, capa/emoji opcionais e ícone padrão de documento `🗎`. Limpeza destrutiva exige confirmação.
- Banco migra para `user_version=7`; `priority_level` integra tarefa e backup; snapshot atual é schema 6.
- Atualizador da release deve usar `MANIFESTO_V85.json` e preservar `.env`, dados, memória, anexos, backups e `INICIAR_SOFIA.cmd` personalizado.


## Checkpoint v86

- Versão atual: **Sofia OS v86 / Core 86.0.0 / package 1.37.0**.
- Corrigido o botão Enjoy the Void/árvore Particular: o nó estrutural não recebe mais a classe global `selected`; o destaque fica no botão sem barra roxa externa nem truncamento indevido.
- Seleção de imagem não pode alterar o layout: toolbar flutuante absoluta, duas linhas conforme necessário, bloco transparente, legenda vazia oculta, handles sem transição e drag somente após movimento real.
- `+`, engrenagem e `…` das páginas Particular ficam fora do scroll em `#userPageFloatingActions`.
- Tokens de Responses/Chat Completions podem ser sincronizados pelo Usage oficial da organização quando `OPENAI_ADMIN_KEY` estiver configurada; Data Sharing/Incentive alimenta Compartilhado e os demais service tiers alimentam Privado.
- Sem Admin key, mostrar claramente que a contagem é local; nunca afirmar que está sincronizada com a Platform.
- A tela Configurações aceita/valida a chave Admin separadamente.
- Atualizador da release usa `MANIFESTO_V86.json`, preservando `.env`, dados, memória, anexos, backups, exports e `INICIAR_SOFIA.cmd` personalizado.


## Checkpoint v88

- Versão atual: **Sofia OS v88 / Core 88.0.0 / package 1.39.0**.
- Controles `+`, engrenagem e `…` de Particular permanecem no canto superior direito original e ficam fixos na viewport; nunca acompanham o scroll.
- PARTICULAR usa o mesmo padrão visual do bloco APPS, mantendo as páginas abaixo.
- Toolbar de imagem é uma linha horizontal abaixo da imagem, fora do frame, absoluta/flutuante e sem alterar o fluxo.
- Trocar entre Compartilhado e Privado não pode remontar o chat nem deslocar a conversa; atualizar apenas o cartão de uso.
- Com `OPENAI_ADMIN_KEY`, Privado sincroniza tokens/requisições via Usage da organização e gasto em USD via Costs oficial; fallback local deve ser identificado quando necessário.
- Sino abre preview pequeno no hover, com scroll interno; estado vazio explícito; `Ver todas as notificações` abre página ampliada organizada por origem/área com mais detalhes.
- Atualizador usa `MANIFESTO_V88.json` preservando `.env`, dados, memória, anexos, backups, exports e `INICIAR_SOFIA.cmd`.
- Suíte completa v88: **460/460 testes aprovados**.


## Atualização v89
- Ações `+`, engrenagem e `…` ancoradas ao `main` no canto superior direito original, fora do scroll da página.
- PARTICULAR reutiliza o mesmo componente visual de APPS; páginas internas reutilizam a mesma régua dos itens de Apps.
- Preview do sino abre no hover por popover comum (não `dialog` nativo), com estado vazio, scroll interno e link para a página geral por origem/área.
- Atualizador usa `MANIFESTO_V89.json`.


## Atualização v90

- `+`, engrenagem e `…` da página Particular devem permanecer imóveis na tela durante qualquer scroll da página.
- A regra final de `.user-page-floating-actions` usa `position: fixed`; não voltar para `absolute` ou colocar o bloco dentro de `.scroll-panel`.
- Desktop: `top: 22px` e alinhamento à borda direita da shell; mobile: `top/right: 8px`.
- Atualizador usa `MANIFESTO_V90.json`.

## Atualização v91

- `+`, engrenagem e `…` da página Particular não ficam mais dentro do `main`/`shell`: `#userPageFloatingActions` é filho direto de `body`.
- O container usa `position: fixed` na viewport com regra final `body > .user-page-floating-actions`.
- `ensureUserPageActionsViewportLayer()` também reanexa o container ao `body` em runtime, protegendo contra HTML antigo/cache ou reparentamento acidental.
- Nenhum scroll de `#tab-userpage`, `main`, `body` ou de outro container deve alterar a coordenada visual desses três botões.
- Atualizador usa `MANIFESTO_V91.json`.



## Atualização v102 — Notificações no sino

- Preview flutuante abre no hover do sino e permanece estável ao entrar com o mouse.
- Estado vazio centralizado: **Você não tem notificações.**
- Link **Ver todas** abre a central completa.
- Central agrupa por **Área** e, dentro de cada área, por **Origem**.
- Cache do front usa `?v=102`.
- Atualizador usa `MANIFESTO_V102.json` e preserva `.env`, dados e backups.


## Atualização v103 — Hover do sino e menu
- O listener do sino é ligado antecipadamente e usa `pointerenter` + `mouseenter`.
- Início e Resumo usam o mesmo tamanho de texto dos demais menus.
- Cache do front usa `?v=103`.
- Atualizador usa `MANIFESTO_V103.json` e preserva `.env`, dados e backups.
