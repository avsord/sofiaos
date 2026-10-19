'use strict';
// 0.3.201: "Campo nao previsto: sort_order" - a pagina nao salvava depois de reordenar a lista.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('pagina com a posicao na lista (sort_order) e o modelo de origem salva normalmente',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const p=w.save({kind:'user_page',title:'Desenvolvimento estético',area:'Pessoal',data:{blocks_json:'[]',parent_id:'',node_type:'space'}});
 const moved=w.save({...p,data:{...p.data,sort_order:3072}},p.id);
 assert.equal(moved.data.sort_order,3072);
 const again=w.save({...moved,title:'Desenvolvimento',data:{...moved.data,template_id:'tasks_personal',blocks_json:'[{"id":"x","type":"text","text":"oi"}]'}},p.id);
 assert.equal(again.title,'Desenvolvimento');assert.equal(again.data.sort_order,3072);assert.equal(again.data.template_id,'tasks_personal');
});
