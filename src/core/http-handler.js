'use strict';
// Este handler usa a API HTTP nativa. Em produção é montado no Express; os mesmos
// endpoints podem ser testados com http.createServer sem substituir a lógica real.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {VERSION,IDENTITY_VERSION}=require('../config/sofia');
const {AppError,cleanText,validId,publicError}=require('./util');
const STATIC={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/ui-current.css':['ui-current.css','text/css; charset=utf-8']};
function bodyJson(req,limitBytes=65536) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))return Promise.reject(new AppError('CONTENT_TYPE','Use JSON nesta operação.',415));
  return new Promise((resolve,reject)=>{
    let size=0,tooLarge=false;const chunks=[];
    req.on('data',part=>{size+=part.length;if(size>limitBytes){tooLarge=true;chunks.length=0;}else if(!tooLarge)chunks.push(part);});
    req.once('error',()=>reject(new AppError('REQUEST_ERROR','A requisição foi interrompida.')));
    req.once('end',()=>{if(tooLarge)return reject(new AppError('BODY_TOO_LARGE','A mensagem é grande demais.',413));try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw new Error();resolve(value);}catch{reject(new AppError('INVALID_JSON','O conteúdo enviado não é um objeto JSON válido.'));}});
  });
}

function checkLocalRequest(req) {
// RAILWAY_HEALTH_PUBLIC_V114
const railwayEnv = Boolean(
process.env.RAILWAY_ENVIRONMENT ||
process.env.RAILWAY_ENVIRONMENT_ID ||
process.env.RAILWAY_PROJECT_ID ||
process.env.RAILWAY_SERVICE_ID
);

let railwayHealth = false;
if (railwayEnv) {
try {
railwayHealth = new URL(req.url, 'http://localhost').pathname === '/health';
} catch (_) {}
}

// No Railway, somente /health pode atravessar os bloqueios LOCAL_ONLY/HOST_BLOCKED/PROXY_BLOCKED.
// Todas as demais rotas continuam protegidas pelas regras locais já existentes abaixo.
if (railwayHealth) return;
  if(process.env.RAILWAY_PUBLIC_DOMAIN)return;
  const remote=req.socket.remoteAddress;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))throw new AppError('LOCAL_ONLY','Este painel é apenas local.',403);
  const host=req.headers.host || '';
  if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host))throw new AppError('HOST_BLOCKED','Acesso externo não habilitado para o painel privado.',403);
  if(Object.keys(req.headers).some(k=>k.startsWith('x-forwarded-')||k==='forwarded'||k==='cf-connecting-ip'))throw new AppError('PROXY_BLOCKED','Não exponha o painel privado por túnel. O webhook terá um receptor separado.',403);
  const pathname=(()=>{try{return new URL(req.url,'http://localhost').pathname;}catch{return '';}})();
  const fetchMode=String(req.headers['sec-fetch-mode']||'').toLowerCase();
  const fetchDest=String(req.headers['sec-fetch-dest']||'').toLowerCase();
  const panelNavigation=req.method==='GET'&&(pathname==='/'||pathname==='/index.html')&&(fetchMode==='navigate'||fetchDest==='document'||(!req.headers.origin&&!req.headers['sec-fetch-site']));
  // Abrir o painel por link, atalho ou restauração do navegador pode chegar como
  // cross-site. Isso é seguro apenas para o documento HTML inicial: APIs e
  // operações continuam exigindo a origem local exata e o token CSRF.
  if(!panelNavigation&&req.headers.origin&&req.headers.origin!=='http://'+host)throw new AppError('ORIGIN_BLOCKED','Origem não autorizada.',403);
  if(!panelNavigation&&req.headers['sec-fetch-site']==='cross-site')throw new AppError('ORIGIN_BLOCKED','Origem não autorizada.',403);
}
function headers(res) {
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; media-src 'self' blob:");
}
function json(res,status,value){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));}
function limitNumber(value, fallback,max=100){if(value===null)return fallback;const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>max)throw new AppError('INVALID_PAGE','Paginação inválida.');return n;}
function decorateMessages(store,messages){const route=store.db.prepare('SELECT requested_mode,route,reason,context_used,protected,created_at FROM route_decisions WHERE message_id=? ORDER BY rowid DESC LIMIT 1'),voices=store.voiceForMessages(messages);return messages.map(m=>{const decision=route.get(m.id),privacy=store.privacyOf('message',m.id),voice=voices.get(m.id);return {...m,privacy:privacy||null,route_decision:decision||null,voice:voice?{mime:voice.mime,duration_ms:voice.duration_ms,languages:voice.languages,bytes:voice.bytes,audio_url:'/api/messages/'+encodeURIComponent(m.id)+'/audio'}:null};});}
function createHandler(runtime) {
  const {store,core,backups,config,usageService,audioService}=runtime;
  const extra=require('./api45').makeApi45(runtime,{bodyJson,json});
  const token=crypto.randomBytes(32).toString('hex');
  return async function handler(req,res) {
    headers(res);
    try {
      checkLocalRequest(req);
      const url=new URL(req.url,'http://localhost');const p=url.pathname,m=req.method;
      if(req.url.length>4096)throw new AppError('URL_TOO_LONG','Endereço grande demais.',414);
      if(!['GET','POST','PATCH','DELETE'].includes(m))throw new AppError('METHOD','Método não suportado.',405);
      if(m!=='GET' && req.headers['x-sofia-token']!==token)throw new AppError('CSRF','Reabra a página para atualizar a sessão local.',403);
      if(m==='GET' && p==='/health')return json(res,200,{ok:true,name:'Sofia OS',version:VERSION,storage:'sqlite-local'});
      if(m==='GET' && p==='/api/bootstrap')return json(res,200,{ok:true,token,version:VERSION,identity_version:IDENTITY_VERSION,model:config.model,key_present:Boolean(config.apiKey),settings:store.settings(),usage:store.usage(),stats:store.stats(),backup_warning:backups.lastError});
      if(m==='GET' && p==='/api/usage-status')return json(res,200,{ok:true,usage:await usageService.status()});
      if(m==='GET' && STATIC[p]) {const [f,type]=STATIC[p];res.setHeader('Content-Type',type);res.end(fs.readFileSync(path.join(config.root,'public',f)));return;}
      if(await extra(req,res,p,m,url))return;
      if(m==='GET' && p==='/api/conversations')return json(res,200,{items:store.conversations(limitNumber(url.searchParams.get('limit'),100),limitNumber(url.searchParams.get('offset'),0,1000000))});
      if(m==='POST' && p==='/api/conversations') {const b=await bodyJson(req);const channel=store.settings().privacyMode==='test'?'test':(b.channel==='whatsapp-simulator'?'whatsapp-simulator':'web');return json(res,201,store.createConversation(b.title || 'Chat',channel));}
      let match=p.match(/^\/api\/conversations\/([\w-]+)$/);
      if(m==='GET' && match) {const c=store.conversation(validId(match[1]));const messages=store.messages(c.id,101);return json(res,200,{conversation:c,messages:decorateMessages(store,messages.slice(-100)),has_more:messages.length>100,digest:store.digest(c.id),checkpoints:store.checkpoints(c.id)});}
      match=p.match(/^\/api\/conversations\/([\w-]+)\/messages$/);
      if(m==='GET' && match) {const items=store.messages(validId(match[1]),101,limitNumber(url.searchParams.get('before'),Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER));return json(res,200,{items:decorateMessages(store,items.slice(-100)),has_more:items.length>100});}
      if(m==='POST' && (p==='/chat'||p==='/api/channels/whatsapp/simulate')) {const b=await bodyJson(req,p==='/chat'?60*1024*1024:65536);if(p==='/chat'&&(!Array.isArray(b.images)||!b.images.length)&&Buffer.byteLength(JSON.stringify(b),'utf8')>65536)throw new AppError('BODY_TOO_LARGE','A mensagem é grande demais.',413);return json(res,200,await core.receive(b,{channel:p==='/chat'?'web':'whatsapp-simulator'}));}
      if(m==='POST' && p==='/api/audio/transcribe'){const b=await bodyJson(req,36*1024*1024);const raw=String(b.audio_base64||'');if(!raw||!/^[A-Za-z0-9+/=\r\n]+$/.test(raw))throw new AppError('VOICE_INVALID','O áudio enviado está inválido.',400);const bytes=Buffer.from(raw.replace(/\s+/g,''),'base64');const mime=String(b.mime||'audio/webm').slice(0,120);if(!/^audio\/(webm|ogg|wav|mpeg|mp4|m4a|x-m4a)(?:;|$)/i.test(mime))throw new AppError('VOICE_FORMAT','Formato de áudio não suportado.',415);const transcription=await audioService.transcribe(bytes,{mime,filename:'sofia-voice.'+(mime.includes('ogg')?'ogg':mime.includes('wav')?'wav':mime.includes('mp4')||mime.includes('m4a')?'m4a':'webm'),route:b.route||'auto'});return json(res,200,{ok:true,text:transcription.text,languages:transcription.languages||[],model:transcription.model||config.transcriptionModel});}
      if(m==='POST' && p==='/chat/audio'){const b=await bodyJson(req,36*1024*1024);const raw=String(b.audio_base64||'');if(!raw||!/^[A-Za-z0-9+/=\r\n]+$/.test(raw))throw new AppError('VOICE_INVALID','O áudio enviado está inválido.',400);const bytes=Buffer.from(raw.replace(/\s+/g,''),'base64');const mime=String(b.mime||'audio/webm').slice(0,120);if(!/^audio\/(webm|ogg|wav|mpeg|mp4|m4a|x-m4a)(?:;|$)/i.test(mime))throw new AppError('VOICE_FORMAT','Formato de áudio não suportado.',415);const transcription=await audioService.transcribe(bytes,{mime,filename:'sofia-voice.'+(mime.includes('ogg')?'ogg':mime.includes('wav')?'wav':mime.includes('mp4')||mime.includes('m4a')?'m4a':'webm'),route:b.route||'auto'});const payload={conversation_id:b.conversation_id||null,message:transcription.text,client_message_id:b.client_message_id,retry:b.retry===true,route:b.route||'auto',lesson_id:b.lesson_id||undefined,clarification_id:b.clarification_id||undefined,clarification_option:b.clarification_option||undefined,ui_context:b.ui_context||undefined};const result=await core.receive(payload,{channel:'web'});const row=store.db.prepare('SELECT id FROM messages WHERE owner=? AND client_id=?').get('owner-local',String(b.client_message_id||''));if(row)store.saveVoiceMessage(row.id,{mime,duration_ms:Number.isSafeInteger(b.duration_ms)?b.duration_ms:0,transcript:transcription.text,languages:transcription.languages,bytes});return json(res,200,{...result,voice_message_id:row?.id||null,voice_transcribed:true});}
      if(m==='GET' && p==='/api/history/search') {const q=cleanText(url.searchParams.get('q'),'Busca',300);const kind=url.searchParams.get('kind');if(kind&&!['note','user','assistant'].includes(kind))throw new AppError('BAD_KIND','Filtro inválido.');return json(res,200,{items:store.search(q,{kind,limit:50})});}
      match=p.match(/^\/api\/messages\/([\w-]+)\/audio$/);if(m==='GET' && match){const messageId=validId(match[1]),voice=store.voiceMessage(messageId);if(!voice)throw new AppError('NOT_FOUND','Áudio não encontrado.',404);res.setHeader('Content-Type',voice.mime||'audio/webm');res.setHeader('Content-Length',String(Buffer.byteLength(voice.blob)));res.setHeader('Accept-Ranges','none');res.end(Buffer.from(voice.blob));return;}
      match=p.match(/^\/api\/messages\/([\w-]+)$/);if(m==='GET' && match){const msg=store.message(validId(match[1]));return json(res,200,decorateMessages(store,[msg])[0]);}
      if(m==='GET' && p==='/api/memories')return json(res,200,{items:store.notes(url.searchParams.get('state')==='archived'?'archived':'active')});
      if(m==='POST' && p==='/api/memories')return json(res,201,store.saveNote(await bodyJson(req)));
      match=p.match(/^\/api\/memories\/([\w-]+)$/);
      if(m==='PATCH' && match)return json(res,200,store.saveNote(await bodyJson(req),validId(match[1])));
      match=p.match(/^\/api\/memories\/([\w-]+)\/versions$/);if(m==='GET' && match)return json(res,200,{items:store.noteVersions(validId(match[1]))});
      match=p.match(/^\/api\/memories\/([\w-]+)\/archive$/);if(m==='POST' && match)return json(res,200,store.archiveNote(validId(match[1]),(await bodyJson(req)).revision));
      match=p.match(/^\/api\/memories\/([\w-]+)\/restore$/);if(m==='POST' && match)return json(res,200,store.restoreNote(validId(match[1]),(await bodyJson(req)).revision));
      if(m==='GET' && p==='/api/tasks')return json(res,200,{items:store.tasks()});
      if(m==='POST' && p==='/api/tasks')return json(res,201,store.saveTask(await bodyJson(req)));
      match=p.match(/^\/api\/tasks\/([\w-]+)$/);if(m==='PATCH' && match)return json(res,200,store.saveTask(await bodyJson(req),validId(match[1])));if(m==='DELETE' && match){await bodyJson(req);return json(res,200,store.deleteTask(validId(match[1])));}
      match=p.match(/^\/api\/tasks\/([\w-]+)\/versions$/);if(m==='GET' && match)return json(res,200,{items:store.taskVersions(validId(match[1]))});
      if(m==='POST' && p==='/api/checkpoints') {const b=await bodyJson(req);const c=store.checkpoint(validId(b.conversation_id),{topic:b.topic,next_step:b.next_step,reason:'pause'});const backup=backups.tryCreate('pause');return json(res,201,{checkpoint:c,backup,warning:backups.lastError});}
      if(m==='GET' && p==='/api/settings')return json(res,200,{settings:store.settings(),usage:store.usage()});
      if(m==='PATCH' && p==='/api/settings') {if(core.busy)throw new AppError('BUSY','Espere a resposta terminar antes de mudar as configurações.',409);return json(res,200,store.updateSettings(await bodyJson(req)));}
      if(m==='GET' && p==='/api/backups')return json(res,200,{items:backups.list(),warning:backups.lastError});
      if(m==='POST' && p==='/api/backups/create') {await bodyJson(req);return json(res,201,backups.create('manual'));}
      if(m==='POST' && p==='/api/backups/export') {const b=await bodyJson(req);const bytes=backups.portable(b.passphrase);res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition','attachment; filename="Sofia_backup_portatil.sofia-backup"');res.end(bytes);return;}
      if(m==='GET' && p==='/api/diagnostics')return json(res,200,{version:VERSION,node:process.version,model:config.model,key_present:Boolean(config.apiKey),busy:core.busy,storage:'data/sofia.sqlite',stats:store.stats(),usage:store.usage(),settings:store.settings(),backup_warning:backups.lastError,whatsapp:'simulador; não conectado',google:'não conectado',cofre:runtime.vault.status().initialized?'criptografado, configurado':'criptografado, aguarda configuração',database_encrypted:false,backups_encrypted:true});
      match=p.match(/^\/api\/export\/conversation\/([\w-]+)$/);
      if(m==='GET' && match) {
        const c=store.conversation(validId(match[1]));const messages=store.db.prepare('SELECT role,content,created_at FROM messages WHERE conversation_id=? ORDER BY rowid').all(c.id);
        const text='# '+c.title+'\n\nExportação local da Sofia OS v46. Arquivo NÃO criptografado.\n\n'+messages.map(x=>'## '+(x.role==='user'?'Você':'Sofia')+' — '+x.created_at+'\n\n'+x.content).join('\n\n')+'\n\n## Checkpoints\n\n'+JSON.stringify(store.checkpoints(c.id),null,2);
        res.setHeader('Content-Type','text/markdown; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="Sofia_conversa.md"');res.end(text);return;
      }
      throw new AppError('NOT_FOUND','Esta rota não existe.',404);
    }catch(error) {
      const e=publicError(error);
      if(e.status>=500)console.error('[Sofia] '+e.code); // No provider body, request headers, tokens or private message content.
      if(!res.headersSent)json(res,e.status,{ok:false,code:e.code,error:e.error,conversation_id:error.conversationId || null,message_id:error.messageId || null});
      else if(!res.writableEnded)res.end();
    }
  };
}
module.exports={createHandler,checkLocalRequest,bodyJson};
