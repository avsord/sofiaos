# Sofia OS Android 0.3.15

Corrige três pontos de navegação e páginas no Android.

**Páginas com visual de documento:** a tela deixa de parecer um formulário. A capa ocupa a largura, o ícone fica solto sobre a capa sem cartão branco, o título é maior, o conteúdo começa logo abaixo e o espaço artificial entre conteúdo e subpáginas foi reduzido. O cabeçalho mostra o nome da página e “Particular” para páginas privadas; não volta a exibir “Salvo”. Placeholders discretos continuam aparecendo somente enquanto título/corpo estão vazios.

**Voltar arrastando:** quando uma página está aberta dentro da aba Páginas, um arraste horizontal para a direita move a própria página junto com o dedo e revela a lista por baixo. Enquanto a página estiver aberta, esse gesto pertence à navegação interna e não ao carrossel principal. Depois que a página fecha e a lista de Páginas volta a aparecer, o swipe entre Início, Conversa, Páginas, Agenda, Apps e Perfil volta a funcionar normalmente. A velocidade/motion aprovado do carrossel principal não foi alterado.

**Hierarquia por arraste:** o ícone de cada página é um handle dedicado que captura o gesto antes do pager principal. Arrastar uma página sobre outra muda seu parent_id e a transforma em subpágina; a área “Solte aqui para página principal” remove o parent_id e devolve a página à raiz. Ciclos continuam bloqueados e a mudança é persistida no servidor.

A Sofia continua iniciando em **Início**. Versão 0.3.15; versionCode 20; package com.avsord.sofiaapp; canal sofia-android-v preservado para atualização dentro do app.
