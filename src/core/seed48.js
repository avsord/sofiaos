'use strict';
function seed48(store){
  if(store.db.prepare("SELECT key FROM settings WHERE key='seedV48'").get())return;
  store.tx(()=>{
    for(const note of [
      {kind:'decision',title:'Compromissos têm prioridade sobre sugestão de Diário',area:'Sofia OS',content:'Frases operacionais com data/horário, como aniversário, reunião, consulta ou dentista, devem ser interpretadas primeiro como compromissos. A presença de “hoje eu” sozinha não caracteriza Diário Pessoal. O Diário deve ser sugerido apenas diante de linguagem reflexiva/pessoal ou pedido explícito.',pinned:true},
      {kind:'decision',title:'Compromissos e lembretes alimentam a Agenda',area:'Sofia OS',content:'Compromissos e lembretes são registros distintos. Ambos aparecem na Agenda da página inicial. Local informado deve ser preservado. A sincronização com Google Calendar só será ativada quando a integração oficial estiver conectada.',pinned:true}
    ])store.saveNote(note);
    store.db.prepare("INSERT INTO settings VALUES('seedV48','true')").run();
  });
}
module.exports={seed48};
