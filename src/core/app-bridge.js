'use strict';
// Ponte entre a conversa e os apps da Sofia (Cápsulas, Price Tracker, Finanças,
// E-mails, Compras, Listas, Contatos...). Três responsabilidades:
// 1) descrever os apps para a IA (nomes, campos, exemplos, registros existentes);
// 2) transformar o que a IA estruturou em dados válidos de cada app (tipos,
//    sinônimos, datas, referências por NOME em vez de ID, padrões sensatos);
// 3) responder consultas de cada app ("quanto gastei", "o que tomo hoje"...).
const {CATALOG}=require('./catalog');
const {AppError}=require('./util');

const TZ='America/Sao_Paulo';
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function fold(s){return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function money(v){if(typeof v==='number')return v;const s=fold(v).replace(/r\$|reais?|brl|\s/g,'');if(!s)return NaN;const n=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;return Number(n);}
function bool(v){const s=fold(v);return ['true','1','sim','yes','on','ligado','ativo','pago','paga'].includes(s)||v===true;}
function dateOf(v){const s=fold(v);if(!s||s==='hoje')return today();if(s==='amanha')return addDays(today(),1);if(s==='ontem')return addDays(today(),-1);if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/.exec(s);if(m){const y=m[3]?(m[3].length===2?'20'+m[3]:m[3]):today().slice(0,4);return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');}return s;}
function timeOf(v){const s=fold(v).replace(/\s*(horas?|hrs?|hs?)\s*$/,'').replace(/h/,':').replace(/:$/,'').replace(/\s+/g,'');const m=/^(\d{1,2})(?::(\d{1,2}))?$/.exec(s);if(!m)return '';const h=Number(m[1]),mi=Number(m[2]||0);if(h>23||mi>59)return '';return String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0');}
const WEEK={dom:0,seg:1,ter:2,qua:3,qui:4,sex:5,sab:6};
function weekdays(v){if(Array.isArray(v))return v.map(Number).filter(n=>n>=0&&n<=6);const out=new Set();for(const part of fold(v).split(/[,\s/e]+/)){const k=part.slice(0,3);if(k in WEEK)out.add(WEEK[k]);else if(/^\d$/.test(part))out.add(Number(part));}return [...out].sort();}

// Sinônimos para campos de escolha, por app.
const SYNONYM={
 capsule_type:{remedio:'medicine',medicamento:'medicine',medicine:'medicine',remedy:'medicine',suplemento:'supplement',supplement:'supplement',vitamina:'supplement',erva:'herbal',cha:'herbal',herbal:'herbal',natural:'herbal'},
 repeat_type:{diario:'daily',diaria:'daily','todo dia':'daily','todos os dias':'daily',daily:'daily','dias uteis':'weekdays',semanal:'weekdays',weekdays:'weekdays',intervalo:'interval',interval:'interval',mensal:'monthly',monthly:'monthly',anual:'yearly',yearly:'yearly','uma vez':'once',once:'once',unico:'once'},
 kind:{despesa:'expense',gasto:'expense',gastei:'expense',saida:'expense',expense:'expense',receita:'income',entrada:'income',ganho:'income',salario:'income',income:'income',transferencia:'transfer',transfer:'transfer','pagamento de fatura':'card_payment',fatura:'card_payment',card_payment:'card_payment'},
 recurrence:{nenhuma:'none',none:'none',mensal:'monthly',monthly:'monthly',semanal:'weekly',weekly:'weekly',anual:'yearly',yearly:'yearly'},
 field:{qualquer:'any',any:'any',tudo:'any',remetente:'from',from:'from','de':'from',assunto:'subject',subject:'subject',titulo:'subject',texto:'body',corpo:'body',body:'body',conteudo:'body'},
 currency:{real:'BRL',reais:'BRL',brl:'BRL','r$':'BRL',dolar:'USD',usd:'USD','us$':'USD',euro:'EUR',eur:'EUR'},
 account_type:{conta:'corrente','conta corrente':'corrente',corrente:'corrente',banco:'corrente',checking:'corrente',poupanca:'poupanca',savings:'poupanca',carteira:'carteira',dinheiro:'carteira',cash:'carteira',investimento:'investimento',investimentos:'investimento',investment:'investimento',outro:'outro',outra:'outro'},
 list:{mercado:'market',market:'market',supermercado:'market',feira:'market',farmacia:'pharmacy',pharmacy:'pharmacy',drogaria:'pharmacy',outro:'other',outra:'other',other:'other'},
};

// Registro dos apps: como a IA os conhece e o que cada um precisa.
const APPS={
 capsule:{app:'Cápsulas',names:['cápsulas','capsulas','remédio','remedio','medicamento','vitamina','suplemento','tomar'],ui:'capsules',
  describe:'Remédios, vitaminas e suplementos com horários. title=nome (ex.: "Multivitamínico"); data.dose_text=dose ("1 cápsula"); data.times_json=horários (["15:00"]); data.repeat_type=daily|weekdays|interval|monthly|yearly|once; data.weekdays_json=[1,3,5] se for dias específicos; data.interval_days se for "a cada N dias"; data.start_date (padrão hoje); data.end_date opcional; data.capsule_type=medicine|supplement|herbal.',
  example:'"Coloca no app de cápsulas: tomar 1 multivitamínico todo dia às 15h a partir de hoje" → create_entity entity_kind=capsule title="Multivitamínico" changes=[{field:"data.dose_text",value:"1 cápsula"},{field:"data.times_json",value:"15:00"},{field:"data.repeat_type",value:"daily"},{field:"data.start_date",value:"hoje"}]',
  defaults:{repeat_type:'daily',notifications:true,capsule_type:'supplement',remind_minutes:0}},
 monitor:{app:'Price Tracker',names:['price tracker','tracker','monitoramento','monitorar preço','acompanhar preço','preço'],ui:'monitoring',
  describe:'Acompanha o preço de um produto por link. title=nome do produto; data.preferred_url=link principal (https); data.source_urls=outros links (um por linha); data.target_price=preço-alvo; data.drop_percent=avisar se cair X%; data.new_low=avisar no menor preço já visto.',
  example:'"Monitora esse produto https://... e me avisa se cair 10%" → create_entity entity_kind=monitor title="<nome>" changes=[{field:"data.preferred_url",value:"https://..."},{field:"data.drop_percent",value:"10"}]',
  defaults:{method:'product',currency:'BRL',interval_minutes:360,consent:true,discover:false,new_low:true}},
 fin_account:{app:'Finanças',names:['finanças','financas','conta','banco','carteira'],ui:'finance',describe:'Conta (banco, carteira, poupança). title=nome; data.account_type=corrente|poupanca|carteira|investimento|outro; data.initial_balance=saldo inicial.',defaults:{account_type:'corrente',initial_balance:'0',include_total:true}},
 fin_card:{app:'Finanças',names:['cartão','cartao','crédito','credito'],ui:'finance',describe:'Cartão de crédito. title=nome; data.limit=limite; data.closing_day=dia do fechamento; data.due_day=dia do vencimento; data.account_id=NOME da conta que paga a fatura.',defaults:{}},
 fin_tx:{app:'Finanças',names:['lançamento','lancamento','gasto','despesa','receita','paguei','gastei','recebi','comprei'],ui:'finance',
  describe:'Lançamento. title=descrição; data.kind=expense|income|transfer|card_payment; data.amount=valor (número); data.date (padrão hoje); data.category; data.account_id=NOME da conta; data.card_id=NOME do cartão (compra no cartão); data.to_account_id=conta destino (transferência); data.paid (padrão: pago); data.installments=número de parcelas; data.recurrence=none|monthly|weekly|yearly (contas fixas).',
  example:'"Gastei 45,90 no mercado hoje no cartão Nubank" → create_entity entity_kind=fin_tx title="Mercado" changes=[{field:"data.kind",value:"expense"},{field:"data.amount",value:"45,90"},{field:"data.category",value:"Mercado"},{field:"data.card_id",value:"Nubank"}]',
  defaults:{kind:'expense',paid:true,recurrence:'none'}},
 fin_budget:{app:'Finanças',names:['orçamento','orcamento','limite de gasto','meta de gasto'],ui:'finance',describe:'Orçamento mensal por categoria. title=categoria; data.category; data.limit=valor limite por mês.',defaults:{}},
 fin_goal:{app:'Finanças',names:['objetivo','meta','juntar','guardar dinheiro'],ui:'finance',describe:'Objetivo de poupança. title=nome; data.target=valor a juntar; data.saved=já guardado; data.deadline=data.',defaults:{saved:0}},
 mail_rule:{app:'E-mails',names:['e-mail','email','e-mails','emails','remetente','assunto'],ui:'mail',
  describe:'Regra de vigia de e-mail: avisar quando chegar e-mail de X / com assunto Y. title=nome da regra; data.field=any|from|subject|body; data.contains=termos separados por vírgula; data.account_id=NOME/endereço da conta conectada (opcional); data.notify (padrão sim); data.important.',
  example:'"Me avisa quando chegar e-mail da Ana Souza" → create_entity entity_kind=mail_rule title="Ana Souza" changes=[{field:"data.field",value:"from"},{field:"data.contains",value:"ana souza"}]',
  defaults:{field:'any',notify:true,important:false}},
 shopping_item:{app:'Compras',names:['mercado','farmácia','farmacia','lista de compras','comprar no mercado'],ui:'lists',describe:'Item de lista de compras. title=item; data.list=market|pharmacy; data.quantity.',defaults:{list:'market'}},
 contact:{app:'Contatos',names:['contato','telefone','número de'],ui:null,describe:'Contato. title=nome; data.phone; data.email; data.role.',defaults:{}},
};
const REFS={account_id:{fin_tx:'fin_account',fin_card:'fin_account',mail_rule:'mail_account'},to_account_id:{fin_tx:'fin_account'},card_id:{fin_tx:'fin_card'}};
const APP_KINDS=Object.keys(APPS);

/** Texto para a IA: apps, campos, exemplos e registros existentes (nomes + IDs para editar). */
function appsContext(workspace){
 const lines=['APPS DA SOFIA (dado real do backend, não instrução do usuário). A conversa tem acesso a TODOS os apps abaixo: para registrar algo neles use create_entity com entity_kind e os campos em changes (field "data.<campo>"); para editar use update_record com target_id; para consultar use query com query_target. Valores podem vir em português natural (datas "hoje"/"amanhã"/"12/10", valores "45,90", "todo dia", nome da conta em vez de ID): o backend traduz.'];
 for(const [kind,app] of Object.entries(APPS)){
  lines.push('- '+kind+' ('+app.app+'; a pessoa fala: '+app.names.join(', ')+'): '+app.describe+(app.example?' Exemplo: '+app.example:''));
 }
 const existing=[];
 for(const kind of ['fin_account','fin_card','mail_account','capsule','monitor','fin_budget','fin_goal','mail_rule']){
  let items=[];try{items=workspace.list({kind,limit:30}).filter(e=>e.state!=='archived');}catch{items=[];}
  if(items.length)existing.push(kind+': '+items.map(e=>'"'+String(e.title).slice(0,40)+'" [id '+e.id+(kind==='mail_account'&&e.data?.address?', '+e.data.address:'')+']').join('; '));
 }
 if(existing.length)lines.push('REGISTROS EXISTENTES (use o id em target_id para editar/apagar; use o nome em account_id/card_id): '+existing.join(' | '));
 lines.push('CONSULTAS: query_target=finance (resumo do mês: receitas, despesas, saldo, maiores categorias, contas a pagar), capsules (o que tomar hoje e horários), monitors (produtos acompanhados e preços), mail (últimos e-mails que bateram nas regras).');
 return {role:'user',content:lines.join('\n')};
}

/** Acha um registro por nome (ou id) entre os de um tipo. */
function resolveRef(workspace,kind,value){
 const raw=String(value||'').trim();if(!raw)return '';
 try{const byId=workspace.get(raw);if(byId&&byId.kind===kind)return byId.id;}catch{/* não é id */}
 const items=workspace.list({kind,limit:200}).filter(e=>e.state!=='archived');
 const q=fold(raw);
 const hit=items.find(e=>fold(e.title)===q)||items.find(e=>fold(e.data?.address||'')===q)||items.find(e=>fold(e.title).includes(q)||q.includes(fold(e.title)));
 if(hit)return hit.id;
 const label={fin_account:'conta',fin_card:'cartão',mail_account:'conta de e-mail'}[kind]||kind;
 throw new AppError('REF_NOT_FOUND','Não achei '+label+' chamada “'+raw.slice(0,40)+'”'+(items.length?'. Existem: '+items.map(e=>e.title).slice(0,8).join(', ')+'.':'. Crie primeiro em '+(APPS[kind]?.app||'Apps')+'.'),409);
}

/** Traduz um valor para o tipo do campo do catálogo (com sinônimos e português natural). */
function coerce(kind,field,value,workspace){
 const key=field.key;
 if(REFS[key]&&REFS[key][kind])return resolveRef(workspace,REFS[key][kind],value);
 if(field.type==='checkbox')return bool(value);
 if(field.type==='number'){const n=money(value);if(!Number.isFinite(n))throw new AppError('BAD_FIELD',field.label+': use um número (ex.: 45,90).',409);return n;}
 if(field.type==='date')return dateOf(value);
 if(field.type==='select'){const syn=SYNONYM[key]||{};const f=fold(value);const v=syn[f]||(field.options.includes(String(value))?String(value):null)||field.options.find(o=>fold(o)===f);if(!v)throw new AppError('BAD_FIELD',field.label+': use '+field.options.join(', ')+'.',409);return v;}
 if(key==='times_json'){const list=Array.isArray(value)?value:String(value).split(/[,;\s]+e\s+|[,;]|\s+e\s+/).map(timeOf).filter(Boolean);if(!list.length)throw new AppError('BAD_FIELD','Horário: use por exemplo 15:00.',409);return JSON.stringify(list);}
 if(key==='weekdays_json')return JSON.stringify(weekdays(value));
 if(field.type==='url'){const s=String(value||'').trim();const m=s.match(/https?:\/\/[^\s<>"']+/i)||s.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)+\.[a-z]{2,}(\/[^\s<>"']*)?/i);if(!m)throw new AppError('BAD_FIELD',field.label+': preciso de um link.',409);let u=m[0].replace(/[),.;!?]+$/,'');if(!/^https?:\/\//i.test(u))u='https://'+u;return u.replace(/^http:/i,'https:');}
 return value==null?'':String(value);
}

/** Monta title/data/state de um registro de app a partir do que a IA estruturou. */
function buildEntity(workspace,kind,action,fallbackTitle){
 const app=APPS[kind],def=CATALOG[kind];if(!app||!def)return null;
 const data={...(typeof app.defaults==='function'?app.defaults():app.defaults)};
 const changes=Array.isArray(action.changes)?action.changes:[];
 for(const c of changes){
  if(!c||!c.field)continue;const key=String(c.field).replace(/^data\./,'');
  if(['title','area','content','state'].includes(key))continue;
  const field=def.fields.find(f=>f.key===key);
  if(!field)throw new AppError('UPDATE_FIELD_INVALID','Campo não previsto para '+app.app+': '+key,409);
  data[key]=coerce(kind,field,c.value,workspace);
 }
 // Atalhos que a IA costuma preencher fora de changes.
 if(kind==='capsule'){if(!data.times_json&&action.time)data.times_json=coerce(kind,{key:'times_json',type:'text'},action.time,workspace);if(!data.start_date)data.start_date=today();if(data.repeat_type==='weekdays'&&!data.weekdays_json)data.weekdays_json='[1,2,3,4,5]';if(data.interval_days&&data.repeat_type!=='interval')data.repeat_type='interval';if(!data.times_json)throw new AppError('ACTION_NEEDS_TIME','Em que horário(s) tomar? Ex.: 15:00.',409);}
 if(kind==='fin_tx'){if(!data.date)data.date=action.date?dateOf(action.date):today();if(!(Number(data.amount)>0))throw new AppError('ACTION_INVALID','Qual é o valor do lançamento?',409);if(!data.account_id&&!data.card_id){const accounts=workspace.list({kind:'fin_account',limit:50}).filter(e=>e.state!=='archived');if(accounts.length===1)data.account_id=accounts[0].id;else throw new AppError('REF_NOT_FOUND',accounts.length?'Em qual conta ou cartão? Existem: '+accounts.map(a=>a.title).join(', ')+'.':'Crie uma conta em Apps → Finanças antes do primeiro lançamento.',409);}}
 if(kind==='fin_budget'&&!data.category)data.category=action.title||'';
 if(kind==='monitor'){if(!data.preferred_url)throw new AppError('ACTION_INVALID','Preciso do link do produto para acompanhar o preço.',409);if(!data.variant)data.variant=String(action.title||fallbackTitle||'').slice(0,120);}
 if(kind==='mail_rule'&&!data.contains)throw new AppError('ACTION_INVALID','O que procurar no e-mail (remetente, assunto ou termo)?',409);
 const title=String(action.title||fallbackTitle||'').trim()||(kind==='fin_tx'?String(data.category||'Lançamento'):kind==='mail_rule'?String(data.contains):'Registro');
 const states={capsule:'active',monitor:'active',fin_account:'active',fin_card:'active',fin_tx:'active',fin_budget:'active',fin_goal:'active',mail_rule:'active',shopping_item:'todo',contact:'active'};
 return {title,data,state:action.state||states[kind]||'active',ui:app.ui,app:app.app};
}

function describeCreated(kind,e){
 const d=e.data||{};
 if(kind==='capsule'){let times=[];try{times=JSON.parse(d.times_json||'[]');}catch{}const rep={daily:'todos os dias',weekdays:'nos dias escolhidos',interval:'a cada '+(d.interval_days||'?')+' dias',monthly:'todo mês',yearly:'todo ano',once:'uma vez'}[d.repeat_type]||'';return 'Cápsula registrada: “'+e.title+'”'+(d.dose_text?' ('+d.dose_text+')':'')+(times.length?' às '+times.join(', '):'')+(rep?' '+rep:'')+(d.start_date?', a partir de '+d.start_date.split('-').reverse().join('/'):'')+'. Está em Apps → Cápsulas.';}
 if(kind==='fin_tx'){const n=Number(d.amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});return ({expense:'Despesa',income:'Receita',transfer:'Transferência',card_payment:'Pagamento de fatura'}[d.kind]||'Lançamento')+' registrada: “'+e.title+'”, '+n+(d.category?' em '+d.category:'')+(d.date?', '+d.date.split('-').reverse().join('/'):'')+'. Está em Apps → Finanças.';}
 if(kind==='monitor')return 'Produto no Price Tracker: “'+e.title+'”. A Sofia lê o preço em seguida'+(d.drop_percent?' e avisa se cair '+d.drop_percent+'%':'')+(d.target_price?' e quando chegar a R$ '+d.target_price:'')+'.';
 if(kind==='mail_rule')return 'Vigia de e-mail criada: “'+e.title+'” ('+({any:'qualquer campo',from:'remetente',subject:'assunto',body:'texto'}[d.field]||d.field)+' contém “'+d.contains+'”). A Sofia avisa quando chegar.';
 return (APPS[kind]?.app||'Registro')+': “'+e.title+'” criado.';
}

/** Consultas por app. */
function query(workspace,store,target){
 const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 if(target==='capsules'){const items=workspace.list({kind:'capsule',limit:200}).filter(e=>e.state==='active');if(!items.length)return {reply:'Nenhuma cápsula cadastrada. Diga, por exemplo: “tomar 1 ômega 3 todo dia às 16h”.',items:[]};const lines=items.map(e=>{let t=[];try{t=JSON.parse(e.data.times_json||'[]');}catch{}return '• '+e.title+(e.data.dose_text?' — '+e.data.dose_text:'')+(t.length?' às '+t.join(', '):'');});return {reply:'Cápsulas de hoje:\n'+lines.join('\n'),ui_target:'capsules',items};}
 if(target==='monitors'){const items=workspace.list({kind:'monitor',limit:100}).filter(e=>e.state!=='archived');if(!items.length)return {reply:'Nenhum produto no Price Tracker ainda. Me manda um link que eu passo a acompanhar.',items:[]};const lines=items.map(e=>{const obs=workspace.observations(e.id);const last=obs[obs.length-1];return '• '+e.title+(last?': '+money((last.total_cents||last.price_cents||0)/100)+(last.source?' ('+(()=>{try{return new URL(last.source).hostname.replace(/^www\./,'');}catch{return '';}})()+')':''):': sem leitura ainda')+(e.state==='paused'?' (pausado)':'');});return {reply:'Price Tracker:\n'+lines.join('\n'),ui_target:'monitoring',items};}
 if(target==='mail'){const hits=workspace.list({kind:'mail_hit',limit:10});if(!hits.length)return {reply:'Nenhum e-mail bateu nas regras ainda.',items:[]};return {reply:'Últimos e-mails que a Sofia pegou:\n'+hits.map(h=>'• '+(h.data.from_name||h.data.from_addr||'?')+': '+(h.data.subject||'(sem assunto)')).join('\n'),ui_target:'mail',items:hits};}
 if(target==='finance'){
  const month=today().slice(0,7);const txs=[];for(let offset=0;offset<20000;offset+=500){const page=workspace.list({kind:'fin_tx',limit:500,offset});txs.push(...page.filter(e=>e.state!=='archived'));if(page.length<500)break;}
  const inMonth=txs.filter(t=>String(t.data.date||'').startsWith(month));
  const sum=k=>inMonth.filter(t=>t.data.kind===k&&t.data.paid!==false).reduce((s,t)=>s+Number(t.data.amount||0),0);
  const income=sum('income'),expense=sum('expense');
  const cats=new Map();for(const t of inMonth.filter(t=>t.data.kind==='expense'))cats.set(t.data.category||'Outros',(cats.get(t.data.category||'Outros')||0)+Number(t.data.amount||0));
  const top=[...cats.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,v])=>c+' '+money(v));
  const pending=txs.filter(t=>t.data.kind==='expense'&&t.data.paid===false&&String(t.data.date||'')>=today()).sort((a,b)=>String(a.data.date).localeCompare(String(b.data.date))).slice(0,5);
  const accounts=workspace.list({kind:'fin_account',limit:50}).filter(e=>e.state!=='archived');
  const balance=accounts.reduce((s,a)=>{const base=Number(a.data.initial_balance||0);const flow=txs.filter(t=>t.data.paid!==false).reduce((x,t)=>{if(t.data.kind==='income'&&t.data.account_id===a.id)return x+Number(t.data.amount||0);if((t.data.kind==='expense'||t.data.kind==='card_payment')&&t.data.account_id===a.id)return x-Number(t.data.amount||0);if(t.data.kind==='transfer'){if(t.data.account_id===a.id)return x-Number(t.data.amount||0);if(t.data.to_account_id===a.id)return x+Number(t.data.amount||0);}return x;},0);return s+base+flow;},0);
  const lines=['Finanças deste mês ('+month.split('-').reverse().join('/')+'):','• Receitas: '+money(income),'• Despesas: '+money(expense),'• Resultado: '+money(income-expense),'• Saldo das contas: '+money(balance)];
  if(top.length)lines.push('• Maiores gastos: '+top.join(', '));
  if(pending.length)lines.push('• A pagar: '+pending.map(t=>t.title+' '+money(t.data.amount)+' ('+String(t.data.date).split('-').reverse().slice(0,2).join('/')+')').join(', '));
  if(!inMonth.length&&!accounts.length)lines.push('Nenhum lançamento ainda. Diga, por exemplo: “gastei 45,90 no mercado hoje”.');
  return {reply:lines.join('\n'),ui_target:'finance',items:inMonth.slice(0,30)};
 }
 return null;
}

module.exports={APPS,APP_KINDS,appsContext,buildEntity,describeCreated,resolveRef,coerce,query,today,dateOf,money,timeOf,weekdays};
