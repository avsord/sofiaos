# Sofia OS v106 — Master enxuto com documentação bruta preservada

Esta versão corrige a simplificação excessiva da v104/v105 sem voltar a deixar a área ativa do projeto pesada.

## O que mudou

- o código ativo continua enxuto para facilitar edição;
- toda a documentação bruta disponível da v103 foi reintegrada ao pacote;
- os 57 documentos antigos de `projeto/docs` foram preservados em `projeto/docs/historico_bruto/documentacao_projeto_v103/`;
- documentos de raiz (`LEIA_Vxx`, `Comando atual`, prompt de continuação e PDF) foram preservados em `documentacao_raiz_v103/`;
- testes versionados antigos foram mantidos como histórico fora da suíte ativa;
- snapshots da v104 e v105 foram preservados;
- `docs/CONTEXTO_NOVO_CHAT.md` e `docs/GUIA_MASTER_COMPLETO.md` foram adicionados;
- o atualizador e `tools/simplify-project.cjs` não removem documentação;
- testes legados encontrados na instalação são movidos para o histórico interno do próprio projeto, nunca apagados.

## Aplicar

1. Pare a Sofia com `Ctrl+C`.
2. Execute `ATUALIZAR_SOFIA.cmd` desta pasta.
3. Inicie novamente com:

```powershell
Set-Location "$HOME\SOFIA-OS"
& "$HOME\SOFIA-OS\INICIAR_SOFIA.cmd"
```

4. No navegador, use `Ctrl+F5` uma vez se necessário.

## Para continuar em um novo chat

Envie o ZIP/master e peça para ler primeiro:
- `projeto/docs/CONTEXTO_NOVO_CHAT.md`
- `projeto/docs/GUIA_MASTER_COMPLETO.md`
- `projeto/docs/MASTER.md`

O histórico bruto completo permanece no próprio pacote.
