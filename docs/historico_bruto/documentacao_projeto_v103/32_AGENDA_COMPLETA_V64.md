# Sofia OS v64 — escopos genéricos, Safe Chat e UX modular

A v64 começou a partir de um erro observado na Agenda, mas a correção foi generalizada para a Sofia inteira.

## 1. Escopos semânticos genéricos

A IA é responsável por entender a referência do usuário. O backend não possui regras do tipo “se falar Agenda, faça X”. Ele recebe um `scope_id` real escolhido pela IA a partir do catálogo estrutural.

Exemplos de scopes atuais:

- `agenda` — compromissos + lembretes atuais;
- `commitments`;
- `reminders`;
- `tasks`;
- `priorities`;
- `library`;
- `study`;
- `market`;
- `pharmacy`;
- `purchase`;
- `monitors`;
- `purchase-group:<id>` para grupos criados pelo usuário em Comprar;
- `list:<id>` para listas personalizadas;
- `page:<id>` para páginas/espaços;
- `tag:<nome-normalizado>` para labels reais.

Quando o usuário diz “apaga tudo que está em X”, a IA escolhe X no catálogo e usa `delete_scope`. O backend enumera somente os membros atuais daquele escopo e executa o conjunto. Isso vale para grupos existentes hoje e para coleções futuras.

O catálogo passado à IA é estrutural: não despeja todos os títulos e conteúdos privados em cada turno. Para editar ou excluir um registro específico, a IA pode pedir contexto seletivo e deve usar IDs reais.

## 2. Exclusão direta

Por decisão de UX da v64, exclusões claras não recebem uma segunda pergunta de confirmação.

- o botão `×` exclui diretamente;
- o botão Excluir também exclui diretamente;
- um pedido claro à Sofia pode ir direto ao backend depois da interpretação da IA;
- o backend continua podendo vetar dependências, permissões, IDs inexistentes ou outras restrições técnicas.

Confirmações que não são simples exclusões — por exemplo exportar texto sem criptografia, aprovar um rascunho ou enviar conteúdo ao filtro privado — usam um diálogo da própria Sofia, nunca `window.confirm()` do navegador.

## 3. Detalhes e cards

- clicar fora de um modal de registro/detalhe fecha o modal;
- se um registro aberto for excluído, o modal é fechado automaticamente;
- Agenda, tarefas, listas e cards gerais possuem `×` rápido no lado esquerdo;
- Estudos não recebe o `×` rápido;
- exclusões vindas da IA devolvem `deleted_ids` para a interface remover/fechar estados obsoletos.

## 4. Edição in-place

`update_record` é a capacidade para alterar algo existente. A IA deve preservar `target_id` e informar `changes`. O executor atualiza a mesma entidade/tarefa e retorna `created:false`. Editar um lembrete, compromisso, compra ou outro registro não deve criar uma segunda cópia.

## 5. Safe Chat

“Chat Protegido” passa a se chamar **Safe Chat**. Na interface e nas respostas renderizadas, o nome recebe uma label/chip visual. O Safe Chat continua sendo um modo explícito da conversa e não é sinônimo de Diário Pessoal.

## 6. Comprar com grupos do usuário

Comprar agora aceita grupos reais definidos pelo usuário, por exemplo Studio, Suplementação, Casa ou Tecnologia.

- criar grupo;
- renomear grupo;
- filtrar por Todos, Sem grupo ou grupo específico;
- associar uma compra ao grupo;
- cada grupo vira um scope real para a IA;
- excluir o grupo não exclui seus itens: eles voltam para Sem grupo.

A IA pode usar o mesmo modelo para “o que falta comprar pro Studio?”, “move isso pra Suplementação” ou “apaga tudo de Casa”.

## 7. Módulo do sistema x widget

Listas e Biblioteca continuam módulos padrão da Sofia e não podem ser apagados do sistema. O usuário pode ocultá-los da barra lateral como widgets de navegação e reexibi-los em Personalizar. A mesma separação vale para widgets do Início: esconder o card não apaga o módulo nem os dados.

## 8. Templates de páginas

O editor de blocos da v63 continua intacto e ganha templates editáveis. Eles apenas inserem blocos iniciais; depois disso a página é livre.

Templates incluídos:

- Página em branco;
- Notas;
- Projeto;
- Banco de ideias;
- Reunião;
- Pesquisa;
- Produção de conteúdo;
- Compras / orçamento;
- Planejamento semanal.

O editor mantém rich text, headings, listas, checklist, toggle, código, citação, callout, equação, tabela, anexos, links, data, subpáginas e blocos específicos da Sofia.

## 9. Princípio central preservado

**Usuário → IA → diálogo se necessário → IA → plano estruturado → backend valida/executa → resultado técnico → IA → resposta natural.**

O backend não interpreta linguagem natural.
