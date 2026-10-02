'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
test('tab switch updates synchronously, including rapid consecutive taps',()=>{
  const match=source.match(/const switchTab=useCallback\(\(next:Tab\)=>\{([^}]*)\},\[\]\)/);
  assert.ok(match,'Tab switch must stay synchronous and independent of render state');
  const calls=[];
  const fn=vm.runInNewContext('(next)=>{'+match[1]+'}',{setTab:value=>calls.push(value)});
  const tabs=['home','pages','agenda','apps','profile','chat'];
  for(let i=0;i<100;i++){const next=tabs[i%tabs.length];fn(next);assert.equal(calls[i],next);}
  assert.equal(calls.length,100);
});
test('no animation, translated surface or deferred tab dispatch',()=>{
  for(const token of ['Animated','Easing','transitioning','translateY','requestAnimationFrame','setTimeout'])assert.ok(!source.includes(token),token);
  assert.match(source,/function navigate\(next:Tab\)\{[^\n]*switchTab\(next\);\}/);
});
test('tab surfaces stay mounted and their visibility changes without spinners',()=>{
  for(const tab of ['chat','home','pages','agenda','apps','notifications','profile'])assert.ok(source.includes("display:tab==='"+tab+"'?'flex':'none'"),tab);
  for(const name of ['Home','Agenda','Notifications','Workspace']){
    const text=fs.readFileSync(path.join(root,'src/screens',name+'.tsx'),'utf8');
    assert.ok(!text.includes('refreshing={loading}'),name+' uses only manual refreshing');
  }
  assert.ok(!source.includes('setBootstrap(null);setTab('));
});
test('Android identity and released version agree',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'app.json'))).expo;
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  const update=fs.readFileSync(path.join(root,'src/lib/update.ts'),'utf8');
  assert.equal(config.android.package,'com.avsord.sofiaapp');assert.equal(config.android.versionCode,11);
  assert.equal(config.version,'0.3.6');assert.equal(pkg.version,config.version);assert.ok(update.includes("APP_VERSION = '"+pkg.version+"'"));
});


test('Pages opens from cached entity immediately without awaiting api.entity',()=>{
  const pages=fs.readFileSync(path.join(root,'src/screens/Pages.tsx'),'utf8');
  assert.match(pages,/function open\(page:Entity,push=true\)\{[^\n]*setSelected\(page\);[^\n]*setTitle\(page\.title\);[^\n]*setBlocks\(parseBlocks\(page\)\)/);
  assert.ok(!pages.includes('await api.entity(page.id)'));
  assert.ok(!pages.includes('const fresh=await api.entity(page.id)'));
});
