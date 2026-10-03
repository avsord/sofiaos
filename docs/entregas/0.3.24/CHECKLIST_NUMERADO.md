# Alterações — conferência por número

Este documento complementa, não apaga, o MD original. O código 0.3.24 só é considerado PUBLICADO após prova do workflow/release. Testes automatizados não equivalem a testes manuais de todos os gestos no aparelho do usuário.

| Nº | Requisito | Situação / aceitação |
|---|---|---|
| 1 | Arrastar, reordenar e hierarquia | Mantido da 0.3.23: ícone+texto, linha prévia, antes/depois/dentro, saída suave um nível por vez. Nova proteção no item 11. Hierarquia remota; ordem entre site/aparelhos ainda depende do backend. |
| 2 | Logo nítido | Vetores originais e PNG de 1024 px mantidos; sem alterar desenho ou motion. Pipeline regenera e confere dimensão. |
| 3 | Perfil vira Ajustes | Engrenagem; áreas Aplicativo e Perfil separadas, tema sistema/claro/escuro mantidos. |
| 4 | Google Calendar simples | UI existente; conexão efetiva bloqueada por backend persistente, credenciais OAuth administrativas e autorização da conta. NÃO conectado nesta entrega. |
| 5 | Início analítico | Sem card gigante de conversa; miniagenda e monitoramentos reais. Refinamento 50/50 no item 12. |
| 6 | Centro unificado | Sino compartilhado Home/Apps, não lidas, leitura e limpeza, visão completa por área. Servidor legado limita histórico a 300 e limpeza local. Refinamento visual no item 14. |
| 7 | Labels reais | Identidade da página preservada antes/durante/depois de arrastar. Ícone e texto viajam juntos. |
| 8 | Template só conteúdo | Preserva título, emoji, capa e anotações; sem Guidance/Quick Capture indevidos. Equivalente do site ainda depende do deploy seguro. |
| 9 | Excluir ao segurar | Segurar sem mover abre ação com nome e confirmação; mover arrasta. Usa API atual. |
| 10 | Voltar em Apps | Sobe um nível por vez, não salta para Início. Equivalente do site pendente. |
| 11 | Arraste não pode atualizar | NOVO: bloqueio desde DOWN na linha, antes de 240 ms do toque longo; RefreshControl nativo desativado, callback protegido contra atraso; rolagem normal independente de arraste; encerramento/cancelamento libera corretamente; pager/voltar não roubam o gesto. |
| 12 | Agenda 50% + 50% | NOVO: mesmo card, mesma linha, mini calendário à esquerda e compromissos da data à direita; seleção atualiza lista sem navegar, lista tem rolagem interna; largura testada por estrutura, confirmar visualmente no aparelho. |
| 13 | Sincronização absoluta app/site | EXIGÊNCIA NÃO CONCLUÍDA: dados e mudanças estruturais precisam fonte única, persistência, revisões/conflitos e testes em dois clientes. Ordem e limpeza locais NÃO contam como sincronizados. Bloqueio principal: migração segura da produção sem volume. |
| 14 | Notificações a partir do sino | NOVO: mede sino real, posiciona painel flutuante abaixo dele, anima de cima para baixo, fechamento por fora/voltar, limites da tela, rolagem interna e grupos Hoje/Ontem/Últimos 7 dias. Tela completa continua por área. |
| 15 | Cabeçalhos no mesmo padrão | NOVO: Páginas com título e identificação roxa relacionada; Agenda e Notificações com identificações próprias. Conversa sem alteração. Editor mantém identidade/título/capa como Notion. |
| 16 | Exatamente três templates e + duplo | Tarefas pessoal (quadro), Bloco de nota (cadernos), Lista de reprodução (links). + permite página em branco/subpágina ou aplicar template. Colunas podem ser adicionadas, duplicadas, renomeadas e coloridas. Código nativo anterior preservado; sincronizar catálogo/ações do site no backend pendente. |
| 17 | Página limpa mas sempre editável | Vazia: título e texto com dica em baixa opacidade. Preenchida ou com subpáginas: dicas ocultas; tocar permite escrever. Autosave, desfazer/refazer, sem botão salvar, subpáginas no espaçamento compacto sem seta dentro do conteúdo. Preservar testes existentes. |
| 18 | Master e publicação sem perguntar | Master com fonte, documentos, histórico disponível, critérios e evidências. APK novo testado e publicado no canal existente sem nova confirmação; Android pode exigir o toque de instalar. Registrar versão REAL ao final. |

## Testes obrigatórios da 0.3.24
- TypeScript completo e regressões anteriores; testes dos callbacks reais de toque da linha com renderer simulado.
- DOWN, hold, movimento, soltura, cancelamento, scroll antes do hold e refresh tardio; não disparar abertura/reordenação indevidas.
- MiniAgenda renderizada: duas metades 50% e seleção troca apenas a lista, preservando callbacks.
- Posição de notificações em 320/360/400/768/1200 px e janela curta; datas de calendário.
- Coerência npm/lockfile/app.json/atualizador; package e prefixo intactos.
- APK release com bundle, certificado igual ao APK 0.3.23 e instalação `adb install -r` em Android 15.
- Início estável e tela de login; atualizadores 0.3.23/0.3.24 descobrem o novo asset exato.
- NÃO declarar QA manual completo, conexão Calendar real, sincronização total ou site publicado a partir desses testes.
