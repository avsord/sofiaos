# ESTADO VIVO — Sofia OS

Snapshot gerado em 2026-10-18T00:35:03.013Z a partir de `8a8df6c` na `sofia-app-android`.
Este arquivo é atualizado por push/release; a conclusão posterior de uma execução pode exigir consulta ao GitHub. Decisões humanas ficam em `docs/SOFIA_MASTER.md`.

## Alertas

- ⚠ MASTER não foi atualizado há 20 commit(s) de app/backend (último toque: 2026-10-16).
- ⚠ Diário do MASTER parou na 0.3.149, mas o código está na 0.3.167.

**Com ⚠ de MASTER:** conferir commits e PRs e atualizar as seções 9 e 10 antes de confiar na narrativa.

## Versões

- Código: **0.3.167** (versionCode 172)
- Atualizador oferece: **0.3.57** (publicada 2026-10-08T14:22:31Z)
- Há código **não publicado**; isto NÃO garante que exista um APK compilado/aprovado.

## Últimos commits

- `8a8df6c` 2026-10-17 fix(ui): teclado nao cobre mais os campos das folhas no Android, 0.3.167 code 172 [manual-apk]
- `47f34c1` 2026-10-17 feat(financas): parcelas ao editar e no passo a passo, com a parcela atual para contas ja em andamento, 0.3.166 code 171 [manual-apk]
- `ec73d3a` 2026-10-17 feat(financas): contas fixas com prazo em parcelas, contagem do que falta e aviso de termino, 0.3.165 code 170 [manual-apk]
- `0d5ad72` 2026-10-17 feat(financas): mascara de banco nos campos de dinheiro (ponto e virgula automaticos, digitos pela direita), 0.3.164 code 169 [manual-apk]
- `be1068c` 2026-10-17 fix(financas): digitar no fim de um valor com centavos entra pela direita (antes nao digitava nada), 0.3.163 code 168 [manual-apk]
- `7b3aa3e` 2026-10-17 feat(financas): corrigir ou apagar movimento da reserva, com guardado e aporte recalculados, 0.3.162 code 167 [manual-apk]
- `eed8092` 2026-10-17 feat(financas): ciclo do recebimento, contas fixas, Saldo do ciclo, meta do guardado, Sofia respondendo e registrando, configuracao em 7 passos, 0.3.161 code 166 [manual-apk]
- `cc5a1ac` 2026-10-17 feat(financas): historico da reserva, uma hora no aporte, evolucao do guardado nos relatorios, filtros por categorias ja usadas, sem analise da Sofia, 0.3.160 code 165 [manual-apk]
- `c6ec7fe` 2026-10-17 feat(financas): aportes do guardado com dia, hora e lembretes, retirada a recompor ou planejada, faixa com resumo curto, 0.3.159 code 164 [manual-apk]
- `13bd0c1` 2026-10-17 build: prepare validated Android 0.3.158
- `df2d5aa` 2026-10-17 fix(ci): build procura os arquivos do S e a abertura do sistema comeca na mesma escala da animacao, 0.3.158 code 163 [manual-apk]
- `b3fa1f8` 2026-10-17 build: prepare validated Android 0.3.157
- `2dd175a` 2026-10-17 feat: volta o S da marca em tudo (icone, abertura, login, chat e site), 0.3.157 code 162 [manual-apk]
- `4d93977` 2026-10-17 feat(financas): respiro padronizado na tela (margens, espaco entre blocos e dentro dos cartoes), 0.3.156 code 161 [manual-apk]
- `66e27da` 2026-10-17 feat(financas): reserva so com aportes (sem meta mensal nem 'faltam no mes'), 0.3.155 code 160 [manual-apk]

## Últimas execuções do workflow de APK

- pending · `8a8df6c` · fix(ui): teclado nao cobre mais os campos das folhas no Android, 0.3.… · https://github.com/avsord/sofiaos/actions/runs/39083283627
- in_progress · `ec73d3a` · feat(financas): contas fixas com prazo em parcelas, contagem do que f… · https://github.com/avsord/sofiaos/actions/runs/39082851756
- completed/failure · `0d5ad72` · feat(financas): mascara de banco nos campos de dinheiro (ponto e virg… · https://github.com/avsord/sofiaos/actions/runs/39079922021
- completed/failure · `7b3aa3e` · feat(financas): corrigir ou apagar movimento da reserva, com guardado… · https://github.com/avsord/sofiaos/actions/runs/39078396968
- completed/failure · `c6ec7fe` · feat(financas): aportes do guardado com dia, hora e lembretes, retira… · https://github.com/avsord/sofiaos/actions/runs/39053908960
- completed/failure · `df2d5aa` · fix(ci): build procura os arquivos do S e a abertura do sistema comec… · https://github.com/avsord/sofiaos/actions/runs/39038736897

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
  - 8a8df6c fix(ui): teclado nao cobre mais os campos das folhas no Android, 0.3.167 code 172 [manual-apk]
  - 47f34c1 feat(financas): parcelas ao editar e no passo a passo, com a parcela atual para contas ja em andamento, 0.3.166 code 171 [manual-apk]
  - ec73d3a feat(financas): contas fixas com prazo em parcelas, contagem do que falta e aviso de termino, 0.3.165 code 170 [manual-apk]
  - 0d5ad72 feat(financas): mascara de banco nos campos de dinheiro (ponto e virgula automaticos, digitos pela direita), 0.3.164 code 169 [manual-apk]
  - be1068c fix(financas): digitar no fim de um valor com centavos entra pela direita (antes nao digitava nada), 0.3.163 code 168 [manual-apk]
  - 7b3aa3e feat(financas): corrigir ou apagar movimento da reserva, com guardado e aporte recalculados, 0.3.162 code 167 [manual-apk]
  - eed8092 feat(financas): ciclo do recebimento, contas fixas, Saldo do ciclo, meta do guardado, Sofia respondendo e registrando, configuracao em 7 passos, 0.3.161 code 166 [manual-apk]
  - cc5a1ac feat(financas): historico da reserva, uma hora no aporte, evolucao do guardado nos relatorios, filtros por categorias ja usadas, sem analise da Sofia, 0.3.160 code 165 [manual-apk]
  - c6ec7fe feat(financas): aportes do guardado com dia, hora e lembretes, retirada a recompor ou planejada, faixa com resumo curto, 0.3.159 code 164 [manual-apk]
  - 13bd0c1 build: prepare validated Android 0.3.158
