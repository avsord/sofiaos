// 0.3.263: conferencia do site num navegador de verdade (Tab, avisos no titulo, hover, Ctrl+K, menus do botao direito, janelas perto do clique, rodinha, grafico). Mesmo preparo de tools/site-shots.cjs.
const chromium=require('@sparticuz/chromium'),puppeteer=require('puppeteer-core');const sleep=ms=>new Promise(r=>setTimeout(r,ms));const B='http://127.0.0.1:3999';
const R=[];const ok=(name,cond,info='')=>{R.push((cond?'OK   ':'FALHA ')+name+(info?' — '+info:''));};
const menuText=p=>p.evaluate(()=>{const m=document.querySelector('[data-testid="context-menu"]');return m?m.innerText.replace(/\n/g,' | '):'';});
async function rightClickOn(p,pred){const h=await p.evaluateHandle(pred);const el=h.asElement();if(!el)return false;const b=await el.boundingBox();if(!b)return false;await p.mouse.click(b.x+Math.min(40,b.width/2),b.y+b.height/2,{button:'right'});await sleep(500);return true;}
const byText=t=>new Function('return [...document.querySelectorAll("div")].filter(e=>(e.innerText||"").includes('+JSON.stringify(t)+')&&e.getBoundingClientRect().height>20&&e.getBoundingClientRect().height<140).sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height)[0]||null');
(async()=>{const b=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:true,defaultViewport:{width:1440,height:900}});const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,150)));
await p.goto(B+'/',{waitUntil:'networkidle0'});await sleep(1200);
// Tab na ordem: e-mail -> senha -> esqueceu -> entrar
const inputs=await p.$$('input');await inputs[0].focus();const order=[];
for(let k=0;k<4;k++){order.push(await p.evaluate(()=>{const a=document.activeElement;return a.getAttribute('aria-label')||a.innerText.trim().slice(0,20)||a.tagName;}));await p.keyboard.press('Tab');}
ok('Tab na ordem do login',order[0]==='E-mail de login'&&order[1]==='Senha da Sofia'&&/Esqueceu/.test(order.join('|')),order.join(' → '));
await inputs[0].type('teste@sofia.dev');await inputs[1].type('senha-de-teste-123');await inputs[1].press('Enter');await sleep(4500);
// titulo com avisos
await sleep(2500);ok('Avisos no título da aba',/^\(\d+\) /.test(await p.title()),await p.title());
// hover
const hb=await p.evaluateHandle(()=>[...document.querySelectorAll('[role=button]')].find(e=>(e.innerText||'').trim()==='Agenda'));const hbe=hb.asElement();const bb=await hbe.boundingBox();await p.mouse.move(bb.x+20,bb.y+bb.height/2);await sleep(300);
ok('Hover visível no menu lateral',/inset/.test(await p.evaluate(e=>getComputedStyle(e).boxShadow,hbe)),await p.evaluate(e=>getComputedStyle(e).boxShadow,hbe));
// Ctrl+K com tarefas
await p.keyboard.down('Control');await p.keyboard.press('k');await p.keyboard.up('Control');await sleep(600);await p.keyboard.type('Comprar lente');await sleep(600);
const pal=await p.evaluate(()=>document.body.innerText.includes('Comprar lente 50mm')&&document.body.innerText.includes('TAREFAS'));ok('Ctrl+K encontra tarefa',pal);
await p.keyboard.press('Enter');await sleep(2500);ok('Ctrl+K abre a tarefa',await p.evaluate(()=>{const pk=document.querySelector('[data-testid="side-peek"]');return location.pathname==='/apps/tarefas'&&!!pk&&[...pk.querySelectorAll('input,textarea')].some(i=>String(i.value).includes('Comprar lente'));}),await p.evaluate(()=>location.pathname));
await p.keyboard.press('Escape');await sleep(800);
// menus
const checks=[['/apps/tarefas','Tarefa de exemplo 2','Levar para a agenda'],['/apps/notas','Ideia de abertura','Duplicar'],['/apps/biblioteca','Blade Runner','Duplicar'],['/apps/lembretes','Ligar para o contador','Apagar'],['/apps/encomendas','Lente 50mm','Remover'],['/apps/emails','Boleto do condomínio','Tirar da lista'],['/agenda','Responder e-mails','Apagar'],['/apps/financas','Mercado','Duplicar']];
for(const [url,text,expect] of checks){await p.goto(B+url,{waitUntil:'networkidle0'});await sleep(4000);const done=await rightClickOn(p,byText(text));const m=await menuText(p);ok('Menu do botão direito em '+url,done&&m.includes(expect),m||'(nao abriu)');await p.keyboard.press('Escape');await sleep(300);}
await p.goto(B+'/paginas',{waitUntil:'networkidle0'});await sleep(4000);
const pg=await rightClickOn(p,()=>[...document.querySelectorAll('div')].filter(e=>(e.innerText||'').trim()==='Ideias para o I MISS YOU'&&e.getBoundingClientRect().left>300).pop()?.parentElement||null);const pm=await menuText(p);ok('Menu do botão direito em Páginas',pg&&pm.includes('Apagar'),pm||'(nao abriu)');await p.keyboard.press('Escape');
// folha perto do clique (Financas: seletor de conta)
await p.goto(B+'/apps/financas',{waitUntil:'networkidle0'});await sleep(4000);
const acc=await p.evaluateHandle(()=>[...document.querySelectorAll('div')].filter(e=>(e.innerText||'').trim().startsWith('Conta principal')&&e.getBoundingClientRect().height<50).pop());const ab=await acc.asElement().boundingBox();await p.mouse.click(ab.x+20,ab.y+ab.height/2);await sleep(700);
const sp=await p.evaluate(()=>{const s=document.querySelector('[data-testid="sheet-panel"]');if(!s)return null;const r=s.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width};});
ok('Janelinha abre perto do clique',!!sp&&Math.abs(sp.x+sp.w/2-(ab.x+20))<260&&sp.y<ab.y+120,JSON.stringify(sp)+' clique '+Math.round(ab.x+20)+','+Math.round(ab.y));
await p.keyboard.press('Escape');await sleep(500);
// rodinha fora da caixa que rola
await p.setViewport({width:1440,height:520});await p.goto(B+'/agenda',{waitUntil:'networkidle0'});await sleep(4000);
const before=await p.evaluate(()=>{const els=[...document.querySelectorAll('div')].filter(e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+4);return els.map(e=>e.scrollTop).join(',');});
await p.mouse.move(700,25);await p.mouse.wheel({deltaY:300});await sleep(700);
const after=await p.evaluate(()=>{const els=[...document.querySelectorAll('div')].filter(e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+4);return els.map(e=>e.scrollTop).join(',');});
ok('Rodinha rola de qualquer lugar',before!==after,before+' → '+after);
await p.setViewport({width:1440,height:900});
// grafico com detalhe no mouse
await p.goto(B+'/apps/financas',{waitUntil:'networkidle0'});await sleep(3500);
await p.evaluate(()=>{const el=[...document.querySelectorAll('div')].filter(e=>(e.innerText||'').trim()==='Relatórios').pop();el&&el.click();});await sleep(2500);
await sleep(500);
const bar=await p.evaluateHandle(()=>{const e=[...document.querySelectorAll('[aria-label]')].filter(e=>/: receitas R\$/.test(e.getAttribute('aria-label')||'')).pop();e&&e.scrollIntoView({block:'center'});return e;});await sleep(600);const be=bar.asElement();
if(be){const bx=await be.boundingBox();await p.mouse.move(bx.x+bx.width/2,bx.y+bx.height/2);await sleep(500);}
ok('Gráfico mostra detalhe ao passar o mouse',!!be&&await p.evaluate(()=>/Resultado R\$/.test(document.body.innerText)));
await p.screenshot({path:'/tmp/shots/verify-chart.png'});
ok('Sem erros de página',errs.length===0,errs.join(' | '));
console.log(R.join('\n'));await b.close();})().catch(e=>{console.log(R.join('\n'));console.error('ERR',e.message);process.exit(1);});
