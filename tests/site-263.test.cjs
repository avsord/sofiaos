'use strict';
// 0.3.263: comportamento do site (nao o texto do codigo): enderecos por tela entregam o site, arquivos vao comprimidos.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),fs=require('node:fs');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');
test('site: /apps/financas e /agenda abrem o site; JS chega comprimido (brotli e gzip) e descomprime igual',async t=>{
 const f=fixture(t);f.config.loginPassword='integration-test-password-only';f.config.loginEmail='owner@example.com';
 const webDir=path.join(f.config.root,'public','web');
 if(!fs.existsSync(path.join(webDir,'index.html'))){t.skip('site nao gerado');return;}
 const r=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(r.handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const get=(p,enc)=>new Promise((ok,bad)=>http.get(base+p,{headers:enc?{'Accept-Encoding':enc}:{}},res=>{const parts=[];res.on('data',d=>parts.push(d));res.on('end',()=>ok({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts)}));}).on('error',bad));
 for(const p of ['/apps/financas','/agenda','/inicio','/perfil']){const x=await get(p);assert.equal(x.status,200,p);assert.match(x.body.toString(),/<div id="root">/);}
 assert.equal((await get('/naoexiste')).status,404);
 const js=/src="(\/_expo\/static\/js\/web\/[^"]+\.js)"/.exec(fs.readFileSync(path.join(webDir,'index.html'),'utf8'))[1];
 const plain=await get(js),br=await get(js,'br'),gz=await get(js,'gzip');
 assert.equal(br.headers['content-encoding'],'br');assert.equal(gz.headers['content-encoding'],'gzip');
 assert.ok(br.body.length<plain.body.length/2,'comprimido de verdade');
 assert.ok(zlib.brotliDecompressSync(br.body).equals(plain.body));assert.ok(zlib.gunzipSync(gz.body).equals(plain.body));
});
