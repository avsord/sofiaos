# Abrir a Sofia ao público — "tomada pronta"

Hoje a Sofia é de um dono só. Nada aqui está ligado; é o que já fica preparado para ligar na hora certa.

## Google (Agenda, Drive e Gmail)
- Agenda e Drive usam `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET`.
- O Gmail de cada conta de e-mail (Entrar com Google) usa `GOOGLE_MAIL_CLIENT_ID` / `GOOGLE_MAIL_CLIENT_SECRET`
  quando existirem; sem eles, usa o mesmo projeto da Agenda (como hoje). Isso permite ter um projeto Google
  separado e verificado só para o Gmail, trocando apenas a configuração do servidor.
- Cada função pede só a permissão dela: o Gmail pede apenas `openid email gmail.readonly` (nada de Agenda/Drive).
- Para o público: `gmail.readonly` é uma permissão restrita. O Google exige verificação do app e uma avaliação de
  segurança (CASA) antes de liberar para mais de 100 pessoas. Até lá, o app em modo de teste aceita só os
  e-mails cadastrados em "Usuários de teste" na tela de consentimento OAuth.
- Endereço de retorno usado por tudo: `<PUBLIC_BASE_URL>/google/oauth/callback` (cadastrar no projeto Google).

## Dados por dono
- O banco já grava `owner` nas tabelas principais; as partes novas devem gravar dados por dono desde o início.
- Antes de abrir: contas de pessoa (cadastro, convite, recuperação), separar as chaves e os backups por dono.

## Login
- Segundo passo no site (código no e-mail em navegador novo) já existe e vale para qualquer dono com e-mail configurado.
