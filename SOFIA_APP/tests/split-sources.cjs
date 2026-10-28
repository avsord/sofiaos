'use strict';
// 0.3.263: telas grandes divididas em partes (ex.: Financas em src/screens/finance/*). Os testes que leem o TEXTO de
// src/screens/Finance.tsx continuam vendo a tela inteira: a leitura devolve as partes juntas, na ordem original.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const SPLIT={[path.join(root,'src/screens/Finance.tsx')]:['src/screens/finance/core.tsx','src/screens/Finance.tsx','src/screens/finance/Setup.tsx','src/screens/finance/Home.tsx','src/screens/finance/Transactions.tsx','src/screens/finance/Plan.tsx','src/screens/finance/Goal.tsx','src/screens/finance/Reports.tsx','src/screens/finance/Manage.tsx'],
  [path.join(root,'src/screens/Workspace.tsx')]:['src/screens/workspace/core.tsx','src/screens/workspace/EntityEditor.tsx','src/screens/workspace/Tasks.tsx','src/screens/Workspace.tsx'],
  [path.join(root,'src/screens/Monitoring.tsx')]:['src/screens/monitoring/core.tsx','src/screens/Monitoring.tsx','src/screens/monitoring/Add.tsx','src/screens/monitoring/Detail.tsx','src/screens/monitoring/Stores.tsx']};
const original=fs.readFileSync;
fs.readFileSync=function(file,...rest){
  const full=typeof file==='string'?path.resolve(file):null;
  if(full&&SPLIT[full]&&rest.length){return SPLIT[full].map(rel=>original.call(fs,path.join(root,rel),...rest)).join('\n');}
  return original.call(fs,file,...rest);
};
