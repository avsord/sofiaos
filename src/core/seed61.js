'use strict';
function seed61(store){
  if(store.db.prepare("SELECT key FROM settings WHERE key='seedV61'").get())return;
  store.saveNote({kind:'decision',title:'IA como autoridade semântica global',area:'Sofia OS',content:'Em toda a Sofia, a IA interpreta significado, intenção, continuidade, referências, ambiguidade, capacidade, alvo e sensibilidade antes do backend. O backend não classifica linguagem natural nem substitui a intenção por palavras-chave; apenas aplica barreiras de segurança, valida schema/IDs/datas/permissões/integridade, exige confirmações de segurança, persiste e executa o plano autorizado. Botões e respostas a estados pendentes também retornam à IA antes da execução.',pinned:true});
  store.db.prepare("INSERT INTO settings VALUES ('seedV61','true')").run();
}
module.exports={seed61};
