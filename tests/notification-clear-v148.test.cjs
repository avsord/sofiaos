'use strict';
// Erro vermelho no sino ao apagar aviso: "Limpar notificações ... aguarda a atualização do servidor".
const {test}=require('node:test'),assert=require('node:assert/strict');
const {httpFixture}=require('./helpers.cjs');
const {OwnerAuth}=require('../src/services/owner-auth');
const {MobileSessions}=require('../src/services/mobile-sessions');
test('apagar um aviso e apagar todos funcionam no servidor',async t=>{
 const f=await httpFixture(t);const token=new MobileSessions(f.store,new OwnerAuth(f.config,f.store),f.config).issue('n').token;
 const w=f.workspace;w.notify('price','A','b',null,'info','k1');w.notify('price','B','b',null,'info','k2');w.notify('price','C','b',null,'info','k3');
 const call=(p,m='GET')=>fetch(f.base+'/api/mobile'+p,{method:m,headers:{Authorization:'Bearer '+token}}).then(async r=>({status:r.status,data:await r.json()}));
 const list=(await call('/notifications')).data.items;assert.equal(list.length,3);
 const one=await call('/md/notifications/'+list[0].id,'DELETE');assert.equal(one.status,200);assert.equal(one.data.removed,1);
 assert.equal((await call('/notifications')).data.items.length,2);
 const all=await call('/md/notifications/all','DELETE');assert.equal(all.data.removed,2);
 assert.equal((await call('/notifications')).data.items.length,0);
});
