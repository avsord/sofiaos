'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const store=fs.readFileSync(path.join(root,'src','memory','store.js'),'utf8');
const cfg=fs.readFileSync(path.join(root,'src','config','sofia.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const pkg=require(path.join(root,'package.json'));

test('v100: Resumo possui bloco Tarefas com tarefas ativas',()=>{
  assert.match(app,/tasks:\{title:'Tarefas',description:'Tarefas ativas e próximas ações\.'\}/);
  assert.match(app,/if\(key==='tasks'\)\{const tasks=\(\(await api\('\/api\/tasks'\)\)\.items\|\|\[\]\)\.filter\(x=>!\['done','cancelled'\]\.includes\(x\.state\)\)\.slice\(0,6\)/);
  assert.match(app,/record:x,task:true,open:\(\)=>editTask\(x\)/);
});

test('v100: mudanças de tarefa atualizam Prioridades, Tarefas e Notificações',()=>{
  assert.match(app,/if\(touchesTasks\)keys\.push\('priorities','tasks'\)/);
  assert.match(app,/if\(kind==='task'\)return refreshHomeWidgets\(\['priorities','tasks','notifications'\]\)/);
});

test('v100: instalações existentes recebem Tarefas uma vez e podem ocultar depois',()=>{
  assert.match(store,/homeWidgets: \['priorities','tasks','commitments','notifications','study'\]/);
  assert.match(store,/homeTasksWidgetV100Added/);
  assert.match(store,/!widgets\.includes\('tasks'\)/);
});

test('v100: identidade e cache estão alinhados',()=>{
  assert.match(cfg,/VERSION = '103\.0\.0'/);
  assert.match(html,/Sofia OS · v103/);
  assert.match(html,/style\.css\?v=103/);
  assert.match(html,/app\.js\?v=103/);
  assert.match(html,/Core v103 · AVSORD Technology/);
  assert.equal(pkg.version,'1.53.0');
});
