# v70 — Navegação, escala de páginas e feedback silencioso

## Menu da Sofia

- **APLICATIVOS DA SOFIA** virou uma seção recolhível, aberta por padrão.
- O recolhimento atua apenas nos aplicativos; **PARTICULAR** continua independente.
- Os símbolos finos foram trocados por ícones semânticos mais legíveis e com área visual maior.

## Início ↔ Resumo

- O estado visual agora é mutuamente exclusivo: só **Início** ou **Resumo** pode estar ativo.
- A troca continua dentro da mesma Home, sem rota duplicada.
- A animação usa easing contínuo e duração menor/proporcional à distância; rolagem manual cancela a animação.

## Feedback e barras laterais

- `Ctrl+Z`, `Ctrl+Y` e `Ctrl+Shift+Z` não abrem toast; o feedback aparece discretamente em `userPageSaveState`.
- O alerta de uso disparado depois de mensagens, inclusive áudio, passa para o cartão de uso da própria conversa/mini Sofia e não usa toast lateral.
- Avisos globais que ainda precisam existir são pílulas compactas centralizadas; erros continuam mais visíveis.

## Escala das páginas

- Conteúdo central ampliado para até 980 px.
- Título, ícone, corpo, tabelas, cards de coleção, linhas e controles foram ampliados para aproximar a leitura do Notion em 100%.
- `tab-userpage` bloqueia overflow horizontal e mantém a capa full width, reduzindo quebras visuais.

## Voz — envio responsivo

- Ao tocar em **Enviar áudio**, a mensagem de voz aparece imediatamente na conversa usando uma URL local temporária; a interface não espera a transcrição nem a resposta da IA para mostrar o envio.
- O estado do balão evolui de `Enviando…` para processamento, sem abrir barra lateral.
- A captura prefere Opus mono em 32 kbps, adequado para fala e bem menor que o bitrate padrão do navegador; há fallback automático se o navegador rejeitar essa configuração.
- A conversão do Blob e a preparação da conversa começam em paralelo, reduzindo trabalho serial antes da chamada de áudio.
- O áudio persistido continua sendo associado à mensagem real pelo mesmo `client_message_id`; o balão otimista desaparece quando a versão persistida chega.
