# Comando atual — Sofia OS v127

## Estado
- Backend Railway online e `/health` público.
- `/privacy` e `/webhook` públicos; painel privado não foi aberto para a internet.
- Meta webhook verificado e `messages` assinado.
- Número escolhido já usa WhatsApp Business; não migrar/desconectar pelo fluxo normal.
- Próximo fluxo: **Conectar WhatsApp Business** por Embedded Signup/coexistência e voltar ao App Review.

## Abrir localmente
```powershell
npm.cmd start
```

## Depois de atualizar código e enviar ao GitHub
```powershell
git add .; git commit -m "Sofia OS v127 - corrige CSP Meta"; git push
```

## Variáveis públicas/configuráveis no Railway
```text
META_APP_ID=1617872666710770
META_LOGIN_CONFIG_ID=1590251151959449
META_GRAPH_VERSION=v26.0
PUBLIC_BASE_URL=https://sofiaos.up.railway.app
WHATSAPP_VERIFY_TOKEN=<defina no Railway/.env>
```

## Segredos (não colocar no Git)
```text
META_APP_SECRET=<somente Railway/.env>
WHATSAPP_ACCESS_TOKEN=<somente Railway/.env>
WHATSAPP_PHONE_NUMBER_ID=<somente Railway/.env>
```

## URL para gravar o fluxo de coexistência
```text
https://sofiaos.up.railway.app/whatsapp/connect
```


## v127
Correção direta do bloqueio CSP observado no Console do Edge. Depois da atualização: `git add` apenas os arquivos versionados da v127, commit/push e testar `/whatsapp/connect` no Railway.
