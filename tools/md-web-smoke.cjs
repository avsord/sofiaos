'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright'),{createRuntime}=require('../src/core/runtime');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-web-')),out=path.join(__dirname,'../SOFIA_APP/dist/web-evidence');fs.mkdirSync(out,{recursive:true});
 const runtime=createRuntime({root:path.resolve(__dirname,'..'),dataDir:path.join(tmp,'data'),backupDir:path.join(tmp,'backups'),publicBaseUrl:'http://127.0.0.1',maxMessageChars:12000,maxContextChars:20000},{secureDir:path.join(tmp,'secure'),provider:{respond:async()=>({reply:'QA',usage:{}})}});
 const make=title=>runtime.workspace.save({kind:'user_page',title,area:'Pessoal',privacy:'private',data:{icon:'🖤',blocks_json:'[]'}});
 const first=make('QA principal');make('QA segunda');
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>window.sofiaMdInstalled&&state.token);await page.waitForSelector('.md-agenda-split');
  const widths=await page.locator('.md-agenda-half').evaluateAll(xs=>xs.slice(0,2).map(x=>x.getBoundingClientRect().width));assert.equal(widths.length,2);assert.ok(Math.abs(widths[0]-widths[1])<1);
  await page.screenshot({path:path.join(out,'home.png')});
  const bell=page.locator('#startNotifications');await bell.click();await page.waitForSelector('.md-notice-popup[open]');
  await page.locator('.md-notice-popup').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished));});
  const [b,p]=await Promise.all([bell.boundingBox(),page.locator('.md-notice-popup').boundingBox()]);assert.ok(p.y>=b.y+b.height);await page.screenshot({path:path.join(out,'bell.png')});await page.keyboard.press('Escape');
  await page.locator('#primaryUserNav [data-tab="userpages"]').click();await page.getByRole('button',{name:'Abrir página QA principal',exact:true}).last().waitFor();
  const row=page.locator('#mdPageRootTree').getByRole('button',{name:'Abrir página QA principal',exact:true});const box=await row.boundingBox();await page.mouse.move(box.x+12,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(350);await page.mouse.up();await page.getByRole('button',{name:'Excluir página',exact:true}).waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
  const context2=await browser.newContext(),other=await context2.newPage();await other.goto(base);await other.waitForFunction(()=>window.sofiaMdInstalled&&state.token);
  await other.evaluate(async()=>api('/api/entities',{method:'POST',body:{kind:'user_page',title:'Criada no segundo cliente',privacy:'private',data:{blocks_json:'[]'}}}));
  await page.locator('#mdPageRootTree').getByRole('button',{name:'Abrir página Criada no segundo cliente',exact:true}).waitFor({timeout:12000});
  await row.click();await page.locator('#notionPageTitle').waitFor();
  await other.evaluate(async id=>{const p=await api('/api/entities/'+id);await api('/api/entities/'+id,{method:'PATCH',body:{revision:p.revision,title:'Alterada no segundo cliente'}});},first.id);
  await page.waitForFunction(()=>document.querySelector('#notionPageTitle')?.textContent==='Alterada no segundo cliente',null,{timeout:12000});
  await page.evaluate(()=>showPageTemplates());await page.getByRole('button',{name:'Tarefas pessoal',exact:true}).waitFor();await page.getByRole('button',{name:'Anotações',exact:true}).waitFor();await page.getByRole('button',{name:'Coleção',exact:true}).waitFor();await page.screenshot({path:path.join(out,'templates.png')});await page.keyboard.press('Escape');
  await page.evaluate(()=>setTab('settings'));await page.waitForSelector('#md-settings-tabs');assert.equal(await page.locator('#tab-settings h2').first().textContent(),'Ajustes');await page.screenshot({path:path.join(out,'settings.png')});
  await page.setViewportSize({width:360,height:800});await page.evaluate(()=>setTab('start'));await page.waitForSelector('.md-agenda-split');await page.screenshot({path:path.join(out,'home-mobile.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,tests:['agenda halves','bell anchored','long press','two browser clients create/edit','exact templates','settings','mobile layout'],errors},null,2));console.log('PASS: MD web checks with two isolated clients and synthetic data');
 }finally{await browser?.close();runtime[Symbol.for('sofia.md.upgrade')]?.calendar.close();server.closeAllConnections();await new Promise(r=>server.close(r));runtime.store.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
