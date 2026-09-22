'use strict';
function seed(store) {
  if(store.db.prepare("SELECT key FROM settings WHERE key='seedV44'").get())return;
  // Declarações confirmadas no projeto; não são uma falsa importação do histórico do ChatGPT.
  for(const item of [
    {kind:'decision',title:'AVSORD — estrutura aprovada',area:'AVSORD',content:'AVSORD é um Estúdio de Criação e Tecnologia. AVSORD Studio reúne publicidade, motion design, 3D, audiovisual e direção visual. AVSORD Technology reúne Sofia, Anchor Track/Anchor Trackpad e futuros softwares funcionais. Labs foi descartado. Organização de marcas, não declaração de novas pessoas jurídicas.',pinned:true},
    {kind:'decision',title:'Enjoy The Void permanece independente',area:'Enjoy The Void',content:'Enjoy The Void permanece independente da AVSORD, como projeto artístico autoral.',pinned:true},
    {kind:'preference',title:'Condução do trabalho com a Sofia',area:'Sofia OS',content:'Continuar a execução após autorização, sem confirmações redundantes. Explicar detalhes técnicos quando solicitados. Entregar alterações de projeto em ZIP; comandos no chat são permitidos em texto, enquanto na voz usar Comando atual. Não afirmar ações, arquivos ou integrações sem resultado real.',pinned:true}
  ])store.saveNote(item);
  store.db.prepare("INSERT INTO settings VALUES ('seedV44','true')").run();
}
module.exports={seed};
