# Sofia OS v104 — Master simplificado

Esta passa a ser a base recomendada para as próximas alterações.

## Iniciar a Sofia
No PowerShell/terminal do VS Code:

```powershell
Set-Location "$HOME\SOFIA-OS"
& "$HOME\SOFIA-OS\INICIAR_SOFIA.cmd"
```

## Aplicar esta versão
1. Pare a Sofia com `Ctrl+C`.
2. Execute `ATUALIZAR_SOFIA.cmd` desta pasta.
3. Inicie novamente com o comando acima.
4. No navegador, use `Ctrl+F5` uma vez.

## O que foi simplificado
- histórico de documentação por versão removido do master;
- testes antigos `vXX.test.cjs` removidos do master;
- dados e backups locais não são transportados dentro deste pacote de código; a instalação existente é preservada;
- documentação atual consolidada em poucos arquivos;
- nova camada `public/ui-current.css` para ajustes visuais rápidos sem mexer no CSS histórico grande;
- o atualizador arquiva documentação/testes antigos da instalação em vez de apagá-los.

A memória, o `.env`, credenciais e o banco atual continuam protegidos durante a atualização.
