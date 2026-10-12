'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const m={};vm.runInNewContext(ts.transpileModule(read('src/lib/monitoring.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:m,URL,Date,Math,JSON,Number,String,Set,Map,Array,Object,Infinity,encodeURIComponent,isFinite});
const mon=(p,s)=>({id:'x',data:{preferred_url:p,source_urls:s}});
const plain=x=>JSON.parse(JSON.stringify(x));
test('trocar link mantém a ordem: a principal continua principal',()=>{
 assert.deepEqual(plain(m.replaceSource(mon('https://a.com/1','https://b.com/2\nhttps://c.com/3'),'https://a.com/1','https://a.com/novo')),{preferred_url:'https://a.com/novo',source_urls:'https://b.com/2\nhttps://c.com/3'});
 assert.deepEqual(plain(m.replaceSource(mon('https://a.com/1','https://b.com/2'),'https://b.com/2','https://b.com/9')),{preferred_url:'https://a.com/1',source_urls:'https://b.com/9'});
 assert.deepEqual(plain(m.replaceSource(mon('https://a.com/1','https://b.com/2'),'https://b.com/2','https://a.com/1')),{preferred_url:'https://a.com/1',source_urls:''},'link repetido não duplica');
});
test('opção "Trocar o link" no menu da loja, com colar e validação',()=>{
 const s=read('src/screens/Monitoring.tsx');assert.ok(s.includes('<SheetItem label="Trocar o link"'));assert.ok(s.includes('replaceSource(monitor, old, u)'));assert.ok(s.includes("Esse link já está em outra loja deste produto."));
});
test('sino: o resumo não reaparece animado nem se refaz a cada abertura (era o item piscando)',()=>{
 const s=read('src/components/NotificationCenter.tsx');const d=s.slice(s.indexOf('function BellDigest('),s.indexOf('export function NotificationList('));
 assert.ok(!d.includes('<Appear'));assert.ok(!d.includes('refreshDigest(n.api)'));
});
