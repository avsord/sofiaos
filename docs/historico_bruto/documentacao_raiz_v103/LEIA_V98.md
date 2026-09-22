# Sofia OS v98 — Modo default e páginas legadas

- Corrige `Campo não previsto: template_id` ao retornar uma página do PARTICULAR ao **Modo default**.
- O erro vinha de páginas antigas carregarem `template_id` dentro de `data`; o frontend reaproveitava todo o objeto e reenviava esse campo para uma API que já não o aceita.
- A v98 passa a montar o payload de página somente com os campos atualmente permitidos pelo catálogo.
- O filtro também é usado no salvamento normal do editor e no salvamento de imagens em páginas, evitando falhas posteriores em páginas legadas.
- **Modo default** agora preserva o título e a posição na hierarquia, mas limpa corpo, `purpose`, capa, ícone personalizado, estrutura pré-preenchida e blocos anteriores.
- O resultado visual é a página básica: título editável, ícone padrão de documento e corpo vazio.
- Assets atualizados para `v=98` para evitar cache do JavaScript antigo.
- Mantidas as correções anteriores de localhost/origin e dos ícones coloridos no PARTICULAR.
