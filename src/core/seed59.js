'use strict';
const {normalize}=require('./util');
function seed59(store,workspace){
  if(store.db.prepare("SELECT key FROM settings WHERE key='seedV59'").get())return;
  store.tx(()=>{
    for(const note of [
      {kind:'decision',title:'Espaços raiz e páginas internas são estruturas diferentes',area:'Sofia OS',content:'Seus Espaços contém apenas espaços raiz criados pelo usuário. Páginas e subpáginas ficam hierarquicamente dentro de um espaço ou de outra página. Quando o usuário disser “página X dentro de Y”, a Sofia deve registrar o vínculo com Y e nunca criar X como outro espaço raiz.',pinned:true},
      {kind:'decision',title:'Chat visual persiste durante a navegação interna',area:'Sofia OS',content:'Trocar entre Início, Resumo, Agenda, Biblioteca, Espaços ou outros menus internos não limpa a conversa visual da sessão. O Chat só começa limpo em um reload/nova visita ou quando a pessoa aperta explicitamente Chat para iniciar uma nova sessão visual.',pinned:true},
      {kind:'decision',title:'Páginas personalizadas usam editor em blocos',area:'Sofia OS',content:'Páginas personalizadas usam um editor em blocos inspirado no Notion, com texto, títulos, listas, checklist, citação, divisor, criação por barra ou botão, reordenação e salvamento automático local. Espaços e páginas aparecem em árvore na barra lateral.',pinned:true},
      {kind:'decision',title:'Início usa um único scroll estrutural',area:'Sofia OS',content:'A aplicação desktop não deve produzir rolagem externa do body junto da rolagem principal da página. A shell ocupa o viewport e o conteúdo da aba controla a rolagem, evitando duas barras verticais externas lado a lado.',pinned:true}
    ])store.saveNote(note);

    // Repara apenas o caso legado seguro da v58: uma página foi criada como raiz,
    // mas a própria mensagem de origem dizia explicitamente que ela deveria ficar
    // dentro de outro user_page já existente.
    const pages=workspace.list({kind:'user_page',limit:500}).filter(p=>p.state==='active');
    for(const page of pages){
      if(page.data?.parent_id||!page.source_id)continue;
      let message;try{message=store.message(page.source_id);}catch{continue;}
      const source=normalize(message.content||'');
      if(!source.includes('pagina')&&!source.includes('subpagina'))continue;
      const candidates=pages.filter(parent=>parent.id!==page.id&&!parent.data?.parent_id);
      const parent=candidates.find(candidate=>{
        const name=normalize(candidate.title);
        return source.includes('dentro de '+name)||source.includes('dentro do '+name)||source.includes('dentro da '+name);
      });
      if(!parent)continue;
      workspace.save({...page,revision:page.revision,data:{...page.data,parent_id:parent.id,node_type:'page',blocks_json:page.data?.blocks_json||'[]'}},page.id);
    }
    store.db.prepare("INSERT INTO settings VALUES('seedV59','true')").run();
  });
}
module.exports={seed59};
