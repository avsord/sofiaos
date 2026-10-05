# MASTER — Sofia OS 0.3.38

Atualizado em 5 de outubro de 2026. Preserve mensagens, páginas, Biblioteca, sessões, banco e conexão Google. Esta master registra a entrega publicada e os próximos pontos de trabalho.

## Estado atual

- Repositório: https://github.com/avsord/sofiaos
- Branch completa: `work/sofia-refinements-038`.
- Fonte completa mais recente: `73d182e5fa0067443f798d925cfd65085d5518ba`.
- APK publicado e validado no Android: 0.3.38, versionCode 43, pacote `com.avsord.sofiaapp`.
- Fonte do APK corretivo: `73d182e5fa0067443f798d925cfd65085d5518ba`. A primeira tentativa compilou, mas falhou no teste real de arrasto curto; não publicou.
- CI: https://github.com/avsord/sofiaos/actions/runs/37379688445
- **APK 0.3.38 PUBLICADO em 05/10/2026 às 19:15:42 de São Paulo (22:15:42Z), após aceitação Android SUCCESS.** Release pública, sem draft/prerelease; asset Sofia-OS.apk uploaded, 51.465.160 bytes. Atualizadores antigo e novo confirmaram descoberta da 0.3.38.
- Backend **publicado** em `3fa3237896384f4cf92da02e73012872f58d1d59`, deployment Railway SUCCESS. Deploy aplicado e verificado.

## Correções desta etapa

### Calendário e menus

- `MonthSwipe`: no Android a reserva do pager é nativa, antes do ACTION_DOWN. Removido bloqueio JS duplicado que podia restaurar estado desatualizado após tocar no calendário. iOS mantém bloqueio React, com cancelamento/múltiplos dedos.
- Todo o mini calendário do Início está protegido, inclusive cabeçalho e lista.
- `SofiaCalendarTouchGuard.kt`: gesto deliberado de 18 dp, predominantemente horizontal, termina pelo fling nativo no menu vizinho; movimento e animação permanecem no Android. Calendário e menus desabilitados são excluídos. O iOS tem fallback de 20 dp/5%.
- `useAgendaView` move o dia selecionado para o mês exibido e limita ao último dia válido. Mudar de mês já atualiza a lista correspondente, sem tocar de novo no dia.
- `agenda-cache` e `use-agenda-month`: cache compartilhado por sessão, unificação de leituras, pré-carregamento de meses vizinhos, preservação dos eventos em falha, atualização em segundo plano e consulta a cada dois segundos enquanto `refresh_pending` (até 60 consultas por ciclo ativo).
- Agenda mostra compromissos sem esperar catálogo; indicador de carregamento evita exibir vazio durante importação. Início usa o mesmo cache.
- Testes locais: TypeScript PASS; 213 testes do app PASS (9 + 203 + 1). Testes novos verificam troca de dia, fevereiro, virada de ano, respostas fora de ordem, compartilhamento/cache e chegada de eventos sem novo toque.
- A aceitação Android passou, incluindo ida/volta de 60 pixels em 80 e 450 ms, bloqueio dos dois calendários e os fluxos anteriores de tarefa, conversa, tema, filtros e notas. Também passou a seleção do dia e exibição do compromisso do próximo mês sem novo toque no dia.

### Agenda vazia por timeout — corrigido no servidor

O primeiro deploy de recorrências passou na comparação de eventos, mas GET `/api/mobile/agenda?month=...` aguardava a sincronização completa. Além disso, cada abertura após 30 segundos invalidava a janela e podia reexpandir quatro anos. O celular cancelava a leitura aos 20 segundos; os logs mostraram HTTP 499. As ocorrências existiam, mas a tela não recebia a resposta no prazo.

- GET agenda agora lê os compromissos já salvos e solicita atualização em segundo plano (`requestMonth`), sem aguardar Google.
- Requisições simultâneas são unificadas, falhas têm espera antes de repetir, e abrir um mês já coberto não invalida a expansão.
- `expandSeries` evita janelas sobrepostas desnecessárias e só marca como carregadas as janelas efetivamente processadas.
- Resposta traz `refresh_pending` para uma janela nova. Clientes antigos ignoram esse campo. A corretiva 0.3.38 consulta automaticamente o mês ativo enquanto a importação está pendente; sem bloquear a leitura inicial.
- Backend: **199 testes PASS**, incluindo leitura imediata durante sincronização lenta, preservação em falha, cache e nenhuma duplicação.
- Verificação real após deploy: cinco ocorrências do dia 5 retornam uma única vez, iguais aos IDs Google anteriormente comparados. Consultas de outubro, novembro e dezembro passaram.
- Primeiro tempo medido no servidor: 228 ms. Consultas simultâneas e novas consultas do celular depois do deploy retornaram HTTP 200 em menos de um segundo, em vez dos 20 segundos seguidos de cancelamento. O tempo de rede do ambiente de diagnóstico é maior e não é a latência do servidor.
- **Mensagens e itens da Biblioteca preservados por IDs/hashes**; Google conectado, sem erro ou aviso na sincronização. Nenhum backup restaurado, dado limpo ou chave trocada.

## Publicação e instalação Android

- Usar sempre `com.avsord.sofiaapp`, mesmo certificado, prefixo de releases `sofia-android-v` e versionCode crescente.
- Workflow: `.github/workflows/sofia-native-038-update.yml`, runner ubuntu-22.04. Publica só depois dos testes Android, verificação de assinatura e upgrade.
- Não substituir um APK já instalado sob o mesmo versionCode; qualquer correção posterior à entrega requer versão maior.
- Última versão publicada antes desta etapa: 0.3.36. A 0.3.37/code42 foi entregue manualmente com bundle novo e base nativa validada, mas não teve publicação GitHub confirmada. Não oferecê-la como se fosse a 0.3.38.
- Publicação 0.3.38 confirmada; acompanhamento encerrado para evitar aviso repetido.
- O snapshot `release/sofia-android-v...` é um snapshot do aplicativo sobre main e **não é o baseline correto para o servidor**. Usar a branch completa acima para Railway.

## Infraestrutura e preservação

- Banco `/sofia/data/sofia.sqlite`; chaves `/sofia/secure`; backups `/sofia/backups`; start `node tools/restore-gate.cjs`.
- Deploys pinados e manuais. Não presumir que push publica o servidor.
- Nunca trocar `SOFIA_CALENDAR_TOKEN_KEY`, refresh tokens, client ID/secret ou volume para resolver falha de agenda. Não restaurar backup sobre registros atuais.
- A correção 035 impede que shutdown esconda conversas pessoais como paused; mantém conversas apagadas/pausadas manualmente como estavam. Não regredir `src/memory/store.js` e `src/services/chat-sync.js`.
- Sessão diagnóstica desta etapa revogada e token local removido. Sessões diagnósticas futuras também devem ser revogadas ao terminar. Não colocar credenciais, tokens, banco, backup privado ou logs pessoais no GitHub ou no master.

## Funcionalidades anteriores a preservar

- App nativo Expo/React Native em `SOFIA_APP`; backend Node/SQLite. Supabase conectado como ferramenta não significa migração do banco.
- Tema claro 05:00/escuro 19:00, horários configuráveis e modos Sistema/Claro/Escuro.
- Navegação por toque imediato, telas mantidas durante troca, menu acompanha posição nativa; sem apagar cache durante refresh.
- Chat: anexos por clipe, teclado sem cortar o compositor, histórico compartilhado, exclusão por seleção, rolagem Y animada acompanhando crescimento de respostas.
- Início: título Tarefas, filtro Todas por padrão; toque no conteúdo abre detalhes/edição e somente a caixa conclui. Mini calendário usa seis linhas fixas.
- Biblioteca: tudo por padrão, áreas temáticas versus propriedade/marca/projeto, categorias derivadas dos registros, estrelas e filtros adaptados, Nova área no final do +.
- Páginas: caderno e folha distintos, hierarquia estável, ícones, editor Notion, salvamento preservando IDs, undo/redo, títulos sem placeholders permanentes.
- Notas: `LeafEditor` compartilhado; `leaf_document` junto ao texto simples, mantendo propriedades, revisões e o mesmo registro. Backend com esse campo já publicado; confirmar experiência no aparelho.
- Agenda: recorrências Google importadas por `events.instances`, migração única do token legado, exceções, cancelamentos, fuso, dia inteiro e paginação. Sem corte global em 500. Importa o calendário selecionado, não todos os calendários da conta automaticamente.
- Notificações: painel nasce no sino, fundo com fade; sheets compartilham movimento suave.
- Tarefa: Sofia interpreta prioridade explicitamente solicitada; não voltar a salvar tudo como sem prioridade.
- Monitoramento de produtos: prioriza link informado e sua cor no gráfico; compara fontes verificáveis da mesma variante. Não inventar preço nem prometer cobertura de toda a internet.

## Pendências separadas

- Exportar uma nova série local como RRULE Google ainda exige capability `calendar_recurrence`; importação de séries existentes está implementada. Não prometer exportação recorrente completa.
- OAuth unificado Drive/Gmail dentro da Sofia ainda precisa implementação/validação; instalar conectores no ChatGPT não implementa isso no aplicativo.
- Validar fluidez no aparelho do usuário, sem inventar medição de FPS ou latência de toque.

## Retomada

Continue a partir da branch completa 038 e do estado atual acima. Preserve todos os dados. O timeout foi corrigido e publicado; não solicitar novamente autorização para esse deploy já concluído. CI/APK concluídos com sucesso. A próxima alteração no app deve incrementar para 0.3.39 e versionCode 44; não substituir o binário publicado 0.3.38. Validação no emulador não substitui avaliação de fluidez no aparelho do usuário. Não confundir dados Google reais verificados com transporte sintético dos testes Android.

## Entrega verificada

- APK: https://github.com/avsord/sofiaos/releases/download/sofia-android-v0.3.38/Sofia-OS.apk
- SHA-256: `c3effa48aef3eceb96036c2e76b10a66f0b45feb0f8551901115a4acb8fce6c9`.
- Fonte completa: 627 arquivos comparados por hash Git com a árvore `49b6571e83212efc98473d7c6a30209b18c36d63`, sem diferenças.
- Artefato da CI com evidências: https://github.com/avsord/sofiaos/actions/runs/37379688445/artifacts/11374380426
- Atualização pelo aplicativo: Ajustes > Verificar atualizações. Instalar como atualização preservando os dados; não desinstalar para atualizar.

- APK baixado do asset publicado e comparado por tamanho e SHA-256; manifest local confirma versão 0.3.38/code43. Assinatura local confere com o certificado instalado: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
