# Desbloqueio do servidor Sofia — preparado, não implantado

Base de produção: 1875f36ac533026bac3ff1052792152f5b75b5d6.

A conversa passa a recuperar tarefas pelo vínculo com a mensagem original e por referências persistidas nas respostas. O contexto consulta o registro atual: título, ID, revisão, descrição e nível de prioridade. Criar e renomear preserva a mesma tarefa; consultas respeitam privacidade e a conversa de origem. Criação pelo chat usa none/light/medium/important e atualização pode alterar prioridade e descrição sem substituir outros campos.

Validação local: 177 testes passaram, incluindo cinco novos testes de regressão e restauração. Planejamento de IA é simulado nos testes; não foi usado dado pessoal nem foi verificado com a conta real.

## Backup automático preparado

`tools/snapshot-server.cjs` executa dentro do container autorizado e produz cópia SQLite consistente via VACUUM INTO, incluindo todas as tabelas, arquivos de autenticação e chaves. `tools/verify-snapshot.cjs` confere hashes, integridade SQLite e contagem de todas as tabelas extraídas. Teste usa arquivo de autenticação, chave fictícia e tabela adicional ausente do backup portátil legado. Nunca publicar o backup, credenciais ou chaves em repositório ou Actions.

## Estado de acesso

Login Railway CLI autorizado pelo proprietário em 04/10/2026. O cadastro da chave SSH foi bloqueado pela revisão automática por criar acesso privilegiado persistente. Consulta posterior confirmou nenhuma chave SSH cadastrada. Nenhum backup de produção foi obtido; nenhum servidor foi reiniciado/implantado.

Próxima ação concreta: autorização específica para cadastrar a chave SSH temporária, copiar e validar o backup e revogar a chave ao terminar. Sem esse acesso, não aplicar o patch nem montar volume vazio sobre dados existentes. Depois, configurar armazenamento persistente, restaurar/verificar dados e publicar a correção do servidor.

## Google e Supabase

Plugins Google Calendar/Drive instalados no ChatGPT não configuram o OAuth do aplicativo Sofia. Railway ainda sem credenciais Google; Supabase sem projetos, organização avsord's Org (free). A ferramenta Supabase exige escolha explícita da organização e confirmação do custo antes de criar projeto. Nenhuma sincronização Google foi ativada ou simulada.
