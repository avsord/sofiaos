'use strict';
function seed45(store,w){if(store.db.prepare("SELECT key FROM settings WHERE key='seedV45'").get())return;
 store.tx(()=>{
 for(const note of [
  {kind:'decision',title:'Panorama e Fluxo Ativo',area:'Sofia OS',content:'Panorama é a Home. Fluxo Ativo reúne intenções, projetos, sonhos, tarefas, compromissos, rotinas, compras, monitoramentos e acompanhamentos. A Fazer é uma visão interna. Memória, Estudos e Acervo preservam conhecimento ligado a esses fluxos.',pinned:true},
  {kind:'rule',title:'Comprar, monitorar e Black Friday',area:'Pessoal',content:'Comprar é uma lista. Monitoramento é uma capacidade ligada ao item. Black Friday é uma ocasião/filtro, não uma cópia de cada produto. Comparar a mesma variante e distinguir preço total, frete e condições.'},
  {kind:'rule',title:'Rotas de privacidade',area:'Sofia OS',content:'Informação pessoal/de terceiros, finanças, meditações e localização real ou inferível vai para privado. Credenciais não entram no chat. Conteúdo compartilhado não leva histórico privado. Seleção manual só pode aumentar proteção; nenhuma classificação automática é infalível.'},
  {kind:'rule',title:'Continuidade e cursos',area:'Estudos',content:'Uma única Sofia, com modos de ensino. Cada curso mantém sessões, progresso informado, dificuldades e checkpoint. Não inventar nível ou frequência de voz a partir de texto.'},
  {kind:'rule',title:'Tarefas e notificações',area:'Sofia OS',content:'Prioridade é uma marca, não tarefa duplicada nem cobrança constante. Não cumprido não vai automaticamente para amanhã. Resumos são sob demanda, salvo rotinas explicitamente ativadas. A integração Google Calendar segue pendente.'}
 ])store.saveNote(note);
 for(const [title,goal,state] of [
  ['Inglês','Conversação, vocabulário e correções no nível informado. Não há teste de nível realizado.','interest'],
  ['Oratória','Clareza e organização da fala; métricas acústicas dependem de áudio e análise real.','interest'],
  ['Desenvolvimento pessoal','Reflexão e aprendizagem. Distinguir tradição simbólica e evidência; não é tratamento.','interest'],
  ['Arquitetura de Sistemas de IA e Gestão de Conhecimento','Aprender conceitos pelos problemas reais da Sofia. Curso colocado na geladeira pelo usuário.','paused']
 ])w.save({kind:'course',title,area:'Estudos',state,tags:['Cursos da Sofia'],data:{mode:'sofia',goals:goal,next_step:'Definir a primeira sessão quando solicitado.'}});
 store.db.prepare("INSERT INTO settings VALUES('seedV45','true')").run();
 });
}
module.exports={seed45};
