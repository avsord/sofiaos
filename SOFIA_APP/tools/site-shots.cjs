// Uso local: npm i @sparticuz/chromium@131 puppeteer-core@23 numa pasta a parte, servidor da Sofia rodando em SITE (padrao 127.0.0.1:3999).
// Prints de referencia do site (Sofia OS) - uso: node shots.js <pasta> [largura] [altura]
const chromium=require('@sparticuz/chromium'),puppeteer=require('puppeteer-core'),fs=require('fs');
const out=process.argv[2]||'/tmp/shots/base',W=Number(process.argv[3]||1440),H=Number(process.argv[4]||900),BASE=process.env.SITE||'http://127.0.0.1:3999';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function clickText(p,text,{exact=true}={}){return p.evaluate((text,exact)=>{const els=[...document.querySelectorAll('[role=button],[role=link],[role=tab],a,button,div[tabindex],div')];
 const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
 const hit=els.filter(e=>vis(e)&&(exact?(e.innerText||'').trim()===text:(e.innerText||'').includes(text))).sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length)[0];
 if(!hit)return false;hit.click();return true;},text,exact);}
(async()=>{fs.mkdirSync(out,{recursive:true});
 const b=await puppeteer.launch({args:[...chromium.args,'--lang=pt-BR'],executablePath:await chromium.executablePath(),headless:true,defaultViewport:{width:W,height:H}});
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e.message).slice(0,200)));
 await p.goto(BASE+'/',{waitUntil:'networkidle0',timeout:60000});await sleep(1500);
 await p.screenshot({path:out+'/00-login.png'});
 const inputs=await p.$$('input');if(inputs.length>=2){await inputs[0].type('teste@sofia.dev');await inputs[1].type('senha-de-teste-123');}
 await clickText(p,'Entrar');await sleep(5000);
 const shots=[['01-inicio','Início'],['02-conversa','Conversa'],['03-paginas','Páginas'],['04-agenda','Agenda'],['05-apps','Apps'],['06-perfil','Perfil']];
 for(const [name,label] of shots){const ok=await clickText(p,label);await sleep(2500);await p.screenshot({path:out+'/'+name+'.png'});if(!ok)errors.push('nao achei '+label);}
 const apps=[['10-financas','Finanças'],['11-tarefas','Tarefas backlog'],['12-emails','E-mails'],['13-biblioteca','Biblioteca'],['14-notas','Notas'],['15-listas','Listas'],['16-capsulas','Cápsulas'],['17-monitoramento','Monitoramento'],['18-rotinas','Rotinas'],['19-lembretes','Lembretes']];
 for(const [name,label] of apps){await clickText(p,'Apps');await sleep(1200);const ok=await clickText(p,label);await sleep(2500);await p.screenshot({path:out+'/'+name+'.png'});if(!ok)errors.push('nao achei '+label);}
 fs.writeFileSync(out+'/erros.txt',errors.join('\n'));console.log('prints:',fs.readdirSync(out).length,'erros:',errors.length);await b.close();})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
