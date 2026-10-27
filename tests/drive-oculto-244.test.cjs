'use strict';
// 0.3.244 — Arquivos da Sofia na área oculta do Drive (appDataFolder), migração da pasta visível antiga,
// tela de arquivos (resumo, lista, conteúdo), cópia visível ("Exportar tudo") e proteções.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./helpers.cjs');
const {GoogleService,SCOPES}=require('../src/services/google');
const {BackupService}=require('../src/services/backup');
const {createRuntime}=require('../src/core/runtime');
const ENV={GOOGLE_CALENDAR_CLIENT_ID:'cid',GOOGLE_CALENDAR_CLIENT_SECRET:'csecret',SOFIA_CALENDAR_TOKEN_KEY:'chave-de-teste'};
const FOLDER='application/vnd.google-apps.folder';
const SC_VISIBLE='openid email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file';
const SC_BOTH=SC_VISIBLE+' https://www.googleapis.com/auth/drive.appdata';

// Drive falso que segue as regras do de verdade que importam aqui: dois espaços (meu Drive e área oculta do app),
// consultas por pasta, nome, tipo, appProperties e lixeira; lixeira de pasta leva o que está dentro.
function fakeDrive(){
 const g={files:[],seq:1,calls:[],fail:null,trashFails:new Set(),quota:{limit:'214748364800',usage:'1073741824',usageInDrive:'805306368',usageInDriveTrash:'52428800'}};
 const res=(status,body)=>({ok:status<300,status,json:async()=>body});
 const pub=f=>({id:f.id,name:f.name,mimeType:f.mimeType,size:f.mimeType===FOLDER?undefined:String(f.bytes.length),createdTime:f.createdTime,modifiedTime:f.modifiedTime,appProperties:f.appProperties,description:f.description,parents:f.parents,trashed:f.trashed,webViewLink:'https://drive.google.com/drive/folders/'+f.id});
 const trashedDeep=f=>f.trashed||(f.parents||[]).some(p=>{const par=g.files.find(x=>x.id===p);return par?trashedDeep(par):false;});
 const add=(o)=>{const t=new Date(Date.now()+(g.seq)).toISOString();const f={id:'id'+String(g.seq++).padStart(4,'0'),bytes:Buffer.alloc(0),appProperties:{},trashed:false,createdTime:t,modifiedTime:t,space:'drive',...o};g.files.push(f);return f;};
 g.add=add;
 g.visible=()=>g.files.filter(f=>f.space==='drive'&&!trashedDeep(f));
 g.hidden=()=>g.files.filter(f=>f.space==='appDataFolder'&&!f.trashed);
 g.fetch=async(url,opts={})=>{const u=new URL(url),m=opts.method||'GET';g.calls.push(m+' '+u.pathname+u.search);
  if(g.fail){const x=g.fail(m,u);if(x)return res(x.status,{error:{message:x.message||'falha simulada'}});}
  if(u.href.startsWith('https://oauth2.googleapis.com/token'))return res(200,{access_token:'at',expires_in:3600});
  if(u.pathname==='/drive/v3/about')return res(200,{storageQuota:g.quota});
  if(u.pathname==='/drive/v3/files'&&m==='GET'){
   const q=u.searchParams.get('q')||'';let list=g.files.filter(f=>u.searchParams.get('spaces')==='appDataFolder'?f.space==='appDataFolder':f.space==='drive');
   if(/trashed=false/.test(q))list=list.filter(f=>!f.trashed);
   const name=/name='([^']+)'/.exec(q);if(name)list=list.filter(f=>f.name===name[1]);
   if(q.includes("mimeType='"+FOLDER+"'"))list=list.filter(f=>f.mimeType===FOLDER);
   if(q.includes("mimeType!='"+FOLDER+"'"))list=list.filter(f=>f.mimeType!==FOLDER);
   const par=/'([^']+)' in parents/.exec(q);if(par)list=list.filter(f=>(f.parents||[]).includes(par[1]));
   const ap=/appProperties has \{ key='([^']+)' and value='((?:[^'\\]|\\.)*)' \}/.exec(q);if(ap)list=list.filter(f=>f.appProperties[ap[1]]===ap[2].replace(/\\(.)/g,'$1'));
   const ob=u.searchParams.get('orderBy')||'';if(/desc/.test(ob)){const k=/modified/.test(ob)?'modifiedTime':'createdTime';list=[...list].sort((a,b)=>b[k].localeCompare(a[k]));}else if(/createdTime/.test(ob))list=[...list].sort((a,b)=>a.createdTime.localeCompare(b.createdTime));
   const size=Number(u.searchParams.get('pageSize')||100),start=Number(u.searchParams.get('pageToken')||0);
   return res(200,{files:list.slice(start,start+size).map(pub),...(start+size<list.length?{nextPageToken:String(start+size)}:{})});
  }
  if(u.pathname==='/drive/v3/files'&&m==='POST'){const b=JSON.parse(opts.body);const f=add({name:b.name,mimeType:b.mimeType,parents:b.parents||[],description:b.description});return res(200,pub(f));}
  if(u.pathname==='/upload/drive/v3/files'&&m==='POST'){
   const boundary=/boundary=([^;\s]+)/.exec(opts.headers['Content-Type'])[1],text=opts.body.toString('latin1'),parts=text.split('--'+boundary);
   const meta=JSON.parse(Buffer.from(parts[1].slice(parts[1].indexOf('\r\n\r\n')+4).trim(),'latin1').toString('utf8')),payload=parts[2].slice(parts[2].indexOf('\r\n\r\n')+4).replace(/\r\n$/,'');
   const hidden=(meta.parents||[]).includes('appDataFolder');
   const f=add({name:meta.name,mimeType:meta.mimeType,description:meta.description,appProperties:meta.appProperties||{},parents:hidden?['appdata-root']:(meta.parents||[]),space:hidden?'appDataFolder':'drive',bytes:Buffer.from(payload,'latin1'),...(meta.createdTime?{createdTime:meta.createdTime}:{}),...(meta.modifiedTime?{modifiedTime:meta.modifiedTime}:{})});
   return res(200,{id:f.id,size:String(f.bytes.length)});
  }
  let mm=u.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
  if(mm&&m==='PATCH'){const f=g.files.find(x=>x.id===mm[1]);if(!f)return res(404,{error:{message:'nao achei'}});const boundary=/boundary=([^;\s]+)/.exec(opts.headers['Content-Type'])[1],part=opts.body.toString('latin1').split('--'+boundary)[2];f.bytes=Buffer.from(part.slice(part.indexOf('\r\n\r\n')+4).replace(/\r\n$/,''),'latin1');f.modifiedTime=new Date(Date.now()+g.seq++).toISOString();return res(200,{id:f.id});}
  mm=u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  if(mm){const f=g.files.find(x=>x.id===mm[1]);if(!f)return res(404,{error:{message:'File not found'}});
   if(m==='GET'&&u.searchParams.get('alt')==='media')return {ok:true,status:200,json:async()=>({}),arrayBuffer:async()=>Uint8Array.from(f.bytes).buffer};
   if(m==='GET')return res(200,pub(f));
   if(m==='PATCH'){const b=JSON.parse(opts.body||'{}');if('trashed' in b){if(b.trashed&&g.trashFails.has(f.id)){g.trashFails.delete(f.id);return res(500,{error:{message:'falha simulada ao jogar na lixeira'}});}f.trashed=!!b.trashed;}return res(200,{id:f.id});}
   if(m==='DELETE'){g.files=g.files.filter(x=>x!==f);return {ok:true,status:204,json:async()=>({})};}}
  throw new Error('rota inesperada '+m+' '+url);};
 return g;
}
function service(t,g,scopes){
 const f=fixture(t);f.config.publicBaseUrl='https://sofia.example';
 const backups=new BackupService(f.store,path.join(f.dir,'bk'));
 const svc=new GoogleService(f.store,f.core.workspace,f.config,{fetchImpl:g.fetch,env:ENV,backups});
 svc.saveLink({refresh:svc.seal('rt'),email:'pedro@gmail.com',scopes,connected_at:new Date().toISOString(),calendar_id:'primary',sync:{}});
 svc.migrationPauseMs=0;
 return {...f,svc,w:f.core.workspace,backups};
}
const reconnect=svc=>{svc.saveLink({...svc.link(),scopes:SC_BOTH});};
const notices=f=>f.store.db.prepare("SELECT title,body FROM notifications WHERE category='drive'").all();
// coloca de tudo um pouco na pasta visível antiga, como estava até a 0.3.243
async function legacyContent(f,g){
 const {svc,w,store}=f;
 const page=w.save({kind:'user_page',title:'Viagem',area:'Pessoal',data:{blocks_json:JSON.stringify([{type:'text',text:'Itinerário'}])}});
 const att=w.attach(page.id,{name:'capa.png',mime:'image/png',base64:Buffer.from('PNG-CAPA-1').toString('base64')});
 assert.equal((await svc.offloadAttachments()).moved,1);
 const conv=store.createConversation('Chat','mobile');const msg=store.userMessage({conversationId:conv.id,clientId:'v1',message:'oi',channel:'mobile'});const mid=msg.message?msg.message.id:msg.id;
 store.saveVoiceMessage(mid,{mime:'audio/mp4',duration_ms:1000,transcript:'oi',bytes:Buffer.from('VOZ-ANTIGA')});
 store.db.prepare('UPDATE voice_messages SET created_at=? WHERE message_id=?').run(new Date(Date.now()-3*864e5).toISOString(),mid);
 assert.equal((await svc.offloadVoices()).moved,1);
 assert.equal((await svc.exportPages()).exported,1);
 assert.equal((await svc.backupToDrive(true)).ok,true);
 return {page,att,mid};
}

test('escopos: a conexão pede a área oculta do app (drive.appdata) além do resto',()=>{
 assert.ok(SCOPES.includes('https://www.googleapis.com/auth/drive.appdata'));
 assert.ok(SCOPES.includes('https://www.googleapis.com/auth/drive.file'),'drive.file continua: é o que permite a cópia visível');
});

test('conta nova: tudo vai para a área oculta e nenhuma pasta aparece no Drive',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_BOTH),{svc,w}=f;
 const page=w.save({kind:'user_page',title:'Notas',area:'Pessoal',data:{}});
 const att=w.attach(page.id,{name:'foto.jpg',mime:'image/jpeg',base64:Buffer.from('JPEG-1').toString('base64')});
 assert.equal((await svc.offloadAttachments()).moved,1);
 assert.equal((await svc.exportPages()).exported,1);
 assert.equal((await svc.backupToDrive(true)).ok,true);
 assert.equal(g.visible().length,0,'nada visível no Drive: '+JSON.stringify(g.visible().map(x=>x.name)));
 const cats=g.hidden().map(x=>x.appProperties.sofia_cat).sort();
 assert.deepEqual([...new Set(cats)].sort(),['Anexos','Backups','Páginas']);
 const row=w.attachment(att.id);assert.equal((await svc.attachmentBytes(row)).toString(),'JPEG-1');
 const st=(await svc.status()).drive;assert.equal(st.mode,'hidden');assert.equal(st.needs_reconnect,false);assert.equal(st.folder,'área oculta da Sofia no seu Drive');
 // o backup diário guarda 14 também na área oculta
 for(let i=0;i<16;i++)g.add({name:'velho'+i,space:'appDataFolder',parents:['appdata-root'],appProperties:{sofia_cat:'Backups'},createdTime:new Date(Date.now()-864e5*(i+2)).toISOString()});
 await svc.backupToDrive(true);
 assert.equal(g.hidden().filter(x=>x.appProperties.sofia_cat==='Backups').length,14);
});

test('o backup diário não apaga mais o resto do estado do Drive (antes perdia a lista de pastas)',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_VISIBLE),{svc}=f;
 await svc.ensureFolders();const before=svc.link().drive.folders;assert.ok(before.root);
 svc.saveDrive({pages_exported:7});
 await svc.backupToDrive(true);
 assert.deepEqual(svc.link().drive.folders,before);assert.equal(svc.link().drive.pages_exported,7);
});

test('sem reconectar: segue na pasta visível e o status pede para reconectar',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_VISIBLE),{svc}=f;
 await legacyContent(f,g);
 assert.ok(g.visible().some(x=>x.name==='Sofia OS'));assert.equal(g.hidden().length,0);
 const st=(await svc.status()).drive;assert.equal(st.mode,'folder');assert.equal(st.needs_reconnect,true);
 assert.equal((await svc.migrateToHidden()).moved,0,'sem a permissão nova não migra nada');
});

test('pasta antiga jogada na lixeira sem querer: a Sofia tira de lá e avisa',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_VISIBLE),{svc}=f;
 const folders=await svc.ensureFolders();
 g.files.find(x=>x.id===folders.root).trashed=true;
 svc.foldersCheckedAt=0;await svc.folderId('Anexos');
 assert.equal(g.files.find(x=>x.id===folders.root).trashed,false,'restaurada');
 assert.equal(g.files.filter(x=>x.name==='Sofia OS').length,1,'não criou outra');
 assert.ok(notices(f).some(n=>/restaurada/.test(n.title)));
});

test('ao reconectar, tudo vai para a área oculta: referências trocadas, conteúdo igual e pasta antiga na lixeira',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_VISIBLE),{svc,w,store}=f;
 const {page,att,mid}=await legacyContent(f,g);
 const oldAtt=w.attachment(att.id).drive_id,oldVoice=store.voiceMessage(mid).drive_id,oldPage=svc.kvGet('drive_pages')[page.id].file;
 const visibleFiles=g.visible().filter(x=>x.mimeType!==FOLDER).length;assert.equal(visibleFiles,4,'anexo, voz, página e backup');
 reconnect(svc);
 await svc.kickMigration();
 const mig=svc.link().drive.migration;assert.equal(mig.state,'done');assert.equal(mig.left,0);assert.equal(mig.moved,visibleFiles);
 assert.equal(g.visible().length,0,'nada visível sobrou: '+JSON.stringify(g.visible().map(x=>x.name)));
 assert.equal(g.files.find(x=>x.name==='Sofia OS').trashed,true,'a pasta antiga foi para a lixeira (fica 30 dias)');
 const row=w.attachment(att.id);assert.notEqual(row.drive_id,oldAtt);assert.equal(g.files.find(x=>x.id===row.drive_id).space,'appDataFolder');
 svc.blobCache.clear();svc.blobCacheBytes=0;
 assert.equal((await svc.attachmentBytes(row)).toString(),'PNG-CAPA-1','o anexo abre igual, vindo da área oculta');
 const v=store.voiceMessage(mid);assert.notEqual(v.drive_id,oldVoice);assert.equal((await svc.voiceBytes(v)).toString(),'VOZ-ANTIGA');
 const pf=svc.kvGet('drive_pages')[page.id].file;assert.notEqual(pf,oldPage);assert.equal(g.files.find(x=>x.id===pf).space,'appDataFolder');
 assert.equal(g.files.find(x=>x.id===pf).appProperties.sofia_cat,'Páginas');
 // a página editada depois atualiza o arquivo da área oculta (não cria outro, não volta para a pasta antiga)
 const cur=w.get(page.id);w.save({...cur,title:'Viagem 2027'},page.id);const count=g.hidden().length;
 assert.equal((await svc.exportPages()).exported,1);assert.equal(g.hidden().length,count);
 assert.match(g.files.find(x=>x.id===pf).bytes.toString('utf8'),/Viagem 2027/);
 assert.ok(notices(f).some(n=>/protegidos/.test(n.title)&&/lixeira/.test(n.body)),'aviso no sino');
 assert.equal((await svc.migrateToHidden()).done,true,'não repete');
 // ordem dos backups preservada (createdTime copiado)
 const bk=g.hidden().filter(x=>x.appProperties.sofia_cat==='Backups');assert.ok(bk.length>=1);
});

test('migração segura: se cair entre copiar e jogar fora, reaproveita a cópia (sem duplicar)',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_VISIBLE),{svc,w}=f;
 const {att}=await legacyContent(f,g);
 const oldAtt=w.attachment(att.id).drive_id;g.trashFails.add(oldAtt);
 reconnect(svc);await svc.kickMigration();
 assert.equal(svc.link().drive.migration.state,'done');
 assert.equal(g.hidden().filter(x=>x.appProperties.sofia_from===oldAtt).length,1,'uma cópia só');
 assert.equal(g.files.find(x=>x.id===oldAtt).trashed,true);
});

test('arquivo que não dá para ler fica onde está, a pasta antiga não é apagada e o aviso conta',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_VISIBLE),{svc,w}=f;
 const {att}=await legacyContent(f,g);
 const bad=w.attachment(att.id).drive_id;
 g.fail=(m,u)=>u.pathname==='/drive/v3/files/'+bad&&u.searchParams.get('alt')==='media'?{status:500}:null;
 reconnect(svc);await svc.kickMigration();
 const mig=svc.link().drive.migration;assert.equal(mig.state,'done');assert.equal(mig.left,1);
 assert.equal(w.attachment(att.id).drive_id,bad,'referência intacta: o anexo continua abrindo de onde está');
 assert.equal(g.files.find(x=>x.name==='Sofia OS').trashed,false,'pasta antiga preservada');
 assert.ok(notices(f).some(n=>/não pôde ser copiado/.test(n.body)));
});

test('área oculta apagada de propósito: a Sofia percebe, reenvia páginas e backup e conta o que não volta',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_BOTH),{svc,w}=f;
 svc.saveDrive({migration:{state:'done'}});
 const page=w.save({kind:'user_page',title:'Diário',area:'Pessoal',data:{}});w.attach(page.id,{name:'a.png',mime:'image/png',base64:Buffer.from('A').toString('base64')});
 await svc.offloadAttachments();await svc.exportPages();
 assert.deepEqual(await svc.checkHidden(true),{ok:true});
 for(const x of g.hidden())x.trashed=true;
 const r=await svc.checkHidden(true);assert.equal(r.wiped,true);assert.equal(r.lost,1);
 await new Promise(r=>setTimeout(r,60));
 assert.ok(g.hidden().some(x=>x.appProperties.sofia_cat==='Páginas'),'páginas reenviadas');
 assert.ok(notices(f).some(n=>/apagados/.test(n.title)&&/1 anexo ou áudio antigo/.test(n.body)));
});

test('Arquivos da Sofia: resumo por tipo com espaço do Drive, lista com origem e conteúdo do arquivo',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_BOTH),{svc,w}=f;
 const page=w.save({kind:'user_page',title:'Receitas',area:'Pessoal',data:{}});
 w.attach(page.id,{name:'bolo.jpg',mime:'image/jpeg',base64:Buffer.from('BOLO').toString('base64')});
 await svc.offloadAttachments();await svc.exportPages();await svc.backupToDrive(true);
 const s=await svc.driveSummary();
 assert.equal(s.mode,'hidden');assert.equal(s.quota.limit,214748364800);
 const by=Object.fromEntries(s.categories.map(c=>[c.key,c]));
 assert.equal(by['Anexos'].count,1);assert.equal(by['Anexos'].bytes,4);assert.equal(by['Páginas'].count,1);assert.equal(by['Backups'].count,1);
 assert.deepEqual(s.categories.map(c=>c.key),['Páginas','Anexos','Comprovantes','Áudios','Backup com senha','Backups']);
 const list=await svc.driveList('Anexos');assert.equal(list.items.length,1);assert.equal(list.items[0].name,'bolo.jpg');assert.equal(list.items[0].origin,'De “Receitas”');
 assert.equal((await svc.driveList('Páginas')).items[0].origin,'Página “Receitas”');
 await assert.rejects(svc.driveList('Qualquer'),/desconhecida/);
 const out=await svc.driveContent(list.items[0].id);
 const headers={};let body=null;const res={statusCode:0,setHeader:(k,v)=>{headers[k.toLowerCase()]=v;},getHeader:k=>headers[k.toLowerCase()],end:b=>{body=b;}};
 await GoogleService.sendFile(res,out);
 assert.equal(body.toString(),'BOLO');assert.equal(headers['content-type'],'image/jpeg');assert.match(headers['content-disposition'],/^attachment; filename="bolo.jpg"/);
 await assert.rejects(svc.driveContent('../x'),/inválido/);
});

test('durante a migração a lista mostra os arquivos dos dois lugares (nada some da tela)',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_VISIBLE);
 await legacyContent(f,g);reconnect(f.svc);
 const s=await f.svc.driveSummary();const total=s.categories.reduce((n,c)=>n+c.count,0);
 assert.equal(total,g.visible().filter(x=>x.mimeType!==FOLDER).length);
 assert.equal((await f.svc.driveList('Anexos')).items.length,1);
});

test('Exportar tudo: cópia numa pasta visível, separada por tipo, sem mexer nos originais, e aviso ao terminar',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_BOTH),{svc,w}=f;
 const page=w.save({kind:'user_page',title:'Casa',area:'Pessoal',data:{}});
 w.attach(page.id,{name:'planta.pdf',mime:'application/pdf',base64:Buffer.from('PDF').toString('base64')});
 await svc.offloadAttachments();await svc.exportPages();
 const hiddenBefore=g.hidden().length;
 const e=await svc.startExport(['Anexos','Páginas']);assert.equal(e.state,'running');assert.equal(e.total,2);assert.match(e.folder_name,/^Sofia OS — cópia de \d{2}-\d{2}-\d{4} \d{2}h\d{2}$/);
 await svc.kickExport();
 const st=svc.driveState().export;assert.equal(st.state,'done');assert.equal(st.done,2);assert.equal(st.failed,0);assert.ok(st.link.startsWith('https://drive.google.com/'));
 const root=g.visible().find(x=>x.name===e.folder_name);assert.ok(root);
 const subs=g.visible().filter(x=>(x.parents||[]).includes(root.id)).map(x=>x.name).sort();assert.deepEqual(subs,['Anexos','Páginas']);
 assert.ok(g.visible().some(x=>x.name==='planta.pdf'&&x.bytes.toString()==='PDF'));
 assert.equal(g.hidden().length,hiddenBefore,'originais intactos');
 assert.ok(notices(f).some(n=>/Cópia dos arquivos pronta/.test(n.title)&&/2 arquivos/.test(n.body)));
 await assert.rejects(svc.startExport(['Nada']),/pelo menos um/);
});

test('HTTP: app e site listam, baixam e exportam só com sessão; sem conta Google a resposta explica',async t=>{
 const f=fixture(t);f.config.loginPassword='test-only-password-244';f.config.loginEmail='owner@example.com';
 const g=fakeDrive();
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure'),googleFetch:g.fetch,googleEnv:ENV});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const login=await (await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'test-only-password-244'})})).json();
 const auth={Authorization:'Bearer '+login.token};
 assert.equal((await fetch(base+'/api/mobile/md/drive/files')).status,401,'sem sessão não entra');
 const off=await fetch(base+'/api/mobile/md/drive/files',{headers:auth});assert.equal(off.status,409);assert.match((await off.json()).error,/Conecte a Conta Google/);
 const svc=runtime.google;svc.saveLink({refresh:svc.seal('rt'),email:'p@gmail.com',scopes:SC_BOTH,connected_at:new Date().toISOString(),sync:{},drive:{migration:{state:'done'}}});
 const page=runtime.workspace.save({kind:'user_page',title:'Obra',area:'Pessoal',data:{}});
 runtime.workspace.attach(page.id,{name:'orçamento.png',mime:'image/png',base64:Buffer.from('PNG-OBRA').toString('base64')});
 await svc.offloadAttachments();
 const sum=await (await fetch(base+'/api/mobile/md/drive/files',{headers:auth})).json();assert.equal(sum.categories.find(c=>c.key==='Anexos').count,1);
 const list=await (await fetch(base+'/api/mobile/md/drive/files?cat='+encodeURIComponent('Anexos'),{headers:auth})).json();assert.equal(list.items[0].name,'orçamento.png');
 const file=await fetch(base+'/api/mobile/md/drive/files/'+list.items[0].id+'/content',{headers:auth});
 assert.equal(file.status,200);assert.equal(Buffer.from(await file.arrayBuffer()).toString(),'PNG-OBRA');assert.match(file.headers.get('content-disposition'),/filename\*=UTF-8''or%C3%A7amento\.png/);
 const caps=await (await fetch(base+'/api/mobile/md/capabilities',{headers:auth})).json();assert.equal(caps.drive_files,true);
 const ex=await fetch(base+'/api/mobile/md/drive/export',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({categories:['Anexos']})});
 assert.equal(ex.status,200);const exb=await ex.json();assert.equal(exb.export.total,1);
 await svc.kickExport();assert.equal(svc.driveState().export.state,'done');
 const rc=await (await fetch(base+'/api/mobile/md/drive/receipts-cleanup',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({enabled:false})})).json();assert.equal(rc.enabled,false);
 const webList=await fetch(base+'/api/drive/files?cat=Anexos');assert.equal(webList.status,200);assert.equal((await webList.json()).items.length,1);
 const del=await fetch(base+'/api/mobile/md/drive/files/'+list.items[0].id,{method:'DELETE',headers:{...auth,'Content-Type':'application/json'},body:'{}'});assert.equal(del.status,200);
 assert.equal((await (await fetch(base+'/api/mobile/md/drive/files?cat=Anexos',{headers:auth})).json()).items.length,0,'apagado');
 const gone=await fetch(base+'/api/mobile/workspace/attachments/x'.replace('x','nao-existe'),{headers:auth});assert.ok(gone.status>=400);
 // site: página e API exigem login (fora da Railway o handler aceita local; aqui só confere que existem)
 const pageHtml=await fetch(base+'/arquivos');assert.equal(pageHtml.status,200);assert.match(await pageHtml.text(),/Arquivos da Sofia/);
 const js=await fetch(base+'/arquivos.js');assert.equal(js.status,200);
});

test('apagar pela tela: some do Drive de vez, quem usava o arquivo explica o que houve; cópia de página não se apaga',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_BOTH),{svc,w,store}=f;
 svc.saveDrive({migration:{state:'done'}});
 const page=w.save({kind:'user_page',title:'Reforma',area:'Pessoal',data:{}});
 const att=w.attach(page.id,{name:'parede.png',mime:'image/png',base64:Buffer.from('PAREDE').toString('base64')});
 await svc.offloadAttachments();await svc.exportPages();await svc.backupToDrive(true);
 const conv=store.createConversation('Chat','mobile');const msg=store.userMessage({conversationId:conv.id,clientId:'v9',message:'oi',channel:'mobile'});const mid=msg.message?msg.message.id:msg.id;
 store.saveVoiceMessage(mid,{mime:'audio/mp4',duration_ms:1000,transcript:'oi',bytes:Buffer.from('VOZ')});store.db.prepare('UPDATE voice_messages SET created_at=? WHERE message_id=?').run(new Date(Date.now()-3*864e5).toISOString(),mid);await svc.offloadVoices();
 const anexos=(await svc.driveList('Anexos')).items;assert.equal(anexos[0].deletable,true);
 const paginas=(await svc.driveList('Páginas')).items;assert.equal(paginas[0].deletable,false);
 await assert.rejects(svc.driveDelete(paginas[0].id),/apague a página em Páginas/);
 assert.equal((await svc.driveDelete(anexos[0].id)).ok,true);
 assert.ok(!g.files.some(x=>x.id===anexos[0].id),'saiu do Drive');
 const row=w.attachment(att.id);assert.ok(row.removed_at);assert.equal(row.drive_id,null);
 await assert.rejects(svc.attachmentBytes(row),e=>e.status===410&&/apagado em Arquivos da Sofia/.test(e.message));
 const voz=(await svc.driveList('Áudios')).items[0];await svc.driveDelete(voz.id);
 await assert.rejects(svc.voiceBytes(store.voiceMessage(mid)),/transcrição continua/);
 const bk=(await svc.driveList('Backups')).items[0];await svc.driveDelete(bk.id);assert.equal((await svc.driveList('Backups')).items.length,0);
 const s=await svc.driveSummary();assert.equal(s.categories.find(c=>c.key==='Páginas').deletable,false);assert.equal(s.categories.find(c=>c.key==='Anexos').deletable,true);
});

test('limpeza semanal dos comprovantes: foto da conversa com mais de 7 dias sai; a recente, a miniatura e outros anexos ficam',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_BOTH),{svc,w}=f;
 svc.saveDrive({migration:{state:'done'}});
 const jpeg=require('jpeg-js');const W=64,H=48,data=Buffer.alloc(W*H*4,120);const foto=jpeg.encode({data,width:W,height:H},80).data;
 const mk=(title,daysAgo)=>{const e=w.save({kind:'file',title,area:'Pessoal',state:'saved',tags:['chat-attachment'],data:{provider:'local',logical_path:'conversations/x',description:'Arquivo enviado na conversa com a Sofia'}});const a=w.attach(e.id,{name:title,mime:'image/jpeg',base64:foto.toString('base64')});w.db.prepare('UPDATE attachments SET created_at=? WHERE id=?').run(new Date(Date.now()-daysAgo*864e5).toISOString(),a.id);return a.id;};
 const velho=mk('cupom-velho.jpg',9),novo=mk('cupom-novo.jpg',2);
 const page=w.save({kind:'user_page',title:'Capa antiga',area:'Pessoal',data:{}});const capa=w.attach(page.id,{name:'capa.png',mime:'image/png',base64:Buffer.from('CAPA').toString('base64')});w.db.prepare('UPDATE attachments SET created_at=? WHERE id=?').run(new Date(Date.now()-30*864e5).toISOString(),capa.id);
 await svc.offloadAttachments();
 const velhoDrive=w.attachment(velho).drive_id;assert.equal(g.files.find(x=>x.id===velhoDrive).appProperties.sofia_cat,'Comprovantes');
 // um comprovante antigo de antes desta versão, só no Drive
 g.add({name:'nota-antiga.jpg',space:'appDataFolder',parents:['appdata-root'],appProperties:{sofia_cat:'Comprovantes'},createdTime:new Date(Date.now()-20*864e5).toISOString(),bytes:Buffer.from('X')});
 assert.equal(svc.receiptsCleanup().enabled,true,'ligada por padrão');
 const r=await svc.cleanReceipts(true);assert.equal(r.removed,2);
 assert.ok(!g.files.some(x=>x.id===velhoDrive),'o velho saiu do Drive');assert.ok(!g.files.some(x=>x.name==='nota-antiga.jpg'));
 const v=w.attachment(velho);assert.ok(v.removed_at);assert.ok(v.thumb&&v.thumb.length,'a miniatura na conversa continua');
 assert.equal(w.attachment(novo).removed_at,null,'o de 2 dias fica');assert.equal(w.attachment(capa.id).removed_at,null,'capa de página não é comprovante');
 assert.deepEqual(await svc.cleanReceipts(),{skipped:true},'no máximo a cada 6 h');
 svc.setReceiptsCleanup(false);assert.equal(svc.receiptsCleanup().enabled,false);assert.deepEqual(await svc.cleanReceipts(true),{skipped:true},'desligada não apaga');
 const s=await svc.driveSummary();assert.equal(s.receipts_cleanup.enabled,false);assert.equal(s.receipts_cleanup.days,7);assert.equal(s.receipts_cleanup.last_removed,2);
});

test('Armazenamento (0.3.245): total, usado no Drive, lixeira, Gmail e Fotos e o espaço da Sofia; plano sem limite; reaproveita a contagem',async t=>{
 const g=fakeDrive(),f=service(t,g,SC_BOTH),{svc,w}=f;
 svc.saveDrive({migration:{state:'done'}});
 const page=w.save({kind:'user_page',title:'Casa',area:'Pessoal',data:{}});w.attach(page.id,{name:'a.png',mime:'image/png',base64:Buffer.from('12345').toString('base64')});
 await svc.offloadAttachments();
 const st=await svc.driveStorage();
 assert.deepEqual(st.quota,{limit:214748364800,usage:1073741824,usage_in_drive:805306368,usage_in_trash:52428800});
 assert.equal(st.sofia_bytes,5);assert.equal(st.categories.find(c=>c.key==='Anexos').bytes,5);
 const lists=()=>g.calls.filter(c=>c.startsWith('GET /drive/v3/files?')).length,before=lists();
 await svc.driveStorage();assert.equal(lists(),before,'segunda vez em 10 min: só a cota, sem listar tudo de novo');
 const id=(await svc.driveList('Anexos')).items[0].id;await svc.driveDelete(id);
 assert.equal((await svc.driveStorage()).sofia_bytes,0,'apagar refaz a conta');
 g.quota={usage:'10',usageInDrive:'10'};svc.summaryCache=null;assert.equal((await svc.driveStorage()).quota.limit,0,'sem limite = 0');
 const off=service(t,fakeDrive(),SC_BOTH);off.svc.saveLink({});await assert.rejects(off.svc.driveStorage(),/Conecte a Conta Google/);
});
