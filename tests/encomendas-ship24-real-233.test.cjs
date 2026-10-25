'use strict';
// 0.3.233: o teste da 0.3.232 usou um armazenamento simulado e nao pegou que o servidor REAL recusa campos fora do
// catalogo ("Campo não previsto: ship24_tracker_id"). Aqui o mesmo fluxo grava no Workspace real (SQLite).
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');const {Workspace}=require('../src/core/workspace');
const {PackageTracker}=require('../src/services/package-tracker');
const tracking=(milestone,events)=>({data:{trackings:[{tracker:{trackerId:'trk-real-1',trackingNumber:'AP594818996BR',isSubscribed:true,isTracked:true,createdAt:'2026-10-25T20:00:00Z'},
  shipment:{statusMilestone:milestone,delivery:{estimatedDeliveryDate:'2026-11-03T00:00:00Z'}},events,statistics:{timestamps:{}}}]}});
const ev=(at,status,location,statusMilestone)=>({eventId:at,trackingNumber:'AP594818996BR',status,occurrenceDatetime:at,location,statusMilestone});
test('Ship24 no servidor real: grava id, etapa, taxa e previsao sem "Campo não previsto"; a 2a consulta so le',async t=>{
  const f=fixture(t);const w=new Workspace(f.store);
  const pkg=w.save({kind:'package',title:'Câmera G15',content:'',area:'Encomendas',privacy:'private',state:'active',tags:[],data:{code:'AP594818996BR',carrier:'correios'}});
  const calls=[];const fetchImpl=async(url,opt)=>{calls.push({url,method:opt.method});
    const json=url.endsWith('/trackers/track')?tracking('in_transit',[ev('2026-10-25T10:00:00','Objeto em trânsito - por favor aguarde','Curitiba, PR','in_transit')])
      :tracking('exception',[ev('2026-10-26T10:00:00','Aguardando pagamento do despacho postal','Curitiba, PR','exception'),ev('2026-10-25T10:00:00','Objeto em trânsito - por favor aguarde','Curitiba, PR','in_transit')]);
    return {ok:true,status:200,json:async()=>json};};
  const tr=new PackageTracker(w,{env:{SHIP24_API_KEY:'k'},fetchImpl});
  const r1=await tr.refreshOne(pkg.id);
  assert.equal(r1.error,'');const saved=w.get(pkg.id);
  assert.equal(saved.data.ship24_tracker_id,'trk-real-1');assert.equal(saved.data.milestone,'in_transit');assert.equal(saved.data.milestone_label,'Em trânsito');
  assert.equal(saved.data.status,'Objeto em trânsito - por favor aguarde');assert.equal(saved.data.estimated,'2026-11-03T00:00:00Z');
  await tr.refreshOne(pkg.id);
  assert.equal(calls[1].method,'GET');assert.equal(calls[1].url,'https://api.ship24.com/public/v1/trackers/trk-real-1/results');
  const after=w.get(pkg.id);assert.equal(!!after.data.fee,true);assert.equal(after.data.milestone,'exception');
});
