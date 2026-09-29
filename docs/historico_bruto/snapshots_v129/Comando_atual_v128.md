# Comando atual — Sofia OS v128

## Estado
- Backend Railway online; painel principal continua somente local.
- `/privacy`, `/webhook`, `/health` e `/whatsapp/connect` são as rotas públicas mínimas.
- Número escolhido já usa WhatsApp Business; não migrar/desconectar pelo fluxo normal.
- v127 corrigiu CSP; v128 corrige o callback rejeitado pelo SDK da Meta.

## Abrir localmente
```powershell
npm.cmd start
```

## Subir para GitHub/Railway
Na pasta oficial:
```powershell
Set-Location "C:\Users\pedro\OneDrive\Documentos\Sofia_OS_v125\projeto"
git add -- package.json package-lock.json public src tests docs "Comando atual.md" PROMPT_CONTINUAR_SOFIA.md
git commit -m "v128 corrige callback Meta WhatsApp"
git push
```

## URL de teste
```text
https://sofiaos.up.railway.app/whatsapp/connect
```

## Regra do número
Se a Meta pedir para desconectar/migrar o número para fora do WhatsApp Business, não confirmar.
