# Conferência 0.3.26 — 18 itens do MD

Base: 0.3.25. Publicação pendente da execução CI. Nenhuma alteração em dados de produção.

| Item | Tratamento e critério | Limite |
|---|---|---|
| 1 | Arraste agora sobe um nível por gesto; ordenação/hierarquia e prévia testadas; servidor com ordem atômica reconciliado | Ordem compartilhada exige deploy do servidor |
| 2 | Vetores e PNG1024 preservados; pipeline valida e regenera | Não redesenhado |
| 3 | Cabeçalho Ajustes corrigido; engrenagem e seções mantidas | Web preparado, não publicado |
| 4 | Google OAuth/PKCE e sync bidirecional preparado; testes com transporte simulado | Sem credenciais Google e sem deploy seguro; não conectado |
| 5 | Home analítico preservado; site preparado com calendário50/50 | Site não publicado |
| 6 | Centro único preservado; API paginada/limpeza compartilhada preparada e testada | Legado300 e limpeza local continuam na produção |
| 7 | Nome/ícone reais mantidos; teste Android arrastando ícone e contando uma única gravação | Dados sintéticos |
| 8 | Templates só de conteúdo; nomes exatos corrigidos; anotações e aparência preservadas | Equivalente web preparado |
| 9 | Segurar abre exclusão identificada com confirmação; mantida correção0.3.25 | Teste com dados sintéticos não apaga dados reais |
| 10 | Navegação interna em Apps mantida e testes anteriores preservados; web preparado | Web não publicado |
| 11 | Bloqueio desde DOWN mantido; polling não inicia enquanto há interação; callback obsoleto removido | Mantém rolagem normal |
| 12 | Agenda50/50 nativa preservada; equivalente web implementado | Teste web isolado |
| 13 | Páginas busca atualizações enquanto aberta/retorno ao app, preserva rascunhos e ignora revisão antiga; web preparado para dois clientes | NÃO integral: backend sem volume, backup completo inacessível, preferências ainda locais, deploy bloqueado |
| 14 | Painel nativo ancorado no sino mantido; web ancorado e animação de cima para baixo preparada | Web não publicado |
| 15 | Cabeçalhos nativos mantidos; contextuais web preparados; Conversa preservada | Web não publicado |
| 16 | Exatamente Tarefas pessoal, Bloco de nota e Lista de reprodução; +duplo e colunas preservados | Teste picker Android |
| 17 | Dica do título agora some com conteúdo/subpáginas e volta ao focar; autosave/desfazer/refazer mantidos | Rascunhos não são descartados por polling |
| 18 | Workflow026 com assinatura, atualização sobre025, gestos reais, descoberta, APK e master | Só marcar publicado com prova de release |

## Bloqueios confirmados
Railway produção: serviço sofiaos, zero volumes, deploy manual. A conexão retorna somente nomes de variáveis e não há ferramenta de shell nem token CLI disponível. Não foi possível extrair banco SQLite completo, arquivos de autenticação e chaves, nem testar restauração dos dados reais. A exportação atual por API usa lista limitada de tabelas e não substitui esse backup. Não reiniciar nem montar volume vazio sobre a produção.
Nenhuma das variáveis GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET e SOFIA_CALENDAR_TOKEN_KEY está configurada. Não criar credenciais falsas nem usar a conexão Google do ChatGPT. A autorização final da conta Google depende do titular.
