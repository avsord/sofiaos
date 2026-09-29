# Comando atual — Sofia OS v129

## Estado
- Backend Railway online; painel principal continua somente local.
- `/site`, `/privacy`, `/terms`, `/data-deletion`, `/health`, `/webhook` e `/whatsapp/connect` são rotas públicas controladas.
- A análise do app da Meta já foi enviada para `whatsapp_business_messaging`, `whatsapp_business_management` e `public_profile`.
- A verificação de acesso da Meta exige um site público completo; v129 adiciona a página institucional em `/site`.
- Número escolhido já usa WhatsApp Business; não migrar/desconectar pelo fluxo normal.

## Abrir localmente
```powershell
npm.cmd start
```

## Subir para GitHub/Railway
Na pasta oficial:
```powershell
Set-Location "C:\Users\pedro\OneDrive\Documentos\Sofia_OS_v125\projeto"
git add -- package.json package-lock.json public src tests docs "Comando atual.md" PROMPT_CONTINUAR_SOFIA.md
git commit -m "v129 site publico Meta"
git push
```

## URL para a verificação de acesso da Meta
```text
https://sofiaos.up.railway.app/site
```

## URLs públicas auxiliares
- Política: `https://sofiaos.up.railway.app/privacy`
- Termos: `https://sofiaos.up.railway.app/terms`
- Exclusão de dados: `https://sofiaos.up.railway.app/data-deletion`
- Conexão WhatsApp: `https://sofiaos.up.railway.app/whatsapp/connect`

## Regra do número
Se a Meta pedir para desconectar/migrar o número para fora do WhatsApp Business, não confirmar.
