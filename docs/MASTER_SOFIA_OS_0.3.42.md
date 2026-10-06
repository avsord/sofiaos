# Master Sofia OS 0.3.42

## Estado de entrega

0.3.42 / versionCode 47 publicada, final, não draft nem prerelease. Published_at: 2026-10-06T03:35:34Z (06/10/2026 00:35:34 São Paulo). Sofia-OS.apk uploaded, 51.516.604 bytes; SHA256 14640a21b44d3de5dcac20a775e02aedd5160f9e0284d1021d267cb2f234251a. APK: https://github.com/avsord/sofiaos/releases/download/sofia-android-v0.3.42/Sofia-OS.apk. Disponível em Ajustes > Verificar atualizações.

Repositório: avsord/sofiaos. Branch: work/sofia-refinements-042. Fonte: 99d33c5b76e792c228116f3e8c7ddf4aafd63b5c. Workflow corretivo Sofia Android 0.3.42 exact APK revalidation, execução 37408751878, job 112092168298 SUCCESS. Reutilizou exatamente os binários produção/QA da compilação 37407419102, verificando SOURCE_COMMIT e SHA256. A primeira tentativa falhou numa checagem de gesto; a revalidação completa, sem mudar testes ou binário, passou. Um diagnóstico intermediário falhou por sintaxe de shell no executor por linha; foi corrigido. Outra revalidação independente 37409227814 ainda estava em andamento após a publicação, sem substituir o APK.

## Alterações desta entrega

- App Listas inteiro no padrão visual da Biblioteca: seletor Todos, busca, cartões, filtros em painel e criação de registros no botão +. Inclui listas personalizadas, seus itens, mercado/farmácia e compras/grupos.
- Listas carrega todos os tipos e todas as páginas, mantendo os dados e relações existentes. Filtros de área, propriedade e estado; nenhuma avaliação de estrelas imposta aos itens de lista.
- Todos como seleção inicial dos registros dos Apps. Biblioteca mantém seu endpoint próprio. Cada outro app agrega apenas suas categorias. Criar a partir de Todos abre a seleção do tipo apropriado.
- Agenda e Cápsulas compartilham a fila de alterações de notificações. Limite 128 por canal, com margem global de 384 considerando outros pedidos registrados. Avisos antecipados não são selecionados sem o aviso correspondente no horário.
- Alarmes obsoletos são cancelados antes de instalar novos. Ao substituir um pedido existente, remove-se o registro anterior antes da nova tentativa. Falhas do Expo que persistem um pedido sem instalar o alarme são limpas; identificadores de falhas não são considerados confirmados em uma nova tentativa.
- Assinatura de agendamento 042 força reparação dos pedidos das versões anteriores. Rotinas e histórico permanecem no servidor; esta mudança afeta o agendamento local, não apaga dados.
- Falha ao limpar uma notificação já apresentada não é mais tratada como falha do agendamento. Mensagens de erro distinguem limite, permissões e outros erros. Cápsulas oferece Tentar novamente.

## Validação

TypeScript passou. 225 testes do app e 205 testes do backend passaram localmente. Testes novos cobrem o estado legado com 512 pedidos, retirada antes de inserção, falha que persiste pedido, recuperação de fila compartilhada, Listas com paginação e agregação apenas das categorias do app.

Validação Android nativa passou antes da publicação: mesmo pacote e assinatura, instalação como atualização, navegação, Agenda, tarefas, chat, Biblioteca, notas, notificações de Cápsulas, histórico e criação mensal pelo seletor de horário, Listas com filtros e criação pelo +. A fixture usa transporte isolado e não grava dados de usuários reais. O APK de produção não contém a fixture.

## Servidor e preservação

Nenhuma alteração ou nova publicação de backend nesta entrega. Último backend confirmado: commit 5561178a2b931633aecbd4e2903f1b6e0190da0c, Railway deployment 360612b3-cead-46ca-867a-470204bd9784 SUCCESS. Health md_upgrade 0.3.41, versão 142.0.0, SQLite local, Cápsulas e recorrência habilitados.

Não desinstalar ou limpar dados para atualizar. Nunca apagar conversas, mensagens, Biblioteca, rotinas ou histórico durante atualização. Não restaurar backup por cima da base atual. Railway permanece com volume e configuração existentes. A autorização para manutenção e atualização já foi dada; não repetir perguntas rotineiras.

## Limites e continuidade

O print do usuário prova um erro de agendamento local, mas não identifica sua exceção original. O defeito de capacidade e ordem foi demonstrado no código e corrigido; não afirmar que se leu um log do celular real. Permissões e restrições de bateria continuam sendo do Android. Conferir o resultado na rotina Dudasterida, 21:00, Seg/Qua/Sex, preservando-a.

Não prometer que a conexão unificada Google Drive/Gmail dentro do aplicativo esteja concluída. A integração do ChatGPT não substitui o OAuth da Sofia. Recorrência importada do Google foi publicada separadamente anteriormente; exportação completa de novas séries locais requer confirmação própria.

Não criar automação adicional ou enviar uma versão antiga como nova. A antiga automação de APK foi desativada. Publicar somente o binário validado, sem substituir release já existente.

A descoberta da atualização da versão instalada 0.3.41 foi confirmada como 0.3.42 no CI. APK e código da fixture de QA são separados; somente Sofia-OS.apk de produção foi publicado.
