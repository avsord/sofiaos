'use strict';
const https=require('node:https'),dns=require('node:dns').promises,net=require('node:net');
const {AppError}=require('../core/util');
function publicIP(ip){
 const kind=net.isIP(ip);if(kind===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===88))||(a===100&&b>=64&&b<=127)||a===198||a===203);}
 if(kind===6){const n=ip.toLowerCase();return /^[23][0-9a-f]{3}:/.test(n)&&!n.startsWith('2001:db8:')&&!n.startsWith('2001:0:')&&!n.startsWith('2002:');}return false;
}
async function readFeed(address,{signal,resolve=dns.lookup}={}){
 let u;try{u=new URL(address);}catch{throw new AppError('FEED_URL','Endereço de feed inválido.');}
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||net.isIP(u.hostname)||u.hostname==='localhost'||/\.(?:localhost|local|internal|test)$/i.test(u.hostname))throw new AppError('FEED_URL','Feed exige domínio público HTTPS sem credenciais.');
 let addresses;try{addresses=await resolve(u.hostname,{all:true,verbatim:true});}catch{throw new AppError('FEED_DNS','Não foi possível resolver o domínio do feed.');}
 if(!addresses.length||addresses.some(a=>!publicIP(a.address)))throw new AppError('FEED_PRIVATE_HOST','O domínio do feed aponta para rede reservada/local. Acesso bloqueado.');
 const chosen=addresses[0];
 return new Promise((resolve,reject)=>{
   let total=0,done=false;const chunks=[];const finish=(e,data)=>{if(done)return;done=true;e?reject(e):resolve(data);};
   const req=https.get(u,{signal,timeout:10000,headers:{Accept:'application/json','User-Agent':'SofiaOS-AuthorizedFeed/45'},lookup:(host,opts,cb)=>opts?.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family)},res=>{
     if(res.statusCode!==200){res.resume();return finish(new AppError('FEED_HTTP','Feed respondeu HTTP '+res.statusCode+'. Redirecionamentos não são seguidos.'));}
     if(!/^(application\/json|application\/[^;]+\+json)/i.test(res.headers['content-type']||'')){res.resume();return finish(new AppError('FEED_TYPE','A fonte não retornou JSON. HTML de loja não é feed compatível.'));}
     res.on('data',b=>{total+=b.length;if(total>512*1024){req.destroy();return finish(new AppError('FEED_SIZE','Feed ultrapassou 512 KB.'));}chunks.push(b);});res.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(new AppError('FEED_JSON','Feed contém JSON inválido.'));}});res.on('error',()=>finish(new AppError('FEED_CONNECTION','Leitura do feed interrompida.')));
   });
   req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',()=>finish(new AppError('FEED_CONNECTION','Não foi possível consultar o feed. Nenhum preço foi inventado.')));
 });
}
function field(object,path){if(typeof path!=='string'||!/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){0,8}$/.test(path)||path.split('.').some(x=>['__proto__','constructor','prototype'].includes(x)))throw new AppError('FEED_FIELD','Caminho de campo inválido.');let r=object;for(const p of path.split('.')){if(!r||typeof r!=='object'||!Object.hasOwn(r,p))throw new AppError('FEED_FIELD','Campo não encontrado no feed.');r=r[p];}return r;}
module.exports={readFeed,publicIP,field};
