'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {fixture}=require('./helpers.cjs'),{createRuntime}=require('../src/core/runtime'),{MobileSessions}=require('../src/services/mobile-sessions'),{OwnerAuth}=require('../src/services/owner-auth');
test('web and mobile keep existing tokens after long inactivity and restart; logout still revokes',async t=>{
 const previous=process.env.RAILWAY_ENVIRONMENT;process.env.RAILWAY_ENVIRONMENT='test';
 t.after(()=>{if(previous===undefined)delete process.env.RAILWAY_ENVIRONMENT;else process.env.RAILWAY_ENVIRONMENT=previous;});
 const f=fixture(t);f.config.loginEmail='owner@example.com';f.config.loginPassword='isolated-test-password';
 const options={store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')};
 let runtime=createRuntime(f.config,options);const server=http.createServer((req,res)=>runtime.handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 const login=await fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:f.config.loginEmail,password:f.config.loginPassword})});
 const setCookie=login.headers.get('set-cookie'),cookie=setCookie.split(';')[0];assert.match(setCookie,/HttpOnly; Secure; SameSite=Lax; Max-Age=34560000/);
 const sessions=new MobileSessions(f.store,new OwnerAuth(f.config,f.store),f.config),issued=sessions.issue();
 // Simulate tokens issued by the old version whose deadline has already passed.
 f.store.db.exec('UPDATE web_sessions SET expires_ms=1; UPDATE mobile_sessions SET expires_ms=1');
 runtime=createRuntime(f.config,options);
 let response=await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=34560000/);
 const boot=await response.json();assert.equal(boot.auth.session_persistent,true);assert.equal(boot.auth.session_expires_at,null);
 response=await fetch(base+'/api/mobile/bootstrap',{headers:{Authorization:'Bearer '+issued.token}});assert.equal(response.status,200);
 await fetch(base+'/logout',{headers:{Cookie:cookie},redirect:'manual'});
 assert.equal((await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await fetch(base+'/api/mobile/bootstrap',{headers:{Authorization:'Bearer '+issued.token}})).status,200);
 sessions.revokeAll();assert.equal((await fetch(base+'/api/mobile/bootstrap',{headers:{Authorization:'Bearer '+issued.token}})).status,401);
});
