'use strict';
// Encomendas (0.3.142): detecta a transportadora, le o rastro dos Correios, so avisa quando muda e nunca derruba por falha.
const test=require('node:test'),assert=require('node:assert/strict');
const {PackageTracker,detectCarrier,parseCorreios,officialUrl}=require('../src/services/package-tracker');
function fakeWorkspace(items){const notices=[];return {items,notices,get(id){return items.find(x=>x.id===id)||null;},list({kind}){return items.filter(x=>x.kind===kind);},
 save(input,id){const i=items.findIndex(x=>x.id===id);if(i<0)throw Error('save sem id');items[i]={...items[i],...input,data:{...input.data}};return items[i];},
 notify(category,title,body,entityId,importance,dedup){if(notices.some(n=>n.dedup===dedup))return;notices.push({category,title,body,entityId,importance,dedup});}};}
const payload=(events)=>({objetos:[{codObjeto:'AA123456789BR',eventos:events}]});
const ev=(at,descricao,cidade)=>({dtHrCriado:at,descricao,unidade:{nome:'Unidade',endereco:{cidade,uf:'SP'}}});

test('detecta transportadora pelo formato do codigo e monta o link oficial',()=>{
  assert.equal(detectCarrier('aa 123456789 br'),'correios');assert.equal(detectCarrier('LP00123456789012'),'cainiao');assert.equal(detectCarrier('BR251234567890A'),'shopee');assert.equal(detectCarrier('X'),'outro');
  assert.match(officialUrl('correios','AA123456789BR'),/rastreamento\.correios\.com\.br.*AA123456789BR/);
});
test('le a resposta dos Correios: status atual = evento mais recente, com local',()=>{
  const r=parseCorreios(payload([ev('2026-10-15T10:00:00','Objeto saiu para entrega ao destinatário','São Paulo'),ev('2026-10-14T20:00:00','Objeto em trânsito','Cajamar')]),'AA123456789BR');
  assert.equal(r.status,'Objeto saiu para entrega ao destinatário');assert.equal(r.events.length,2);assert.equal(r.events[0].local,'Unidade · São Paulo · SP');assert.equal(r.found,true);
});
test('avisa so quando o status muda; entrega marca o estado; falha de rede guarda o motivo sem avisar',async()=>{
  const items=[{id:'p1',kind:'package',title:'Fone',state:'active',revision:1,data:{code:'AA123456789BR',carrier:'correios',events:'[]'}}];
  const w=fakeWorkspace(items);let answer=payload([ev('2026-10-14T20:00:00','Objeto em trânsito','Cajamar')]),fail=false;
  const t=new PackageTracker(w,{fetchImpl:async()=>{if(fail)throw Error('rede');return {ok:true,json:async()=>answer};}});
  let r=await t.refresh(items[0]);assert.equal(r.changed,true);assert.equal(w.notices.length,1);assert.equal(items[0].data.status,'Objeto em trânsito');
  r=await t.refresh(items[0]);assert.equal(r.changed,false);assert.equal(w.notices.length,1,'mesmo status nao repete o aviso');
  answer=payload([ev('2026-10-15T11:00:00','Objeto entregue ao destinatário','São Paulo'),ev('2026-10-14T20:00:00','Objeto em trânsito','Cajamar')]);
  r=await t.refresh(items[0]);assert.equal(r.changed,true);assert.equal(items[0].state,'delivered');assert.equal(w.notices.length,2);assert.match(w.notices[1].title,/Entregue/);
  fail=true;r=await t.refresh(items[0]);assert.equal(r.changed,false);assert.match(items[0].data.error,/rede/);assert.equal(items[0].data.status,'Objeto entregue ao destinatário','status anterior preservado');assert.equal(w.notices.length,2);
  assert.equal(await t.checkAll(),0,'entregues nao sao consultadas de novo');
});
test('outras transportadoras: registro fica sem consulta automatica, sem erro',async()=>{
  const items=[{id:'p2',kind:'package',title:'Camisa',state:'active',revision:1,data:{code:'LP00123456789012',carrier:'',events:'[]'}}];
  const w=fakeWorkspace(items);const t=new PackageTracker(w,{fetchImpl:async()=>{throw Error('nao deve chamar');}});
  const r=await t.refresh(items[0]);assert.equal(r.changed,false);assert.equal(items[0].data.carrier,'cainiao');assert.match(items[0].data.error,/Correios/);assert.equal(w.notices.length,0);
});
