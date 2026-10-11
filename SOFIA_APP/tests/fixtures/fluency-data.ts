/** Synthetic QA-only input. Imported solely by the separately built seed APK. */
export function fluencyData(multiplier=1,now=Date.now()){
 const n=Math.max(1,Math.min(3,Math.floor(multiplier))),at=now,date=new Date(now),iso=new Date(now).toISOString();
 const profile={name:'Teste R7',email:'r7-heavy@example.test',role:'owner' as const};
 const kinds=['project','book','film','asset','document','course'];
 const make=(id:string,kind:string,title:string)=>({id,kind,title,content:'Registro sintético R7',area:'QA',state:'active',privacy:'private',tags:[] as string[],revision:1,updated_at:iso,data:{} as Record<string,any>});
 const pages=Array.from({length:600*n},(_,i)=>{
  const row=make('r7p'+i,'user_page','Página QA '+String(i).padStart(4,'0'));
  // 3/4 root rows, 1/6 children, 1/12 grandchildren. Maximum depth three.
  const parent=i%12===11?'r7p'+(i-1):i%12>=9?'r7p'+(i-i%12):'';
  row.data={parent_id:parent,icon:'📄',blocks_json:JSON.stringify(Array.from({length:20},(_,j)=>({id:'b'+j,type:'text',text:'Bloco de teste '+j+' página '+i}))),sort_order:i};return row;
 });
 const entities=Array.from({length:1500*n},(_,i)=>make('r7e'+i,kinds[i%kinds.length],'Registro QA '+i));
 const tasks=Array.from({length:300*n},(_,i)=>({id:'r7t'+i,title:'Tarefa QA '+i,state:'todo',revision:1,area:'QA',priority_level:'none'}));
 const conversations=Array.from({length:30*n},(_,i)=>({id:'r7c'+i,title:'Conversa QA '+i,channel:'mobile',state:'active',message_count:300,created_at:iso,updated_at:iso}));
 const messages=conversations.map((c,index)=>Array.from({length:300},(_,i)=>({id:'r7m'+index+'_'+i,conversation_id:c.id,sequence:i+1,role:i%2?'assistant':'user',content:'Mensagem sintética '+i+' da conversa '+index,created_at:iso,status:'sent'})));
 const catalog={catalog:Object.fromEntries([...kinds,'user_page','commitment'].map(kind=>[kind,{label:kind,group:kind==='user_page'?'knowledge':kind==='commitment'?'flow':'library',states:['active','saved','archived'],fields:[]} ])),areas:['QA']};
 const home={tasks,today_tasks:tasks.slice(0,12),notifications:[],profile};
 const entries:[string,{at:number;value:any}][]=[];
 const add=(route:string,value:any)=>entries.push([route,{at,value}]);
 add('/home',home);add('/tasks',{items:tasks});add('/workspace/catalog',catalog);add('/md/dashboard',{widgets:[]});
 add('/workspace/entities?limit=100&kind=user_page&q=&offset=0',{items:pages});
 add('/workspace/entities?limit=100&group=library&q=&offset=0',{items:entities});
 add('/workspace/entities?group=library&limit=100&offset=0',{items:entities});
 for(const kind of kinds)add('/workspace/entities?limit=100&kind='+kind+'&q=&offset=0',{items:entities.filter(e=>e.kind===kind)});
 add('/conversations?offset=0',{items:conversations});
 conversations.forEach((c,i)=>add('/conversations/'+c.id,{conversation:c,messages:messages[i],has_more:false}));
 const chat={conversation:conversations[0],messages:messages[0],has_more:false,deleted_ids:[],current_id:conversations[0].id,cursor_revision:1};
 add('/chat-sync/current',chat);
 const months:string[]=[];let eventsCount=0;
 for(let m=0;m<12;m++){
  const first=new Date(date.getFullYear(),date.getMonth()-m,1,12),key=first.getFullYear()+'-'+String(first.getMonth()+1).padStart(2,'0');months.push(key);
  const events=Array.from({length:50*n},(_,i)=>{const start=new Date(first);start.setDate(i%27+1);start.setHours(10+i%7);const row=make('r7a'+m+'_'+i,'commitment','Compromisso QA '+m+' '+i);row.state='confirmed';row.data={start_at:start.toISOString(),end_at:new Date(start.getTime()+1800000).toISOString()};return row;});
  add('/agenda?month='+key,{items:events});eventsCount+=events.length;
 }
 const projection=entries.filter(([route])=>['/home','/tasks','/workspace/catalog','/md/dashboard','/agenda?month='+months[0],'/chat-sync/current'].includes(route)).map(([route,e])=>[route,route==='/chat-sync/current'?{at,value:{...chat,messages:messages[0].slice(-10),has_more:true}}:e]);
 const auth={token:'qa_r7_'+'x'.repeat(37),token_type:'Bearer',expires_at:'2050-01-01T00:00:00Z',profile};
 // Token is syntactically valid only; offline transport is mandatory for the benchmark.
 if(auth.token.length!==43)throw Error('QA token syntax');
 const raw=JSON.stringify({schema:1,entries}),launch=JSON.stringify({schema:1,entries:projection});
 return {auth,raw,launch,scope:'https://sofiaos.up.railway.app|'+profile.email+'|startup-v1',counts:{pages:pages.length,entities:entities.length,conversations:conversations.length,messages:messages.flat().length,events:eventsCount,tasks:tasks.length,months:12,blocks:pages.length*20},rawChars:raw.length};
}
