'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,httpFixture,base,blankAction}=require('./helpers.cjs');
const {OpenAIProvider}=require('../src/services/openai');
const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});

test('v53: primeira interpretação recebe continuidade recente para resolver “ele”',async t=>{
  const firstPlan=base('respond',{response_ready:true,assistant_message:'Sim, conheço o Redmi Pad 2.',privacy:{sensitivity:'general',recommended_route:'shared',reason:'Produto público.'}});
  const secondPlan=base('clarify',{confidence:.96,assistant_message:'Entendi que você fala do Redmi Pad 2. Quando quer receber o lembrete de Black Friday?',privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Monitoramento e lembrete comuns.'},clarification:{question:'Quando quer receber o lembrete de Black Friday para o Redmi Pad 2?',options:[{id:'week_before',label:'Uma semana antes',meaning:'Lembrar uma semana antes.'},{id:'day_before',label:'Um dia antes',meaning:'Lembrar um dia antes.'}]}});
  const f=fixture(t,{privateMode:false,plans:[firstPlan,secondPlan]});
  const a=await send(f.core,'Você conhece o Redmi Pad 2?');
  await send(f.core,'Depois quero monitorar ele e criar um lembrete para Black Friday',{conversation_id:a.conversation_id});
  const structured=f.calls.filter(x=>x.kind==='structured');
  assert.equal(structured.length,2);
  const input=JSON.stringify(structured[1].input);
  assert.match(input,/Redmi Pad 2/);
  assert.match(input,/monitorar ele/);
  assert.match(input,/CONTINUIDADE DA MESMA CONVERSA/);
});

test('v53: múltiplas ações explícitas podem ser executadas sem esquecer a segunda',async t=>{
  const plan=base('compound',{explicit_action:true,confidence:.99,assistant_message:'Certo. Vou acompanhar o Redmi Pad 2 e registrar o lembrete.',privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Ações comuns.'},actions:[
    {intent:'create_monitor',action:{...blankAction(),title:'Redmi Pad 2',content:'Monitorar preço do Redmi Pad 2',area:'Pessoal',tags:['Black Friday']}},
    {intent:'create_reminder',action:{...blankAction(),title:'Black Friday — Redmi Pad 2',content:'Revisar o monitoramento do Redmi Pad 2',area:'Pessoal',date:'2026-11-20',time:'09:00'}}
  ]});
  const f=fixture(t,{privateMode:false,plans:[plan]});
  const r=await send(f.core,'Monitore o Redmi Pad 2 e me lembre uma semana antes da Black Friday.');
  assert.equal(r.intent.type,'compound');
  assert.equal(f.core.workspace.list({kind:'monitor'}).length,1);
  assert.equal(f.core.workspace.list({kind:'reminder'}).length,1);
});

test('v53: DELETE remove registro sem vínculos e endpoint responde corretamente',async t=>{
  const f=await httpFixture(t);
  const created=(await f.request('/api/entities',{kind:'commitment',title:'Excluir teste',privacy:'shared',data:{start_at:'2026-09-20T10:00:00.000Z'}})).body;
  const del=await f.request('/api/entities/'+created.id,{},'DELETE');
  assert.equal(del.status,200);
  assert.equal(del.body.ok,true);
  assert.equal(f.core.workspace.list({kind:'commitment'}).some(x=>x.id===created.id),false);
});

test('v53: Início é chat contínuo, tem exclusão e volta ao topo após Resumo',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','style.css'),'utf8');
  assert.match(html,/id="homeChatResult" class="home-thread"/);
  assert.match(js,/function renderHomeThread\(/);
  assert.match(js,/scrollStartTop/);
  assert.match(js,/btn\('Excluir'/);
  assert.match(html,/id="addReminder"/);
  assert.match(css,/\.home-turn\.user/);
  assert.match(css,/typing-dots/);
});

test('v53: GPT-5.6 usa reasoning none para reduzir latência nas chamadas compatíveis',async()=>{
  let body;
  const fetchMock=async(_url,opts)=>{body=JSON.parse(opts.body);return {ok:true,status:200,headers:{get:()=>null},json:async()=>({output_text:'ok',usage:{input_tokens:1,output_tokens:1}})};};
  const provider=new OpenAIProvider({apiKey:'sk-'+'x'.repeat(40),model:'gpt-5.6-luna',apiTimeoutMs:1000},fetchMock);
  await provider.respond({instructions:'x',input:[{role:'user',content:'y'}],maxOutputTokens:50});
  assert.equal(body.reasoning.effort,'none');
});
