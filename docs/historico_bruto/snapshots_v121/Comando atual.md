# Comando atual — Sofia OS v110

## Estado

- Base funcional herdada da v106.
- Preview do sino corrigido para abrir para a esquerda e permanecer inteiro dentro do viewport.
- Hover/foco continuam abrindo a prévia; `Ver todas` abre a central completa.
- Master ativo continua enxuto apenas na área necessária para edição.
- Toda a documentação bruta permanece em `docs/historico_bruto/`.
- Documentação não pode ser apagada como estratégia de simplificação.

## Iniciar

```powershell
Set-Location "$HOME\SOFIA-OS"
& "$HOME\SOFIA-OS\INICIAR_SOFIA.cmd"
```

## Antes de editar

Leia `docs/CONTEXTO_NOVO_CHAT.md`, `docs/GUIA_MASTER_COMPLETO.md`, `docs/MASTER.md` e `docs/UI_MAP.md`.

## Regra de preservação

Nunca apagar documentação histórica/bruta. Simplificar somente a superfície ativa necessária para acelerar edição/manutenção.


## Adendo v109
- simplificar só o necessário;
- nunca apagar documentação histórica/bruta;
- páginas normais e subpáginas devem seguir visual mais limpo, próximo do Notion;
- ações redundantes não devem ficar expostas na tela principal.


## Adendo v110
- manter capa até o topo;
- manter ícones no visual anterior;
- placeholders de blocos vazios aparecem apenas no hover.


## Adendo v117
- corrigido espaçamento entre controles de bloco e texto;
- manter hover discreto estilo Notion.


## v117
- `botão de topo` = botão flutuante `↑ Topo` da página Início;
- ele deve ficar centralizado e um pouco acima da borda inferior;
- não confundir com `Personalizar` e sino de notificações do cabeçalho.


## Adendo v118
- Agenda agora funciona como calendário mensal e Programação.
- Subpáginas continuam recolhidas por padrão ao recarregar/reabrir.
- Faixas do Resumo mantêm largura total com X sobreposto.


## Adendo v121
A Agenda é uma visualização unificada e interativa. Não duplicar tarefas/eventos para exibir no calendário. Alterações feitas no calendário devem persistir na entidade de origem. Futuro Google Calendar deve ser bidirecional por IDs externos e estado de sincronização.
