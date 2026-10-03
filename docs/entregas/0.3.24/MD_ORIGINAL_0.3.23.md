# Sofia OS — Alterações Pendentes

> Documento de controle das alterações que precisam ser feitas no Sofia OS.
> Regra: nenhuma alteração deste documento deve ser omitida durante a implementação.
> Cada item deve permanecer numerado para facilitar conferência e correção posterior.

## Alteração 1 — Arrastar, reordenar e mudar hierarquia das páginas
**Status:** Pendente

### Objetivo
Deixar o arraste das páginas e subpáginas intuitivo, previsível e parecido com o comportamento do Notion.

### Regras
- A linha inteira da página deve ser arrastável: ícone + texto.
- Durante o arraste, deve aparecer uma linha/divisória visual indicando antecipadamente onde a página será solta.
- A indicação precisa aparecer cedo, sem exigir que a página seja arrastada muito para fora da tela.
- Soltar entre duas páginas deve reordenar a página naquele nível.
- Soltar sobre outra página deve transformar a página arrastada em subpágina dela.
- Uma subpágina deve poder voltar a ser página principal sem precisar ser arrastada muito para a esquerda.
- Basta puxar a subpágina um pouco para fora do agrupamento atual; nesse momento já deve aparecer a linha de destino no nível principal.
- A pré-visualização deve deixar claro, antes de soltar, se o resultado será:
  - acima de outra página;
  - abaixo de outra página;
  - dentro de outra página;
  - ou fora do agrupamento atual, tornando-se página principal.
- O usuário também deve conseguir reordenar páginas principais entre si e subpáginas entre si.

### Critério de conclusão
A alteração só deve ser considerada concluída quando todos os quatro comportamentos abaixo funcionarem:
1. Reordenar página no mesmo nível.
2. Transformar página em subpágina.
3. Retirar subpágina do agrupamento e torná-la página principal.
4. Mostrar corretamente a linha/indicação de destino antes de soltar.

---

## Alteração 2 — Melhorar a qualidade do logo da Sofia no app
**Status:** Pendente

### Problema
O logo da Sofia perde definição quando aumenta durante a transição de abertura do aplicativo.

### Regras
- Manter o mesmo desenho, aparência e animação.
- Trocar a fonte de imagem de baixa resolução por uma versão de alta resolução.
- Não alterar o estilo visual do logo.
- A imagem deve permanecer nítida no maior tamanho usado durante a animação.
- O ícone atual identificado no app tem apenas 96×96 px e não deve ser ampliado como fonte final para a transição.

### Critério de conclusão
O logo deve permanecer visualmente nítido durante toda a animação, inclusive no ponto de maior escala.

---

## Alteração 3 — Transformar “Perfil” em “Configurações”
**Status:** Pendente

### Objetivo
Separar claramente configurações do aplicativo das informações e configurações pessoais do usuário.

### Regras
- Trocar o item inferior “Perfil” por “Configurações”, usando um nome curto o suficiente para caber bem na barra inferior.
- Trocar o ícone de perfil por uma engrenagem.
- Dentro de Configurações, criar pelo menos duas áreas:
  1. **Aplicativo**
  2. **Perfil do usuário**
- Em **Aplicativo**, mover opções que são do comportamento do app, e não da identidade do usuário.
- Incluir ali as opções já existentes de aparência:
  - Sistema
  - Claro
  - Escuro
- Manter as configurações pessoais na área de Perfil do usuário.
- Outras opções do app podem ser agrupadas nessa seção quando fizer sentido, sem misturar com dados pessoais.

### Critério de conclusão
O menu inferior não deve mais apresentar “Perfil” como destino principal; “Configurações” passa a concentrar ajustes do app e do usuário de forma organizada.

---

## Alteração 4 — Sincronização simples com Google Calendar
**Status:** Pendente

### Objetivo
Sincronizar a Agenda da Sofia com o Google Calendar da forma menos burocrática possível.

### Regras
- A conexão deve ficar dentro de **Configurações**.
- O usuário deve conseguir conectar a conta Google em um fluxo simples e guiado.
- Evitar configurações técnicas manuais pelo usuário.
- Exibir claramente quando o Google Calendar está conectado ou desconectado.
- A Agenda da Sofia e o Google Calendar devem ficar sincronizados.
- Definir e validar sincronização de:
  - criação de evento;
  - edição de evento;
  - exclusão de evento;
  - alteração de data/horário;
  - mudanças feitas no Google Calendar refletidas na Sofia.
- Deve existir opção simples para desconectar a conta.

### Critério de conclusão
Depois de conectar a conta, eventos compatíveis devem aparecer e permanecer sincronizados entre a Agenda da Sofia e o Google Calendar sem exigir configuração técnica adicional do usuário.

---

## Alteração 5 — Home como painel analítico + preview da Agenda
**Status:** Pendente

### Objetivo
Transformar o Início em um painel de status da vida do usuário, e não em uma tela dominada por um atalho para conversa.

### Regras
- Remover da Home o card grande “Sua Sofia está aqui” / conversa direta.
- Não criar outro atalho grande para conversa na Home, porque a aba **Conversa** já está imediatamente acessível pela navegação.
- O espaço principal liberado deve receber widgets de status e previews úteis.
- A Home deve funcionar como uma visão resumida, estética e analítica do que está acontecendo na vida do usuário.
- Widgets detalhados podem abrir uma visão completa ao toque.

### Preview da Agenda
- O card atual simples de Agenda da Home deixa de existir e é substituído por um widget mais útil no espaço principal.
- O widget deve combinar:
  - **mini calendário mensal**, mostrando os dias do mês e indicação visual nos dias com compromissos;
  - **agenda do dia selecionado**, com os compromissos/tarefas do dia.
- O mini calendário e os itens do dia devem coexistir dentro do mesmo widget.
- Os compromissos do dia devem ter scroll interno quando houver mais itens do que cabem no espaço disponível.
- Selecionar outro dia no mini calendário atualiza a lista do dia sem precisar abrir a Agenda completa.
- Tocar no widget ou em um item pode abrir a Agenda completa / detalhe correspondente.
- O widget deve ser um preview compacto, não uma réplica completa da tela de Agenda.

### Painel de monitoramentos
- A Home deve comportar previews de monitoramentos do usuário.
- Exemplo: monitoramento de preços de produtos.
- O preview de preço pode usar um gráfico compacto de linhas:
  - eixo X = tempo;
  - eixo Y = valor;
  - uma linha por produto;
  - cores distintas e estáveis por produto para facilitar reconhecimento visual.
- A Home mostra somente uma visão mínima do gráfico.
- Ao tocar no widget, abre-se uma visão analítica mais detalhada com valores, datas e histórico.

### Critério de conclusão
Ao abrir o app, o usuário deve enxergar primeiro um resumo útil do seu estado atual — agenda e monitoramentos — sem o card grande de conversa ocupando a área principal.

---

## Alteração 6 — Centro de notificações unificado
**Status:** Pendente

### Objetivo
Remover notificações como card da Home e concentrar tudo em um sino consistente, com acesso rápido e uma central completa organizada por área.

### Sino
- Adicionar um sino no topo da Home, próximo ao perfil/cabeçalho.
- Exibir uma bolinha/badge com a quantidade de notificações não lidas.
- O sino existente na área de **Apps** deve ser substituído pelo mesmo componente e comportamento do sino da Home.
- Home e Apps devem abrir o mesmo centro de notificações, sem experiências diferentes.

### Popup / painel rápido
Ao tocar no sino:
- abrir uma janela/painel sobreposto;
- permitir scroll interno por todas as notificações disponíveis;
- permitir marcar uma notificação como lida;
- permitir limpar notificações;
- atualizar o badge de não lidas conforme as ações;
- incluir ao final a ação **“Ver todas as notificações”**.

O popup não deve ser limitado apenas às notificações mais recentes: o usuário pode rolar e consultar todas as que estiverem mantidas no histórico.

### Tela completa — Todas as notificações
- “Ver todas as notificações” abre um painel/tela completa.
- Organizar as notificações por origem/área em blocos distintos, por exemplo:
  - Agenda;
  - Cursos;
  - Tarefas;
  - Monitoramento de produtos;
  - Estudos;
  - outras áreas futuras.
- Cada bloco deve ser visualmente separado e fácil de identificar.
- Quando houver muitos itens em uma área, limitar inicialmente a quantidade mostrada e oferecer “Ver mais” naquela seção para evitar uma tela excessivamente longa.
- Continuar permitindo marcar como lida e limpar notificações também na visão completa.

### Remoções na Home
- O card/bloco atual de **Notificações** da Home deixa de existir.
- O acesso às notificações passa a ser pelo sino no topo.

### Critério de conclusão
Home e Apps usam o mesmo sino; o badge reflete não lidas; o popup permite consultar, rolar, marcar como lida e limpar; e a visão completa organiza todas as notificações por área.

---

## Regra de conferência
Antes de considerar uma versão concluída, conferir cada alteração por número e marcar individualmente:
- Alteração 1
- Alteração 2
- Alteração 3
- Alteração 4
- Alteração 5
- Alteração 6

---

## Alteração 7 — Corrigir labels, nomes e ícones no menu de Páginas
**Status:** Pendente

### Objetivo
Garantir que as páginas mantenham identidade visual e comportamento corretos no menu lateral/inferior durante navegação, seleção e arraste.

### Regras
- Manter sempre o nome real da página.
- Manter o ícone/emoticon real da página.
- Não trocar nome ou ícone por dados vindos de template.
- Durante o arraste, ícone e texto devem se mover como uma única linha, sem disputa de gesto entre o conteúdo e o menu.
- Não exibir labels, nomes ou ícones herdados de estruturas antigas ou de templates anteriores.
- A aparência da label durante o arraste deve continuar coerente com a página original.

### Critério de conclusão
As páginas exibem nome e ícone corretos antes, durante e depois do arraste, sem alterações indevidas causadas por templates ou pelo estado do menu.

---

## Alteração 8 — Templates devem alterar apenas o conteúdo da página
**Status:** Pendente

### Objetivo
Separar completamente a identidade da página do conteúdo inserido por um template.

### Regras
- Aplicar um template deve alterar somente o conteúdo interno da página.
- O nome da página deve permanecer o que o usuário definiu.
- O ícone/emoticon da página deve permanecer o que o usuário definiu.
- Não substituir título ou ícone automaticamente pelo nome/ícone do template.
- Remover conteúdos indevidos herdados de templates antigos, incluindo referências como “Guidance” e “Quick Capture” quando não fizerem parte do modelo correto.
- O mesmo comportamento deve valer no app e no site.

### Critério de conclusão
Aplicar qualquer template modifica somente o conteúdo da página e nunca sua identidade visual ou nome.

---

## Alteração 9 — Excluir página ao segurar
**Status:** Pendente

### Objetivo
Permitir exclusão direta e intuitiva de páginas e subpáginas pelo próprio menu de Páginas.

### Regras
- Segurar uma página deve abrir uma ação de exclusão.
- O comportamento deve funcionar tanto para página principal quanto para subpágina.
- A ação deve deixar claro qual página será excluída.
- Evitar exclusão acidental por um simples toque.
- Após excluir, a árvore de páginas deve atualizar sem quebrar a hierarquia das páginas restantes.

### Critério de conclusão
O usuário consegue segurar qualquer página, escolher excluir e ver a estrutura restante atualizada corretamente.

---

## Alteração 10 — Voltar dentro de Apps deve respeitar a navegação interna
**Status:** Pendente

### Objetivo
Fazer o gesto/botão de voltar seguir a hierarquia correta dentro da área de Apps.

### Regras
- Se o usuário estiver dentro da página de um app, o primeiro voltar deve fechar essa página e retornar ao carrossel/lista de Apps.
- Somente um novo voltar, já no nível principal de Apps, pode sair da área atual conforme a navegação geral do Sofia OS.
- Não pular diretamente para Home quando ainda existir um nível interno aberto.
- O comportamento deve ser consistente no Android e no site quando houver equivalente de navegação.

### Critério de conclusão
O voltar sempre sobe um nível por vez dentro de Apps, sem saltos inesperados.

---

## Regra de conferência atualizada
Antes de considerar uma versão concluída, conferir individualmente:
- Alteração 1
- Alteração 2
- Alteração 3
- Alteração 4
- Alteração 5
- Alteração 6
- Alteração 7
- Alteração 8
- Alteração 9
- Alteração 10

Nenhuma alteração pode ser considerada concluída por associação com outra. Cada número deve ser validado separadamente.
