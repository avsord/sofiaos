'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function edit(p,fn){const f=path.join(root,p),old=fs.readFileSync(f,'utf8'),next=fn(old);if(next!==old)fs.writeFileSync(f,next);}
// Same task priority vocabulary as the server, not an unrelated numeric scale.
edit('src/lib/types.ts',s=>s.replace('priority?: number; area?: string','priority?: number; priority_level?: string; area?: string'));
edit('src/screens/Workspace.tsx',s=>s.replace("priority:2,area:'Pessoal'","priority_level:'medium',area:'Pessoal'").replace("String(editing.priority??2)","String(editing.priority_level||'none')").replace('({...t,priority:Number(v)})','({...t,priority_level:v})').replace("[{value:'1',label:'Alta'},{value:'2',label:'Normal'},{value:'3',label:'Baixa'}]","[{value:'none',label:'Sem prioridade'},{value:'important',label:'Importante'},{value:'medium',label:'Média'},{value:'light',label:'Leve'}]"));
edit('src/lib/api.ts',s=>s.replace("if (!response.ok) { if (response.status", "if (!response.ok && path === '/auth/login' && (response.status === 404 || response.status === 405 || data.code === 'AUTH_REQUIRED')) throw new ApiError('O servidor ainda precisa receber a API móvel da Sofia. Não é um erro da sua senha.', 'MOBILE_API_NOT_PUBLISHED', response.status);\n      if (!response.ok) { if (response.status"));
edit('src/screens/Profile.tsx',s=>s.replace('Sofia App 0.2 ·','Sofia App 0.2.1 ·'));
for(const name of ['package.json','package-lock.json'])edit(name,s=>{const p=JSON.parse(s);p.version='0.2.1';if(p.packages?.[''])p.packages[''].version='0.2.1';return JSON.stringify(p,null,2)+'\n';});
edit('app.json',s=>{const p=JSON.parse(s);p.expo.version='0.2.1';p.expo.android.versionCode=3;return JSON.stringify(p,null,2)+'\n';});
const ui=fs.readFileSync(path.join(root,'src/screens/Workspace.tsx'),'utf8');if(!ui.includes('editing.priority_level')||ui.includes('priority:Number(v)'))throw new Error('Task priority mapping did not apply.');
