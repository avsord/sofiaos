# Sofia OS v88 — revisão final das correções

Esta versão corrige a entrega v87 sem desfazer as alterações anteriores.

## 1. Botões `+`, engrenagem e `…`

- Continuam **no lugar original, no canto superior direito** da página.
- Não são centralizados.
- Ficam `fixed` em relação à viewport.
- Ao rolar a página, os botões permanecem exatamente no topo e não acompanham o conteúdo.

## 2. Sidebar PARTICULAR

- O cabeçalho PARTICULAR usa a mesma régua visual de APPS: altura, fundo, bordas arredondadas, padding e alinhamento.
- As páginas internas, como `Enjoy the Void`, usam o mesmo padrão de botão.
- O `+` de subpágina fica integrado à mesma linha visual, em vez de parecer uma coluna solta.

## 3. Imagens

- `Editar imagem`, link, comentário e demais ações ficam em **uma única linha horizontal**.
- A toolbar aparece **abaixo da imagem**, fora do frame.
- Continua flutuante e não empurra/reorganiza o conteúdo.

## 4. Uso Compartilhado / Privado

- Clicar em Compartilhado ou Privado atualiza apenas o cartão de Uso.
- O thread não é remontado e a posição do scroll da conversa é preservada, eliminando o flick/salto para cima.
- Cada troca força uma nova consulta ao endpoint de uso (`cache-busting`).
- Com `OPENAI_ADMIN_KEY`, o Privado usa Usage oficial para tokens/requisições e Costs oficial para gasto em USD quando disponível; fallback local continua identificado na interface.

## 5. Sino de notificações

- O preview abre **ao passar o mouse** sobre o sino.
- É uma janela pequena e flutuante.
- É possível mover o mouse do sino para a janela sem ela piscar ou fechar instantaneamente.
- Muitas notificações usam scroll interno; o scroll da página não é afetado.
- Sem notificações, aparece `Nenhuma notificação no momento.`
- `Ver todas as notificações` é apresentado como ação textual discreta.
- A página ampliada organiza o overview por **origem e área** e mostra estado, data, categoria, importância, vínculo com registro e ações disponíveis.

## Atualização

1. Feche a Sofia com `Ctrl+C`.
2. Extraia o ZIP.
3. Execute `ATUALIZAR_SOFIA.cmd`.
4. O atualizador valida `MANIFESTO_V88.json` por SHA-256, preserva dados locais e cria backup para rollback.

A atualização preserva `.env`, memória, `data/`, anexos, backups, exports, `node_modules`, credenciais e `INICIAR_SOFIA.cmd` personalizado.
