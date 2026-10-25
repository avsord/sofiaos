'use strict';
// 0.3.232: Encomendas pela Ship24 (todas as transportadoras). Respostas no formato da especificacao oficial
// (docs.ship24.com, OpenAPI 1.0.0): data.trackings[0].{tracker,shipment.statusMilestone,events[] mais recente primeiro}.
const test=require('node:test'),assert=require('node:assert/strict');
const {PackageTracker,parseShip24}=require('../src/services/package-tracker');
function fakeWorkspace(items){const notices=[];return {items,notices,get(id){return items.find(x=>x.id===id)||null;},list({kind}){return items.filter(x=>x.kind===kind);},
 save(input,id){const i=items.findIndex(x=>x.id===id);items[i]={...items[i],...input,data:{...input.data}};return items[i];},
 notify(category,title,body,entityId,importance,dedup){if(notices.some(n=>n.dedup===dedup))return;notices.push({category,title,body,entityId,importance,dedup});}};}
const tracking=(milestone,events,trackerId='trk-1')=>({data:{trackings:[{tracker:{trackerId,trackingNumber:'LP00123456789012',isSubscribed:true,isTracked:true,createdAt:'2026-10-20T10:00:00Z'},
  shipment:{statusMilestone:milestone,delivery:{estimatedDeliveryDate:'2026-11-02T00:00:00Z'}},events,statistics:{timestamps:{}}}]}});
const ev=(at,status,location,statusMilestone)=>({eventId:at,trackingNumber:'LP00123456789012',status,occurrenceDatetime:at,location,statusMilestone});
function ship24(script){const calls=[];const fetchImpl=async(url,opt)=>{calls.push({url,method:opt.method,auth:opt.headers.Authorization,body:opt.body});const r=script(url,opt,calls.length);return {ok:r.status<300,status:r.status,json:async()=>r.json};};return {calls,fetchImpl};}
const item=(data={})=>({id:'p1',kind:'package',title:'Fone AliExpress',state:'active',revision:1,data:{code:'LP00123456789012',carrier:'cainiao',events:'[]',...data}});

test('le o rastreio da Ship24: status em portugues pela etapa, eventos com local, entrega e previsao',()=>{
  const r=parseShip24(tracking('in_transit',[ev('2026-10-24T08:00:00','Objeto em trânsito - por favor aguarde','Curitiba, PR','in_transit'),ev('2026-10-20T10:00:00','Objeto postado','Shenzhen','info_received')]));
  assert.equal(r.status,'Objeto em trânsito - por favor aguarde');assert.equal(r.milestoneLabel,'Em trânsito');assert.equal(r.events.length,2);
  assert.equal(r.events[0].local,'Curitiba, PR');assert.equal(r.delivered,false);assert.equal(r.trackerId,'trk-1');assert.equal(r.estimated,'2026-11-02T00:00:00Z');
});
test('primeira consulta CADASTRA (gasta 1 da cota) e guarda o id; as seguintes so LEEM resultados (nao gastam)',async()=>{
  const items=[item()],w=fakeWorkspace(items);
  const api=ship24((url,opt)=>url.endsWith('/trackers/track')?{status:201,json:tracking('in_transit',[ev('2026-10-24T08:00:00','Objeto em trânsito','Curitiba','in_transit')])}
    :{status:200,json:tracking('out_for_delivery',[ev('2026-10-25T09:00:00','Objeto saiu para entrega ao destinatário','São Paulo','out_for_delivery'),ev('2026-10-24T08:00:00','Objeto em trânsito','Curitiba','in_transit')])});
  const t=new PackageTracker(w,{env:{SHIP24_API_KEY:'k'},fetchImpl:api.fetchImpl});
  await t.refreshOne('p1');
  assert.equal(api.calls[0].url,'https://api.ship24.com/public/v1/trackers/track');assert.equal(api.calls[0].method,'POST');
  assert.equal(api.calls[0].auth,'Bearer k');assert.deepEqual(JSON.parse(api.calls[0].body),{trackingNumber:'LP00123456789012',destinationCountryCode:'BR'});
  assert.equal(items[0].data.ship24_tracker_id,'trk-1','guardou o id da Ship24');
  await t.refreshOne('p1');await t.refreshOne('p1');
  assert.equal(api.calls.filter(c=>c.url.endsWith('/trackers/track')).length,1,'so 1 cadastro (1 da cota)');
  assert.equal(api.calls[1].url,'https://api.ship24.com/public/v1/trackers/trk-1/results');assert.equal(api.calls[1].method,'GET');
  assert.equal(items[0].data.status,'Objeto saiu para entrega ao destinatário');assert.equal(items[0].data.milestone,'out_for_delivery');
  assert.equal(w.notices.length,2,'avisou no cadastro e na mudanca; a consulta igual nao repete');
});
test('entregue: marca a encomenda como entregue (para de consultar) e avisa',async()=>{
  const items=[item({ship24_tracker_id:'trk-1'})],w=fakeWorkspace(items);
  const api=ship24(()=>({status:200,json:tracking('delivered',[ev('2026-10-26T14:00:00','Objeto entregue ao destinatário','São Paulo','delivered')])}));
  const t=new PackageTracker(w,{env:{SHIP24_API_KEY:'k'},fetchImpl:api.fetchImpl});
  await t.refreshOne('p1');
  assert.equal(items[0].state,'delivered');assert.match(w.notices[0].title,/Entregue/);
  await t.checkAll();assert.equal(api.calls.length,1,'entregue nao e mais consultada');
});
test('taxa a pagar: aviso destacado (atencao) com o texto do evento',async()=>{
  const items=[item({ship24_tracker_id:'trk-1'})],w=fakeWorkspace(items);
  const api=ship24(()=>({status:200,json:tracking('exception',[ev('2026-10-25T10:00:00','Aguardando pagamento do despacho postal','Curitiba','exception')])}));
  await new PackageTracker(w,{env:{SHIP24_API_KEY:'k'},fetchImpl:api.fetchImpl}).refreshOne('p1');
  assert.equal(items[0].data.fee,true);assert.match(w.notices[0].title,/Taxa a pagar/);assert.equal(w.notices[0].importance,'warning');
});
test('chave recusada ou cota do mes acabou: guarda o motivo, mantem o ultimo status e nao inventa nada',async()=>{
  for(const [status,re] of [[401,/chave da Ship24/],[403,/plano grátis|recusou/]]){
    const items=[item({status:'Em trânsito',events:JSON.stringify([{at:'x',status:'Em trânsito',local:''}])})],w=fakeWorkspace(items);
    const api=ship24(()=>({status,json:{errors:[{code:'e',message:''}]}}));
    const r=await new PackageTracker(w,{env:{SHIP24_API_KEY:'k'},fetchImpl:api.fetchImpl}).refreshOne('p1');
    assert.match(r.error,re);assert.equal(items[0].data.status,'Em trânsito','ultimo status mantido');assert.equal(w.notices.length,0);
  }
});
test('sem SHIP24_API_KEY na Railway: segue o caminho antigo (Correios), sem chamar a Ship24',async()=>{
  const items=[{id:'p1',kind:'package',title:'X',state:'active',revision:1,data:{code:'AA123456789BR',carrier:'correios',events:'[]'}}],w=fakeWorkspace(items);
  const urls=[];const t=new PackageTracker(w,{env:{},fetchImpl:async(u)=>{urls.push(u);return {ok:false,status:403,json:async()=>({})};}});
  await t.refreshOne('p1');assert.ok(urls.every(u=>!u.includes('ship24')));
});
