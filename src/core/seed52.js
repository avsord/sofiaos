'use strict';
function seed52(store){
  if(store.db.prepare("SELECT key FROM settings WHERE key='seedV52'").get())return;
  store.tx(()=>{
    const old=store.db.prepare("SELECT * FROM notes WHERE title IN ('Compromisso por conversa alimenta Compromissos e mini agenda','Compromissos e lembretes alimentam a Agenda') AND state='active' ORDER BY rowid DESC LIMIT 1").get();
    if(old){
      store.saveNote({kind:old.kind,title:'Compromissos e lembretes alimentam a Agenda',content:'Compromissos e lembretes são registros distintos. Ambos aparecem na Agenda da página inicial. Datas e horários devem ser exibidos em formato humano; identificadores e detalhes técnicos ficam restritos ao modo desenvolvedor. A sincronização com Google Calendar continua preparada, mas só será ativada quando a integração oficial for conectada.',area:old.area,source_id:old.source_id,pinned:Boolean(old.pinned),revision:old.revision},old.id);
    }else{
      store.saveNote({kind:'decision',title:'Compromissos e lembretes alimentam a Agenda',area:'Sofia OS',content:'Compromissos e lembretes são registros distintos. Ambos aparecem na Agenda da página inicial. Datas e horários devem ser exibidos em formato humano; identificadores e detalhes técnicos ficam restritos ao modo desenvolvedor. A sincronização com Google Calendar continua preparada, mas só será ativada quando a integração oficial for conectada.',pinned:true});
    }
    store.saveNote({kind:'decision',title:'Tarefa, lembrete e compromisso são ações diferentes',area:'Sofia OS',content:'Tarefa é algo que precisa ser feito. Lembrete é um aviso para um momento. Compromisso é um evento ou encontro com data/horário. A Sofia deve oferecer essas ações separadamente quando houver ambiguidade, e o backend não deve fundi-las.',pinned:true});
    store.db.prepare("INSERT INTO settings VALUES('seedV52','true')").run();
  });
}
module.exports={seed52};
