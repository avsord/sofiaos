'use strict';
// Finanças mês a mês: o app pede só a janela do mês e aplica o "saldo acumulado" no saldo inicial.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('janela: abas normais = mês anterior..próximo; Relatórios = 6 meses',()=>{
 const src=read('src/screens/Finance.tsx');
 assert.ok(src.includes("return tab === 'reports' ? {from: addMonths(month, -5), to: addMonths(month, 1)} : {from: addMonths(month, -1), to: addMonths(month, 1)};"));
 assert.ok(src.includes("api.financeBundle(window)"));
 assert.ok(src.includes("initial: a.initial + (carry[a.id] || 0)"),'o acumulado entra no saldo inicial da conta');
 assert.ok(src.includes("if (loaded.current !== windowKey) void reload();"),'mudou o mês/aba: busca a janela nova');
 assert.ok(read('src/lib/api.ts').includes("'/md/finance' + (window ? '?from=' + window.from + '&to=' + window.to : '')"));
});
test('com o acumulado, o saldo é o mesmo de quando se tinha o histórico inteiro',()=>{
 const m={};vm.runInNewContext(ts.transpileModule(read('src/lib/finance.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:m,require,Date,Math,JSON,Number,String,Set,Map,Array,Object,Intl,isFinite,parseFloat});
 const acc={id:'a',name:'Nubank',type:'corrente',initial:100,color:'#000',include:true,archived:false};
 const tx=(id,date,amount,kind='expense',paid=true)=>({id,kind,desc:id,amount,date,category:'',accountId:'a',toAccountId:'',cardId:'',invoice:'',paid,seriesId:'',installment:0,installments:0,recurrence:'none',recurrenceEnd:''});
 const all=[tx('old1','2026-07-10',50),tx('old2','2026-08-20',30),tx('sal','2026-08-01',1000,'income'),tx('now','2026-10-05',80)];
 const full=m.totalBalance([acc],all);
 const carry=all.filter(t=>t.date<'2026-09-01').reduce((s,t)=>s+m.effect(t,'a'),0);
 const windowed=m.totalBalance([{...acc,initial:acc.initial+carry}],all.filter(t=>t.date>='2026-09-01'));
 assert.equal(windowed,full);assert.equal(full,940);
});
