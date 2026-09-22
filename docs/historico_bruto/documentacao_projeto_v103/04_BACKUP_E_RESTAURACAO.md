# Meditações, backups e recuperação — v45

## Configurar o cofre

Abra Meditações e a configuração do Authenticator. No Google Authenticator, escolha adicionar uma chave de configuração manual, baseada em tempo, com conta **Sofia — Meditações**. Copie o segredo exibido APENAS para o aplicativo autenticador. Digite o código de seis números no formulário da Sofia para confirmar. Esta versão fornece cadastro manual, não um QR Code desenhado.

Guarde o código de recuperação exibido uma única vez fora do computador. Ele recupera a autorização do Authenticator para recadastrar seu acesso; não substitui uma cópia das chaves de criptografia perdida. Depois, gere um backup portátil criptografado com senha forte e guarde-o em outro local.

Para adicionar uma nova meditação, não é necessário abrir todo o histórico. Para listar/ler/editar, um código novo libera uma sessão de cinco minutos. Códigos já utilizados são recusados. Cinco tentativas incorretas geram bloqueio temporário. Bloquear fecha as permissões de leitura. Versões são entradas cifradas encadeadas; a anterior não é sobrescrita.

O título e o texto são cifrados com AES-256-GCM. A chave fica separada do banco: DPAPI no Windows ou arquivo de permissões restritas no ambiente de teste. Segredos do Authenticator também são cifrados. O cofre não aparece na busca comum nem é anexado ao contexto de outra conversa.

## Refletir com IA

Use a ação de reflexão dentro de uma entrada aberta. A Sofia exige confirmação da rota privada e envia somente aquela entrada e a pergunta autorizada. A resposta volta ao cofre cifrada; não entra no chat comum. Isso é envio a um provedor remoto autorizado, não leitura de texto cifrado diretamente por uma IA. Não use isso com um projeto compartilhado para treinamento.

Esta implementação protege o armazenamento contra certos acessos, mas não impede que malware ou alguém com acesso ao mesmo usuário Windows, servidor e chave consiga ler durante uma sessão autorizada. Não é uma auditoria independente de um produto financeiro/médico. Não guarde senhas de bancos/cartões no diário.

## Backup

Backups locais continuam cifrados com chave do usuário; os portáteis usam senha. Para restaurar o cofre em outra máquina, o envelope cifrado inclui a chave do cofre, além das tabelas e anexos. Essa chave nunca fica solta em um ZIP de código. Perder senha e cópias pode tornar os dados irrecuperáveis.

A versão gera snapshots completos em eventos e na verificação diária, sem política de descarte automático. O desenho do documento pedia incremental diário e completo semanal; a retenção sem exclusão foi preservada, mas o algoritmo incremental ainda não foi implementado. Não confunda “backup diário existente” com essa estratégia completa já pronta.

Para restaurar: pare a Sofia, abra RESTAURAR_MEMORIA.cmd, selecione o arquivo e informe a senha solicitada em campo protegido. O restaurador valida formato, relações, anexos e cofre antes de substituir o banco; salva uma cópia do estado anterior e reinicia as rotas desabilitadas, para não herdar autorização de tráfego sem revisão.

A migração mantém `data/sofia.sqlite.before-v45` como cópia prévia da v44. A reversão guarda o banco v45 completo antes de restaurar o antigo. Essas duas cópias de contingência são arquivos locais, não envelopes cifrados. A memória comum, os metadados, os registros e anexos fora do cofre também não são cifrados no banco de trabalho. Proteja o computador e não envie `data`, `.env` ou a pasta de chaves para terceiros.

## Limites

Sem backup externo automático/Drive nesta etapa. Anexos: 10 MB por arquivo, 50 MB no total, formatos restritos; não se faz OCR, leitura de PDF ou transcrição automaticamente. O teste de restauração foi realizado com dados fictícios em diretório separado; DPAPI e arquivos .cmd precisam da validação no seu Windows.
