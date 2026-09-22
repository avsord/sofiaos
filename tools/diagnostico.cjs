'use strict';
const fs=require('node:fs');const path=require('node:path');const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),req=createRequire(path.join(root,'package.json'));
const {VERSION}=require('../src/config/sofia');
console.log('SOFIA OS v'+VERSION.split('.')[0]+' | DIAGNOSTICO LOCAL SEM SEGREDOS');
console.log('Pasta:',root);console.log('Node:',process.version);
for(const name of ['src/server.js','src/config/sofia.js','src/core/sofia-core.js','public/index.html','.env'])console.log(name+': '+(fs.existsSync(path.join(root,name))?'presente':'ausente'));
for(const name of ['express','dotenv']){try{const v=req(name+'/package.json').version;console.log(name+': '+v);}catch{console.log(name+': nao encontrado — dependencias do projeto precisam estar instaladas.');}}
try{require('node:sqlite');console.log('SQLite nativo: disponivel');}catch{console.log('SQLite nativo: indisponivel — use Node 22.16+ ou a versao 24 ja instalada.');}
console.log('Nenhuma chave foi lida da area de transferencia. Nenhuma chamada a OpenAI ou Meta foi feita.');
