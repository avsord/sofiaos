# Sofia OS v97 — correção da abertura em localhost

- Corrige a tela em branco que mostrava `ORIGIN_BLOCKED` / `Origem não autorizada` ao abrir `http://localhost:3000`.
- A navegação inicial para `/` ou `/index.html` agora pode vir de um link, atalho ou restauração do navegador sem ser bloqueada.
- As APIs continuam protegidas contra origem externa e as operações de escrita continuam exigindo o token CSRF local.
- Mantém os ícones coloridos das páginas em PARTICULAR da v96 e todas as correções anteriores.
- Assets públicos atualizados para `v=97` para evitar cache antigo.
