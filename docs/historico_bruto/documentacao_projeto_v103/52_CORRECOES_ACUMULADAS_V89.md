# Sofia OS v89 — correções definitivas de interface e notificações

Esta versão corrige os problemas visuais observados na v88 sem remover as alterações acumuladas anteriores.

## 1. Ações `+`, engrenagem e `…`

- Permanecem no canto superior direito original da página Particular.
- Não são centralizadas.
- O container fica ancorado ao `main`, fora do painel rolável.
- Ao rolar a página Particular, as ações permanecem na mesma posição visual.
- A posição não depende mais da largura total da viewport.

## 2. Menu PARTICULAR igual ao APPS

- APPS e PARTICULAR usam o mesmo componente visual da sidebar.
- Mesma largura, altura, padding, raio, fundo, tipografia e alinhamento.
- O título PARTICULAR usa a mesma classe tipográfica de APPS.
- As páginas de Particular usam a mesma régua dos itens internos de Apps: 40 px de altura, ícone 24 px, gap 10 px, padding 8 × 12 e raio 12 px.
- Os controles extras de subpágina ficam sobrepostos à direita e não alteram a geometria do botão.

## 3. Sino de notificações

- O preview abre ao passar o mouse sobre o sino.
- O preview deixou de depender do comportamento nativo de `<dialog>` e agora usa um popover comum, mais estável para hover.
- É possível mover o mouse do sino para o preview sem fechamento imediato.
- Se houver muitas notificações, a lista usa scroll interno.
- Sem notificações, mostra `Nenhuma notificação no momento.`
- `Ver todas as notificações` abre a página ampliada.
- A página ampliada continua organizada por origem e área, com estado, data, categoria, importância e vínculo com o registro.

## 4. Outras correções acumuladas mantidas

- Toolbar contextual da imagem em uma única linha abaixo da imagem.
- Troca Compartilhado/Privado sem remontar o chat nem alterar a posição da conversa.
- Atualização dos dados do Privado via Usage/Costs oficial quando `OPENAI_ADMIN_KEY` estiver configurada.
- Todas as correções anteriores permanecem acumuladas.

## Atualização

1. Feche a Sofia com `Ctrl+C`.
2. Extraia o ZIP.
3. Execute `ATUALIZAR_SOFIA.cmd`.
4. O atualizador valida `MANIFESTO_V89.json` por SHA-256 e cria backup para rollback.

A atualização preserva `.env`, memória, `data/`, anexos, backups, exports, `node_modules`, credenciais e `INICIAR_SOFIA.cmd` personalizado.
