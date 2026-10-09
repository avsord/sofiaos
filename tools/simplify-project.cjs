'use strict';
const fs=require('node:fs');
const path=require('node:path');

function movePreserving(source,destination){
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  if(fs.existsSync(destination)) destination=destination+'.'+Date.now();
  fs.renameSync(source,destination);
}
function simplifyProject(root=path.resolve(__dirname,'..')){
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const archive=path.join(root,'docs','historico_bruto','testes_arquivados_local',stamp);
  const moved=[];
  const folder=path.join(root,'tests');
  if(fs.existsSync(folder)){
    for(const name of fs.readdirSync(folder)){
      if(!/^v\d+\.test\.cjs$/i.test(name))continue;
      const src=path.join(folder,name);if(!fs.statSync(src).isFile())continue;
      const dest=path.join(archive,name);movePreserving(src,dest);moved.push(path.join('tests',name));
    }
  }
  return {archive:moved.length?archive:null,moved};
}

if(require.main===module){
  try{
    const result=simplifyProject();
    if(!result.moved.length)console.log('Projeto ja esta organizado. Nenhuma documentacao foi removida.');
    else{
      console.log('Projeto organizado:',result.moved.length,'testes legados foram movidos para o historico interno.');
      console.log('Historico interno:',result.archive);
    }
    console.log('Documentacao bruta, memoria, .env, banco e arquivos de runtime nao foram alterados.');
  }catch(error){console.error('ERRO:',error.message);process.exitCode=1;}
}
module.exports={simplifyProject};
