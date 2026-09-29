# Comando atual — Sofia OS v130

## Estado
- Backend Railway online.
- O painel principal online agora exige login por senha.
- Acesso sem sessão a `https://sofiaos.up.railway.app` redireciona para `/login`.
- Após senha correta, o login redireciona para `https://sofiaos.up.railway.app` e o painel/API ficam acessíveis na mesma sessão.
- Sessão online usa cookie opaco `HttpOnly`, `Secure`, `SameSite=Lax`, com validade de 12 horas; reiniciar/republicar o servidor invalida sessões existentes.
- A senha não entra no Git/ZIP. Defina `SOFIA_LOGIN_PASSWORD` no Railway (mínimo técnico: 12 caracteres; prefira senha longa e única).
- O acesso local em `localhost` continua funcionando como antes, sem depender do login do Railway.
- `/site`, `/privacy`, `/terms`, `/data-deletion`, `/health`, `/webhook` e `/whatsapp/connect` continuam públicos e controlados para Meta/integração.
- App Review da Meta já foi enviado para `whatsapp_business_messaging`, `whatsapp_business_management` e `public_profile`.
- A verificação de acesso da Meta usa `https://sofiaos.up.railway.app/site` como website institucional.
- Número escolhido já usa WhatsApp Business; não migrar/desconectar pelo fluxo normal.

## Importante sobre contas
A v130 adiciona **um login de proprietário/admin para proteger uma única instalação da Sofia**. Ela NÃO cria contas separadas para vários clientes e NÃO isola dados por usuário. O armazenamento atual continua single-owner (`owner-local`). Antes de permitir múltiplas pessoas independentes, é obrigatório implementar autenticação multiusuário, autorização e isolamento de dados.

## Configurar a senha no Railway
No serviço da Sofia: `Variables` → `New Variable`:

```text
SOFIA_LOGIN_PASSWORD=<uma senha longa e única, com pelo menos 12 caracteres>
```

Depois aguarde o redeploy. Não escreva essa senha em arquivos versionados ou no chat.

## Abrir online
```text
https://sofiaos.up.railway.app
```
Sem sessão, abre `/login`. Depois do login, volta para `/`.

## Abrir localmente
```powershell
npm.cmd start
```

## Subir para GitHub/Railway
Na pasta oficial:
```powershell
Set-Location "C:\Users\pedro\OneDrive\Documentos\Sofia_OS_v125\projeto"
git add -- package.json package-lock.json public src tests docs "Comando atual.md" PROMPT_CONTINUAR_SOFIA.md
git commit -m "v130 login painel Railway"
git push
```

## URL para a verificação de acesso da Meta
```text
https://sofiaos.up.railway.app/site
```

## URLs públicas auxiliares
- Login do painel: `https://sofiaos.up.railway.app/login`
- Site institucional: `https://sofiaos.up.railway.app/site`
- Política: `https://sofiaos.up.railway.app/privacy`
- Termos: `https://sofiaos.up.railway.app/terms`
- Exclusão de dados: `https://sofiaos.up.railway.app/data-deletion`
- Conexão WhatsApp: `https://sofiaos.up.railway.app/whatsapp/connect`

## Regra do número
Se a Meta pedir para desconectar/migrar o número para fora do WhatsApp Business, não confirmar.

### v131 — conta e login
- painel online deve ter menu de conta no rodapé, botão **Sair**, card de sessão e opção de encerrar todas as sessões;
- ao expirar a sessão, o painel volta ao login automaticamente;
- login deve seguir convenções normais de UX: mostrar/ocultar senha, Caps Lock, erro claro, logout/expiração confirmados e links legais;
- não transformar o login single-owner em cadastro multiusuário fictício antes de existir isolamento real de contas/dados.
