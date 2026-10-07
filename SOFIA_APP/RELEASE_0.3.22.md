# Sofia OS Android 0.3.23

Correções de navegação imediata e capa de páginas:

- Toques na barra inferior trocam a página e o destaque imediatamente, sem spring decorativo segurando a resposta.
- O swipe horizontal continua fluido e acompanha o dedo.
- A seleção de capa recupera o resultado perdido pelo Android quando a Activity é recriada ao abrir a galeria.
- A imagem de capa é comprimida no picker para reduzir memória e tamanho do upload.
- Ao segurar e arrastar o ícone ou o texto de uma página, o gesto continua pertencendo à lista de páginas.
- O swipe horizontal entre os menus fica temporariamente desativado durante o arraste da página.
- O arraste assume o controle mais cedo e exige menos movimento para começar.
- Mantém as correções da 0.3.21: template altera somente conteúdo, nomes/ícones corrigidos, sem Guidance/Quick-capture, excluir ao segurar, hierarquia sobe um nível antes de virar página principal e gesto de voltar revela a página anterior real.
- Mantém package com.avsord.sofiaapp e atualização por cima.
- Não redeploya o backend Railway.
