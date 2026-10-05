'use strict';
// Called only after the existing cookie/CSRF or mobile bearer authentication.
// The owner cursor never points at WhatsApp contacts, simulations or protected chat.
const {AppError,validId}=require('../core/util');
const OWNER='owner-local';
function createChatSync(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS owner_chat_cursor(owner TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1) STRICT;`);
 // Repair only personal threads hidden by a shutdown checkpoint; never restore deleted history.
 store.db.prepare(`UPDATE conversations SET state='active' WHERE owner=? AND state='paused'
 AND channel IN ('web','mobile') AND (SELECT reason FROM checkpoints WHERE conversation_id=conversations.id ORDER BY rowid DESC LIMIT 1)='shutdown'`).run(OWNER);
 function eligible(id){const c=store.conversation(validId(id));if(c.owner!==OWNER||c.state!=='active'||!['web','mobile'].includes(c.channel))throw new AppError('NOT_FOUND','Conversa pessoal não encontrada.',404);return c;}
 function cursor(){return store.db.prepare('SELECT * FROM owner_chat_cursor WHERE owner=?').get(OWNER);}
 function select(id){const c=eligible(id),old=cursor();if(old?.conversation_id!==c.id)store.db.prepare('INSERT INTO owner_chat_cursor(owner,conversation_id,revision) VALUES(?,?,1) ON CONFLICT(owner) DO UPDATE SET conversation_id=excluded.conversation_id,revision=owner_chat_cursor.revision+1').run(OWNER,c.id);return c;}
 function current(create=false){const old=cursor();if(old){try{return eligible(old.conversation_id);}catch(e){if(e.code!=='NOT_FOUND')throw e;}}
  const latest=store.db.prepare("SELECT id FROM conversations WHERE owner=? AND state='active' AND channel IN ('web','mobile') ORDER BY updated_at DESC,rowid DESC LIMIT 1").get(OWNER);
  if(latest)return select(latest.id);if(!create)return null;
  return select(store.createConversation('Conversa com a Sofia','web').id);
 }
 function decorate(rows,client){const voices=store.voiceForMessages(rows);return rows.map(m=>{const v=voices.get(m.id);return {...m,voice:v?{mime:v.mime,duration_ms:v.duration_ms,audio_url:(client==='mobile'?'/api/mobile/messages/':'/api/messages/')+m.id+'/audio'}:null};});}
 function snapshot({id=null,client='web',decorateRows=null}={}){
  const conversation=id?eligible(id):current(false),selection=cursor();
  if(!conversation)return {conversation:null,messages:[],has_more:false,deleted_ids:[],current_id:null,cursor_revision:selection?.revision||0};
  const rows=store.messages(conversation.id,101),messages=rows.slice(-100);
  // Tombstones cover older loaded pages too, not only the latest 100 messages.
  const deleted_ids=store.db.prepare("SELECT id FROM messages WHERE owner=? AND conversation_id=? AND status='deleted'").all(OWNER,conversation.id).map(m=>m.id);
  return {conversation,messages:decorateRows?decorateRows(messages):decorate(messages,client),has_more:rows.length>100,deleted_ids,current_id:selection?.conversation_id||conversation.id,cursor_revision:selection?.revision||0};
 }
 function remove(id,ids){const c=eligible(id);if(!Array.isArray(ids)||!ids.length||ids.length>100)throw new AppError('BAD_SELECTION','Selecione de 1 a 100 mensagens.');
  const unique=[...new Set(ids.map(validId))];
  // Validate the entire selection before the first deletion. No cross-thread IDs.
  const rows=unique.map(key=>{const row=store.db.prepare('SELECT id,status,conversation_id FROM messages WHERE id=? AND owner=?').get(key,OWNER);if(!row||row.conversation_id!==c.id)throw new AppError('NOT_FOUND','A seleção contém uma mensagem indisponível nesta conversa.',404);if(row.status==='pending')throw new AppError('IN_PROGRESS','Espere a resposta terminar antes de excluir.',409);return row;});
  const deleted_ids=[],failed=[];
  for(const row of rows){try{if(row.status!=='deleted')store.deleteMessage(row.id);deleted_ids.push(row.id);}catch(e){failed.push({id:row.id,code:e.code||'DELETE_FAILED',error:'Não foi possível excluir esta mensagem.'});}}
  return {ok:failed.length===0,conversation_id:c.id,deleted_ids,failed};
 }
 return {current,select,snapshot,remove};
}
function makeChatSyncApi(store,{bodyJson,json,client='web',decorateRows=null}){
 const sync=createChatSync(store),prefix=client==='mobile'?'/api/mobile/chat-sync':'/api/chat-sync';
 return async(req,res,p,m,url)=>{
  const send=value=>{json(res,200,value);return true;};
  if(p===prefix&&m==='GET')return send(sync.snapshot({id:url.searchParams.get('conversation_id')||null,client,decorateRows}));
  if(p===prefix+'/current'&&m==='POST'){await bodyJson(req,1024);sync.current(true);return send(sync.snapshot({client,decorateRows}));}
  if(p===prefix+'/select'&&m==='POST'){const b=await bodyJson(req,1024);sync.select(b.conversation_id);return send(sync.snapshot({client,decorateRows}));}
  if(p===prefix+'/delete'&&m==='POST'){const b=await bodyJson(req,16384);return send(sync.remove(b.conversation_id,b.ids));}
  return false;
 };
}
module.exports={createChatSync,makeChatSyncApi};
