'use strict';
// 0.3.199: foto do chat - a Sofia le, o original vai para o Drive e o chat mostra uma miniatura minuscula.
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),crypto=require('node:crypto'),fs=require('node:fs');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');
const jpeg=require('jpeg-js');const {makeThumb}=require('../src/services/thumb');
const PASSWORD='development-fixture-only-199';
function photo(){const W=640,H=480,data=Buffer.alloc(W*H*4);for(let i=0;i<W*H;i++){data[i*4]=(i%W)%256;data[i*4+1]=Math.floor(i/W)%256;data[i*4+2]=90;data[i*4+3]=255;}return jpeg.encode({data,width:W,height:H},90).data;}
test('miniatura: poucos bytes, so para JPEG',()=>{
 const big=photo(),t=makeThumb(big,'image/jpeg');
 assert.ok(t&&t.length<2000,'miniatura com menos de 2 KB');assert.ok(big.length>t.length*20);
 assert.equal(makeThumb(big,'image/png'),null);assert.equal(makeThumb(Buffer.from('nao e foto'),'image/jpeg'),null);
});
test('rota ?thumb=1 entrega a miniatura e guarda para as proximas vezes',async t=>{
 const f=fixture(t);f.config.loginPassword=PASSWORD;f.config.loginEmail='owner@example.com';
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const token=(await (await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:PASSWORD})})).json()).token;
 const w=runtime.core?runtime.core.workspace:f.core.workspace;
 const e=w.save({kind:'file',title:'cupom.jpg',area:'Pessoal',state:'saved',tags:['chat-attachment'],data:{provider:'local',logical_path:'conversations/x',description:'Arquivo enviado na conversa com a Sofia'}});
 const bytes=photo(),aid=crypto.randomUUID();
 w.db.prepare('INSERT INTO attachments(id,entity_id,name,mime,bytes,sha256,blob,created_at) VALUES(?,?,?,?,?,?,?,?)').run(aid,e.id,'cupom.jpg','image/jpeg',bytes.length,crypto.createHash('sha256').update(bytes).digest('hex'),bytes,new Date().toISOString());
 const r=await fetch(base+'/api/mobile/workspace/attachments/'+aid+'?thumb=1',{headers:{Authorization:'Bearer '+token}});
 assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');
 const thumb=Buffer.from(await r.arrayBuffer());assert.ok(thumb.length<2000,'miniatura leve');
 assert.ok(w.db.prepare('SELECT thumb FROM attachments WHERE id=?').get(aid).thumb.length>0,'guardada');
});
test('a foto da conversa vai para a Sofia ler e depois para Comprovantes no Drive',()=>{
 const m=fs.readFileSync(path.join(__dirname,'..','src/channels/mobile.js'),'utf8'),g=fs.readFileSync(path.join(__dirname,'..','src/services/google.js'),'utf8');
 assert.ok(m.includes('let images = await chatImages(text)'),'le as fotos anexadas');
 assert.ok(g.includes("COALESCE(e.tags,'') NOT LIKE '%chat-attachment%' OR a.created_at < ?"),'0.3.206: foto da conversa fica 24 h no servidor e depois vai para o Drive');
 assert.ok(g.includes("'Comprovantes'")&&g.includes("(await this.folderId('Comprovantes')) || dir"),'pasta Comprovantes');
 assert.ok(g.includes("UPDATE attachments SET drive_id=?, blob=? WHERE id=?"),'o original sai do servidor depois que o Drive confirma');
 const re=/!\[[^\]\n]*\]\(https?:\/\/[^\s)]*\/api\/attachments\/([A-Za-z0-9_-]+)\?inline=1\)/g;
 assert.equal([...'![cupom.jpg](https://sofiaos.up.railway.app/api/attachments/abc-123?inline=1)'.matchAll(re)][0][1],'abc-123');
});
