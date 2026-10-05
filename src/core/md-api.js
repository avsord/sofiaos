'use strict';
// Called only after Sofia's web CSRF/session or native bearer validation.
const {OWNER}=require('../memory/store');
const {AppError,validId}=require('./util');
const {GoogleCalendarSync}=require('../services/google-calendar-sync');
const {CATALOG}=require('./catalog');
const KEY=Symbol.for('sofia.md.upgrade');
function installFields(){
 const append=(kind,field)=>{if(!CATALOG[kind].fields.some(x=>x.key===field.key))CATALOG[kind].fields.push(field);};
 append('user_page',{key:'sort_order',label:'Ordem da página',type:'number',developerOnly:true});
 for(const kind of ['commitment','reminder']){
  append(kind,{key:'calendar_recurring_id',label:'Série Google',type:'text',max:1024,developerOnly:true});
  append(kind,{key:'calendar_original_start',label:'Início original Google',type:'text',developerOnly:true});
  append(kind,{key:'calendar_time_zone',label:'Fuso Google',type:'text',developerOnly:true});
  append(kind,{key:'calendar_all_day',label:'Dia inteiro',type:'checkbox',developerOnly:true});
  append(kind,{key:'calendar_date_start',label:'Data inicial',type:'date',developerOnly:true});
  append(kind,{key:'calendar_date_end',label:'Data final exclusiva',type:'date',developerOnly:true});
 }
}
function comparePages(a,b){
 const rank=p=>p.data?.sort_order!==''&&p.data?.sort_order!=null&&Number.isFinite(Number(p.data.sort_order))?Number(p.data.sort_order):null;
 const ar=rank(a),br=rank(b);if(ar!=null&&br!=null&&ar!==br)return ar-br;if(ar!=null&&br==null)return -1;if(ar==null&&br!=null)return 1;
 return a.title.localeCompare(b.title,'pt-BR')||a.id.localeCompare(b.id);
}
function computeMove(pages,input){
 const byId=new Map(pages.map(p=>[p.id,p])),page=byId.get(input.id),anchor=byId.get(input.anchorId);
 if(!page||!anchor)throw new AppError('NOT_FOUND','A página de origem ou de destino não está mais disponível.',404);
 if(page.revision!==input.revision)throw new AppError('REVISION_CONFLICT','A página mudou. Atualize a lista antes de movê-la.',409);
 if(!['before','after','inside'].includes(input.kind))throw new AppError('BAD_DROP','Destino de arraste inválido.');
 const parent=String(input.parentId||'');
 if(input.kind==='inside'?parent!==anchor.id:parent!==String(anchor.data?.parent_id||''))throw new AppError('STALE_DROP','A hierarquia mudou durante o arraste. Tente novamente.',409);
 const seen=new Set();let cursor=parent;
 while(cursor){if(cursor===page.id||seen.has(cursor))throw new AppError('PAGE_CYCLE','Uma página não pode ficar dentro dela mesma.',409);seen.add(cursor);const p=byId.get(cursor);if(!p)throw new AppError('NOT_FOUND','Página pai indisponível.',404);cursor=String(p.data?.parent_id||'');}
 if(anchor.id===page.id)throw new AppError('BAD_DROP','Não é possível soltar uma página sobre ela mesma.');
 const siblings=pages.filter(p=>p.id!==page.id&&String(p.data?.parent_id||'')===parent).sort(comparePages);
 let index=siblings.length;
 if(input.kind!=='inside'){index=siblings.findIndex(p=>p.id===anchor.id);if(index<0)throw new AppError('STALE_DROP','O destino mudou.',409);if(input.kind==='after')index++;}
 siblings.splice(index,0,page);
 return siblings.map((p,i)=>({page:p,parentId:parent,sort_order:(i+1)*1024}));
}
function getMdRuntime(runtime){
 if(runtime[KEY])return runtime[KEY];installFields();
 const {store,workspace}=runtime;
 const calendar=new GoogleCalendarSync(runtime);
 // Schedule changes at the source, including changes made by chat actions, not only UI.
 const save=workspace.save.bind(workspace),del=workspace.deleteEntity.bind(workspace);
 workspace.save=function(input,id){const result=save(input,id);if(!calendar.applying&&['commitment','reminder'].includes(result.kind))calendar.schedule();return result;};
 workspace.deleteEntity=function(id){const old=workspace.get(id),result=del(id);if(['commitment','reminder'].includes(old.kind))calendar.schedule();return result;};
 const service={calendar,move(input){
  validId(input.id);validId(input.anchorId);if(input.parentId)validId(input.parentId);
  return store.tx(()=>{
   const ids=store.db.prepare("SELECT id FROM entities WHERE owner=? AND kind='user_page' AND state<>'archived'").all(OWNER);
   const pages=ids.map(p=>workspace.get(p.id)),changes=computeMove(pages,input),items=[];
   for(const move of changes){const p=workspace.get(move.page.id);if(p.data?.sort_order===move.sort_order&&String(p.data?.parent_id||'')===move.parentId){items.push(p);continue;}
    items.push(workspace.save({revision:p.revision,data:{...p.data,parent_id:move.parentId,node_type:move.parentId?'page':'space',sort_order:move.sort_order}},p.id));
   }
   return {items};
  });
 }};
 runtime[KEY]=service;calendar.start();return service;
}
function makeMdApi(runtime,{bodyJson,json}){
 const service=getMdRuntime(runtime),{store}=runtime;
 return async function mdApi(req,res,p,m,url){
  if(!p.startsWith('/api/md/'))return false;
  const send=value=>{json(res,200,value);return true;};
  if(p==='/api/md/capabilities'&&m==='GET')return send({version:2,task_intervals:true,dashboard_widgets:true,conversation_delete:true,notifications_unread:true,page_order:true,notifications_paged:true,google_calendar:service.calendar.status().configured});
  if(p==='/api/md/conversations'&&m==='DELETE'){const b=await bodyJson(req,8192);if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>50)throw new AppError('BAD_SELECTION','Selecione de 1 a 50 conversas.');b.ids.forEach(validId);return send(store.clearChatHistory([...new Set(b.ids)]));}
  if(p==='/api/md/dashboard'&&m==='GET')return send({widgets:store.settings().homeWidgets});
  if(p==='/api/md/dashboard'&&m==='PATCH'){const b=await bodyJson(req,8192);if(!Array.isArray(b.widgets)||b.widgets.some(x=>!['monitoring','tasks','priorities','study','notifications'].includes(x)))throw new AppError('BAD_WIDGETS','Widgets inválidos.');store.updateSettings({homeWidgets:b.widgets});return send({widgets:store.settings().homeWidgets});}
  if(p==='/api/md/pages/move'&&m==='POST')return send(service.move(await bodyJson(req,8192)));
  if(p==='/api/md/notifications'&&m==='GET'){
   const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new AppError('BAD_PAGE','Página inválida.');
   const rows=store.db.prepare("SELECT n.*,COALESCE(e.area,'Geral') area FROM notifications n LEFT JOIN entities e ON e.id=n.entity_id WHERE e.owner=? OR e.id IS NULL ORDER BY n.created_at DESC,n.rowid DESC LIMIT 101 OFFSET ?").all(OWNER,offset);
   const unread=store.db.prepare("SELECT COUNT(*) AS n FROM notifications n LEFT JOIN entities e ON e.id=n.entity_id WHERE n.state='unread' AND (e.owner=? OR e.id IS NULL)").get(OWNER).n;
   return send({items:rows.slice(0,100),next_offset:rows.length>100?offset+100:null,unread});
  }
  const notification=p.match(/^\/api\/md\/notifications\/([\w-]+)$/);
  if(notification&&m==='PATCH'){const b=await bodyJson(req,2048);if(!['read','unread'].includes(b.state))throw new AppError('BAD_STATE','Estado inválido.');validId(notification[1]);store.db.prepare("UPDATE notifications SET state=? WHERE id=? AND (entity_id IS NULL OR entity_id='' OR entity_id NOT IN (SELECT id FROM entities) OR entity_id IN (SELECT id FROM entities WHERE owner=?))").run(b.state,notification[1],OWNER);return send({ok:true});}
  if(notification&&m==='DELETE'){
   if(notification[1]==='all')store.db.prepare("DELETE FROM notifications WHERE entity_id IS NULL OR entity_id='' OR entity_id NOT IN (SELECT id FROM entities) OR entity_id IN (SELECT id FROM entities WHERE owner=?)").run(OWNER);
   else {validId(notification[1]);store.db.prepare("DELETE FROM notifications WHERE id=? AND (entity_id IS NULL OR entity_id='' OR entity_id NOT IN (SELECT id FROM entities) OR entity_id IN (SELECT id FROM entities WHERE owner=?))").run(notification[1],OWNER);}
   return send({ok:true});
  }
  const cal=service.calendar;
  if(p==='/api/md/calendar/status'&&m==='GET')return send(cal.status());
  if(p==='/api/md/calendar/connect'&&m==='POST'){await bodyJson(req,2048);return send(cal.createTicket());}
  if(p==='/api/md/calendar/disconnect'&&m==='POST'){await bodyJson(req,2048);await cal.disconnect();return send({ok:true});}
  if(p==='/api/md/calendar/select'&&m==='POST'){const body=await bodyJson(req,4096);await cal.select(body.id);return send({ok:true});}
  if(p==='/api/md/calendar/sync'&&m==='POST'){await bodyJson(req,2048);await cal.sync();return send({ok:true,...cal.status()});}
  throw new AppError('NOT_FOUND','Operação desconhecida.',404);
 };
}
module.exports={makeMdApi,getMdRuntime,computeMove,comparePages,installFields};
