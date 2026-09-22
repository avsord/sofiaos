
'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {fixture,base,blankAction}=require('./helpers.cjs');
const {plannerInstructions}=require('../src/services/intent-engine');
const send=(c,message,extra={})=>c.receive({message,client_message_id:crypto.randomUUID(),...extra});
const crypto=require('node:crypto');

test('v50: IA é explicitamente a primeira camada semântica',()=>{const x=plannerInstructions({today:'2026-09-19'});assert.match(x,/PRIMEIRA CAMADA DE INTELIGÊNCIA/);assert.match(x,/backend NÃO deve adivinhar intenções/);assert.match(x,/INTERPRETE PRIMEIRO/);});

test('v50: aniversário ambíguo é interpretado antes de qualquer execução e oferece botões',async t=>{const f=fixture(t,{privateMode:false});const r=await send(f.core,'hoje eu tenho um aniversario de um colega pra ir as 19hrs no capao');assert.equal(r.intent.type,'clarify');assert.equal(r.intent.sensitivity,'personal_non_sensitive');assert.equal(r.filter,'Filtro Compartilhado');assert.equal(f.core.workspace.list({kind:'commitment'}).length,0);assert.deepEqual(r.clarification.options.map(x=>x.label),['Adicionar aos compromissos','Criar tarefa','Criar lembrete','Só estou contando']);const reservations=f.store.db.prepare('SELECT route FROM route_reservations ORDER BY rowid').all();assert.equal(reservations[0].route,'private');});

test('v50: escolha em botão volta à IA antes do backend executar',async t=>{const f=fixture(t,{privateMode:false});const a=await send(f.core,'hoje eu tenho um aniversario de um colega pra ir as 19hrs no capao');const before=f.calls.filter(x=>x.kind==='structured').length;const b=await send(f.core,'Adicionar aos compromissos',{conversation_id:a.conversation_id,clarification_id:a.clarification.id,clarification_option:'add_commitment'});assert.ok(f.calls.filter(x=>x.kind==='structured').length>before);assert.equal(b.intent.type,'create_commitment');assert.equal(f.core.workspace.list({kind:'commitment'}).length,1);});

test('v50: conversa geral usa interpretador privado e resposta final compartilhada',async t=>{const f=fixture(t,{privateMode:false});const r=await send(f.core,'Explique o que é uma metáfora');assert.equal(r.filter,'Filtro Compartilhado');assert.deepEqual(f.calls.map(x=>x.kind),['structured','respond']);const rows=f.store.db.prepare('SELECT route FROM route_reservations ORDER BY rowid').all();assert.deepEqual(rows.map(x=>x.route),['private','shared']);});

test('v50: conteúdo sensível permanece privado depois da interpretação',async t=>{const f=fixture(t,{privateMode:false});const r=await send(f.core,'Quero organizar um pagamento confidencial');assert.equal(r.filter,'Filtro Privado');const rows=f.store.db.prepare('SELECT route FROM route_reservations ORDER BY rowid').all();assert.ok(rows.every(x=>x.route==='private'));});

test('v50: sem chave do interpretador privado não há fallback silencioso ao compartilhado',async t=>{const f=fixture(t,{privateMode:false});f.config.privateApiKey='';f.config.apiKey='';await assert.rejects(send(f.core,'Explique o que é uma metáfora'),e=>e.code==='INTENT_FILTER_REQUIRED');assert.equal(f.calls.length,0);});

test('v50: segredo explícito é bloqueado antes de qualquer chamada de IA',async t=>{const f=fixture(t,{privateMode:false});await assert.rejects(send(f.core,'minha senha é senha-super-secreta-123'),e=>Boolean(e.code));assert.equal(f.calls.length,0);});

test('v50: contexto recuperado privado não pode terminar no compartilhado',async t=>{const f=fixture(t,{privateMode:false});const note=f.store.saveNote({kind:'decision',title:'Projeto Órion',content:'O orçamento do Projeto Órion é confidencial.',area:'Geral',privacy:'private'});const p=base('respond',{needs_context:true,context_query:'Projeto Órion',privacy:{sensitivity:'personal_non_sensitive',recommended_route:'shared',reason:'Pedido atual não sensível.'}});f.plans.push(p,p);const r=await send(f.core,'O que combinamos sobre o Projeto Órion?');assert.equal(r.filter,'Filtro Privado');});

test('v50: chat normal não sugere Diário Pessoal',async t=>{const f=fixture(t,{privateMode:false});const r=await send(f.core,'Hoje eu fiquei pensativo sobre algumas coisas da vida.');assert.equal(r.clarification,null);assert.doesNotMatch(r.reply,/Diário Pessoal/i);});

test('v50: endpoint de prévia não usa classificador semântico do backend',()=>{const fs=require('node:fs'),path=require('node:path');const code=fs.readFileSync(path.join(__dirname,'..','src','core','api45.js'),'utf8');assert.doesNotMatch(code,/require\(['"]\.\.\/services\/privacy['"]\)/);assert.match(code,/prévia semântica por palavras-chave foi desativada/);});
