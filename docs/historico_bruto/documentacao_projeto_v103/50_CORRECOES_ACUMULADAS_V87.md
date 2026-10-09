# Sofia OS v87 — correções acumuladas

## Interface

- Ações `+`, engrenagem e `…` de Particular: camada fixa na viewport, centralizada na área útil, independente do scroll do documento.
- Cabeçalho PARTICULAR: mesmo bloco visual de APPS, sem alterar a árvore de páginas abaixo.
- Toolbar contextual de imagem: overlay absoluto, uma única linha horizontal e posicionada abaixo do frame selecionado; não participa do fluxo do documento.

## Uso da Sofia

- A troca Compartilhado/Privado não remonta o thread do chat; apenas substitui o cartão de uso existente.
- `OPENAI_ADMIN_KEY` permite sincronizar tokens/requisições pelo Usage da organização.
- O gasto do Privado passa a consultar `/v1/organization/costs`; quando houver `project_id` nos resultados de completions, a consulta de custos é limitada aos projetos relevantes.
- Na indisponibilidade do Costs/Admin, permanece o fallback local e a interface informa a origem.

## Notificações

- Sino abre popover flutuante imediatamente.
- Lista possui scroll interno.
- Estado vazio: `Sem notificações no momento.`
- `Ver todas as notificações` abre a página geral.
- Página geral agrupa por área/app e mostra metadados e acesso ao detalhe relacionado.

## Regressão

Todas as alterações anteriores continuam cumulativas. A suíte completa da v87 possui 454 testes aprovados.
