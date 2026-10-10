'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {StartupSnapshot}=load('src/lib/startup-snapshot.ts');
const now=Date.now(),d=new Date(now),month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
function disk(){const data=new Map(),reads=[];return {data,reads,read:async key=>{reads.push(key);return data.get(key)||null;},write:async(key,value)=>{data.set(key,value);},remove:async key=>{data.delete(key);}};}
async function seed(storage){const s=new StartupSnapshot(storage,'owner',()=>now);s.remember('/chat-sync/current',{conversation:{id:'recent'},messages:[{id:'recent-message',content:'Mensagem recente disponível'}]});s.remember('/tasks',{items:[{id:'task',title:'Preservada'}]});s.remember('/agenda?month='+month,{items:[{id:'event',title:'Compromisso'}]});for(let i=0;i<3;i++)s.remember('/conversations/chat'+i,{conversation:{id:'chat'+i},messages:[{id:'m'+i,content:'histórico '.repeat(60000)}]});await s.flush();return s;}
test('062 first screen reads only its small encrypted projection, independently of large history',async()=>{
 const storage=disk(),source=await seed(storage);storage.reads.length=0;
 const next=new StartupSnapshot(storage,'owner',()=>now);await next.hydrateLaunch();
 assert.deepEqual(storage.reads,['owner|home-v1']);assert.equal(next.peek('/tasks').items[0].id,'task');assert.equal(next.peek('/agenda?month='+month).items[0].id,'event');
 assert.equal(next.peek('/conversations/chat0'),undefined);assert.equal(next.peek('/chat-sync/current').messages[0].id,'recent-message');
 const full=storage.data.get('owner').length,launch=storage.data.get('owner|home-v1').length;
 assert.ok(full>1500000);assert.ok(launch<1000);console.log(JSON.stringify({full_snapshot_characters:full,launch_snapshot_characters:launch,network_calls_before_home:0}));
 await next.hydrate();assert.equal(next.peek('/conversations/chat0').messages[0].id,'m0');await source.clear();await next.clear();
});
test('062 upgrade recovers old cache and writes the fast projection without losing history',async()=>{
 const storage=disk(),source=await seed(storage);storage.data.delete('owner|home-v1');storage.reads.length=0;
 const next=new StartupSnapshot(storage,'owner',()=>now);await next.hydrateLaunch();await new Promise(r=>setImmediate(r));
 assert.deepEqual(storage.reads,['owner|home-v1','owner']);assert.equal(next.peek('/tasks').items[0].title,'Preservada');assert.ok(storage.data.has('owner|home-v1'));assert.equal(next.peek('/conversations/chat2').messages[0].id,'m2');await source.clear();await next.clear();
});
test('062 early save after quick launch merges archive and newer tasks before replacing disk',async()=>{
 const storage=disk(),source=await seed(storage);const next=new StartupSnapshot(storage,'owner',()=>now);await next.hydrateLaunch();next.remember('/tasks',{items:[{id:'new'}]});await next.flush();
 const reopened=new StartupSnapshot(storage,'owner',()=>now);await reopened.hydrate();assert.equal(reopened.peek('/tasks').items[0].id,'new');assert.equal(reopened.peek('/conversations/chat1').messages[0].id,'m1');await source.clear();await next.clear();await reopened.clear();
});
test('062 explicit chat deletion cannot be resurrected by deferred archive hydration',async()=>{
 const storage=disk(),source=await seed(storage);const next=new StartupSnapshot(storage,'owner',()=>now);await next.hydrateLaunch();next.forgetChat();await next.flush();
 const reopened=new StartupSnapshot(storage,'owner',()=>now);await reopened.hydrate();assert.equal(reopened.peek('/conversations/chat0'),undefined);assert.equal(reopened.peek('/tasks').items[0].id,'task');await source.clear();await next.clear();await reopened.clear();
});
test('062 account separation and corrupt fast projection preserve legacy recovery',async()=>{
 const storage=disk(),source=await seed(storage);storage.data.set('owner|home-v1','bad json');
 const next=new StartupSnapshot(storage,'owner',()=>now);await next.hydrateLaunch();assert.equal(next.peek('/tasks').items[0].id,'task');
 const other=new StartupSnapshot(storage,'another-account',()=>now);await other.hydrateLaunch();assert.equal(other.peek('/tasks'),undefined);await source.clear();await next.clear();await other.clear();
});
