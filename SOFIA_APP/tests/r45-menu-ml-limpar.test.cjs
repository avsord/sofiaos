'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const m={};vm.runInNewContext(ts.transpileModule(read('src/lib/monitoring.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:m,URL,Date,Math,JSON,Number,String,Set,Map,Array,Object,Infinity,encodeURIComponent,isFinite});
test('link do Mercado Livre do dono vira o anúncio direto, sem rastreio, e abre como computador',()=>{
 const link='https://www.mercadolivre.com.br/p/MLB42258825?matt_tool=38524122&pdp_filters=item_id:MLB5296520523&ua=gk8gAQjmeLwvQL_n3qSH7zvMwxa8BNw78bqpGIsFQX0nt4E#origin=share&sid=share&wid=MLB5296520523&action=copy';
 assert.equal(m.readerUrl(link),'https://produto.mercadolivre.com.br/MLB-5296520523');
 assert.equal(m.readerUrl('https://www.mercadolivre.com.br/p/MLB42258825?matt_tool=1'),'https://www.mercadolivre.com.br/p/MLB42258825');
 assert.equal(m.readerUrl('https://produto.mercadolivre.com.br/MLB-123-x-_JM?a=1#b'),'https://produto.mercadolivre.com.br/MLB-123-x-_JM');
 assert.equal(m.readerAgent(link),'desktop');assert.equal(m.readerAgent('https://www.kabum.com.br/produto/1'),'mobile');
 assert.equal(m.readerUrl('https://www.kabum.com.br/produto/1?x=2'),'https://www.kabum.com.br/produto/1?x=2','outras lojas: intocado');
 assert.ok(read('src/lib/price-reader.tsx').includes('const target = readerUrl(url);'));
});
test('produto: três pontinhos no topo com Atualizar, Trocar link, Outras lojas e Excluir',()=>{
 const s=read('src/screens/Monitoring.tsx');assert.ok(s.includes('<IconButton name="more" label="Opções do produto"'));
 for(const t of ["'Atualizar preços agora'",'label="Trocar o link principal"','label="Encontrar em outras lojas"','label="Excluir produto"'])assert.ok(s.includes(t),t);
});
test('apagar aviso não mostra mais "aguarda a atualização do servidor"',()=>{assert.ok(!read('src/lib/legacy-md.ts').includes('aguarda a atualização do servidor. Nenhum aviso foi apagado'));});
