'use strict';
// Deterministic source upgrade. Never touches .env, data, backups, passwords or deploy settings.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),staged=new Map();
function read(file){return staged.has(file)?staged.get(file):fs.readFileSync(path.join(root,file),'utf8');}
function save(file,text){staged.set(file,text);}
function replace(file,from,to){const text=read(file);if(text.includes(to))return;if(!text.includes(from))throw new Error('Source anchor missing: '+file);save(file,text.replace(from,to));}
const original=read('src/config/sofia.js');
if(original.includes("const VERSION = '138.0.0'")){console.log('Mobile v138 source already applied.');process.exit(0);}
if(!original.includes("const VERSION = '134.0.0'"))throw new Error('This migration expects the verified v134 GitHub source; reconcile other versions first.');
const docs=['Comando atual.md','PROMPT_CONTINUAR_SOFIA.md','docs/MASTER.md','docs/CONTEXTO_NOVO_CHAT.md','docs/GUIA_MASTER_COMPLETO.md','docs/UI_MAP.md'];
for(const d of docs)save('docs/historico_bruto/snapshots_v138/'+path.basename(d).replace(/\.md$/,'_base_github_v134.md'),read(d));
replace('src/core/http-handler.js',"const {AccountMailer}=require('../services/account-mailer');", "const {AccountMailer}=require('../services/account-mailer');\nconst {MobileSessions}=require('../services/mobile-sessions');\nconst {makeMobileApi}=require('../channels/mobile');");
replace('src/core/http-handler.js',"  return async function handler(req,res) {", "  const mobileSessions=new MobileSessions(store,ownerAuth,config);\n  const mobileApi=makeMobileApi(runtime,{bodyJson,json,ownerAuth,mobileSessions,tooManyFailures,registerFailure,clearFailures:req=>loginAttempts.delete(attemptKey(req)),revokeWebSessions:()=>sessions.clear()});\n  return async function handler(req,res) {");
replace('src/core/http-handler.js',"      if(m==='GET'&&p==='/login'){", "      if(await mobileApi(req,res,p,m,url))return;\n      if(m==='GET'&&p==='/login'){");
let http=read('src/core/http-handler.js');http=http.replaceAll('sessions.clear();','sessions.clear();mobileSessions.revokeAll();');save('src/core/http-handler.js',http);
replace('src/memory/store.js',"if (!['web','test','whatsapp-simulator'].includes(channel))", "if (!['web','test','whatsapp-simulator','mobile'].includes(channel))");
replace('src/config/runtime.js',"dataDir: path.join(root, 'data'), backupDir: path.join(root, 'backups')", "dataDir: process.env.SOFIA_DATA_DIR ? path.resolve(root, process.env.SOFIA_DATA_DIR) : path.join(root, 'data'), backupDir: process.env.SOFIA_BACKUP_DIR ? path.resolve(root, process.env.SOFIA_BACKUP_DIR) : path.join(root, 'backups')");
replace('src/config/sofia.js',"const VERSION = '134.0.0'", "const VERSION = '138.0.0'");
for(const f of ['src/server.js','public/index.html'])save(f,read(f).replaceAll('v134','v138').replaceAll('?v=134','?v=138'));
const pkg=JSON.parse(read('package.json'));pkg.version='1.88.0';pkg.description='Sofia OS v138 — API nativa e workspace compartilhado com o app';save('package.json',JSON.stringify(pkg,null,2)+'\n');
const lock=JSON.parse(read('package-lock.json'));lock.version=pkg.version;if(lock.packages?.[''])lock.packages[''].version=pkg.version;save('package-lock.json',JSON.stringify(lock,null,2)+'\n');
let ui=read('tests/current-ui.test.cjs');const end=ui.indexOf("test('v119:");if(end<0)throw new Error('UI test boundary missing');ui=ui.slice(0,end).replaceAll('134','138').replaceAll('1.84.0','1.88.0')+ui.slice(end);save('tests/current-ui.test.cjs',ui);
save('tests/auth-online.test.cjs',read('tests/auth-online.test.cjs').replaceAll('v134','v138').replaceAll('134.0.0','138.0.0'));
const note='\n\n## v138 — aplicativo Android e mesma base\n\nLogin nativo por e-mail e senha, sessão Bearer com hash e expiração, mensagens e áudios no mesmo SofiaCore. A API do app expõe somente operações de usuário autenticadas, reutilizando o catálogo e as mesmas operações do site. Sessões web e nativas são revogadas juntas ao trocar a senha ou sair de todos os dispositivos. O diário mantém autenticação adicional e criptografia, separado da memória comum. Nenhuma dependência da aprovação Meta para conversar no app. Não significa que o WhatsApp esteja ativado ou que as conversas de outros contatos possam usar a memória privada do proprietário.\n\nBase desta integração no GitHub: v134; documentos anteriores preservados em snapshots_v138. Não altera .env, senhas, diretórios existentes de dados ou backups. Publicar em produção somente depois dos testes e da conferência de persistência/backup. APK compilado não comprova a credencial real da IA nem equivalência a todos os gestos avançados do editor desktop.\n';
for(const d of docs)save(d,read(d)+note);
for(const [file,content]of staged){const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);}
console.log('Updated '+staged.size+' source/documentation files. No data/config secrets changed.');
