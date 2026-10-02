'use strict';
// Este handler usa a API HTTP nativa. Em produção é montado no Express; os mesmos
// endpoints podem ser testados com http.createServer sem substituir a lógica real.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {VERSION,IDENTITY_VERSION}=require('../config/sofia');
const {AppError,cleanText,validId,publicError,atomicWrite}=require('./util');
const {verifySignature,normalizeWebhook}=require('../channels/whatsapp');
const {OwnerAuth,normalizeEmail}=require('../services/owner-auth');
const {AccountMailer}=require('../services/account-mailer');
const {MobileSessions}=require('../services/mobile-sessions');
const {makeMobileApi}=require('../channels/mobile');
const STATIC={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/ui-current.css':['ui-current.css','text/css; charset=utf-8']};
const PUBLIC_STATIC={'/login.js':['login.js','text/javascript; charset=utf-8'],'/whatsapp/connect':['whatsapp-connect.html','text/html; charset=utf-8'],'/whatsapp-connect.js':['whatsapp-connect.js','text/javascript; charset=utf-8'],'/whatsapp-connect.css':['whatsapp-connect.css','text/css; charset=utf-8'],'/site':['site.html','text/html; charset=utf-8'],'/terms':['terms.html','text/html; charset=utf-8'],'/data-deletion':['data-deletion.html','text/html; charset=utf-8']};
function bodyJson(req,limitBytes=65536) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))return Promise.reject(new AppError('CONTENT_TYPE','Use JSON nesta operação.',415));
  return new Promise((resolve,reject)=>{
    let size=0,tooLarge=false;const chunks=[];
    req.on('data',part=>{size+=part.length;if(size>limitBytes){tooLarge=true;chunks.length=0;}else if(!tooLarge)chunks.push(part);});
    req.once('error',()=>reject(new AppError('REQUEST_ERROR','A requisição foi interrompida.')));
    req.once('end',()=>{if(tooLarge)return reject(new AppError('BODY_TOO_LARGE','A mensagem é grande demais.',413));try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw new Error();resolve(value);}catch{reject(new AppError('INVALID_JSON','O conteúdo enviado não é um objeto JSON válido.'));}});
  });
}
function bodyBuffer(req,limitBytes=1024*1024) {
  return new Promise((resolve,reject)=>{let size=0,tooLarge=false;const chunks=[];req.on('data',part=>{size+=part.length;if(size>limitBytes){tooLarge=true;chunks.length=0;}else if(!tooLarge)chunks.push(part);});req.once('error',()=>reject(new AppError('REQUEST_ERROR','A requisição foi interrompida.')));req.once('end',()=>tooLarge?reject(new AppError('BODY_TOO_LARGE','A mensagem é grande demais.',413)):resolve(Buffer.concat(chunks)));});
}
function plain(res,status,text,type='text/plain; charset=utf-8'){res.statusCode=status;res.setHeader('Content-Type',type);res.end(String(text));}
function redirect(res,status,location){res.statusCode=status;res.setHeader('Location',location);res.end();}
function railwayEnv(){return Boolean(process.env.RAILWAY_ENVIRONMENT||process.env.RAILWAY_PROJECT_ID||process.env.RAILWAY_SERVICE_ID);}
function publicRoute(p,m){return (m==='GET'&&(['/health','/privacy','/webhook','/whatsapp/onboarding-config','/login','/logout','/forgot-password','/reset-password'].includes(p)||Boolean(PUBLIC_STATIC[p])))||(m==='POST'&&['/webhook','/whatsapp/onboarding-result','/auth/login','/auth/forgot-password','/auth/reset-password'].includes(p));}
function publicHeaders(res,p){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');if(p==='/whatsapp/connect'){res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://connect.facebook.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.fbcdn.net https://*.facebook.com; connect-src 'self' https://connect.facebook.net https://graph.facebook.com https://www.facebook.com https://web.facebook.com; frame-src https://www.facebook.com https://web.facebook.com; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");}else if(['/login','/forgot-password','/reset-password'].includes(p)){res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");}else{res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");}}
function bodyForm(req,limitBytes=8192){
  if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||''))return Promise.reject(new AppError('CONTENT_TYPE','Formulário inválido.',415));
  return bodyBuffer(req,limitBytes).then(bytes=>Object.fromEntries(new URLSearchParams(bytes.toString('utf8'))));
}
function cookieValue(req,name){const raw=String(req.headers.cookie||'');for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());}return '';}
function escHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
const AUTH_STYLE=`:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#292522;background:#f5f3fa}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 18% 12%,#eee9ff 0,transparent 34%),#f7f6fa}.card{width:min(440px,100%);background:#fff;border:1px solid #e6e1ed;border-radius:24px;padding:34px;box-shadow:0 18px 55px rgba(45,38,72,.10)}.brand{display:flex;align-items:center;gap:12px;font-weight:800}.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#7258e8;color:#fff}h1{font-size:30px;line-height:1.1;margin:34px 0 8px}p{color:#625d59;line-height:1.55;margin:0 0 22px}label{display:grid;gap:8px;font-weight:700;margin-top:14px}.password-shell{position:relative}.password-shell input{padding-right:78px}input{width:100%;height:50px;border:1px solid #d8d2df;border-radius:12px;padding:0 14px;font:inherit;outline:none}input:focus{border-color:#7258e8;box-shadow:0 0 0 3px rgba(114,88,232,.12)}button{height:50px;border:0;border-radius:12px;background:#2d84df;color:#fff;font:700 15px inherit;cursor:pointer}.submit{width:100%;margin-top:18px}.toggle-password{position:absolute;right:7px;top:7px;width:auto;height:36px;padding:0 10px;background:transparent;color:#514c59;font-size:13px}.toggle-password:hover{background:#f1eef7}button:disabled{opacity:.48;cursor:not-allowed}.alert,.notice{padding:12px 14px;border-radius:11px;margin-bottom:18px;font-size:14px}.alert{background:#fff2f2;color:#9b2f2f;border:1px solid #f0cccc}.notice{background:#effaf3;color:#27643f;border:1px solid #cce7d5}.caps{margin:8px 0 0;font-size:12px;color:#8a5a13}.links{margin-top:22px;text-align:center;font-size:14px;display:flex;justify-content:center;gap:14px;flex-wrap:wrap}.links a,.forgot{color:#5d55a7;text-decoration:none}.forgot-row{display:flex;justify-content:flex-end;margin-top:10px;font-size:13px}.hint{font-size:13px;margin:14px 0 0;color:#817b76}.security{margin-top:22px;padding-top:18px;border-top:1px solid #ece8f0;color:#77706d;font-size:12px;line-height:1.55}.back{display:inline-block;margin-top:12px;color:#5d55a7;text-decoration:none;font-size:14px}`;
function authPage(title,body,{script=false}={}){return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${escHtml(title)} · Sofia OS</title><style>${AUTH_STYLE}</style>${script?'<script src="/login.js" defer></script>':''}</head><body><main class="card"><div class="brand"><span class="mark">S</span><span>Sofia OS</span></div>${body}<div class="links"><a href="/site">Site público</a><a href="/privacy">Privacidade</a><a href="/terms">Termos</a></div></main></body></html>`;}
function loginPage({error=false,configured=true,expired=false,loggedOut=false,loggedOutAll=false,rateLimited=false,reset=false,passwordChanged=false}={}){
  let warning='',notice='';
  if(!configured)warning='O acesso online ainda não foi configurado pelo responsável.';
  else if(rateLimited)warning='Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente.';
  else if(error)warning='E-mail ou senha incorretos. Tente novamente.';
  if(loggedOutAll)notice='Todas as sessões da Sofia foram encerradas.';
  else if(loggedOut)notice='Você saiu da Sofia com segurança.';
  else if(expired)notice='Sua sessão expirou. Entre novamente para continuar.';
  else if(reset)notice='Senha redefinida. Entre com seu e-mail e a nova senha.';
  else if(passwordChanged)notice='Senha alterada. Entre novamente para continuar.';
  return authPage('Entrar',`<h1>Entrar na Sofia</h1><p>Use o e-mail cadastrado no seu perfil e a senha da conta.</p>${warning?`<div class="alert" role="alert">${warning}</div>`:''}${notice?`<div class="notice" role="status">${notice}</div>`:''}<form id="loginForm" method="post" action="/auth/login"><label for="loginEmail">E-mail</label><input id="loginEmail" name="email" type="email" autocomplete="username" maxlength="160" required ${configured?'':'disabled'}><label for="loginPassword">Senha</label><div class="password-shell"><input id="loginPassword" name="password" type="password" autocomplete="current-password" minlength="12" maxlength="200" required ${configured?'':'disabled'}><button id="togglePassword" class="toggle-password" type="button" aria-label="Mostrar senha" ${configured?'':'disabled'}>Mostrar</button></div><p id="capsWarning" class="caps" hidden>Caps Lock está ativado.</p><div class="forgot-row"><a class="forgot" href="/forgot-password">Esqueceu a senha?</a></div><button id="loginSubmit" class="submit" type="submit" ${configured?'':'disabled'}>Entrar</button></form><p class="hint">Após o login, você será direcionado para <strong>sofiaos.up.railway.app</strong>.</p><div class="security">Sessão protegida por cookie HttpOnly e expiração automática. Em computadores compartilhados, use <strong>Sair</strong> ao terminar.</div>`,{script:true});
}
function forgotPasswordPage({sent=false,mailError=false,mailConfigured=true,rateLimited=false}={}){
  let message='';
  if(sent)message='<div class="notice" role="status">Se este e-mail corresponder à conta cadastrada, enviaremos um link de redefinição. Verifique também a caixa de spam.</div>';
  else if(rateLimited)message='<div class="alert" role="alert">Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.</div>';
  else if(mailError)message='<div class="alert" role="alert">Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.</div>';
  else if(!mailConfigured)message='<div class="alert" role="alert">A recuperação por e-mail ainda não foi configurada no servidor.</div>';
  return authPage('Recuperar senha',`<h1>Recuperar senha</h1><p>Informe o e-mail usado para entrar na Sofia. O link de redefinição será enviado somente para o e-mail cadastrado.</p>${message}<form method="post" action="/auth/forgot-password"><label for="recoveryEmail">E-mail</label><input id="recoveryEmail" name="email" type="email" autocomplete="username" maxlength="160" required ${mailConfigured?'':'disabled'}><button class="submit" type="submit" ${mailConfigured?'':'disabled'}>Enviar link</button></form><a class="back" href="/login">← Voltar para entrar</a>`);
}
function resetPasswordPage({token='',valid=false,error=''}={}){
  const warning=error?`<div class="alert" role="alert">${escHtml(error)}</div>`:'';
  if(!valid)return authPage('Redefinir senha',`<h1>Link inválido ou expirado</h1><p>Esse link de redefinição não está mais disponível. Solicite um novo e-mail para continuar.</p><a class="back" href="/forgot-password">Solicitar novo link</a>`);
  return authPage('Redefinir senha',`<h1>Criar nova senha</h1><p>Escolha uma nova senha com pelo menos 12 caracteres. Ao concluir, todas as sessões abertas serão encerradas.</p>${warning}<form id="resetPasswordForm" method="post" action="/auth/reset-password"><input type="hidden" name="token" value="${escHtml(token)}"><label for="newPassword">Nova senha</label><div class="password-shell"><input id="newPassword" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="200" required><button id="togglePassword" class="toggle-password" type="button" aria-label="Mostrar senha">Mostrar</button></div><label for="confirmPassword">Confirmar nova senha</label><input id="confirmPassword" name="confirm_password" type="password" autocomplete="new-password" minlength="12" maxlength="200" required><p id="capsWarning" class="caps" hidden>Caps Lock está ativado.</p><button class="submit" type="submit">Redefinir senha</button></form>`,{script:true});
}
function checkOnlinePrivateRequest(req,config){
  const host=String(req.headers.host||'');let expected;
  try{expected=new URL(config.publicBaseUrl).host;}catch{expected='';}
  if(expected&&host.toLowerCase()!==expected.toLowerCase())throw new AppError('HOST_BLOCKED','Host não autorizado para o painel.',403);
  const pathname=(()=>{try{return new URL(req.url,'https://'+host).pathname;}catch{return '';}})();
  const fetchMode=String(req.headers['sec-fetch-mode']||'').toLowerCase(),fetchDest=String(req.headers['sec-fetch-dest']||'').toLowerCase();
  const panelNavigation=req.method==='GET'&&(pathname==='/'||pathname==='/index.html')&&(fetchMode==='navigate'||fetchDest==='document'||(!req.headers.origin&&!req.headers['sec-fetch-site']));
  let expectedOrigin='';try{expectedOrigin=new URL(config.publicBaseUrl).origin;}catch{}
  if(!panelNavigation&&req.headers.origin&&expectedOrigin&&req.headers.origin!==expectedOrigin)throw new AppError('ORIGIN_BLOCKED','Origem não autorizada.',403);
  if(!panelNavigation&&req.headers['sec-fetch-site']==='cross-site')throw new AppError('ORIGIN_BLOCKED','Origem não autorizada.',403);
}
function safeExternalId(value){const v=String(value||'').trim();return /^[A-Za-z0-9._:-]{1,160}$/.test(v)?v:'';}
function privacyPage(){return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Política de Privacidade · Sofia OS</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:840px;margin:0 auto;padding:48px 24px;color:#222}h1,h2{line-height:1.2}small{color:#666}a{color:#315fd6}</style><h1>Política de Privacidade · Sofia OS</h1><p><small>Atualização 29/09/2026</small></p><p>A Sofia OS é uma plataforma SaaS em desenvolvimento, operada no Brasil por Pedro Henrique Silva. Dados recebidos por integrações autorizadas são tratados para prestar as funcionalidades solicitadas pelo usuário, manter continuidade, segurança e operação do serviço.</p><h2>WhatsApp Business e Meta</h2><p>Quando o usuário conecta voluntariamente uma conta do WhatsApp Business, a Sofia pode receber identificadores de ativos, eventos e mensagens autorizados pelas APIs oficiais da Meta. Esses dados são usados para configurar a conta escolhida, receber mensagens destinadas à empresa e enviar respostas em nome dela conforme a autorização concedida.</p><h2>Infraestrutura e operadores</h2><p>A aplicação utiliza a Railway como provedora de infraestrutura em nuvem. O tratamento segue minimização, controle de acesso e separação por finalidade. A Sofia OS não vende Dados da Plataforma.</p><h2>Controle, desconexão e exclusão</h2><p>O usuário pode solicitar a desconexão de integrações e a exclusão dos dados sob controle da Sofia OS. Consulte as <a href="/data-deletion">instruções de exclusão de dados</a>.</p><h2>Contato</h2><p>E-mail: <a href="mailto:sofiaos.core@gmail.com">sofiaos.core@gmail.com</a></p><p><a href="/site">Voltar ao site da Sofia OS</a> · <a href="/terms">Termos de Serviço</a></p></html>`;}
async function exchangeMetaCode(config,code){if(!code||!config.metaAppSecret)return {exchanged:false};const url=new URL('https://graph.facebook.com/'+encodeURIComponent(config.metaGraphVersion)+'/oauth/access_token');url.searchParams.set('client_id',config.metaAppId);url.searchParams.set('client_secret',config.metaAppSecret);url.searchParams.set('code',code);let response;try{response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});}catch{throw new AppError('META_EXCHANGE_NETWORK','A Meta concluiu o cadastro, mas a troca do código não respondeu agora.',503);}const data=await response.json().catch(()=>({}));if(!response.ok||!data.access_token)throw new AppError('META_EXCHANGE_FAILED','A Meta não aceitou a troca do código do cadastro incorporado.',502);return {exchanged:true};}
function checkLocalRequest(req) {
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
  const ownerAuth=runtime.ownerAuth||new OwnerAuth(config,store),accountMailer=runtime.accountMailer||new AccountMailer(config);
  const sessions=new Map(),loginAttempts=new Map(),resetAttempts=new Map(),sessionCookie='sofia_session',sessionTtlMs=12*60*60*1000;
  const pruneSessions=()=>{const now=Date.now();for(const [id,item] of sessions)if(item.expires<=now)sessions.delete(id);};
  const sessionFor=req=>{pruneSessions();const id=cookieValue(req,sessionCookie),item=id?sessions.get(id):null;return item&&item.expires>Date.now()?{id,...item}:null;};
  const validSession=req=>Boolean(sessionFor(req));
  const clearSession=(req,res)=>{const id=cookieValue(req,sessionCookie);if(id)sessions.delete(id);res.setHeader('Set-Cookie',sessionCookie+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');};
  const createSession=res=>{const id=crypto.randomBytes(32).toString('base64url'),created=Date.now(),expires=created+sessionTtlMs;sessions.set(id,{created,expires});res.setHeader('Set-Cookie',sessionCookie+'='+id+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+Math.floor(sessionTtlMs/1000));};
  const attemptKey=req=>String(req.socket.remoteAddress||'unknown');
  const registerFailure=req=>{const key=attemptKey(req),now=Date.now(),windowMs=15*60*1000;const arr=(loginAttempts.get(key)||[]).filter(ts=>now-ts<windowMs);arr.push(now);loginAttempts.set(key,arr);return arr.length;};
  const tooManyFailures=req=>{const key=attemptKey(req),now=Date.now(),windowMs=15*60*1000;const arr=(loginAttempts.get(key)||[]).filter(ts=>now-ts<windowMs);loginAttempts.set(key,arr);return arr.length>=12;};
  const registerResetRequest=req=>{const key=attemptKey(req),now=Date.now(),windowMs=30*60*1000;const arr=(resetAttempts.get(key)||[]).filter(ts=>now-ts<windowMs);arr.push(now);resetAttempts.set(key,arr);return arr.length;};
  const tooManyResetRequests=req=>{const key=attemptKey(req),now=Date.now(),windowMs=30*60*1000;const arr=(resetAttempts.get(key)||[]).filter(ts=>now-ts<windowMs);resetAttempts.set(key,arr);return arr.length>=5;};
  const mobileSessions=new MobileSessions(store,ownerAuth,config);
  const mobileApi=makeMobileApi(runtime,{bodyJson,json,ownerAuth,mobileSessions,tooManyFailures,registerFailure,clearFailures:req=>loginAttempts.delete(attemptKey(req)),revokeWebSessions:()=>sessions.clear()});
  return async function handler(req,res) {
    const url=new URL(req.url,'http://localhost');const p=url.pathname,m=req.method;
    if(publicRoute(p,m))publicHeaders(res,p);else headers(res);
    try {
      if(req.url.length>4096)throw new AppError('URL_TOO_LONG','Endereço grande demais.',414);
      if(!['GET','POST','PATCH','DELETE'].includes(m))throw new AppError('METHOD','Método não suportado.',405);
      if(await mobileApi(req,res,p,m,url))return;
      if(m==='GET'&&p==='/login'){
        if(railwayEnv()&&validSession(req))return redirect(res,303,'/');
        return plain(res,200,loginPage({error:url.searchParams.get('error')==='1',expired:url.searchParams.get('expired')==='1',loggedOut:url.searchParams.get('logout')==='1',loggedOutAll:url.searchParams.get('logout')==='all',rateLimited:url.searchParams.get('rate')==='1',reset:url.searchParams.get('reset')==='1',passwordChanged:url.searchParams.get('changed')==='1',configured:ownerAuth.passwordConfigured()}),'text/html; charset=utf-8');
      }
      if(m==='POST'&&p==='/auth/login'){
        if(!railwayEnv())return redirect(res,303,'/');
        if(!ownerAuth.passwordConfigured())throw new AppError('LOGIN_NOT_CONFIGURED','O acesso online ainda não foi configurado.',503);
        if(tooManyFailures(req))return redirect(res,303,'/login?rate=1');
        const form=await bodyForm(req),email=normalizeEmail(form.email),password=String(form.password||'');
        if(!ownerAuth.verifyLogin(email,password)){registerFailure(req);return redirect(res,303,'/login?error=1');}
        loginAttempts.delete(attemptKey(req));createSession(res);return redirect(res,303,'/');
      }
      if(m==='GET'&&p==='/forgot-password')return plain(res,200,forgotPasswordPage({sent:url.searchParams.get('sent')==='1',mailError:url.searchParams.get('mail')==='1',rateLimited:url.searchParams.get('rate')==='1',mailConfigured:accountMailer.configured()}),'text/html; charset=utf-8');
      if(m==='POST'&&p==='/auth/forgot-password'){
        if(!railwayEnv())return redirect(res,303,'/login');
        if(!accountMailer.configured())return redirect(res,303,'/forgot-password');
        if(tooManyResetRequests(req))return redirect(res,303,'/forgot-password?rate=1');
        registerResetRequest(req);const form=await bodyForm(req),email=normalizeEmail(form.email);
        if(email&&email===ownerAuth.registeredEmail()){
          const resetToken=ownerAuth.createResetToken(),base=String(config.publicBaseUrl||'').replace(/\/$/,'');
          try{await accountMailer.sendPasswordReset({to:ownerAuth.registeredEmail(),url:base+'/reset-password?token='+encodeURIComponent(resetToken)});}catch(error){console.error('[Sofia] Falha ao enviar recuperação de senha:',error.message);return redirect(res,303,'/forgot-password?mail=1');}
        }
        return redirect(res,303,'/forgot-password?sent=1');
      }
      if(m==='GET'&&p==='/reset-password'){
        const resetToken=String(url.searchParams.get('token')||'');return plain(res,200,resetPasswordPage({token:resetToken,valid:ownerAuth.tokenValid(resetToken)}),'text/html; charset=utf-8');
      }
      if(m==='POST'&&p==='/auth/reset-password'){
        if(!railwayEnv())return redirect(res,303,'/login');
        const form=await bodyForm(req),resetToken=String(form.token||''),password=String(form.password||''),confirmation=String(form.confirm_password||'');
        if(!ownerAuth.tokenValid(resetToken))return plain(res,400,resetPasswordPage({valid:false}),'text/html; charset=utf-8');
        if(password.length<12)return plain(res,400,resetPasswordPage({token:resetToken,valid:true,error:'A nova senha precisa ter pelo menos 12 caracteres.'}),'text/html; charset=utf-8');
        if(password!==confirmation)return plain(res,400,resetPasswordPage({token:resetToken,valid:true,error:'As duas senhas precisam ser iguais.'}),'text/html; charset=utf-8');
        if(!ownerAuth.consumeReset(resetToken,password))return plain(res,400,resetPasswordPage({valid:false}),'text/html; charset=utf-8');
        sessions.clear();mobileSessions.revokeAll();return redirect(res,303,'/login?reset=1');
      }
      if(m==='GET'&&p==='/logout'){if(railwayEnv())clearSession(req,res);return redirect(res,303,railwayEnv()?'/login?logout=1':'/');}
      if(m==='GET'&&p==='/health'){const ss=store.settings(),privateKey=Boolean(config.privateApiKey||(ss.legacyRoute==='private'&&config.apiKey));return json(res,200,{ok:true,name:'Sofia OS',version:VERSION,storage:'sqlite-local',private_filter:{ready:Boolean(privateKey&&ss.routingEnabled&&ss.privateConfirmed),key_present:privateKey,routing_enabled:ss.routingEnabled===true,confirmed:ss.privateConfirmed===true,legacy_route:ss.legacyRoute||'none'}});}
      if(m==='GET'&&p==='/privacy')return plain(res,200,privacyPage(),'text/html; charset=utf-8');
      if(m==='GET'&&PUBLIC_STATIC[p]){const [file,type]=PUBLIC_STATIC[p];res.setHeader('Content-Type',type);res.end(fs.readFileSync(path.join(config.root,'public',file)));return;}
      if(m==='GET'&&p==='/whatsapp/onboarding-config'){if(!config.metaAppId||!config.metaLoginConfigId)throw new AppError('META_CONFIG_MISSING','Configure META_APP_ID e META_LOGIN_CONFIG_ID no servidor.',503);return json(res,200,{ok:true,appId:config.metaAppId,configId:config.metaLoginConfigId,graphVersion:config.metaGraphVersion,featureType:'whatsapp_business_app_onboarding',sessionInfoVersion:'3'});}
      if(m==='GET'&&p==='/webhook'){const mode=url.searchParams.get('hub.mode'),verify=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge');if(!config.whatsappVerifyToken)throw new AppError('WHATSAPP_VERIFY_TOKEN_NOT_CONFIGURED','Token de verificação do WhatsApp não configurado.',503);if(mode==='subscribe'&&verify===config.whatsappVerifyToken&&challenge)return plain(res,200,challenge);throw new AppError('WEBHOOK_VERIFY_FAILED','Token de verificação do webhook recusado.',403);}
      if(m==='POST'&&p==='/webhook'){const raw=await bodyBuffer(req,2*1024*1024),signature=String(req.headers['x-hub-signature-256']||'');if(config.metaAppSecret&&!verifySignature(raw,signature,config.metaAppSecret))throw new AppError('WEBHOOK_SIGNATURE','Assinatura do webhook inválida.',403);let payload;try{payload=JSON.parse(raw.toString('utf8'));}catch{throw new AppError('INVALID_JSON','Webhook inválido.',400);}let events=[];try{events=normalizeWebhook(payload);}catch(error){if(error.code!=='WRONG_WEBHOOK')throw error;}console.log('[Sofia] Webhook WhatsApp recebido:',events.length,'eventos normalizados.');return json(res,200,{ok:true});}
      if(m==='POST'&&p==='/whatsapp/onboarding-result'){const b=await bodyJson(req,16384),session=b.session&&typeof b.session==='object'?b.session:{};const event=String(b.event||'').slice(0,120),safe={event,waba_id:safeExternalId(session.waba_id),phone_number_id:safeExternalId(session.phone_number_id),updated_at:new Date().toISOString()};const exchange=await exchangeMetaCode(config,String(b.code||''));fs.mkdirSync(config.dataDir,{recursive:true});atomicWrite(path.join(config.dataDir,'whatsapp-onboarding.json'),Buffer.from(JSON.stringify({...safe,token_exchanged:exchange.exchanged},null,2)+'\n'));return json(res,200,{ok:true,exchanged:exchange.exchanged,event:safe.event,session:{waba_id:safe.waba_id,phone_number_id:safe.phone_number_id}});}
      if(railwayEnv()){if(!validSession(req)){if(m==='GET'&&(p==='/'||p==='/index.html'))return redirect(res,303,'/login');throw new AppError('AUTH_REQUIRED','Faça login para acessar a Sofia.',401);}checkOnlinePrivateRequest(req,config);}else checkLocalRequest(req);
      if(m!=='GET' && req.headers['x-sofia-token']!==token)throw new AppError('CSRF','Reabra a página para atualizar a sessão local.',403);
      if(m==='GET' && p==='/api/bootstrap'){const current=sessionFor(req);return json(res,200,{ok:true,token,version:VERSION,identity_version:IDENTITY_VERSION,model:config.model,key_present:Boolean(config.apiKey),settings:store.settings(),usage:store.usage(),stats:store.stats(),backup_warning:backups.lastError,auth:{online:railwayEnv(),role:'owner',login_email:ownerAuth.registeredEmail(),recovery_email_configured:accountMailer.configured(),session_expires_at:current?new Date(current.expires).toISOString():null,session_ttl_hours:12}});}
      if(m==='POST' && p==='/api/auth/logout-all'){sessions.clear();mobileSessions.revokeAll();clearSession(req,res);return json(res,200,{ok:true,redirect:'/login?logout=all'});}
      if(m==='POST' && p==='/api/auth/change-password'){const b=await bodyJson(req,8192),currentPassword=String(b.currentPassword||''),newPassword=String(b.newPassword||''),confirmPassword=String(b.confirmPassword||'');if(!ownerAuth.verifyPassword(currentPassword))throw new AppError('PASSWORD_INVALID','A senha atual está incorreta.',403);if(newPassword.length<12)throw new AppError('PASSWORD_WEAK','A nova senha precisa ter pelo menos 12 caracteres.',400);if(newPassword!==confirmPassword)throw new AppError('PASSWORD_MISMATCH','As duas senhas novas precisam ser iguais.',400);ownerAuth.setPassword(newPassword);sessions.clear();mobileSessions.revokeAll();clearSession(req,res);return json(res,200,{ok:true,redirect:'/login?changed=1'});}
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
