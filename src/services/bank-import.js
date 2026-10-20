'use strict';
// Importa extrato de banco/cartão para o Finanças.
// - OFX (o que todo banco exporta): blocos <STMTTRN> com data, valor, descrição e FITID.
// - CSV: detecta separador e colunas pelo cabeçalho (Nubank, Inter, Itaú, C6, genérico).
// Cada item recebe um import_id estável (FITID ou hash de data+valor+descrição) para
// a mesma linha nunca entrar duas vezes, mesmo importando o mesmo arquivo de novo.
const crypto=require('node:crypto');
const {AppError}=require('../core/util');

function fold(s){return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function num(v){const s=String(v==null?'':v).trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');if(!s)return NaN;const neg=/^\(.*\)$/.test(s)||s.startsWith('-');const body=s.replace(/[()]/g,'').replace(/^[-+]/,'');const n=body.includes(',')&&(!body.includes('.')||body.lastIndexOf(',')>body.lastIndexOf('.'))?Number(body.replace(/\./g,'').replace(',','.')):Number(body.replace(/,/g,''));return neg?-n:n;}
function dateISO(v){const s=String(v||'').trim();let m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=/^(\d{4})(\d{2})(\d{2})/.exec(s);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s);if(m){const y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');}return '';}
function importId(date,amount,desc,fitid){return fitid?'fitid:'+String(fitid).trim().slice(0,80):'h:'+crypto.createHash('sha1').update(date+'|'+Math.round(amount*100)+'|'+fold(desc)).digest('hex').slice(0,24);}
function clean(desc){return String(desc||'').replace(/\s+/g,' ').trim().slice(0,120);}
/** 0.3.209: descricao legivel - 'Pix enviado: "Cp :10573521-PIX Marketplace"' vira "Pix · PIX Marketplace". */
function niceDesc(desc){
 let d=clean(desc),head='';
 const m=/^(pix enviado devolvido|pix recebido devolvido|pix enviado|pix recebido|pix|ted enviada|ted recebida|transferencia enviada|transferencia recebida|pagamento de boleto|pagamento)\s*[:\-–]\s*/i.exec(d);
 if(m){const k=fold(m[1]);head=/devolvido/.test(k)?'Pix devolvido':/^pix/.test(k)?'Pix':/^ted/.test(k)?'TED':/^transferencia/.test(k)?'Transferência':'Pagamento';d=d.slice(m[0].length);}
 d=d.replace(/^["'“”]+|["'“”]+$/g,'').replace(/\bcp\s*:\s*\d+\s*-\s*/i,'').replace(/^\d{6,}\s*-\s*/,'').replace(/\s+/g,' ').trim();
 d=d.replace(/\b(instituicao de pagamento|instituição de pagamento|ltda|s\.?a\.?|me|eireli)\b\.?/gi,'').replace(/\s+/g,' ').trim();
 return (head&&d?head+' · '+d:head||d||clean(desc)).slice(0,120);
}

// Categoria sugerida pela descrição (a pessoa pode trocar depois).
const CATEGORY=[
 ['Mercado',/mercado|supermercado|carrefour|pao de acucar|extra |assai|atacad|hortifruti|padaria|acougue/],
 ['Transporte',/uber|99app|99 |taxi|cabify|posto|combust|gasolina|estacion|pedagio|metro|bilhete unico|cptm|onibus/],
 ['Alimentação',/ifood|rappi|restaurante|lanch|burger|pizza|sushi|cafe|bar |boteco|delivery|mcdonald|subway|outback/],
 ['Casa',/aluguel|condominio|enel|eletropaulo|luz|sabesp|agua|gas |comgas|internet|vivo|claro|tim |oi |net |iptu/],
 ['Saúde',/farmacia|drogaria|droga raia|drogasil|medico|hospital|laborat|plano de saude|unimed|amil|dentista/],
 ['Lazer',/netflix|spotify|disney|hbo|prime video|cinema|ingresso|steam|playstation|xbox|show|teatro/],
 ['Compras',/amazon|mercado livre|mercadolivre|magalu|magazine|americanas|shopee|aliexpress|kabum|shein|renner|riachuelo|zara/],
 ['Educação',/escola|faculdade|curso|udemy|alura|livraria|kindle/],
 ['Assinaturas',/assinatura|subscription|google one|icloud|apple.com|microsoft|adobe|notion|chatgpt|openai/],
 ['Receita',/salario|pagamento recebido|pix recebido|transferencia recebida|rendimento|deposito/],
];
function guessCategory(desc,kind){const d=fold(desc);if(kind==='income'){const r=CATEGORY.find(([,re])=>re.test(d));return r?r[0]:'Receita';}for(const [name,re] of CATEGORY){if(name!=='Receita'&&re.test(d))return name;}return '';}

/** OFX (SGML ou XML): lista de {date, amount, desc, fitid, type}. */
function parseOFX(text){
 const out=[];const blocks=String(text).split(/<STMTTRN>/i).slice(1);
 for(const b of blocks){
  const get=tag=>{const m=new RegExp('<'+tag+'>\\s*([^<\\r\\n]*)','i').exec(b);return m?m[1].trim():'';};
  const date=dateISO(get('DTPOSTED')),amount=num(get('TRNAMT'));
  if(!date||!Number.isFinite(amount))continue;
  const desc=clean(get('MEMO')||get('NAME')||get('PAYEE')||get('TRNTYPE'));
  out.push({date,amount,desc,fitid:get('FITID'),type:get('TRNTYPE')});
 }
 return out;
}

/** CSV: detecta separador e colunas pelo cabeçalho. */
function splitLine(line,sep){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===sep&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out.map(x=>x.trim());}
function parseCSV(text){
 const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());
 if(lines.length<2)return [];
 const sep=[';',',','\t'].map(s=>({s,n:lines[0].split(s).length})).sort((a,b)=>b.n-a.n)[0].s;
 const head=splitLine(lines[0],sep).map(fold);
 const find=(...names)=>head.findIndex(h=>names.some(n=>h===n||h.startsWith(n)));
 const iDate=find('data','date','dt'),iDesc=find('descricao','description','titulo','title','historico','memo','lancamento','estabelecimento','detalhes'),iAmount=find('valor','amount','value','montante'),iCat=find('categoria','category'),iId=find('identificador','id','fitid');
 if(iDate<0||iAmount<0)throw new AppError('IMPORT_FORMAT','Não reconheci as colunas do CSV. Precisa ter pelo menos Data e Valor no cabeçalho.',400);
 const out=[];
 for(const line of lines.slice(1)){
  const cols=splitLine(line,sep);const date=dateISO(cols[iDate]),amount=num(cols[iAmount]);
  if(!date||!Number.isFinite(amount))continue;
  out.push({date,amount,desc:clean(iDesc>=0?cols[iDesc]:''),fitid:iId>=0?cols[iId]:'',category:iCat>=0?clean(cols[iCat]):''});
 }
 return out;
}

/** 0.3.211: desfaz a importacao - apaga tudo o que entrou pelo extrato (import_id "fitid:"/"h:") da conta ou do
 * cartao. O que a pessoa lancou a mao ou pela Sofia (import_id "sofia-...") nao e tocado. Devolve o Saldo ao que era. */
function undo(workspace,{target_id=''}={}){
 let removed=0,amount=0;const ids=[];
 for(let offset=0;offset<20000;offset+=500){const page=workspace.list({kind:'fin_tx',limit:500,offset});
  for(const e of page){const iid=String(e.data?.import_id||'');if(!/^(fitid:|h:)/.test(iid))continue;if(target_id&&e.data?.account_id!==target_id&&e.data?.card_id!==target_id)continue;ids.push(e);}
  if(page.length<500)break;}
 for(const e of ids){try{workspace.deleteEntity(e.id);removed++;amount+=Number(e.data?.amount)||0;}catch{/* ja saiu */}}
 return {removed,amount:Math.round(amount*100)/100};
}
/** Lê o arquivo (OFX ou CSV) e monta a prévia para o app, já marcando o que já existe. */
function preview(workspace,{text,target='account',target_id=''}){
 const raw=String(text||'');if(!raw.trim())throw new AppError('IMPORT_EMPTY','O arquivo está vazio.',400);
 const isOFX=/<OFX>|<STMTTRN>|OFXHEADER/i.test(raw);
 const rows=isOFX?parseOFX(raw):parseCSV(raw);
 if(!rows.length)throw new AppError('IMPORT_FORMAT',isOFX?'O OFX não tem lançamentos.':'Não achei lançamentos no CSV (data e valor por linha).',400);
 const card=target==='card';
 // Cartão: todo valor positivo é compra; negativo é pagamento/estorno (não entra). Conta: negativo = despesa, positivo = receita.
 const existing=new Set(),manual=[];for(let offset=0;offset<20000;offset+=500){const page=workspace.list({kind:'fin_tx',limit:500,offset});for(const e of page){if(e.data?.import_id)existing.add(e.data.import_id);if(e.state!=='archived'&&!String(e.data?.import_id||'').startsWith('ofx')&&(!target_id||e.data?.account_id===target_id||e.data?.card_id===target_id))manual.push(e);}if(page.length<500)break;}
 // 0.3.209: ponto de partida - o que e de antes ja esta dentro do saldo (acertado com o banco ou na criacao da conta)
 let start='';try{const acc=target_id?workspace.get(target_id):null;start=String(acc?.data?.balance_set_at||String(acc?.created_at||'').slice(0,10)||'');}catch{start='';}
 const used=new Set();
 const findManual=(kind,amount,date)=>{const t=Date.parse(date+'T12:00:00Z');return manual.filter(e=>!used.has(e.id)&&String(e.data?.kind||'expense')===kind&&Math.abs(Number(e.data?.amount)-amount)<=1.0001&&Math.abs(Date.parse(String(e.data?.date)+'T12:00:00Z')-t)<=3*864e5)
  // o mais parecido primeiro: valor igual antes de valor quase igual, depois a data mais proxima
  .sort((a,b)=>Math.abs(Number(a.data.amount)-amount)-Math.abs(Number(b.data.amount)-amount)||Math.abs(Date.parse(a.data.date+'T12:00:00Z')-t)-Math.abs(Date.parse(b.data.date+'T12:00:00Z')-t))[0];};
 let bridge=null;try{bridge=require('../core/app-bridge');}catch{bridge=null;}
 const items=rows.map(r=>{
  let kind,amount=Math.abs(r.amount),skip='';
  if(card){kind='expense';if(r.amount<0){skip='pagamento/estorno do cartão';}}
  else kind=r.amount<0?'expense':'income';
  if(!card&&/pagamento de fatura|pagamento fatura|fatura cartao/.test(fold(r.desc)))kind='card_payment';
  const import_id=importId(r.date,r.amount,r.desc,r.fitid),amt=Math.round(amount*100)/100,desc=niceDesc(r.desc||'')||'(sem descrição)';
  const dup=existing.has(import_id),m=!dup&&!skip?findManual(kind,amt,r.date):null;if(m)used.add(m.id);
  const before=!!start&&r.date<start&&!dup;
  let category=r.category||'';if(!category&&bridge&&bridge.financeCategory&&(kind==='expense'||kind==='income')){const c=bridge.financeCategory(workspace,kind,desc,'',r.desc||'');category=c&&c!=='Outros'?c:'';}if(!category)category=guessCategory(r.desc,kind)||'Outros';
  return {import_id,date:r.date,desc,original:r.desc||'',amount:amt,kind,category,duplicate:dup,skip,match:m?{id:m.id,title:m.title,amount:Number(m.data?.amount)}:null,before,checked:!dup&&!skip&&!m&&!before};
 });
 return {format:isOFX?'ofx':'csv',items,total:items.filter(i=>!i.skip).length,duplicates:items.filter(i=>i.duplicate).length,matched:items.filter(i=>i.match).length,before:items.filter(i=>i.before).length,start};
}

/** Grava os itens escolhidos como fin_tx (pagos), sem duplicar. */
function commit(workspace,{items,target='account',target_id='',privacy='private',source_id=null}){
 if(!Array.isArray(items)||!items.length)throw new AppError('IMPORT_EMPTY','Nenhum lançamento escolhido.',400);
 if(!target_id)throw new AppError('IMPORT_TARGET','Escolha a conta (ou o cartão) do extrato.',400);
 const ref=workspace.get(target_id);const card=target==='card';
 if(card&&ref.kind!=='fin_card')throw new AppError('IMPORT_TARGET','Isso não é um cartão.',400);
 if(!card&&ref.kind!=='fin_account')throw new AppError('IMPORT_TARGET','Isso não é uma conta.',400);
 const existing=new Set();for(let offset=0;offset<20000;offset+=500){const page=workspace.list({kind:'fin_tx',limit:500,offset});for(const e of page)if(e.data?.import_id)existing.add(e.data.import_id);if(page.length<500)break;}
 let created=0,skipped=0;const saved=[];
 for(const it of items.slice(0,2000)){
  const id=String(it.import_id||'');if(!id||existing.has(id)){skipped++;continue;}
  const amount=Number(it.amount);const date=dateISO(it.date);if(!(amount>0)||!date){skipped++;continue;}
  let kind=['expense','income','card_payment','transfer'].includes(it.kind)?it.kind:'expense';
  const data={kind,amount,date,category:String(it.category||'').slice(0,60),paid:true,recurrence:'none',import_id:id};
  if(card)data.card_id=ref.id;else data.account_id=ref.id;
  // "Pagamento de fatura" no extrato da conta: se só um cartão é pago por essa conta, liga a ele;
  // senão vira despesa comum na categoria Cartão de crédito (a pessoa ajusta depois).
  if(kind==='card_payment'&&!card){const cards=workspace.list({kind:'fin_card',limit:50}).filter(c=>c.state!=='archived'&&c.data?.account_id===ref.id);if(cards.length===1){data.card_id=cards[0].id;data.invoice_month=date.slice(0,7);}else{data.kind='expense';data.category=data.category||'Cartão de crédito';}}
  if(card){const closing=Number(ref.data?.closing_day)||1;const d=Number(date.slice(8));let [y,m]=date.slice(0,7).split('-').map(Number);if(d>closing){m+=1;if(m>12){m=1;y+=1;}}data.invoice_month=y+'-'+String(m).padStart(2,'0');}
  saved.push(workspace.save({kind:'fin_tx',title:String(it.desc||'Lançamento').slice(0,120),area:'Pessoal',privacy,source_id,state:'active',data}));
  existing.add(id);created++;
 }
 return {created,skipped,items:saved};
}

module.exports={undo,preview,commit,parseOFX,parseCSV,guessCategory,num,dateISO};
