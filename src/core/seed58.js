'use strict';
function seed58(store){
  if(store.db.prepare("SELECT key FROM settings WHERE key='seedV58'").get())return;
  store.tx(()=>{
    for(const note of [
      {kind:'decision',title:'Base fixa da Sofia e espaços opcionais do usuário',area:'Sofia OS',content:'A interface pública abre sempre com os menus padrão da Sofia. A seção Seus Espaços começa vazia numa instalação nova e só recebe espaços criados explicitamente pela pessoa ou confirmados por ela. Atualizações preservam espaços já existentes; não criar espaços personalizados de exemplo automaticamente.',pinned:true},
      {kind:'decision',title:'Chat visual é uma sessão; memória permanece separada',area:'Sofia OS',content:'Ao atualizar a página ou abrir a Sofia em uma nova visita, a área visual do Chat começa limpa. Isso não apaga memória, tarefas, registros nem conhecimento persistente. O histórico técnico continua disponível no modo desenvolvedor para auditoria; a experiência pública não restaura automaticamente mensagens antigas.',pinned:true},
      {kind:'decision',title:'Início e Resumo são pontos da mesma página',area:'Sofia OS',content:'Início e Resumo pertencem à mesma tela. Ao clicar entre eles, a página deve percorrer a distância com animação contínua e suave, sem salto instantâneo. A seleção do menu acompanha a posição real da rolagem.',pinned:true}
    ])store.saveNote(note);
    store.db.prepare("INSERT INTO settings VALUES('seedV58','true')").run();
  });
}
module.exports={seed58};
