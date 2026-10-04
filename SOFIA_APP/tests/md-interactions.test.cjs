'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const hierarchy=load('src/lib/page-hierarchy.ts');
const {projectPageDrop,dropLineY,comparePageOrder,descendantsOf}=load('src/lib/page-order.ts',{'./page-hierarchy':hierarchy});
const {localDateKey,monthCells,dayRecords,observationPoints,stableProductColor,priceGeometry}=load('src/lib/dashboard.ts');
const page=(id,parent='',rank=undefined)=>({id,title:id,kind:'user_page',state:'active',revision:1,data:{parent_id:parent,icon:'🖤',...(rank===undefined?{}:{sort_order:rank})}});
const rect=(p,y,depth=0)=>({page:p,depth,x:0,y,width:400,height:46});
function fixture(){const a=page('A'),b=page('B','A'),c=page('C','A'),d=page('D');return {a,b,c,d,pages:[a,b,c,d],rows:[rect(a,0),rect(b,46,1),rect(c,92,1),rect(d,160)]};}

test('MD1: drop at upper/lower edges reorders main pages without nesting',()=>{
 const {a,d,pages,rows}=fixture();
 assert.equal(projectPageDrop(pages,d,rows,120,2,0).kind,'before');
 const result=projectPageDrop(pages,d,rows,120,44,0);assert.equal(result.kind,'after');assert.equal(result.parentId,'');
 assert.equal(dropLineY(result,rows),138,'after a parent is after its visible children, not on top of them');
});
test('MD1: center of a different row previews inside, edges preview insertion',()=>{
 const {a,d,pages,rows}=fixture();let r=projectPageDrop(pages,d,rows,130,23,0);assert.equal(r.kind,'inside');assert.equal(r.parentId,a.id);assert.equal(dropLineY(r,rows),null);
 r=projectPageDrop(pages,d,rows,130,93,0);assert.equal(r.kind,'before');assert.equal(r.parentId,a.id);
});
test('MD1: gentle twelve-pixel outdent promotes to the level represented by the line',()=>{
 const {b,pages,rows}=fixture(),r=projectPageDrop(pages,b,rows,105,135,-12);
 assert.equal(r.parentId,'');assert.equal(r.anchorId,'A');assert.equal(r.kind,'after');assert.equal(r.depth,0);
});
test('MD1: crossing the parent group bottom by nine pixels can outdent vertically',()=>{
 const {b,pages,rows}=fixture(),r=projectPageDrop(pages,b,rows,105,147,0);
 assert.equal(r.parentId,'');assert.equal(r.kind,'after');assert.equal(r.anchorId,'A');assert.equal(dropLineY(r,rows),138);
});
test('MD1: a small vertical reorder inside the group keeps the parent',()=>{
 const {b,pages,rows}=fixture(),r=projectPageDrop(pages,b,rows,120,135,0);
 assert.equal(r.parentId,'A');assert.equal(r.anchorId,'C');assert.equal(r.kind,'after');assert.equal(r.depth,1);
});
test('MD1: nested pages go up one level, not directly to root',()=>{
 const root=page('Root'),a=page('A','Root'),b=page('B','A'),c=page('C','A');const pages=[root,a,b,c],rows=[rect(root,0),rect(a,46,1),rect(b,92,2),rect(c,138,2)];
 const r=projectPageDrop(pages,b,rows,130,181,-12);assert.equal(r.parentId,'Root');assert.equal(r.anchorId,'A');assert.equal(r.depth,1);
});
test('MD1: compact tree may promote a child when its parent row is not rendered',()=>{
 const a=page('A'),b=page('B','A'),c=page('C','A');const r=projectPageDrop([a,b,c],b,[rect(b,0),rect(c,46)],105,89,-12);
 assert.equal(r.anchorId,'A');assert.equal(r.parentId,'');assert.equal(r.lineY,92);
});
test('MD1: invalid self/descendant destinations never create cycles',()=>{
 const {a,b,c,pages,rows}=fixture();
 assert.deepEqual(Array.from(descendantsOf(pages,'A')).sort(),['A','B','C']);
 const r=projectPageDrop(pages,a,rows,120,70,0);assert.notEqual(r?.parentId,b.id);assert.notEqual(r?.parentId,c.id);
 assert.equal(projectPageDrop([a,b,c],a,rows.slice(0,3),120,70,0),null);
});
test('MD1/7: projection is pure and retains the real title, icon and page data',()=>{
 const f=fixture();f.b.title='Enjoythevoid';f.b.data.blocks_json='[{"text":"Não apagar"}]';const before=JSON.stringify(f);
 projectPageDrop(f.pages,f.b,f.rows,120,135,-12);assert.equal(JSON.stringify(f),before);
});
test('MD1: persisted numeric rank wins over alphabetical title and empty rank is not zero',()=>{
 const a=page('Z','',1024),b=page('A','',2048),c=page('C');assert.deepEqual([b,c,a].sort(comparePageOrder).map(p=>p.id),['Z','A','C']);
 assert.ok(comparePageOrder({...a,data:{sort_order:''}},b)>0);
});
test('MD5: monthly calendar preserves date-only strings and complete weeks',()=>{
 assert.equal(localDateKey('2026-10-03'),'2026-10-03');const cells=monthCells(new Date(2026,9,1));assert.equal(cells.length%7,0);assert.equal(cells.filter(Boolean).length,31);assert.equal(localDateKey(cells.filter(Boolean)[0]),'2026-10-01');
});
test('MD5: agenda combines reminders, commitments and dated tasks, excludes cancelled',()=>{
 const events=[{...page('event'),kind:'commitment',data:{start_at:'2026-10-03T12:00:00Z'}},{...page('reminder'),kind:'reminder',data:{remind_at:'2026-10-03T10:00:00Z'}},{...page('cancel'),kind:'commitment',state:'cancelled',data:{start_at:'2026-10-03T09:00:00Z'}}];
 const result=dayRecords(events,[{id:'task',title:'Tarefa',state:'open',due_at:'2026-10-03T11:00:00Z'}]);assert.deepEqual(Array.from(result,r=>r.id),['reminder','task','event']);
});
test('MD5: monitor chart uses actual numeric observed prices, never invented zero values',()=>{
 const at='2026-10-03T10:00:00Z',rows=[{id:'good',total_cents:2599,observed_at:at},{id:'missing',total_cents:null,observed_at:at},{id:'blank',total_cents:'',observed_at:at},{id:'bad',total_cents:100,observed_at:'invalid'},{id:'free',total_cents:0,observed_at:at}];
 const points=observationPoints(rows);assert.equal(points.length,2);assert.equal(points[0].value,25.99);assert.equal(points[1].value,0);assert.equal(stableProductColor('item-1'),stableProductColor('item-1'));
 assert.equal(priceGeometry([]),null);const g=priceGeometry([{monitor:page('M'),points:[points[0]],color:'blue',currency:'BRL'}]);assert.ok(g.lines[0].points.every(p=>p.every(Number.isFinite)));
});
test('MD2: both native icon sources are real 1024x1024 PNGs and vector masters exist',()=>{
 for(const name of ['icon','adaptive-foreground']){const p=fs.readFileSync(path.join(__dirname,'../assets/'+name+'.png'));assert.equal(p.toString('ascii',1,4),'PNG');assert.equal(p.readUInt32BE(16),1024);assert.equal(p.readUInt32BE(20),1024);}
 const svg=fs.readFileSync(path.join(__dirname,'../assets/icon-master.svg'),'utf8');assert.ok(svg.includes('<path'));assert.ok(!svg.includes('<image'));
});
test('MD3/6/10: short settings label, gear, shared notices and nested Apps gate are present',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');
 assert.ok(source.includes("label:'Perfil',icon:'user'"));assert.ok(source.includes('NotificationProvider'));assert.ok(source.includes("tab==='apps'&&workspaceDepth"));
 const workspace=fs.readFileSync(path.join(__dirname,'../src/screens/Workspace.tsx'),'utf8');assert.ok(workspace.includes('InternalBackGesture'));assert.ok(workspace.includes('NotificationBell'));
});


test('MD1: a lone child can leave its compact parent without a second row',()=>{
 const a=page('A'),b=page('B','A'),rows=[rect(b,0)];
 const left=projectPageDrop([a,b],b,rows,95,23,-12);
 assert.equal(left.parentId,'');assert.equal(left.anchorId,'A');assert.equal(dropLineY(left,rows),46);
 const below=projectPageDrop([a,b],b,rows,120,55,0);
 assert.equal(below.parentId,'');assert.equal(below.kind,'after');
 assert.equal(projectPageDrop([a,b],b,rows,120,23,0),null);
});
