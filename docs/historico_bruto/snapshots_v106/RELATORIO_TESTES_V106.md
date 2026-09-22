# Relatório de testes — Sofia OS v106

## Escopo

Versão: v106 — Master enxuto com documentação bruta preservada.

Alteração principal: manter a área ativa simples para edição rápida sem apagar ou retirar do pacote a documentação histórica/bruta.

## Validações realizadas

- suíte ativa completa via `npm test`;
- identidade/cache atualizados para v106;
- regressão visual de Início/Resumo;
- regressão do hover/foco do sino de notificações;
- presença e indexação do histórico bruto;
- regra da ferramenta de simplificação para não remover documentação;
- validação integral do manifesto v106;
- comparação SHA-256 dos arquivos históricos recuperados contra a v103;
- simulação de atualização v105 -> v106;
- preservação de `.env` e `data/` durante atualização;
- documento legado local mantido no lugar;
- teste legado local movido para histórico interno do próprio projeto;
- rollback da atualização com preservação de `.env` e `data/`.

## Resultado

- Testes ativos: 80
- Aprovados: 80
- Falhas: 0
- Arquivos históricos comparados byte a byte com a v103: 146
- Divergências encontradas: 0
- Arquivos cobertos pelo manifesto final: 236
- Simulação de atualização: aprovada
- Simulação de rollback: aprovada
- Preservação de dados protegidos: aprovada
- Preservação de documentação legada: aprovada

## Histórico recuperado

- 57 arquivos de documentação que existiam em `projeto/docs` na v103;
- 34 documentos de raiz da v103;
- 55 testes versionados legados preservados como material histórico;
- snapshots de documentação da v104, v105 e v106.

## Limitações

Não foram usados serviços externos nem credenciais reais neste ciclo, pois a alteração é de organização/documentação e preservação do pacote. O teste de atualização foi realizado em uma cópia temporária da base v105, não na instalação real do usuário.
