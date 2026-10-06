const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
function setup(fetch){const timers=[];const {createAgendaCache}=load('src/lib/agenda-cache.ts',{}, {setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}});return{cache:createAgendaCache(fetch,()=>10000),timers};}
const row=(id)=>({id,title:id,data:{}});
test('switching months selects the same day and clamps a short month immediately',()=>{
 const {useAgendaView}=load('src/lib/agenda-view.ts',{'react':{useReducer:()=>[0,()=>{}],useLayoutEffect:()=>{}},'./dashboard':load('src/lib/dashboard.ts')});
 const owner={},view=()=>useAgendaView(owner,'agenda');view().acceptTarget('2026-01-31',1);view().setMonth(new Date(2026,1,1));assert.equal(view().selected,'2026-02-28');view().setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1));assert.equal(view().selected,'2026-03-28');view().setSelected('2026-03-05');view().setMonth(new Date(2025,11,1));assert.equal(view().selected,'2025-12-05');
});
test('neighboring months are prefetched and revisits read synchronously without duplicate requests',async()=>{
 const calls=[];const {cache}=setup(async month=>{calls.push(month);return{items:[row(month)]};});await cache.warm('2026-10');assert.deepEqual(calls.sort(),['2026-09','2026-10','2026-11']);assert.equal(cache.snapshot('2026-11').items[0].id,'2026-11');await cache.load('2026-11');assert.equal(calls.length,3);
});
test('concurrent Home and Agenda reads share request; late month response cannot replace selected month',async()=>{
 const pending={};let calls=0;const {cache}=setup(month=>{calls++;return new Promise(resolve=>pending[month]=resolve);});const oct=cache.load('2026-10'),same=cache.load('2026-10'),nov=cache.load('2026-11');assert.equal(calls,2);pending['2026-11']({items:[row('nov')]});await nov;pending['2026-10']({items:[row('oct')]});await Promise.all([oct,same]);assert.equal(cache.snapshot('2026-11').items[0].id,'nov');assert.equal(cache.snapshot('2026-10').items[0].id,'oct');
});
test('pending Google import refreshes visible month automatically without another day tap',async()=>{
 let n=0,updates=0;const {cache,timers}=setup(async()=>++n===1?{items:[],refresh_pending:true}:{items:[row('arrived')],refresh_pending:false});const stop=cache.subscribe('2028-10',()=>updates++);await cache.load('2028-10');assert.equal(cache.snapshot('2028-10').pending,true);assert.equal(timers.length,1);timers.shift()();await cache.load('2028-10');assert.equal(cache.snapshot('2028-10').items[0].id,'arrived');assert.equal(cache.snapshot('2028-10').pending,false);assert.ok(updates>=2);stop();
});
test('a failed background refresh retains saved events and retry updates them',async()=>{
 let fail=false;const {cache}=setup(async()=>{if(fail)throw Error('offline');return{items:[row('saved')]};});await cache.load('2026-10');fail=true;await cache.load('2026-10',true);assert.equal(cache.snapshot('2026-10').items[0].id,'saved');assert.equal(cache.snapshot('2026-10').error.message,'offline');fail=false;await cache.load('2026-10',true);assert.equal(cache.snapshot('2026-10').error,null);
});
