# Comando atual — Sofia OS v133

## Estado
- Backend Railway online.
- O painel principal online exige login por e-mail e senha.
- Acesso sem sessão a `https://sofiaos.up.railway.app` redireciona para `/login`.
- Após e-mail e senha corretos, o login redireciona para `https://sofiaos.up.railway.app` e o painel/API ficam acessíveis na mesma sessão.
- Sessão online usa cookie opaco `HttpOnly`, `Secure`, `SameSite=Lax`, com validade de 12 horas; reiniciar/republicar o servidor invalida sessões existentes.
- A senha não entra no Git/ZIP. Defina `SOFIA_LOGIN_PASSWORD` no Railway (mínimo técnico: 12 caracteres; prefira senha longa e única).
- O acesso local em `localhost` continua funcionando como antes, sem depender do login do Railway.
- `/site`, `/privacy`, `/terms`, `/data-deletion`, `/health`, `/webhook` e `/whatsapp/connect` continuam públicos e controlados para Meta/integração.
- App Review da Meta já foi enviado para `whatsapp_business_messaging`, `whatsapp_business_management` e `public_profile`.
- A verificação de acesso da Meta usa `https://sofiaos.up.railway.app/site` como website institucional.
- Número escolhido já usa WhatsApp Business; não migrar/desconectar pelo fluxo normal.

## Importante sobre contas
A v130 adiciona **um login de proprietário/admin para proteger uma única instalação da Sofia**. Ela NÃO cria contas separadas para vários clientes e NÃO isola dados por usuário. O armazenamento atual continua single-owner (`owner-local`). Antes de permitir múltiplas pessoas independentes, é obrigatório implementar autenticação multiusuário, autorização e isolamento de dados.

## Configurar login e recuperação no Railway
No serviço da Sofia: `Variables` → `New Variable`:

```text
SOFIA_LOGIN_EMAIL=<e-mail usado para entrar>
SOFIA_LOGIN_PASSWORD=<uma senha longa e única, com pelo menos 12 caracteres>
SOFIA_SMTP_USER=<e-mail que enviará a recuperação>
SOFIA_SMTP_PASS=<senha de app do provedor de e-mail>
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
git commit -m "v133 login email e recuperacao"
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

### v132 — conta e login
- painel online deve ter menu de conta no rodapé, botão **Sair**, card de sessão e opção de encerrar todas as sessões;
- ao expirar a sessão, o painel volta ao login automaticamente;
- login deve seguir convenções normais de UX: mostrar/ocultar senha, Caps Lock, erro claro, logout/expiração confirmados e links legais;
- não transformar o login single-owner em cadastro multiusuário fictício antes de existir isolamento real de contas/dados.


[v132] Perfil de usuário do proprietário: Pedro Silva, e-mail editável, menu de conta convencional e fechamento ao clicar fora/Esc.


## v133 — e-mail de login e recuperação
- Nome de login: o e-mail cadastrado no perfil. Na primeira configuração online, inicializar por `SOFIA_LOGIN_EMAIL`.
- `Esqueceu a senha?` envia um link de redefinição para o e-mail cadastrado.
- A recuperação precisa de SMTP seguro no Railway. Para Gmail, manter host padrão `smtp.gmail.com`/porta `465` e configurar:
```text
SOFIA_SMTP_USER=<seu e-mail SMTP>
SOFIA_SMTP_PASS=<senha de app do Gmail; nunca a senha normal da conta>
```
Opcional: `SOFIA_SMTP_FROM`.
- Senhas redefinidas ficam somente como hash scrypt em `data/owner-auth.json`; o arquivo é preservado por atualização.
- Alterar o e-mail em Meu perfil muda o nome de login e o destino das próximas recuperações.
- Alterar ou redefinir senha encerra todas as sessões.

## v134 — correção do rodapé da sidebar
- Card de perfil não pode invadir/cair sob a scrollbar lateral.
- Nome permanece compacto; e-mail deve ficar legível sem corte abrupto.
- Menu da conta deve abrir como overlay acima da interface, sem clipping pelo container rolável.
- Clique fora, `Esc`, scroll da sidebar ou seleção de item fecham o menu.


## v138 — aplicativo Android e mesma base

Login nativo por e-mail e senha, sessão Bearer com hash e expiração, mensagens e áudios no mesmo SofiaCore. A API do app expõe somente operações de usuário autenticadas, reutilizando o catálogo e as mesmas operações do site. Sessões web e nativas são revogadas juntas ao trocar a senha ou sair de todos os dispositivos. O diário mantém autenticação adicional e criptografia, separado da memória comum. Nenhuma dependência da aprovação Meta para conversar no app. Não significa que o WhatsApp esteja ativado ou que as conversas de outros contatos possam usar a memória privada do proprietário.

Base desta integração no GitHub: v134; documentos anteriores preservados em snapshots_v138. Não altera .env, senhas, diretórios existentes de dados ou backups. Publicar em produção somente depois dos testes e da conferência de persistência/backup. APK compilado não comprova a credencial real da IA nem equivalência a todos os gestos avançados do editor desktop.
