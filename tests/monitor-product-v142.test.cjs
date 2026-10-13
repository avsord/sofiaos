'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const {CATALOG}=require('../src/core/catalog');

// O formulário do app monta exatamente este payload ao criar um monitor novo
// (SOFIA_APP/src/screens/Workspace.tsx). Antes desta rodada o backend recusava
// os três campos: line_color, discover e method='product'.
const NOVO_DO_APP={method:'product',currency:'BRL',interval_minutes:360,line_color:'#ac8cff',discover:true,new_low:true};

function monitor(core,data,title='Monitor de teste'){
  return core.workspace.save({kind:'monitor',title,area:'Pessoal',data});
}

test('o catálogo conhece os campos que o app já usa', ()=>{
  const keys=CATALOG.monitor.fields.map(f=>f.key);
  for(const k of ['preferred_url','source_urls','discover','line_color'])assert.ok(keys.includes(k),'falta o campo '+k);
  assert.ok(CATALOG.monitor.fields.find(f=>f.key==='method').options.includes('product'));
  for(const k of Object.keys(NOVO_DO_APP))assert.ok(keys.includes(k),'o app manda '+k+' e o catálogo não tem');
});

test('monitor de loja salva sem item de Comprar e guarda as lojas', t=>{
  const {core}=fixture(t);
  const m=monitor(core,{...NOVO_DO_APP,variant:'RTX 4070 Super 12GB',preferred_url:'https://www.kabum.com.br/produto/123',source_urls:' https://www.pichau.com.br/produto/456 \n\nhttps://lista.mercadolivre.com.br/rtx-4070 \n'});
  const salvo=core.workspace.get(m.id);
  assert.equal(salvo.data.preferred_url,'https://www.kabum.com.br/produto/123');
  assert.equal(salvo.data.source_urls.split('\n').length,2,'linhas em branco e espaços devem sumir');
  assert.equal(salvo.data.discover,true);
  assert.equal(salvo.data.line_color,'#ac8cff');
  assert.equal(salvo.data.target_id,'');
});

test('modo product exige o link da loja principal', t=>{
  const {core}=fixture(t);
  assert.throws(()=>monitor(core,{...NOVO_DO_APP,variant:'RTX 4070'}),/loja principal/i);
});

test('modo json continua exigindo item de Comprar ou curso', t=>{
  const {core}=fixture(t);
  assert.throws(()=>monitor(core,{method:'json',variant:'Edição única',feed_url:'https://exemplo.com/f.json',price_path:'p',variant_path:'v',currency_path:'c',consent:true}),/Comprar ou um curso/i);
});

test('link de loja inválido, repetido ou sem HTTPS é recusado', t=>{
  const {core}=fixture(t);
  const bom={...NOVO_DO_APP,variant:'RTX 4070',preferred_url:'https://www.kabum.com.br/produto/123'};
  assert.throws(()=>monitor(core,{...bom,preferred_url:'http://www.kabum.com.br/produto/123'}),/HTTPS/i);
  assert.throws(()=>monitor(core,{...bom,source_urls:'kabum.com.br/produto/9'}),/link completo/i);
  assert.throws(()=>monitor(core,{...bom,source_urls:'http://www.pichau.com.br/x'}),/HTTPS/i);
  assert.throws(()=>monitor(core,{...bom,source_urls:'https://www.pichau.com.br/x\nhttps://www.pichau.com.br/x'}),/duas vezes/i);
  assert.throws(()=>monitor(core,{...bom,source_urls:Array.from({length:11},(_,i)=>'https://loja'+i+'.com/p').join('\n')}),/até 10 lojas/i);
  assert.throws(()=>monitor(core,{...bom,line_color:'roxo'}),/cor válida/i);
});

test('monitor antigo sem os campos novos continua salvável', t=>{
  const {core}=fixture(t);
  const compra=core.workspace.save({kind:'purchase',title:'Placa de vídeo',area:'Pessoal',data:{}});
  const antigo=monitor(core,{method:'manual',target_id:compra.id,variant:'RTX 4070',currency:'BRL',interval_minutes:360});
  const recarregado=core.workspace.get(antigo.id);
  assert.equal(recarregado.data.preferred_url,'');
  assert.equal(recarregado.data.discover,false);
  const atualizado=core.workspace.save({revision:recarregado.revision,data:{...recarregado.data,target_price:2500}},antigo.id);
  assert.equal(core.workspace.get(atualizado.id).data.target_price,2500);
});

test('queda percentual compara com a leitura anterior da MESMA loja, não de outra', t=>{
  const {core,store}=fixture(t);
  const m=monitor(core,{...NOVO_DO_APP,variant:'RTX 4070',preferred_url:'https://www.kabum.com.br/p/1',source_urls:'https://www.pichau.com.br/p/2',drop_percent:10});
  // Collection now requires an active monitor; this test isolates the same-store rule.
  core.workspace.save({...m,state:'active'},m.id);
  const at=(min)=>new Date(Date.now()-min*60000).toISOString();
  const obs=(source,price,min)=>core.workspace.observe(m.id,{price,variant:'RTX 4070',currency:'BRL',source,observed_at:at(min)});
  obs('https://www.kabum.com.br/p/1',3000,30);
  obs('https://www.pichau.com.br/p/2',2600,20); // outra loja mais barata: NÃO é "queda de 13%"
  const quedas=()=>store.db.prepare("SELECT body FROM notifications WHERE category='price'").all().filter(n=>/queda/.test(n.body));
  assert.equal(quedas().length,0);
  obs('https://www.kabum.com.br/p/1',2650,10); // a própria KaBuM caiu 11,7%
  assert.equal(quedas().length,1);
});

test('memória de leitura por loja é aceita e fica fora do formulário genérico', t=>{
  const {core}=fixture(t);
  const f=CATALOG.monitor.fields.find(x=>x.key==='reader_memory');
  assert.ok(f&&f.developerOnly);
  const m=monitor(core,{...NOVO_DO_APP,variant:'X',preferred_url:'https://www.kabum.com.br/p/1',reader_memory:JSON.stringify({'https://www.kabum.com.br/p/1':['json-ld:offer']})});
  assert.match(core.workspace.get(m.id).data.reader_memory,/json-ld:offer/);
});
