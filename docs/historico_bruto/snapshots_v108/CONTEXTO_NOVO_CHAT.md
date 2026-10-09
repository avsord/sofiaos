# CONTEXTO PARA NOVO CHAT — Sofia OS v108

Este arquivo existe para impedir perda de contexto ao continuar a Sofia OS em outro chat.

## Ordem de leitura recomendada

1. `docs/GUIA_MASTER_COMPLETO.md` — regras de trabalho, arquitetura e padrão de entrega.
2. `docs/MASTER.md` — mapa do estado atual e caminhos principais.
3. `docs/UI_MAP.md` — mapa rápido dos pontos de interface mais editados.
4. `Comando atual.md` — resumo corrente da versão e decisões recentes.
5. `docs/historico_bruto/README.md` — índice do histórico bruto preservado.

## Regra mais importante

A partir da v106, o projeto pode ser simplificado apenas na **área ativa** para acelerar edição, testes e manutenção. O histórico documental não deve ser apagado. Documentos antigos e testes históricos que ajudem a explicar decisões devem permanecer dentro do pacote em `docs/historico_bruto/`.

## O que foi recuperado

O histórico bruto da v103 foi reintegrado, incluindo:
- 57 documentos de arquitetura/checkpoints/correções em `projeto/docs` da época;
- 34 documentos de raiz da versão, incluindo `LEIA_Vxx`, `Comando atual.md`, `PROMPT_CONTINUAR_SOFIA.md` e o PDF de continuação;
- testes versionados antigos como material histórico, fora da suíte ativa;
- snapshots dos documentos de master simplificado da v104 e v105.

## Estado atual

Versão atual: **v108**.
Base funcional: v106, com documentação bruta preservada. Na v108, o preview do sino foi corrigido para abrir para a esquerda e não ser cortado na borda direita; hover/foco continuam ativos.

Comando oficial para iniciar:

```powershell
Set-Location "$HOME\SOFIA-OS"
& "$HOME\SOFIA-OS\INICIAR_SOFIA.cmd"
```

## Para o próximo chat

Não trate `docs/historico_bruto/` como lixo ou arquivos descartáveis. Eles são a memória documental do desenvolvimento. Use `MASTER.md` para chegar rápido ao código atual e procure o histórico bruto quando precisar entender requisitos, regressões, decisões antigas ou comportamento de versões anteriores.
