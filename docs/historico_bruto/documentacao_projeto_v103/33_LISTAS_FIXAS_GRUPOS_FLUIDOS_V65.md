# Sofia OS v65 — Listas fixas, grupos fluidos e feedback efêmero

## Decisões de interface

- **Listas** e **Biblioteca** são módulos fixos da Sofia e não podem ser removidos da barra lateral.
- A personalização acontece **dentro** desses módulos: listas padrão como Mercado/Farmácia/Comprar/Black Friday/Monitoramentos e categorias da Biblioteca podem ser ocultadas ou reexibidas sem apagar dados.
- Widgets do Início continuam opcionais: ocultar um widget não remove o módulo nem os registros.

## Exclusão rápida

- O `×` rápido dos cards fica no **lado direito**.
- Estudos continua sem exclusão rápida nos cards.
- Exclusões diretas não usam `confirm()` nativo do navegador.

## Comprar e grupos

- O grupo é uma propriedade real do item de Comprar.
- O usuário pode arrastar um card para um chip de grupo ou para **Sem grupo**.
- No editor do item, o grupo pode ser digitado. Se ainda não existir, a interface cria o grupo e vincula o mesmo registro, sem duplicar o item.
- Editar continua sendo `PATCH` no mesmo ID.

## Feedback da interface

- Avisos globais aparecem no canto inferior da interface.
- Mensagens comuns somem automaticamente em cerca de 3,2 s; erros permanecem por mais tempo, cerca de 6,5 s.
- O objetivo é evitar banners presos como “Grupo criado.”.
