'use strict';
// 0.3.241: apagar uma regra de e-mail nao pode disparar a releitura da caixa de entrada (ficava ~18 s em "Lendo as caixas de entrada...").
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const R=load('src/lib/mail-rules.ts');
test('so criar/editar (save) e reativar (resume) releem os ultimos dias; apagar e pausar nao',()=>{
  assert.equal(R.rescanAfterRule('save'),true);assert.equal(R.rescanAfterRule('resume'),true);
  assert.equal(R.rescanAfterRule('delete'),false,'apagar: nada a reavaliar, os e-mails encontrados ficam');
  assert.equal(R.rescanAfterRule('pause'),false);
});
test('cada saida da janela da regra informa a sua acao, e a tela so relê quando a regra manda',()=>{
  const m=read('src/screens/Mail.tsx');
  assert.ok(m.includes("onDone={(action) => { setRuleSheet(null); void load(); if (rescanAfterRule(action)) void check(14); }}"),'a tela decide pela acao');
  assert.ok(m.includes("await api.deleteEntity(existing.id); onDone('delete');"),'apagar -> delete');
  assert.ok(m.includes("onDone(resuming ? 'resume' : 'pause')"),'pausar/reativar');
  const save=m.slice(m.indexOf("    try { if (existing) await api.saveEntity({...existing, title: name"),m.indexOf("function RuleSheet")+4000);
  assert.ok(save.includes("onDone('save')"),'salvar -> save');
  const rule=m.slice(m.indexOf('function RuleSheet'),m.indexOf('function BillFromMail'));
  assert.ok(!rule.includes('onDone()'),'nenhuma saida da regra chama onDone sem dizer a acao');
  assert.ok(!m.includes('void check(14); }}')||m.includes('if (rescanAfterRule(action)) void check(14);'),'nao ha releitura incondicional');
});
