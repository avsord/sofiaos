'use strict';
// O link de compartilhar do Mercado Livre so redireciona para o app/login. Em vez de
// insistir em abrir a pagina, a Sofia le o preco direto da API da loja: sem navegador,
// sem redirecionamento, sem tela de login.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/lib/price-direct.ts'),'utf8');
const m={};vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:m,require:()=>({}),URL,AbortController,setTimeout,clearTimeout,Number,String,JSON,Promise,fetch:async()=>{throw new Error('nao deveria usar o fetch global no teste');}});

const SHARE='https://www.mercadolivre.com.br/p/MLB42258825?matt_tool=38524122&pdp_filters=item_id:MLB5296520523&ua=gk8gAQjm#origin=share&sid=share&wid=MLB5296520523&action=copy';

test('acha o anuncio certo em qualquer forma de link do Mercado Livre',()=>{
 assert.equal(m.mercadoLivreItemId(SHARE),'MLB5296520523','o link de compartilhar guarda o anuncio real em pdp_filters');
 assert.equal(m.mercadoLivreItemId('https://produto.mercadolivre.com.br/MLB-123456789-hd-seagate-_JM'),'MLB123456789');
 assert.equal(m.mercadoLivreItemId('https://www.mercadolivre.com.br/p/MLB42258825'),'MLB42258825');
 assert.equal(m.mercadoLivreItemId('https://mercadolivre.com/sec/1AbCdE2'),'','link curto nao tem o id: volta para o navegador');
 assert.equal(m.mercadoLivreItemId('https://www.kabum.com.br/produto/123456'),'','outra loja');
 assert.equal(m.mercadoLivreItemId('https://fake-mercadolivre.com.br.evil.com/MLB-1'),'','dominio parecido nao engana');
});
test('le preco e nome pela API, sem abrir pagina nenhuma',async()=>{
 const calls=[];
 const fake=async(url)=>{calls.push(url);return {ok:true,status:200,json:async()=>({id:'MLB5296520523',title:'HD Externo Seagate 2TB',price:784.1,currency_id:'BRL',status:'active'})};};
 const r=await m.readDirect(SHARE,fake);
 assert.deepEqual(calls,['https://api.mercadolibre.com/items/MLB5296520523']);
 assert.equal(r.ok,true);assert.equal(r.title,'HD Externo Seagate 2TB');
 assert.equal(r.result.best.amount,784.1);assert.equal(r.result.best.currency,'BRL');
 assert.equal(r.result.needsConfirmation,false,'veio da propria loja: nao precisa a pessoa confirmar');
 assert.deepEqual([...r.result.best.origins],['API do Mercado Livre']);
});
test('quando a loja nao responde, nao tem preco ou exige credencial: devolve null para o navegador assumir (nunca inventa erro)',async()=>{
 const naoAutorizado=async()=>({ok:false,status:401,json:async()=>({message:'unauthorized'})});
 assert.equal(await m.readDirect(SHARE,naoAutorizado),null);
 const semPreco=async()=>({ok:true,status:200,json:async()=>({id:'x',title:'Produto',status:'closed'})});
 assert.equal(await m.readDirect(SHARE,semPreco),null);
 const quebrado=async()=>{throw new Error('sem internet');};
 assert.equal(await m.readDirect(SHARE,quebrado),null);
 assert.equal(await m.readDirect('https://www.kabum.com.br/produto/1',async()=>{throw new Error('nao deveria chamar');}),null,'outra loja: nem tenta');
});
test('anuncio fechado mas ainda com preco continua sendo lido (historico nao se perde)',async()=>{
 const fechado=async()=>({ok:true,status:200,json:async()=>({id:'x',title:'HD',price:700,currency_id:'BRL',status:'closed'})});
 const r=await m.readDirect(SHARE,fechado);assert.equal(r.result.best.amount,700);
});
test('coleta automatica e tela de adicionar usam o leitor direto ANTES do navegador escondido',()=>{
 const col=fs.readFileSync(path.join(__dirname,'../src/lib/monitor-collector.ts'),'utf8');
 assert.ok(col.includes('const read = (await readDirect(s.url).catch(() => null)) || (await readPrice(s.url));'));
 const scr=fs.readFileSync(path.join(__dirname,'../src/screens/Monitoring.tsx'),'utf8');
 assert.ok(scr.includes('const r = (await readDirect(clean).catch(() => null)) || (await readPrice(clean));'));
});
