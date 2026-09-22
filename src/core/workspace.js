'use strict';
const crypto=require('node:crypto');
const {CATALOG}=require('./catalog');
const {OWNER}=require('../memory/store');
const {AppError,now,id,cleanText,rejectSecrets,normalize}=require('./util');
const AREAS=['Pessoal','Sofia OS','AVSORD','AVSORD Studio','AVSORD Technology','Enjoy The Void','Estudos','Assets','Geral'];
const PRIV=['private','local','shared','public'];
function parse(row){if(!row)return row;return {...row,data:JSON.parse(row.data),tags:JSON.parse(row.tags)};}
function dateISO(v,field='Data'){if(!v)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw new AppError('BAD_DATE',field+': informe uma data válida.');return v;}
function dateTime(v,field='Data'){if(!v)return '';if(typeof v!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))throw new AppError('BAD_DATE',field+': inclua data, hora e fuso.');return new Date(v).toISOString();}
function tags(v){const list=Array.isArray(v)?v:(typeof v==='string'?v.split(','):[]);if(list.length>20)throw new AppError('TAGS_LIMIT','Use até 20 labels.');return [...new Set(list.map(t=>cleanText(String(t),'Label',60)).filter(Boolean))];}
function url(v){if(!v)return '';let u;try{u=new URL(v);}catch{throw new AppError('BAD_URL','Informe um link completo http(s).');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new AppError('BAD_URL','Não use credenciais ou outro protocolo no link.');return u.toString();}
class Workspace {
 constructor(store){this.s=store;this.db=store.db;}
 get(entityId){const r=this.db.prepare('SELECT * FROM entities WHERE id=? AND owner=?').get(entityId,OWNER);if(!r)throw new AppError('NOT_FOUND','Registro não encontrado.',404);return parse(r);}
 list({kind,group,state,area,q,limit=200,offset=0}={}){
   if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0)throw new AppError('BAD_PAGE','Paginação inválida.');
   const clauses=['owner=?'],params=[OWNER];
   if(kind){if(!CATALOG[kind])throw new AppError('BAD_KIND','Categoria desconhecida.');clauses.push('kind=?');params.push(kind);}
   if(group){const kinds=Object.entries(CATALOG).filter(([,v])=>v.group===group).map(([k])=>k);if(!kinds.length)return [];clauses.push('kind IN ('+kinds.map(()=>'?').join(',')+')');params.push(...kinds);}
   if(state){clauses.push('state=?');params.push(state);}if(area){clauses.push('area=?');params.push(area);}
   if(q){const text=cleanText(q,'Busca',300);clauses.push("sofia_normalize(title || ' ' || content || ' ' || tags || ' ' || data) LIKE ? ESCAPE '!'");const escaped='%'+normalize(text).replace(/[!%_]/g,'!$&')+'%';params.push(escaped);}
   return this.db.prepare('SELECT * FROM entities WHERE '+clauses.join(' AND ')+' ORDER BY updated_at DESC,rowid DESC LIMIT ? OFFSET ?').all(...params,limit,offset).map(parse);
 }
 validate(input,old){
   const kind=old?.kind||input.kind,def=CATALOG[kind];if(!def)throw new AppError('BAD_KIND','Categoria inválida.');
   const title=cleanText(input.title??old?.title,'Título',240),content=cleanText(input.content??old?.content??'','Descrição',16000,true);
   rejectSecrets(title+'\n'+content);
   const area=cleanText(input.area||old?.area||'Geral','Área',80),state=input.state||old?.state||def.states[0];if(!def.states.includes(state))throw new AppError('BAD_STATE','Estado inválido para '+def.label+'.');
   let privacy=input.privacy||old?.privacy||def.defaultPrivacy||(def.group==='study'||def.group==='library'?'shared':'private');if(privacy==='public')privacy='shared';if(!PRIV.includes(privacy))throw new AppError('BAD_PRIVACY','Privacidade inválida.');if(def.private&&privacy==='shared')throw new AppError('PRIVATE_RECORD','Esse tipo de registro deve permanecer privado ou local.');
   const raw=input.data===undefined?(old?.data||{}):input.data;if(!raw||Array.isArray(raw)||typeof raw!=='object')throw new AppError('BAD_DATA','Campos inválidos.');
   const data={};const permitted=new Set(def.fields.map(f=>f.key));for(const k of Object.keys(raw))if(!permitted.has(k))throw new AppError('BAD_FIELD','Campo não previsto: '+k);
   for(const f of def.fields){let v=raw[f.key];if(v===undefined||v===null||v===''){data[f.key]=f.type==='checkbox'?false:'';continue;}
     if(f.type==='checkbox'){if(typeof v!=='boolean')throw new AppError('BAD_FIELD',f.label+': marque sim ou não.');}
     else if(f.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e10)throw new AppError('BAD_FIELD',f.label+': use um número positivo.');}
     else if(f.type==='date')v=dateISO(v,f.label);
     else if(f.type==='datetime')v=dateTime(v,f.label);
     else if(f.type==='time'){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw new AppError('BAD_TIME','Use HH:MM.');}
     else if(f.type==='select'){if(!f.options.includes(v))throw new AppError('BAD_FIELD',f.label+': escolha uma opção válida.');}
     else if(f.type==='url')v=url(v);
     else {v=cleanText(v,f.label,f.type==='textarea'?(f.max||16000):(f.max||1000),true);rejectSecrets(v);}
     data[f.key]=v;
   }
   if(kind==='user_page'){
     const allowedBlocks=new Set(['text','heading1','heading2','heading3','heading4','bullet','number','todo','toggle','code','quote','callout','equation','divider','page_link','image','file','table','date','task_link','commitment_link','bookmark','sofia','collection']);
     if(data.blocks_json){
       let blocks;try{blocks=JSON.parse(data.blocks_json);}catch{throw new AppError('BAD_PAGE_BLOCKS','O conteúdo em blocos da página está inválido.');}
       if(!Array.isArray(blocks)||blocks.length>500)throw new AppError('BAD_PAGE_BLOCKS','Use até 500 blocos por página.');
       for(const block of blocks){
         if(!block||typeof block!=='object'||Array.isArray(block))throw new AppError('BAD_PAGE_BLOCKS','Bloco inválido.');
         if(!allowedBlocks.has(String(block.type||'text')))throw new AppError('BAD_PAGE_BLOCKS','Tipo de bloco inválido.');
         const text=String(block.text||'');if(text.length>12000)throw new AppError('BAD_PAGE_BLOCKS','Um bloco não pode ultrapassar 12000 caracteres.');rejectSecrets(text);
         const html=String(block.html||'');if(html.length>24000||/<\/?(?:script|style|iframe|object|embed|form|svg)|on\w+\s*=|javascript\s*:/i.test(html))throw new AppError('BAD_PAGE_BLOCKS','Formatação rich text inválida.');rejectSecrets(html.replace(/<[^>]*>/g,' '));
         if(block.comments!==undefined){if(!Array.isArray(block.comments)||block.comments.length>100)throw new AppError('BAD_PAGE_BLOCKS','Use até 100 comentários por bloco.');for(const c of block.comments){if(!c||typeof c!=='object'||Array.isArray(c))throw new AppError('BAD_PAGE_BLOCKS','Comentário inválido.');const q=String(c.quote||''),body=String(c.text||'');if(q.length>2000||body.length>4000)throw new AppError('BAD_PAGE_BLOCKS','Comentário grande demais.');rejectSecrets(q);rejectSecrets(body);}}
         if(block.data!==undefined){if(!block.data||typeof block.data!=='object'||Array.isArray(block.data))throw new AppError('BAD_PAGE_BLOCKS','Dados do bloco inválidos.');const packed=JSON.stringify(block.data);if(packed.length>50000)throw new AppError('BAD_PAGE_BLOCKS','Dados do bloco grandes demais.');rejectSecrets(packed);if(block.type==='table'&&block.data.rows!==undefined){if(!Array.isArray(block.data.rows)||block.data.rows.length>50||block.data.rows.some(r=>!Array.isArray(r)||r.length>20||r.some(c=>String(c??'').length>3000)))throw new AppError('BAD_PAGE_BLOCKS','Tabela limitada a 50 linhas, 20 colunas e 3000 caracteres por célula.');}}
       }
     }
     if(data.parent_id){
       if(old&&data.parent_id===old.id)throw new AppError('PAGE_SELF_PARENT','Uma página não pode ficar dentro dela mesma.',409);
       const parent=this.get(data.parent_id);if(parent.kind!=='user_page'||parent.state==='archived')throw new AppError('PAGE_PARENT_INVALID','A página pai não está disponível.',409);
       let cursor=parent,depth=0;
       while(cursor?.data?.parent_id&&depth<30){
         if(old&&cursor.data.parent_id===old.id)throw new AppError('PAGE_CYCLE','Esse movimento criaria um ciclo entre páginas.',409);
         cursor=this.get(cursor.data.parent_id);depth++;
       }
       data.node_type='page';
     }else data.node_type='space';
   }
   if(kind==='purchase'&&data.purchase_group_id){const group=this.get(data.purchase_group_id);if(group.kind!=='purchase_group'||group.state==='archived')throw new AppError('PURCHASE_GROUP_REQUIRED','O grupo de compra selecionado não está disponível.');}
   if(kind==='shopping_item'&&data.list==='pharmacy')privacy='private';
   if(['AVSORD','AVSORD Studio','AVSORD Technology'].includes(area)&&['file','project','request','approval'].includes(kind))privacy='private';
   if(kind==='contact'&&!data.permission)data.permission='blocked';
   if(kind==='lesson'&&(!data.course_id||this.get(data.course_id).kind!=='course'))throw new AppError('COURSE_REQUIRED','Selecione um curso existente para esta aula.');
   if(kind==='list_item'){if(!data.collection_id)throw new AppError('LIST_REQUIRED','Selecione uma lista personalizada.');const collection=this.get(data.collection_id);if(collection.kind!=='list_collection')throw new AppError('LIST_REQUIRED','A lista selecionada não é uma lista personalizada válida.');if(!input.privacy&&!old?.privacy)privacy=collection.privacy;}
   if(['commitment','reminder'].includes(kind)){data.calendar_provider=data.calendar_provider||'local';data.sync_state=data.sync_state||'local';}
   if(kind==='commitment'&&data.end_at&&data.start_at&&data.end_at<=data.start_at)throw new AppError('BAD_DATE','O fim precisa ser posterior ao início.');
   if(kind==='course'&&data.progress!==''&&data.progress>100)throw new AppError('BAD_PROGRESS','Progresso deve ficar entre 0 e 100.');
   if(kind==='monitor'){
     if(!data.target_id||!['purchase','course'].includes(this.get(data.target_id).kind))throw new AppError('TARGET_REQUIRED','O monitor deve referenciar um item de Comprar ou um curso existente.');
     if(!data.variant)throw new AppError('VARIANT_REQUIRED','Defina a variante exata para não comparar produtos diferentes.');
     data.currency=data.currency||'BRL';data.method=data.method||'manual';data.interval_minutes=data.interval_minutes||360;
     if(!Number.isInteger(data.interval_minutes)||data.interval_minutes<15||data.interval_minutes>43200)throw new AppError('BAD_INTERVAL','Intervalo entre 15 e 43200 minutos.');
     if(data.drop_percent!==''&&data.drop_percent>100)throw new AppError('BAD_PERCENT','Queda deve ficar entre 0 e 100%.');
     if(data.method==='json'&&(!data.feed_url||!data.price_path||!data.variant_path||!data.currency_path||!data.consent))throw new AppError('FEED_REQUIRED','Informe feed HTTPS autorizado, campos de preço/variante/moeda e consentimento.');
     if(data.feed_url&&[...new URL(data.feed_url).searchParams.keys()].some(k=>/token|api.?key|auth|secret|signature/i.test(k)))throw new AppError('SECRET_FEED','Use um feed público sem tokens, assinaturas ou credenciais na URL.');
     if(data.feed_url&&!data.feed_url.startsWith('https://'))throw new AppError('BAD_FEED','O feed precisa usar HTTPS.');
     if(old&&this.db.prepare('SELECT id FROM observations WHERE monitor_id=? LIMIT 1').get(old.id)&&['target_id','variant','currency'].some(k=>data[k]!==old.data[k]))throw new AppError('OBSERVATION_SCOPE','Esse monitor já tem observações. Crie outro para mudar produto, variante ou moeda.');
   }
   if(kind==='routine'&&state==='active'){
     if(!data.frequency||!data.time||!data.starts_on||!data.delivery)throw new AppError('ROUTINE_INCOMPLETE','Defina frequência, horário, início e entrega antes de ativar.');
     if(data.frequency==='weekly'&&(!Number.isInteger(data.weekday)||data.weekday>6))throw new AppError('BAD_WEEKDAY','Dia da semana: 0 a 6.');
     if(data.frequency==='monthly'&&(!Number.isInteger(data.monthday)||data.monthday<1||data.monthday>31))throw new AppError('BAD_MONTHDAY','Dia do mês: 1 a 31.');
     if(data.ends_on&&data.ends_on<data.starts_on)throw new AppError('BAD_DATE','O término precede o início.');
   }
   let finalState=state;
   if(kind==='approval'){
     const changed=old&&['proposed_text','recipient','channel','sender'].some(k=>data[k]!==old.data[k]);
     if(state==='approved'&&input.confirm_approval!==true&&old?.state!=='approved')throw new AppError('CONFIRM_REQUIRED','Revise destinatário, remetente e texto, então use Aprovar.');
     if(changed&&old.state==='approved')finalState='pending';
     if(finalState==='approved')data.approved_revision=(old?.revision||0)+1;
   }
   if(kind==='recipe'&&state==='ready'&&(!data.ingredients||!data.steps))throw new AppError('RECIPE_INCOMPLETE','Uma receita pronta precisa de ingredientes e preparo. Mantenha rascunho se faltarem.');
   const labels=tags(input.tags??old?.tags??[]);if(kind==='purchase'&&data.occasion==='black-friday'&&!labels.includes('Black Friday'))labels.push('Black Friday');
   return {kind,title,content,area,privacy,state:finalState,data,tags:labels};
 }
 event(type,entityId,event,area,summary){this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?)').run(id(),type,entityId,event,area,summary.slice(0,500),now());}
 save(input,entityId){const old=entityId?this.get(entityId):null;if(old&&input.revision!==old.revision)throw new AppError('REVISION_CONFLICT','Este registro mudou em outra aba. Reabra antes de salvar.',409);
   const v=this.validate(input,old);const inherited=this.s.privacyOf('message',input.source_id||old?.source_id);if(inherited==='local')v.privacy='local';else if(!input.privacy&&inherited==='shared'&&!CATALOG[v.kind].private)v.privacy='shared';else if(!input.privacy&&inherited==='private')v.privacy='private';const key=entityId||id(),revision=(old?.revision||0)+1,stamp=now();
   return this.s.tx(()=>{
     if(old)this.db.prepare('UPDATE entities SET title=?,content=?,area=?,tags=?,privacy=?,state=?,data=?,revision=?,updated_at=? WHERE id=?').run(v.title,v.content,v.area,JSON.stringify(v.tags),v.privacy,v.state,JSON.stringify(v.data),revision,stamp,key);
     else this.db.prepare('INSERT INTO entities VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(key,OWNER,v.kind,v.title,v.content,v.area,JSON.stringify(v.tags),v.privacy,v.state,JSON.stringify(v.data),input.source_id?this.s.source(input.source_id):null,revision,stamp,stamp);
     const saved=this.get(key);this.db.prepare('INSERT INTO entity_versions VALUES(?,?,?,?,?)').run(id(),key,revision,JSON.stringify(saved),stamp);
     this.event('entity',key,old?'updated':'created',v.area,v.title);this.s.audit('workspace.'+(old?'updated':'created'),key);
     if(v.kind==='monitor'||v.kind==='routine')this.syncJob(saved);
     return saved;
   });
 }
 changeState(entityId,state,revision,extra={}){const old=this.get(entityId);return this.save({...old,...extra,state,revision},entityId);}
 deleteEntity(entityId){
   const e=this.get(entityId);
   if(e.kind==='user_page'){
     const pages=this.list({kind:'user_page',limit:500}),byParent=new Map();for(const p of pages){const parent=p.data?.parent_id||'';if(!byParent.has(parent))byParent.set(parent,[]);byParent.get(parent).push(p);}
     const ordered=[],seen=new Set();const walk=id=>{for(const child of byParent.get(id)||[]){if(seen.has(child.id))continue;seen.add(child.id);walk(child.id);ordered.push(child);}};walk(entityId);ordered.push(e);
     const ids=new Set(ordered.map(x=>x.id)),all=this.list({limit:500});
     for(const target of ordered){for(const other of all){if(ids.has(other.id))continue;if(JSON.stringify(other.data||{}).includes(target.id))throw new AppError('ENTITY_IN_USE','A página “'+target.title+'” ainda é usada por “'+other.title+'”. Remova ou altere esse vínculo antes de excluir.',409);}const links=this.db.prepare("SELECT * FROM relations WHERE (from_type='entity' AND from_id=?) OR (to_type='entity' AND to_id=?)").all(target.id,target.id);for(const link of links){const other=(link.from_type==='entity'&&link.from_id===target.id)?link.to_id:link.from_id;if(!ids.has(other))throw new AppError('ENTITY_IN_USE','A página “'+target.title+'” possui vínculo com outro registro. Remova esse vínculo antes de excluir.',409);}}
     return this.s.tx(()=>{for(const target of ordered){this.db.prepare("DELETE FROM relations WHERE (from_type='entity' AND from_id=?) OR (to_type='entity' AND to_id=?)").run(target.id,target.id);this.db.prepare('DELETE FROM observations WHERE monitor_id=?').run(target.id);this.db.prepare('DELETE FROM jobs WHERE entity_id=?').run(target.id);this.db.prepare('DELETE FROM attachments WHERE entity_id=?').run(target.id);this.db.prepare('DELETE FROM notifications WHERE entity_id=?').run(target.id);this.db.prepare('DELETE FROM events WHERE entity_type=? AND entity_id=?').run('entity',target.id);this.db.prepare('DELETE FROM annotations WHERE entity_type=? AND entity_id=?').run('entity',target.id);this.db.prepare('DELETE FROM entity_versions WHERE entity_id=?').run(target.id);this.db.prepare('DELETE FROM entities WHERE id=? AND owner=?').run(target.id,OWNER);this.s.audit('workspace.deleted',target.id);}return {ok:true,id:entityId,title:e.title,kind:e.kind,deleted_ids:ordered.map(x=>x.id),deleted_total:ordered.length};});
   }
   const token='%'+entityId+'%';
   const dependent=this.db.prepare("SELECT id,title,kind FROM entities WHERE id<>? AND data LIKE ? LIMIT 1").get(entityId,token);
   if(dependent)throw new AppError('ENTITY_IN_USE','Este registro ainda é usado por “'+dependent.title+'”. Remova ou altere esse vínculo antes de excluir.',409);
   const linked=this.db.prepare("SELECT id FROM relations WHERE (from_type='entity' AND from_id=?) OR (to_type='entity' AND to_id=?) LIMIT 1").get(entityId,entityId);
   if(linked)throw new AppError('ENTITY_IN_USE','Este registro possui vínculos. Remova os vínculos antes de excluir.',409);
   return this.s.tx(()=>{
     this.db.prepare('DELETE FROM observations WHERE monitor_id=?').run(entityId);
     this.db.prepare('DELETE FROM jobs WHERE entity_id=?').run(entityId);
     this.db.prepare('DELETE FROM attachments WHERE entity_id=?').run(entityId);
     this.db.prepare('DELETE FROM notifications WHERE entity_id=?').run(entityId);
     this.db.prepare('DELETE FROM events WHERE entity_type=? AND entity_id=?').run('entity',entityId);
     this.db.prepare('DELETE FROM annotations WHERE entity_type=? AND entity_id=?').run('entity',entityId);
     this.db.prepare('DELETE FROM entity_versions WHERE entity_id=?').run(entityId);
     this.db.prepare('DELETE FROM entities WHERE id=? AND owner=?').run(entityId,OWNER);
     this.s.audit('workspace.deleted',entityId);return {ok:true,id:entityId,title:e.title,kind:e.kind,deleted_ids:[entityId],deleted_total:1};
   });
  }
 versions(entityId){this.get(entityId);return this.db.prepare('SELECT * FROM entity_versions WHERE entity_id=? ORDER BY revision DESC').all(entityId).map(r=>({...r,snapshot:JSON.parse(r.snapshot)}));}
 reference(type,key){if(type==='entity')return this.get(key);if(type==='note')return this.s.note(key);if(type==='task')return this.s.task(key);if(type==='message')return this.s.message(key);throw new AppError('BAD_REFERENCE','Tipo de vínculo inválido.');}
 link(b){const a=this.reference(b.from_type,b.from_id),z=this.reference(b.to_type,b.to_id);if(b.from_type===b.to_type&&b.from_id===b.to_id)throw new AppError('SELF_LINK','Não vincule o registro a ele mesmo.');const kind=cleanText(b.kind||'related','Relação',80);rejectSecrets(kind);this.db.prepare('INSERT OR IGNORE INTO relations VALUES(?,?,?,?,?,?,?)').run(id(),b.from_type,a.id,b.to_type,z.id,kind,now());return this.links(b.from_type,a.id);}
 links(type,key){this.reference(type,key);return this.db.prepare('SELECT * FROM relations WHERE (from_type=? AND from_id=?) OR (to_type=? AND to_id=?) ORDER BY created_at DESC').all(type,key,type,key);}
 timeline({area='',limit=100,offset=0}={}){
   if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0)throw new AppError('BAD_PAGE','Paginação inválida.');
   const query=`SELECT * FROM (
    SELECT id,entity_type,entity_id,event,area,summary,created_at FROM events
    UNION ALL SELECT v.id,'note',n.id,'version',n.area,n.title,v.created_at FROM note_versions v JOIN notes n ON n.id=v.note_id
    UNION ALL SELECT v.id,'task',t.id,'version',t.area,t.title,v.created_at FROM task_versions v JOIN tasks t ON t.id=v.task_id
    UNION ALL SELECT c.id,'checkpoint',c.id,c.reason,'Sofia OS',c.topic,c.created_at FROM checkpoints c
   ) WHERE (?='' OR area=?) ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`;
   return this.db.prepare(query).all(area,area,limit,offset);
 }
 notify(category,title,body,entityId,importance='info',dedup=null){this.db.prepare('INSERT OR IGNORE INTO notifications VALUES(?,?,?,?,?,?,?, ?,?)').run(id(),category,title,body,entityId||null,importance,'unread',dedup,now());}
 notifications(){return this.db.prepare("SELECT n.*,COALESCE(e.area,'Geral') AS area FROM notifications n LEFT JOIN entities e ON e.id=n.entity_id ORDER BY n.created_at DESC,n.rowid DESC LIMIT 300").all();}
 markRead(key){this.db.prepare("UPDATE notifications SET state='read' WHERE id=?").run(key);return {ok:true};}
 syncJob(e){const active=e.state==='active'&&(e.kind==='routine'||e.data.method==='json');this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,0) ON CONFLICT(entity_id,kind) DO UPDATE SET state=excluded.state,next_at=CASE WHEN jobs.state<>excluded.state THEN excluded.next_at ELSE jobs.next_at END,interval_minutes=excluded.interval_minutes').run(id(),e.id,e.kind,active?'active':'paused',active?now():null,null,null,e.kind==='monitor'?e.data.interval_minutes:1);}
 observations(key){if(this.get(key).kind!=='monitor')throw new AppError('BAD_KIND','Não é um monitor.');return this.db.prepare('SELECT * FROM observations WHERE monitor_id=? ORDER BY observed_at ASC,rowid ASC').all(key);}
 observe(key,b){const mon=this.get(key);if(mon.kind!=='monitor')throw new AppError('BAD_KIND','Não é um monitor.');
   const price=Number(b.price),shipping=Number(b.shipping??0);if(!Number.isFinite(price)||price<=0||price>1e8||!Number.isFinite(shipping)||shipping<0||shipping>1e8)throw new AppError('BAD_PRICE','Informe preço positivo e frete não negativo.');
   if(b.variant!==mon.data.variant||b.currency!==mon.data.currency)throw new AppError('VARIANT_MISMATCH','A moeda ou variante não corresponde ao monitor. Observação recusada.');
   const source=cleanText(b.source,'Fonte',1000),when=b.observed_at?dateTime(b.observed_at):now();rejectSecrets(source);
   if(Date.parse(when)>Date.now()+60000)throw new AppError('FUTURE_OBSERVATION','Uma observação não pode vir do futuro.');
   const previous=this.observations(key),cents=Math.round(price*100),freight=Math.round(shipping*100),total=cents+freight,sourceKey=b.source_key?cleanText(b.source_key,'ID da observação',160):null;
   const duplicate=sourceKey&&this.db.prepare('SELECT * FROM observations WHERE monitor_id=? AND source_key=?').get(key,sourceKey);if(duplicate)return {...duplicate,replayed:true};
   return this.s.tx(()=>{const oid=id();this.db.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(oid,key,cents,freight,total,b.currency,b.variant,source,when,now(),sourceKey);
     const history=previous.filter(p=>p.observed_at<=when),latest=history.at(-1),min=history.length?Math.min(...history.map(x=>x.total_cents)):null;
     const reasons=[];if(mon.data.target_price!==''&&total<=Math.round(mon.data.target_price*100))reasons.push('atingiu o preço-alvo');
     if(latest&&mon.data.drop_percent!==''&&total<latest.total_cents&&(latest.total_cents-total)/latest.total_cents*100>=mon.data.drop_percent)reasons.push('atingiu a queda percentual');
     if(mon.data.new_low&&min!==null&&total<min)reasons.push('menor total desde o início das suas observações');
     if(reasons.length&&(!previous.length||when>=previous.at(-1).observed_at)&&(!latest||latest.total_cents!==total))this.notify('price',mon.title+' — oportunidade',reasons.join('; ')+'. Total inclui o frete informado. Fonte: '+source,key,'opportunity',key+':'+total+':'+when.slice(0,10));
     this.event('entity',key,'observation',mon.area,'Observação de preço registrada');return this.db.prepare('SELECT * FROM observations WHERE id=?').get(oid);
   });
 }
 recipeFragment(key,text){const e=this.get(key);if(e.kind!=='recipe_session'||e.state!=='collecting')throw new AppError('NOT_COLLECTING','Abra uma sessão de receita em coleta.');const value=cleanText(text,'Fragmento',6000);const fragments=e.data.fragments+(e.data.fragments?'\n\n':'')+'['+now()+'] '+value;return this.save({...e,data:{...e.data,fragments}},e.id);}
 finishRecipeSession(key){const e=this.get(key);if(e.kind!=='recipe_session')throw new AppError('BAD_KIND','Não é uma sessão.');return this.save({...e,state:'questions',data:{...e.data,questions:e.data.questions||'Confira ingredientes/quantidades, preparo, tempo, temperatura quando aplicável e rendimento. Não completei nenhum dado ausente automaticamente.'}},key);}
 recipeToShopping(key){const e=this.get(key);if(e.kind!=='recipe')throw new AppError('BAD_KIND','Selecione uma receita.');const lines=[...new Set(e.data.ingredients.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];if(!lines.length)throw new AppError('NO_INGREDIENTS','A receita ainda não tem ingredientes.');if(lines.length>80)throw new AppError('TOO_MANY','Use até 80 ingredientes.');const existing=this.list({kind:'shopping_item',limit:500});const created=[];
   for(const line of lines){if(existing.some(x=>x.data.recipe_id===key&&x.title===line&&['needed','unavailable'].includes(x.state)))continue;created.push(this.save({kind:'shopping_item',title:line,area:e.area,data:{list:'market',recipe_id:key},tags:e.tags,source_id:e.source_id,privacy:e.privacy}));}
   return {created,notice:'Lista gerada das quantidades informadas. Confira o que já tem em casa; nenhum estoque foi presumido.'};
 }
 checkout(key){const e=this.get(key);if(e.kind!=='checkout')throw new AppError('BAD_KIND','Selecione uma saída.');const a=(e.data.items||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),b=(e.data.returned_items||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);return {original:a,returned:b,pending_confirmation:a.filter(x=>!b.some(y=>normalize(y)===normalize(x))),note:'Itens não confirmados não são classificados automaticamente como perdidos.'};}
 attach(key,{name,mime,base64}){this.get(key);name=cleanText(name,'Nome',160);if(/[\\/]/.test(name))throw new AppError('BAD_NAME','Use só o nome do arquivo.');if(!['audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/webm','application/pdf','application/json','application/zip','image/png','image/jpeg','image/webp','image/gif','text/plain','text/markdown','text/csv'].includes(mime))throw new AppError('BAD_MIME','Formato não permitido.');if(typeof base64!=='string'||base64.length>14*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new AppError('BAD_ATTACHMENT','Arquivo inválido ou maior que 10 MB.');const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>10*1024*1024)throw new AppError('BAD_ATTACHMENT','Use arquivo de 1 byte a 10 MB.');
   const total=this.db.prepare('SELECT COALESCE(SUM(bytes),0) AS n FROM attachments').get().n;if(total+bytes.length>50*1024*1024)throw new AppError('MEDIA_LIMIT','Limite local de anexos desta versão: 50 MB. Use referências externas para acervos maiores.');
   const a=id();this.db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').run(a,key,name,mime,bytes.length,crypto.createHash('sha256').update(bytes).digest('hex'),bytes,now());this.event('entity',key,'attachment',this.get(key).area,'Original anexado localmente');return this.attachmentList(key).find(x=>x.id===a);
 }
 attachmentList(key){this.get(key);return this.db.prepare('SELECT id,entity_id,name,mime,bytes,sha256,created_at FROM attachments WHERE entity_id=? ORDER BY created_at').all(key);}
 attachment(key){const a=this.db.prepare('SELECT * FROM attachments WHERE id=?').get(key);if(!a)throw new AppError('NOT_FOUND','Anexo não encontrado.',404);return a;}
 scopeCatalog(){
   const entities=this.list({limit:500}),tasks=this.s.tasks();
   const scopes=[];const entityRef=e=>({id:e.id,record_type:'entity',kind:e.kind,title:e.title,state:e.state});const taskRef=t=>({id:t.id,record_type:'task',kind:'task',title:t.title,state:t.state});
   const active=e=>!['archived','cancelled'].includes(e.state);const activeTask=t=>!['done','cancelled'].includes(t.state);
   const add=(scope_id,label,category,members,meta={})=>{const unique=[];const seen=new Set();for(const m of members){if(!m||seen.has(m.id))continue;seen.add(m.id);unique.push(m);}scopes.push({scope_id,label,category,count:unique.length,members:unique,...meta});};
   add('agenda','Agenda','system',entities.filter(e=>['commitment','reminder'].includes(e.kind)&&e.state!=='archived').map(entityRef),{ui_target:'commitments'});
   add('commitments','Compromissos','system',entities.filter(e=>e.kind==='commitment'&&e.state!=='archived').map(entityRef),{ui_target:'commitments'});
   add('reminders','Lembretes','system',entities.filter(e=>e.kind==='reminder'&&e.state!=='archived').map(entityRef),{ui_target:'commitments'});
   add('tasks','Tarefas','system',tasks.filter(activeTask).map(taskRef),{ui_target:'tasks'});
   add('priorities','Prioridades','system',tasks.filter(t=>activeTask(t)&&t.priority).map(taskRef),{ui_target:'tasks'});
   const libraryKinds=Object.entries(CATALOG).filter(([,v])=>v.group==='library').map(([k])=>k);add('library','Biblioteca','system',entities.filter(e=>libraryKinds.includes(e.kind)&&active(e)).map(entityRef),{ui_target:'library'});
   const studyKinds=Object.entries(CATALOG).filter(([,v])=>v.group==='study').map(([k])=>k);add('study','Estudos','system',entities.filter(e=>studyKinds.includes(e.kind)&&active(e)).map(entityRef),{ui_target:'study',protected_from_quick_delete:true});
   add('market','Mercado','list',entities.filter(e=>e.kind==='shopping_item'&&e.data.list==='market'&&active(e)).map(entityRef),{ui_target:'lists'});
   add('pharmacy','Farmácia','list',entities.filter(e=>e.kind==='shopping_item'&&e.data.list==='pharmacy'&&active(e)).map(entityRef),{ui_target:'lists'});
   add('purchase','Comprar','list',entities.filter(e=>e.kind==='purchase'&&active(e)).map(entityRef),{ui_target:'lists'});
   add('blackfriday','Black Friday','list',entities.filter(e=>e.kind==='purchase'&&active(e)&&(e.data.occasion==='black-friday'||e.tags.includes('Black Friday'))).map(entityRef),{ui_target:'lists'});
   add('monitors','Monitoramentos','system',entities.filter(e=>e.kind==='monitor'&&active(e)).map(entityRef),{ui_target:'lists'});
   for(const g of entities.filter(e=>e.kind==='purchase_group'&&e.state==='active'))add('purchase-group:'+g.id,g.title,'purchase_group',entities.filter(e=>e.kind==='purchase'&&active(e)&&e.data.purchase_group_id===g.id).map(entityRef),{ui_target:'lists',container_id:g.id});
   for(const c of entities.filter(e=>e.kind==='list_collection'&&e.state==='active'))add('list:'+c.id,c.title,'custom_list',entities.filter(e=>e.kind==='list_item'&&active(e)&&e.data.collection_id===c.id).map(entityRef),{ui_target:'lists',container_id:c.id});
   const pages=entities.filter(e=>e.kind==='user_page'&&e.state==='active');const children=new Map();for(const p of pages){const parent=p.data.parent_id||'';if(!children.has(parent))children.set(parent,[]);children.get(parent).push(p);}const descendants=root=>{const out=[],seen=new Set();const walk=id=>{for(const p of children.get(id)||[]){if(seen.has(p.id))continue;seen.add(p.id);out.push(entityRef(p));walk(p.id);}};walk(root);return out;};for(const p of pages)add('page:'+p.id,p.title,p.data.parent_id?'page':'space',descendants(p.id),{ui_target:'userpage',container_id:p.id});
   const tagMap=new Map();for(const e of entities.filter(active)){for(const tag of e.tags||[]){const n=normalize(tag);if(!n)continue;if(!tagMap.has(n))tagMap.set(n,{label:tag,members:[]});tagMap.get(n).members.push(entityRef(e));}}for(const [n,v] of tagMap)if(v.members.length)add('tag:'+n,v.label,'tag',v.members,{ui_target:null});
   return scopes;
 }
 resolveScope(scopeId){const scope=this.scopeCatalog().find(s=>s.scope_id===scopeId);if(!scope)throw new AppError('SCOPE_NOT_FOUND','Esse grupo ou visão não existe mais.',409);return scope;}
 deleteScope(scopeId,{scope='all',targetIds=[]}={}){
   const resolved=this.resolveScope(scopeId);let members=resolved.members;if(scope==='selected'||scope==='single'){const wanted=new Set((targetIds||[]).map(String));members=members.filter(m=>wanted.has(m.id));if(!members.length&&wanted.size)throw new AppError('SCOPE_TARGET_NOT_FOUND','Os itens escolhidos não pertencem mais a esse grupo.',409);}else if(scope!=='all'&&scope!=='active')throw new AppError('DELETE_SCOPE_REQUIRED','Escopo de exclusão inválido.',409);
   const deleted=this.s.tx(()=>members.map(m=>m.record_type==='task'?this.s.deleteTask(m.id):this.deleteEntity(m.id)));
   return {scope:resolved,deleted};
 }
 removePurchaseGroup(groupId){const group=this.get(groupId);if(group.kind!=='purchase_group')throw new AppError('BAD_KIND','Selecione um grupo de compras.');return this.s.tx(()=>{const items=this.list({kind:'purchase',limit:500}).filter(e=>e.data.purchase_group_id===groupId);for(const e of items)this.save({...e,revision:e.revision,data:{...e.data,purchase_group_id:''}},e.id);const deleted=this.deleteEntity(groupId);return {deleted,detached:items.length};});}
 panorama(){const all=this.list({limit:500}),tasks=this.s.tasks(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const activeTasks=tasks.filter(t=>!['done','cancelled'].includes(t.state));return {today,stats:this.s.stats(),tasks:activeTasks.slice(0,12),priorities:activeTasks.filter(t=>t.priority),today_tasks:activeTasks.filter(t=>t.due_at&&require('../services/scheduler').localISO(new Date(t.due_at))===today),active_flows:all.filter(e=>!['completed','archived','cancelled','purchased','watched','paid_reported','uploaded_reported'].includes(e.state)&&CATALOG[e.kind].group==='flow'),lessons:all.filter(e=>e.kind==='lesson'&&['active','paused'].includes(e.state)),notifications:this.notifications().filter(n=>n.state==='unread'),timeline:this.timeline({limit:12}),truncated:all.length===500};}
 context(query,limit=5,{route='private'}={}){const allowed=e=>route==='shared'?e.privacy==='shared':e.privacy!=='local';return this.list({limit:500}).filter(e=>allowed(e)&&!['contact','payment','invoice','approval','recipe_session'].includes(e.kind)&&e.state!=='archived').map(e=>({...e,rank:normalize(query).split(/\W+/).filter(t=>t.length>2&&normalize(e.title+' '+e.content+' '+e.tags.join(' ')+' '+JSON.stringify(e.data)).includes(t)).length})).filter(e=>e.rank>0).sort((a,b)=>b.rank-a.rank).slice(0,limit).map(e=>({id:e.id,kind:e.kind,title:e.title,content:e.content,data:e.data,tags:e.tags,area:e.area,privacy:e.privacy}));}
 contextSensitivity(query){const hits=this.context(query,8,{route:'private'});if(hits.some(e=>e.privacy==='private'))return 'private';if(hits.some(e=>e.privacy==='shared'))return 'shared';return 'none';}
}
module.exports={Workspace,AREAS,dateISO,dateTime,tags,url};
