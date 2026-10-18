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
  assert.ok(s.includes("const draftKey='bill:'+(tx?.id||'novo')"));
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
