# ESTADO VIVO — Sofia OS

Snapshot gerado em 2026-10-21T23:03:55.161Z a partir de `e96154c` na `sofia-app-android`.
Este arquivo é atualizado por push/release; a conclusão posterior de uma execução pode exigir consulta ao GitHub. Decisões humanas ficam em `docs/SOFIA_MASTER.md`.

## Alertas

- ⚠ MASTER não foi atualizado há 73 commit(s) de app/backend (último toque: 2026-10-16).
- ⚠ Diário do MASTER parou na 0.3.149, mas o código está na 0.3.224.

**Com ⚠ de MASTER:** conferir commits e PRs e atualizar as seções 9 e 10 antes de confiar na narrativa.

## Versões

- Código: **0.3.224** (versionCode 229)
- Atualizador oferece: **0.3.57** (publicada 2026-10-08T14:22:31Z)
- Há código **não publicado**; isto NÃO garante que exista um APK compilado/aprovado.

## Últimos commits

- `e96154c` 2026-10-21 build: nova tentativa de gerar o APK da 0.3.224 (mesmo codigo; #200 parou no Gradle), 0.3.224 code 229 rebuild [manual-apk]
- `9cfcd6e` 2026-10-21 fix(cartoes): limite pelo que esta no cartao sem pagar (parcelas futuras inclusas), fatura fechada e paga nao reabre; Apps em Financas volta ao Resumo/topo antes de sair, 0.3.224 code 229 [manual-apk]
- `8f30fd9` 2026-10-21 fix: fatura pelo mes do topo, conta do mes na fatura do mes, compra apos fechamento no mes seguinte, cartao grava de primeira, previsto pelo total de Contas, controle sem piscar, apps suaves e destaque, widget abre o app, capsulas acumulam, Inicio ao topo, emoji da regra, 0.3.223 code 228 [manual-apk]
- `5e297d4` 2026-10-21 fix: segurar app na hora e destaque com cor, extrato do saldo como extrato de banco, cartao grava de primeira, fatura pelo fechamento e Paguei na conta do cartao, usar conta existente, regra de e-mail e emoji por e-mail, 0.3.222 code 227 [manual-apk]
- `35cda3c` 2026-10-21 fix(financas): saldo nao conta duas vezes (acumulado x lista), mudancas no saldo, contas do cartao pagas pela fatura, fatura do mes do calendario, toque garantido; apps sem tela cinza e soltar na hora, 0.3.221 code 226 [manual-apk]
- `349a200` 2026-10-21 fix: previsto so com aportes futuros, descricao nos itens, Biblioteca sem fotos da conversa, apagar regra de e-mail, apps sem animacao ao abrir, 0.3.220 code 225 [manual-apk]
- `fd197d3` 2026-10-21 fix: Contas so programadas e avulsas no extrato, fixas em qualquer mes, copias identicas somem, tarefas como antes, 0.3.219 code 224 [manual-apk]
- `86e2e79` 2026-10-21 fix: segurar widget sem abrir a tela, meta removivel, arrastar app sem trocar de tela, seletor largo, menos espaco, relatorios, fixas repetidas, salvar com servidor atrasado, 0.3.216 code 221 [manual-apk]
- `f7092bf` 2026-10-21 feat(financas): previsto ate a vespera do salario, horario, extrato so guardado, contas no cartao, relatorios em secoes; apps arrastaveis e Inicio organizavel, 0.3.215 code 220 [manual-apk]
- `bc3c66f` 2026-10-20 feat(financas): historico no Resumo, ajustar saldo (inicio do mes e atual), controle de gastos pelo saldo, receita dividida entre saldo e guardado, 0.3.214 code 219 [manual-apk]
- `d961d97` 2026-10-20 feat(financas): reestruturacao - abas por funcao, Lancamentos com Extrato do banco (conciliacao, nao vira lancamento), + unificado, 0.3.213 code 218 [manual-apk]
- `c76caa3` 2026-10-20 feat(financas): zerar Financas, Sofia cadastra prints com varias contas, previsto/controle pelo mes, limpeza da engrenagem, 0.3.212 code 217 [manual-apk]
- `3b0d369` 2026-10-20 feat(financas): desfazer importacao de extrato e conferencia do saldo item por item, 0.3.211 code 216 [manual-apk]
- `7ca1dea` 2026-10-20 fix(financas): botao Importar sempre visivel no extrato, marcar/desmarcar todos, 0.3.210 code 215 [manual-apk]
- `8542c26` 2026-10-20 feat(financas): importar extrato sem duplicar o que ja esta no app nem o que e de antes do ponto de partida, descricao e categoria legiveis, 0.3.209 code 214 [manual-apk]

## Últimas execuções do workflow de APK

- in_progress · `e96154c` · build: nova tentativa de gerar o APK da 0.3.224 (mesmo codigo; #200 p… · https://github.com/avsord/sofiaos/actions/runs/39690884546
- completed/failure · `9cfcd6e` · fix(cartoes): limite pelo que esta no cartao sem pagar (parcelas futu… · https://github.com/avsord/sofiaos/actions/runs/39676452130
- completed/failure · `8f30fd9` · fix: fatura pelo mes do topo, conta do mes na fatura do mes, compra a… · https://github.com/avsord/sofiaos/actions/runs/39668040362
- completed/failure · `5e297d4` · fix: segurar app na hora e destaque com cor, extrato do saldo como ex… · https://github.com/avsord/sofiaos/actions/runs/39651875331
- completed/failure · `35cda3c` · fix(financas): saldo nao conta duas vezes (acumulado x lista), mudanc… · https://github.com/avsord/sofiaos/actions/runs/39639349904
- completed/failure · `349a200` · fix: previsto so com aportes futuros, descricao nos itens, Biblioteca… · https://github.com/avsord/sofiaos/actions/runs/39627195469

O status do build pode mudar depois deste snapshot; conferir execução ao vivo antes de aprovar.

## PRs integrados recentemente

- #21 Sofia OS 0.3.150 — contas selecionáveis, pendências manuais e extrato no resumo (integrado 2026-10-16)
- #19 Sofia OS 0.3.111 — listas virtualizadas e correção direta dos primeiros toques [manual-apk] (integrado 2026-10-11)
- #18 fix(android): R7.1 prazos do agendador e medição real da espera por Páginas (integrado 2026-10-10)
- #17 Sofia R7: agendador central, Activity ocultas e comparação Novo/Antigo [manual-apk] (integrado 2026-10-10)
- #16 docs: registrar validação da Rodada 5 sem gerar APK (integrado 2026-10-10)
- #15 fix(android): menus aquecidos após Home sem aguardar histórico (R5) (integrado 2026-10-10)
- #14 docs: instalar SOFIA KEY e Estado Vivo automático sem gerar APK (integrado 2026-10-10)
- #13 docs: MASTER permanente, prompt fixo e aprovação obrigatória (integrado 2026-10-10)

## Frescor do MASTER

- Última edição do MASTER: `c567bfc` em 2026-10-16.
- Commits com código alterado desde o MASTER:
  - 9cfcd6e fix(cartoes): limite pelo que esta no cartao sem pagar (parcelas futuras inclusas), fatura fechada e paga nao reabre; Apps em Financas volta ao Resumo/topo antes de sair, 0.3.224 code 229 [manual-apk]
  - 8f30fd9 fix: fatura pelo mes do topo, conta do mes na fatura do mes, compra apos fechamento no mes seguinte, cartao grava de primeira, previsto pelo total de Contas, controle sem piscar, apps suaves e destaque, widget abre o app, capsulas acumulam, Inicio ao topo, emoji da regra, 0.3.223 code 228 [manual-apk]
  - 5e297d4 fix: segurar app na hora e destaque com cor, extrato do saldo como extrato de banco, cartao grava de primeira, fatura pelo fechamento e Paguei na conta do cartao, usar conta existente, regra de e-mail e emoji por e-mail, 0.3.222 code 227 [manual-apk]
  - 35cda3c fix(financas): saldo nao conta duas vezes (acumulado x lista), mudancas no saldo, contas do cartao pagas pela fatura, fatura do mes do calendario, toque garantido; apps sem tela cinza e soltar na hora, 0.3.221 code 226 [manual-apk]
  - 349a200 fix: previsto so com aportes futuros, descricao nos itens, Biblioteca sem fotos da conversa, apagar regra de e-mail, apps sem animacao ao abrir, 0.3.220 code 225 [manual-apk]
  - fd197d3 fix: Contas so programadas e avulsas no extrato, fixas em qualquer mes, copias identicas somem, tarefas como antes, 0.3.219 code 224 [manual-apk]
  - 86e2e79 fix: segurar widget sem abrir a tela, meta removivel, arrastar app sem trocar de tela, seletor largo, menos espaco, relatorios, fixas repetidas, salvar com servidor atrasado, 0.3.216 code 221 [manual-apk]
  - f7092bf feat(financas): previsto ate a vespera do salario, horario, extrato so guardado, contas no cartao, relatorios em secoes; apps arrastaveis e Inicio organizavel, 0.3.215 code 220 [manual-apk]
  - bc3c66f feat(financas): historico no Resumo, ajustar saldo (inicio do mes e atual), controle de gastos pelo saldo, receita dividida entre saldo e guardado, 0.3.214 code 219 [manual-apk]
  - d961d97 feat(financas): reestruturacao - abas por funcao, Lancamentos com Extrato do banco (conciliacao, nao vira lancamento), + unificado, 0.3.213 code 218 [manual-apk]
