const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
test('500 imported Google events do not construct 1000 time-zone formatters per calendar pass',()=>{
 let count=0;const original=Intl.DateTimeFormat;function Counting(...args){count++;return new original(...args);}
 const recur=load('src/lib/agenda-recurrence.ts',{}, {Intl:{DateTimeFormat:Counting}}),from=new Date(2026,9,1),to=new Date('2026-11-01T00:00:00Z');
 const events=Array.from({length:500},(_,i)=>({id:String(i),kind:'commitment',state:'confirmed',title:'Google '+i,tags:[],data:{start_at:'2026-10-06T12:00:00Z'}}));
 for(let pass=0;pass<10;pass++){for(const event of events)assert.equal(recur.readRepeat(event).frequency,'none');assert.equal(recur.expandAgenda(events,from).length,500);}
 assert.equal(count,1);
 const invalid={tags:['sofia-repeat-v1:weekly:Invalid/Zone']};assert.equal(recur.readRepeat(invalid).timeZone,'UTC');const checked=count;for(let i=0;i<500;i++)recur.readRepeat(invalid);assert.equal(count,checked);
});
