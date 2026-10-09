# Sofia OS v88 — revisão final das correções de interface

## Ações da página Particular
- `+`, engrenagem e `…` voltam ao lugar original no canto superior direito.
- Ficam fixos na viewport e não acompanham o scroll.
- A centralização introduzida na v87 foi removida.

## Sidebar PARTICULAR
- O cabeçalho PARTICULAR usa a mesma altura, fundo, raio, padding e alinhamento de APPS.
- As páginas internas também usam a mesma régua visual dos botões de APPS.
- O `+` de subpágina fica embutido na linha visual da página, sem uma coluna solta ao lado.

## Notificações
- Passar o mouse sobre o sino abre uma prévia pequena e flutuante.
- A prévia permanece aberta ao mover o ponteiro do sino para ela, evitando flicker.
- Muitas notificações usam scroll interno; a página não se move.
- Sem notificações: `Nenhuma notificação no momento.`
- `Ver todas as notificações` abre a página ampliada.
- O overview ampliado separa origem e área e mostra estado, data, categoria, importância e vínculo com registro.

## Uso Compartilhado / Privado
- A troca atualiza o cartão com uma consulta nova ao Usage.
- O thread não é remontado.
- A posição de scroll do chat é preservada para eliminar flick/salto.
- A sincronização oficial Usage/Costs continua ativa quando `OPENAI_ADMIN_KEY` está configurada.

## Imagem
- Mantida a barra contextual em uma única linha horizontal abaixo da imagem selecionada.
