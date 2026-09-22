# Sofia OS v51 — Filtros Profissionais

## Objetivo
A v51 transforma a configuração dos dois projetos OpenAI em um fluxo verificável dentro da própria Sofia, sem pedir que o usuário edite `.env` manualmente e sem misturar as chaves.

## Arquitetura
- **Filtro Compartilhado**: projeto explicitamente selecionado em `Share inputs and outputs with OpenAI` para conteúdo geral autorizado e eventual elegibilidade a incentivos da OpenAI.
- **Filtro Privado**: projeto que ficou fora dessa seleção. A chamada continua saindo do computador para a API; “Privado” não significa local/offline nem zero retenção.
- As duas rotas usam chaves de projeto distintas.
- A Sofia não consegue verificar programaticamente a opção `Sharing`; por isso a confirmação dessa política é manual.

## Validação da chave
Ao salvar uma chave pela interface, a v51 primeiro faz uma requisição autenticada a `/v1/models`.
- Nenhuma conversa, memória ou contexto é enviado nesse teste.
- HTTP 200: a chave é persistida no `.env` local.
- HTTP 401/403/erro de rede: a chave nova não é persistida.
- A chave nunca volta para o navegador nem para o diagnóstico.

## Custos
Tarifas em USD são opcionais na v51. Se informadas junto com tetos diário/mensal, a Sofia faz reserva local conservadora e bloqueia chamadas que excederiam esses tetos.
Sem tarifas, a rota continua sujeita ao limite local de chamadas e à saída máxima, mas a Sofia não afirma conhecer o custo em dólar.

## IA Primeiro
A v51 preserva o motor da v50:
1. barreira local apenas para segredos inequívocos;
2. IA interpreta a intenção primeiro pela rota privada de interpretação;
3. se houver ambiguidade, pergunta e oferece botões;
4. depois da resposta, IA produz plano estruturado;
5. backend valida e executa.

## Instalação
O atualizador preserva `.env`, memória, dados, backups, exports e `node_modules`. Arquivos do projeto modificados recebem backup antes da substituição. `INICIAR_SOFIA.cmd` local é preservado quando divergir.
