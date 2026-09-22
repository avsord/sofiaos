'use strict';
function seed47(store){if(store.db.prepare("SELECT key FROM settings WHERE key='seedV47'").get())return;
 store.tx(()=>{
  for(const note of [
   {kind:'decision',title:'Safe Chat é modo do chat',area:'Sofia OS',content:'Safe Chat fica como botão de modo junto ao campo de conversa. Ele não envia automaticamente conteúdo para Diário Pessoal. As mensagens do Safe Chat são armazenadas de forma criptografada e usam somente o Filtro Privado quando chamam IA.',pinned:true},
   {kind:'decision',title:'Diário Pessoal é protegido por padrão',area:'Sofia OS',content:'Diário Pessoal é um espaço protegido e criptografado. No chat normal, a Sofia pode perceber que uma fala parece pertencer ao diário e perguntar antes de guardar. Uma sugestão não salva automaticamente.',pinned:true},
   {kind:'decision',title:'Filtros invisíveis no uso normal',area:'Sofia OS',content:'O usuário comum não gerencia filtros a cada mensagem. O roteamento automático permanece nos bastidores. Filtro Compartilhado usa conteúdo geral/autorizado; Filtro Privado usa conteúdo pessoal, sensível ou incerto. Labels e histórico técnico continuam disponíveis na visão de desenvolvimento.',pinned:true},
   {kind:'decision',title:'Chave anterior atribuída ao compartilhado',area:'Sofia OS',content:'Na instalação local de Pedro, a chave OPENAI_API_KEY existente corresponde ao projeto já usado como compartilhado/cortesia. A v47 migra essa chave para o Filtro Compartilhado por padrão. O Filtro Privado continua exigindo chave e orçamento próprios; não há fallback silencioso.',pinned:true}
  ])store.saveNote(note);
  store.db.prepare("INSERT INTO settings VALUES('seedV47','true')").run();
 });
}
module.exports={seed47};
