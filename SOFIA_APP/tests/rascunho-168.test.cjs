'use strict';
// 0.3.168: sair do app no meio do preenchimento nao perde o que foi digitado.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('o rascunho e gravado com atraso, so depois de carregar, e apagado quando o campo esvazia',()=>{
  const s=read('src/lib/form-draft.ts');
  assert.ok(s.includes("const PREFIX = 'sofia.form.draft.v1:'"));
  assert.ok(s.includes('if (!ready || !enabled) return;'),'nao apaga o rascunho antes de ler');
  assert.ok(s.includes('setTimeout(() => { void (empty ? clearFormDraft(key) : writeFormDraft(key, value)); }, 400)'));
  assert.ok(s.includes('catch { return null; }'),'falha de disco nao quebra o formulario');
});
test('conta a pagar, reserva e configuracao restauram e limpam o rascunho ao salvar',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("const draftKey='bill:'+(tx?.id||'novo:'+initialFlow);"));
  assert.ok(s.includes('await clearDraft();'),'conta a pagar limpa ao salvar');
  assert.ok(s.includes("useFormDraft('reserve:' + kind + ':' + (reserve?.id || 'novo')"));
  assert.ok(s.includes('await clearReserveDraft();'));
  assert.ok(s.includes("useFormDraft('financas:setup:' + (acc?.id || 'novo')"));
  assert.ok(s.includes('await clearWizardDraft();'));
  assert.ok(s.includes('if (d.step) setStep('),'volta no mesmo passo da configuracao');
});

test('0.3.169: no passo a passo, tocar numa conta fixa abre para editar (sem remover e criar de novo)',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("accessibilityLabel={'Editar ' + b.title}"));
  assert.ok(s.includes("billEditing === null ? 'Adicionar conta fixa' : 'Salvar alteração'"));
  assert.ok(s.includes('list.map((b, n) => n === billEditing ? item : b)'),'substitui no lugar');
  assert.ok(s.includes('Cancelar a edição'));
  assert.ok(s.includes('Toque em uma conta para corrigir os dados dela.'));
  // a conta meio preenchida tambem entra no rascunho
  assert.ok(s.includes('billTitle, billAmount, billDay, billParcels, billAt};'));
});

test('0.3.171: meta com dia, mes e ano pelo seletor de data',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('<DateTimeField label="Até" value={goalMonth} onChange={setGoalMonth} dateOnly emptyLabel="Escolher data" />'));
  assert.ok(!s.includes("'Até (AAAA-MM)'")&&!s.includes('label="Até (AAAA-MM)"'),'saiu o campo de texto');
  assert.ok(s.includes('test(goalMonth) ? goalMonth : '),'data completa');
});
test('0.3.171: refazer a configuracao mostra o que existe e so substitui ao confirmar no fim',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("fixed: d.txs.filter(t => t.manualDue && t.recurrence === 'monthly' && !t.virtual"),'contas fixas atuais entram na lista');
  assert.ok(s.includes("appAlert('Substituir a configuração atual?'"),'confirmacao antes de alterar');
  assert.ok(s.includes("existing ? 'Substituir configuração' : 'Começar a usar'"));
  assert.ok(s.includes('Nada foi alterado ainda.'));
  assert.ok(s.includes("jobs.push(api.saveEntity({...old.entity, state: 'archived'}))"),'removidas sao arquivadas, nao apagadas');
  assert.ok(s.includes('if (previous && previous.entity) {'),'as que ficaram sao atualizadas, sem duplicar');
});

test('0.3.172: datas e horas de registros ja criados tambem pelo seletor, nada digitado',()=>{
  const fin=read('src/screens/Finance.tsx'),mail=read('src/screens/Mail.tsx'),ws=read('src/screens/Workspace.tsx');
  assert.ok(!/AAAA-MM-DD\)/.test(fin)&&!/AAAA-MM-DD\)/.test(mail),'sem campo de data digitada');
  assert.ok(mail.includes('<DateTimeField label="Vencimento" value={due}'));
  assert.ok(ws.includes("if(field.type==='time')return <DateTimeField"),'hora nos apps pelo seletor');
});

test('0.3.173: depois da configuracao, a meta se edita direto (com seletor de data)',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("['Editar aportes', 'plan'], ['Editar meta', 'goal']"));
  assert.ok(s.includes("kind === 'goal' ? 'Meta'"));
  assert.ok(s.includes('accessibilityLabel="Editar meta" onPress={() => { setReserveMenu(false); afterSheet(() => setReserveSheet(\'goal\')); }}'),'tocar no quadro da meta abre a edicao');
  assert.ok(s.includes('+ Definir uma meta (quanto e até quando)'));
  assert.ok(s.includes('Tirar a meta'));
  assert.ok(s.includes("} else if ((kind === 'plan' || kind === 'goal' || kind === 'adjust') && reserve) {"),'salva como a edicao dos aportes');
});

test('0.3.174: concluir os passos leva ao Resumo de Financas',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("const goHome = useCallback(() => { setManage(false); setEditing(null); setBillEditor(null); setAccountPicker(false); setTabHistory([]); setTab('home'); }, []);"));
  assert.ok(s.includes('<Onboarding api={api} onDone={reload} onFinished={goHome} />'),'primeira configuracao');
  assert.ok(s.includes('onFinished={goHome} reload={reload} />'),'refazer pela engrenagem');
  assert.ok(s.includes('if (onFinished) onFinished(); else onClose?.();'),'cancelar continua so fechando');
});

test('0.3.175: "Paguei" fica pago na hora e o fim dos passos grava em paralelo',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('local?.markPaid(due.tx);'),'marca na tela antes de esperar o servidor');
  assert.ok(s.includes("void receiveTx(api, d, due.tx).then(() => reload()).catch(e => { appAlert('Finanças', errorText(e)); void reload(); });"),'se falhar, volta ao estado real');
  assert.ok(s.includes('<FinanceLocal.Provider value={local}>'));
  assert.ok(s.includes('await Promise.all(jobs);'),'gravacoes em paralelo');
  assert.ok(s.includes('if (existing) { if (onFinished) onFinished(); else onClose?.(); void onDone(); }'),'ao refazer, vai para o Resumo sem esperar');
});
