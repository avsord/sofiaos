# Sofia OS v67 - Páginas visuais, contraste Notion e navegação refinada

## Objetivo

A v67 parte da v66 e corrige a hierarquia visual do modo claro, mantendo o estilo de cores inspirado no Notion sem alterar a estrutura aprovada da interface.

## Modo claro

O modo claro agora diferencia melhor:

- fundo geral branco;
- cards e painéis em cinza muito suave;
- elementos internos em um nível ligeiramente mais escuro;
- botões secundários mais escuros que o card onde aparecem;
- texto principal em `#37352f`;
- placeholders e metadados em cinza secundário;
- ações destrutivas em vermelho legível, sem aparência de item desabilitado.

A correção é global para Chat, Resumo, Agenda, Listas, Biblioteca, páginas, mini Sofia, diálogos e editor em blocos.

## Editor de páginas

Os seletores do editor passaram a forçar contraste correto no tema claro. Títulos, headings, texto digitado, células de tabela, alternantes e equações usam a hierarquia de cor do modo claro em vez de herdarem cores do tema escuro.

## Capa e ícone de página

Páginas personalizadas agora podem ter:

- capa opcional por preset visual;
- capa enviada pelo usuário como imagem local;
- emoji colorido;
- ícone convencional monocromático.

O ícone escolhido é reutilizado no topo da página, breadcrumb e menu lateral. A capa e o ícone fazem parte dos metadados da própria página.

`Ctrl+Z`, `Ctrl+Y` e `Ctrl+Shift+Z` também restauram mudanças visuais de capa e ícone dentro do histórico da página.

## Navegação lateral

Os símbolos dos itens do menu usam a mesma coluna vertical. O menu público foi renomeado para:

- `APLICATIVOS DA SOFIA` para os módulos nativos;
- `PARTICULAR` para os espaços e páginas criados pelo usuário.

## Mini Sofia

No tema claro, a mini Sofia recebeu:

- botão flutuante com contraste maior;
- painel com preenchimento próprio;
- thread e composer visualmente separados;
- campos e botões com níveis diferentes de superfície.

## Princípios preservados

A v67 não muda a arquitetura semântica central:

**Usuário -> IA -> esclarecimento se necessário -> plano estruturado -> backend valida/executa -> resultado técnico -> IA responde.**

Listas e Biblioteca continuam módulos fixos. Espaços e páginas do usuário continuam hierárquicos. Exclusão recursiva de páginas, templates, coleções, mini Sofia contextual e undo/redo permanecem ativos.
