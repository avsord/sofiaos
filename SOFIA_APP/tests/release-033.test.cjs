const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const recur=load('src/lib/agenda-recurrence.ts');
const event=(start,repeat='none',extra={})=>({id:'e',kind:'commitment',title:'Evento',state:'planned',revision:1,tags:recur.agendaTags(['Trabalho'],repeat,'America/Sao_Paulo'),data:{start_at:start,...extra}});
const starts=(e,a,b)=>Array.from(recur.occurrences(e,new Date(a),new Date(b)),x=>x.data.start_at);
test('weekly series preserves the anchor time and does not create occurrences before its start',()=>{assert.deepEqual(starts(event('2026-10-05T12:00:00Z','weekly'),'2026-10-01','2026-11-01'),['2026-10-05T12:00:00.000Z','2026-10-12T12:00:00.000Z','2026-10-19T12:00:00.000Z','2026-10-26T12:00:00.000Z']);});
test('monthly day 31 skips months without that day; yearly leap day skips non-leap years',()=>{assert.deepEqual(starts(event('2026-01-31T12:00:00Z','monthly'),'2026-02-01','2026-05-01'),['2026-03-31T12:00:00.000Z']);assert.deepEqual(starts(event('2024-02-29T12:00:00Z','yearly'),'2025-01-01','2029-01-01'),['2028-02-29T12:00:00.000Z']);});
test('recurrence preserves local wall time across daylight saving changes and duration',()=>{const e=event('2026-03-01T14:00:00Z','weekly',{end_at:'2026-03-01T15:00:00Z'});e.tags=recur.agendaTags([], 'weekly','America/New_York');const rows=recur.occurrences(e,new Date('2026-03-08'),new Date('2026-03-09'));assert.equal(rows[0].data.start_at,'2026-03-08T13:00:00.000Z');assert.equal(rows[0].data.end_at,'2026-03-08T14:00:00.000Z');assert.equal(e.data.start_at,'2026-03-01T14:00:00Z');});
test('canceled and done series stop; recurrence metadata round trips without removing user tags',()=>{const e=event('2026-10-05T12:00:00Z','weekly');assert.equal(recur.readRepeat(e).frequency,'weekly');assert.deepEqual(Array.from(recur.agendaTags(e.tags,'monthly','America/Sao_Paulo',false)),['Trabalho','sofia-repeat-v1:monthly:America/Sao_Paulo','sofia-notify-v1:off']);for(const state of ['cancelled','done'])assert.equal(starts({...e,state},'2026-10-01','2026-11-01').length,0);});
const effects=[];const {useAgendaView}=load('src/lib/agenda-view.ts',{'react':{useReducer:()=>[0,()=>{}],useLayoutEffect:f=>effects.push(f)},'./dashboard':load('src/lib/dashboard.ts')});
test('leaving either calendar resets month year day before reentry, without reapplying stale target',()=>{for(const key of ['home','agenda']){const owner={},v=useAgendaView(owner,key);v.acceptTarget('2030-02-09',1);v.setMonth(new Date(2030,1,1));useAgendaView(owner,key,false);effects.splice(0).forEach(f=>f());const now=new Date(),back=useAgendaView(owner,key,true);assert.equal(back.month.getFullYear(),now.getFullYear());assert.equal(back.month.getMonth(),now.getMonth());assert.equal(back.selected,load('src/lib/dashboard.ts').localDateKey(now));assert.equal(back.acceptTarget('2030-02-09',1),false);}});
const {notificationPlan}=load('src/lib/agenda-notifications.ts',{'react':{},'react-native':{},'./notification-scheduler':load('src/lib/notification-scheduler.ts'),'expo-notifications':{setNotificationHandler:()=>{}},'./agenda-recurrence':recur,'./agenda-events':{},'./dashboard':load('src/lib/dashboard.ts')});
test('notification plan uses offsets, future instances, opt-out, and stable identities',()=>{const now=new Date('2026-10-04T12:00:00Z'),first=event('2026-10-05T12:00:00Z','none',{remind_minutes:30});let rows=notificationPlan([first],now);assert.equal(rows.length,1);assert.equal(rows[0].date.toISOString(),'2026-10-05T11:30:00.000Z');assert.equal(rows[0].day,'2026-10-05');assert.equal(notificationPlan([{...first,tags:['sofia-notify-v1:off']}],now).length,0);assert.equal(notificationPlan([first],new Date('2026-10-06')).length,0);assert.equal(notificationPlan([first],now)[0].id,rows[0].id);assert.ok(notificationPlan([event('2026-10-05T12:00:00Z','weekly')],now).length>100);});

const {ChatScrollIntent}=load('src/lib/chat-scroll.ts',{'react':{},'react-native':{}});
test('chat keeps following large reply growth and keyboard resize, pauses only for deliberate upward scroll',()=>{const s=new ChatScrollIntent();s.position(900,2400,500);assert.equal(s.following,true);s.position(900,2400,250);assert.equal(s.following,true);s.begin();s.position(700,2400,500);s.end();assert.equal(s.following,false);s.position(700,2800,500);assert.equal(s.following,false);s.follow();s.position(700,3200,500);assert.equal(s.following,true);s.begin();s.position(2700,3200,500);s.end();assert.equal(s.following,true);s.pause();s.position(0,4000,500);assert.equal(s.following,false);});

test('chat end offset follows the measured viewport when the keyboard shrinks it without new content',()=>{const s=new ChatScrollIntent();s.position(2600,4000,1400);assert.equal(s.endOffset,2600);s.viewportHeight=700;assert.equal(s.endOffset,3300);s.position(2600,4000,700);assert.equal(s.following,true);assert.equal(s.endOffset,3300);s.begin();s.position(2000,4000,700);s.end();assert.equal(s.following,false);s.follow();s.contentHeight=4600;assert.equal(s.endOffset,3900);});

test('native keyboard resize and automatic momentum keep the latest reply visible; real drag still pauses',()=>{
 const frames=new Map(),commands=[];let seq=0;const flush=()=>{for(let round=0;frames.size&&round<6;round++){const pending=[...frames.values()];frames.clear();pending.forEach(f=>f());}};
 const {useChatAutoscroll}=load('src/lib/chat-scroll.ts',{'react':{useRef:x=>({current:x}),useLayoutEffect:f=>f(),useEffect:f=>f()},'react-native':{Keyboard:{addListener:()=>({remove(){}})}}},{requestAnimationFrame:f=>{frames.set(++seq,f);return seq;},cancelAnimationFrame:id=>frames.delete(id)});
 const h=useChatAutoscroll({current:{scrollToOffset:o=>commands.push(o.offset),scrollToEnd:()=>{}}},true);h.onContentSizeChange(400,4000);h.onLayout({nativeEvent:{layout:{height:1400}}});flush();assert.equal(commands.at(-1),2600);
 h.onLayout({nativeEvent:{layout:{height:700}}});h.onMomentumScrollBegin();h.onScroll({nativeEvent:{contentOffset:{y:2600},contentSize:{height:4000},layoutMeasurement:{height:700}}});flush();assert.equal(commands.at(-1),3300);
 h.onScrollBeginDrag();const up={nativeEvent:{contentOffset:{y:2000},contentSize:{height:4000},layoutMeasurement:{height:700}}};h.onScroll(up);h.onScrollEndDrag(up);h.onMomentumScrollBegin();h.onMomentumScrollEnd(up);const count=commands.length;h.onContentSizeChange(400,5000);flush();assert.equal(commands.length,count);h.follow();flush();assert.equal(commands.at(-1),4300);
});

const {WorkspaceRecords}=load('src/lib/workspace-records.ts',{'react':{},'./chat-model':{errorText:e=>e.message}});
test('module rows and confirmed empty state stay mounted during a slow refresh and reentry',async()=>{
 const cache=new WorkspaceRecords(),pending=[],api={entities:()=>new Promise(resolve=>pending.push(resolve))};
 assert.equal(cache.view('book','').loaded,false);const first=cache.load(api,'book','',()=>{});assert.equal(cache.view('book','').loaded,false);pending.shift()({items:[{id:'book1',title:'Livro'}]});await first;
 const refresh=cache.load(api,'book','',()=>{});assert.equal(cache.view('book','').items[0].id,'book1');assert.equal(cache.view('book','').loaded,true);assert.equal(cache.view('course','').loaded,false);assert.equal(cache.view('book','').items.length,1);pending.shift()({items:[]});await refresh;
 const emptyRefresh=cache.load(api,'book','',()=>{});assert.equal(cache.view('book','').loaded,true);assert.equal(cache.view('book','').items.length,0);pending.shift()({items:[]});await emptyRefresh;
});
test('late module responses cannot replace another category or a newer request',async()=>{
 const cache=new WorkspaceRecords(),pending=[],api={entities:kind=>new Promise(resolve=>pending.push({kind,resolve}))};const old=cache.load(api,'book','',()=>{}),other=cache.load(api,'course','',()=>{}),fresh=cache.load(api,'book','',()=>{});
 pending[2].resolve({items:[{id:'new'}]});await fresh;pending[1].resolve({items:[{id:'course1'}]});await other;pending[0].resolve({items:[{id:'stale'}]});await old;assert.equal(cache.view('book','').items[0].id,'new');assert.equal(cache.view('course','').items[0].id,'course1');assert.equal(cache.view('book','query').loaded,false);
});

test('Library Tudo requests the complete library group, with search and pagination, independently of type filters',async()=>{
 const cache=new WorkspaceRecords(),calls=[],api={library:async(q,offset)=>{calls.push(['library',q,offset]);return {items:offset?[{id:'last',kind:'recipe'}]:Array.from({length:100},(_,i)=>({id:'item'+i,kind:i%2?'music':'reading'}))};},entities:async(kind,q,offset)=>{calls.push([kind,q,offset]);return {items:[{id:'only',kind}]};}};
 await cache.load(api,'@library','',()=>{});assert.equal(cache.view('@library','').items.length,100);assert.equal(cache.view('@library','').hasMore,true);await cache.load(api,'@library','',()=>{},true);assert.equal(cache.view('@library','').items.length,101);assert.equal(cache.view('@library','').hasMore,false);assert.equal(calls[1][2],100);
 await cache.load(api,'reading','',()=>{});assert.equal(cache.view('reading','').items.length,1);assert.equal(cache.view('@library','').items.length,101);await cache.load(api,'@library','ref',()=>{});assert.deepEqual(calls.at(-1),['library','ref',0]);
});

const films=load('src/lib/library-filters.ts');
test('five-star rating round trips in the same saved film without losing tags or review',()=>{const film={id:'f',kind:'film',tags:['Cinema','sofia-film-rating-v1:2'],data:{raw_review:'Minha opinião',genre:'Ação, Drama'}};assert.equal(films.libraryRating(film),2);const tags=films.libraryTags(film.tags,5);assert.deepEqual(Array.from(tags),['Cinema','sofia-library-rating-v1:5']);assert.equal(films.libraryRating({...film,tags}),5);assert.deepEqual(Array.from(films.libraryTags(tags,0)),['Cinema']);assert.equal(film.data.raw_review,'Minha opinião');assert.throws(()=>films.libraryTags([],6));});
test('film star and genre filters combine, support unrated and normalize accents and multiple genres',()=>{const rows=[{id:'a',kind:'film',tags:['sofia-film-rating-v1:5'],data:{genre:'Ação; Drama'}},{id:'b',kind:'film',tags:['sofia-film-rating-v1:3'],data:{genre:'drama'}},{id:'c',kind:'film',tags:[],data:{genre:'Comédia'}}];const ids=(stars,genre)=>Array.from(films.filterLibrary(rows,stars,genre),x=>x.id);assert.deepEqual(ids('all',''),['a','b','c']);assert.deepEqual(ids('5','acao'),['a']);assert.deepEqual(ids('3','drama'),['b']);assert.deepEqual(ids('0','comedia'),['c']);assert.equal(films.facetOptions(rows).length,3);});
test('film filters receive later pages before the category is marked loaded',async()=>{const cache=new WorkspaceRecords(),offsets=[],api={entities:async(kind,q,offset)=>{offsets.push(offset);return {items:offset?[{id:'late',kind:'film',tags:['sofia-film-rating-v1:5'],data:{genre:'Terror'}}]:Array.from({length:100},(_,i)=>({id:'f'+i,kind:'film',tags:[],data:{genre:'Drama'}}))};}};await cache.load(api,'film','',()=>{});const entry=cache.view('film','');assert.deepEqual(offsets,[0,100]);assert.equal(entry.items.length,101);assert.equal(entry.hasMore,false);assert.equal(films.filterLibrary(entry.items,'5','terror')[0].id,'late');});

test('library ratings and category language adapt to books, music, recipes, sources and files',()=>{
 for(const kind of ['reading','music','recipe','video','recipe_session','source','asset','file']){const p=films.libraryPresentation(kind);assert.ok(p.rating&&p.filter&&p.empty);const tags=films.libraryTags(['Pessoal'],4,p.key?'':'Categoria de teste');const record={kind,tags,data:p.key?{[p.key]:kind==='file'?'drive':'Drama'}:{}};assert.equal(films.libraryRating(record),4);assert.equal(films.libraryFacets(record).length,1);assert.equal(films.filterLibrary([record],'4',films.libraryFacets(record)[0]).length,1);assert.deepEqual(Array.from(films.libraryTags(tags,0)),['Pessoal']);}
 assert.equal(films.libraryPresentation('reading').facet,'Gênero literário');assert.equal(films.libraryPresentation('music').facet,'Gênero musical');assert.equal(films.libraryPresentation('recipe').facet,'Tipo de receita');
});

const areas=load('src/lib/library-areas.ts',{'./library-filters':films});
test('custom areas suggest editable filters and preserve field identity when renamed',()=>{
 assert.deepEqual(Array.from(areas.suggestedFields('Artistas de fotografia')),['Estilo','Técnica','País']);assert.deepEqual(Array.from(areas.suggestedFields('Pintores preferidos')),['Estilo','Técnica','País']);
 const payload=areas.areaPayload('Fotógrafos','Minhas referências',[{id:'style',label:'Estilo'},{id:'country',label:'País'}]);const record={id:'area1',revision:1,...payload};assert.equal(record.kind,'asset');assert.equal(record.privacy,'private');const read=areas.readArea(record);assert.equal(read.fields[0].id,'style');const renamed=areas.areaPayload('Artistas visuais',record.content,[{id:'style',label:'Movimento'}],record);assert.equal(renamed.id,'area1');assert.equal(areas.readArea(renamed).fields[0].id,'style');assert.throws(()=>areas.areaPayload('Area','',[{id:'a',label:'País'},{id:'b',label:'pais'}]));
});
test('custom record filters derive from saved values, combine stars and fields and isolate areas',()=>{
 const area=areas.readArea({id:'area1',revision:1,...areas.areaPayload('Fotografia','',[{id:'style',label:'Estilo'},{id:'country',label:'País'}])});
 const a={id:'a',revision:1,...areas.customPayload(area,{},'Ana','Referência','https://example.com',5,{style:'Retrato, Documental',country:'Brasil'})};
 const b={id:'b',revision:1,...areas.customPayload(area,{},'Bia','','',3,{style:'documental',country:'França'})};
 const other={...a,id:'other',tags:[areas.MEMBER_TAG+'area2','sofia-library-rating-v1:5']};const all=[a,b,other];
 assert.equal(areas.memberArea(a),'area1');assert.equal(areas.customFacets([a,b],area.fields)[0].options.length,2);assert.equal(areas.customFacets([a,b],area.fields)[1].options.length,2);
 assert.deepEqual(Array.from(areas.filterCustom(all,'area1','5',{style:'documental',country:'brasil'}),r=>r.id),['a']);assert.equal(areas.filterCustom(all,'area1','3',{country:'brasil'}).length,0);assert.equal(areas.filterCustom(all,'area1','all',{},'franca')[0].id,'b');
 const saved=areas.customPayload(area,{...a,tags:[...a.tags,'Favoritos']},'Ana nova','Descrição','','4'*1,{...areas.customValues(a),country:'Portugal'});assert.equal(saved.id,'a');assert.ok(saved.tags.includes('Favoritos'));assert.equal(films.libraryRating(saved),4);assert.equal(areas.customValues(saved).style,'Retrato, Documental');assert.throws(()=>areas.customPayload(area,{},'A','','javascript:alert(1)',5,{}));
});
test('optimistic record updates cannot be replaced by the pending pre-save snapshot',async()=>{const cache=new WorkspaceRecords();let finish;const pending=cache.load({entities:()=>new Promise(r=>finish=r)},'asset','',()=>{});cache.upsert('asset','',{id:'saved',title:'Preservado'});finish({items:[]});await pending;assert.equal(cache.view('asset','').items[0].id,'saved');assert.equal(cache.view('asset','').loading,false);});

const {hasChatArrival}=load('src/lib/chat-scroll.ts',{'react':{},'react-native':{}});
test('chat follows arrivals and growth of any reply but not unchanged polls, older history or deletions',()=>{
 const before=[{id:'a',content:'A'},{id:'b',content:'B'}];
 assert.equal(hasChatArrival(before,[...before,{id:'c',content:'C'}]),true);
 assert.equal(hasChatArrival(before,[{id:'older',content:'History'},...before]),false);
 assert.equal(hasChatArrival(before,before.map(m=>({...m}))),false);
 assert.equal(hasChatArrival(before,[{id:'a',content:'A growing'},before[1]]),true);
 assert.equal(hasChatArrival(before,[before[0]]),false);
 assert.equal(hasChatArrival([{id:'optimistic',content:'Hello'}],[{id:'server-user',content:'Hello'},{id:'reply',content:'Response'}]),true);
});
