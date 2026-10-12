'use strict';
// Páginas abria em branco no começo: o carregamento só aparecia depois do
// 'ready' (leitura das páginas guardadas no aparelho). Agora aparece já.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../src/screens/Pages.tsx'),'utf8');
test('carregamento (anel + linhas) aparece antes e durante a leitura, nunca tela vazia',()=>{
 assert.ok(s.includes('{(!ready||!loaded)&&!error&&!pages.length?<View testID="pages-loading-placeholder"'));
 const show=(ready,loaded,error,count)=>(!ready||!loaded)&&!error&&!count;
 assert.equal(show(false,true,'',0),true,'antes do ready, mesmo com cache marcado: carregando');
 assert.equal(show(true,false,'',0),true);assert.equal(show(true,true,'',0),false,'pronto e vazio: mostra "Sua primeira página"');
 assert.equal(show(false,false,'',3),false,'já tem páginas: mostra as páginas');assert.equal(show(true,false,'erro',0),false,'erro: mostra o erro');
});
