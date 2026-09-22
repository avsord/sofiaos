# Sofia OS v107 — Correção do preview de notificações

Esta versão parte da v106 e altera somente o necessário para corrigir o painel do sino, preservando integralmente a documentação bruta e o restante do master.

## O que mudou

- o preview do sino agora abre para a **esquerda do botão**, ficando inteiro dentro da tela;
- o painel continua abrindo ao passar o mouse e ao receber foco;
- o estado vazio continua mostrando `Você não tem notificações.` no centro;
- `Ver todas` e o botão de fechar permanecem visíveis no cabeçalho;
- nenhuma documentação histórica foi removida;
- toda a estrutura de `docs/historico_bruto/` da v106 permanece no pacote.

## Aplicar

1. Pare a Sofia com `Ctrl+C`.
2. Execute `ATUALIZAR_SOFIA.cmd` desta pasta.
3. Inicie novamente com:

```powershell
Set-Location "$HOME\SOFIA-OS"
& "$HOME\SOFIA-OS\INICIAR_SOFIA.cmd"
```

4. No navegador, use `Ctrl+F5` uma vez.

## Para continuar em um novo chat

Leia primeiro:
- `projeto/docs/CONTEXTO_NOVO_CHAT.md`
- `projeto/docs/GUIA_MASTER_COMPLETO.md`
- `projeto/docs/MASTER.md`

O histórico bruto continua dentro do próprio pacote.
