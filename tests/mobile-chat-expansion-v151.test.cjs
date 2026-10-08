'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');
const PASSWORD='test-only-password-151';
async function setup(t){
 const f=fixture(t);f.config.loginPassword=PASSWORD;f.config.loginEmail='owner@example.com';f.config.maxMessageChars=1000000;
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure'),audioService:{transcribe:async()=>({text:'Áudio longo recebido.',languages:['pt']})}});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 async function request(route,body,method=body===undefined?'GET':'POST',token=''){const response=await fetch(base+'/api/mobile'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,body:await response.json()};}
 const login=await request('/auth/login',{email:'owner@example.com',password:PASSWORD});assert.equal(login.status,200);const token=login.body.token;
 const made=await request('/conversations',{title:'Sem teto curto'},'POST',token);assert.equal(made.status,200);return{request,token,conversation:made.body.conversation};
}
test('mobile accepts text beyond the former 12k product limit',async t=>{const f=await setup(t),message='A'.repeat(15000);const result=await f.request('/messages',{conversation_id:f.conversation.id,client_message_id:crypto.randomUUID(),message},'POST',f.token);assert.equal(result.status,200,JSON.stringify(result.body));assert.ok(result.body.messages.some(row=>row.role==='user'&&row.content.length===15000));});
test('mobile accepts audio duration beyond the former five-minute product limit',async t=>{const f=await setup(t),result=await f.request('/messages/audio',{conversation_id:f.conversation.id,client_message_id:crypto.randomUUID(),audio_base64:Buffer.from('small fixture representing compressed long audio').toString('base64'),mime:'audio/mp4',duration_ms:600000},'POST',f.token);assert.equal(result.status,200,JSON.stringify(result.body));assert.ok(result.body.messages.some(row=>row.voice?.duration_ms===600000));});
