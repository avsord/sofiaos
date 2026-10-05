'use strict';
const {normalize}=require('../core/util');
const allowed=(privacy,route)=>route==='shared'?privacy==='shared':privacy!=='local';
function taskRecord(store,task){return {id:task.id,kind:'task',title:task.title,state:task.state,area:task.area,priority_level:task.priority_level,description:task.description,due_at:task.due_at,revision:task.revision,source_id:task.source_id,privacy:store.privacyOf('task',task.id)||'private'};}
function searchTasks(store,query,route='private',limit=6){
 const terms=normalize(query).split(/\W+/).filter(x=>x.length>2);
 return store.tasks().map(t=>taskRecord(store,t)).filter(t=>allowed(t.privacy,route))
  .map(t=>({...t,rank:terms.filter(word=>normalize(t.title+' '+t.description+' '+t.area).includes(word)).length}))
  .filter(t=>t.rank>0).sort((a,b)=>b.rank-a.rank).slice(0,limit);
}
function recentRecords(store,workspace,user,route='private'){
 const recent=store.messages(user.conversation_id,28).filter(m=>m.id!==user.id&&allowed(store.privacyOf('message',m.id)||'private',route));
 const sources=new Map(recent.map((m,i)=>[m.id,i])),records=new Map();
 function add(record,order){if(record&&!['contact','payment','invoice','approval','recipe_session'].includes(record.kind)&&allowed(record.privacy||'private',route))records.set(record.id,{...record,context_order:order});}
 // Existing records already point to the real source message, including records
 // created before this update. Never infer an ID from the assistant's prose.
 for(const task of store.tasks())if(sources.has(task.source_id))add(taskRecord(store,task),sources.get(task.source_id));
 if(sources.size){
  const ids=[...sources.keys()];
  const rows=store.db.prepare('SELECT id,source_id FROM entities WHERE owner=? AND source_id IN ('+ids.map(()=>'?').join(',')+')').all('owner-local',...ids);
  for(const row of rows)add(workspace.get(row.id),sources.get(row.source_id));
 }
 // Persisted response references also retain the target after a later update.
 for(let i=0;i<recent.length;i++){
  let refs=[];try{refs=JSON.parse(recent[i].refs||'[]');}catch{}
  if(!Array.isArray(refs))continue;
  for(const ref of refs){try{if(ref.kind==='task')add(taskRecord(store,store.task(ref.id)),i);else if(ref.kind==='entity')add(workspace.get(ref.id),i);}catch(e){if(e.code!=='NOT_FOUND')throw e;}}
 }
 return [...records.values()].sort((a,b)=>b.context_order-a.context_order).slice(0,12).map(r=>({id:r.id,kind:r.kind,title:r.title,state:r.state,area:r.area,priority_level:r.priority_level,description:String(r.description||'').slice(0,1000),content:String(r.content||'').slice(0,1000),data:r.data,revision:r.revision,due_at:r.due_at,source_message_id:r.source_id,privacy:r.privacy||'private'}));
}
function executionRefs(result){return (result?.items||[]).filter(item=>item?.id).slice(0,30).map(item=>({label:'Registro',id:item.id,kind:item.kind?(item.kind==='task'?'task':'entity'):'task',title:item.title||'Registro',snippet:''}));}
module.exports={searchTasks,recentRecords,executionRefs};
