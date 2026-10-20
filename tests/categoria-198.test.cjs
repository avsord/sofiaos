'use strict';
// 0.3.198: a Sofia escolhe a categoria certa sozinha e aprende com as correcoes.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const bridge=require('../src/core/app-bridge.js');
function setup(t){const {core}=fixture(t);const w=core.workspace;w.save({kind:'fin_account',title:'Conta principal',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true}});return w;}
const build=(w,title,amount,category,kind='expense')=>bridge.buildEntity(w,'fin_tx',{title,changes:[{field:'data.kind',value:kind},{field:'data.amount',value:amount},...(category?[{field:'data.category',value:category}]:[])]},title).data.category;
test('categoria pela descricao, mesmo sem a Sofia mandar ou mandando uma que nao existe no app',t=>{
 const w=setup(t);
 assert.equal(build(w,'Rastreador Ugreen','138,08'),'Compras');
 assert.equal(build(w,'Oficialfarma','210,36','Farmácia'),'Saúde','"Farmácia" nao existe no app: vira Saúde');
 assert.equal(build(w,'Uber pra casa','23,40'),'Transporte');
 assert.equal(build(w,'iFood','58,00'),'Alimentação');
 assert.equal(build(w,'Assaí','310,00'),'Mercado');
 assert.equal(build(w,'DAS de outubro','469'),'Impostos');
 assert.equal(build(w,'Coisa sem pista','10'),'Outros');
 assert.equal(build(w,'Freela logo','800','','income'),'Freelance');
 assert.equal(build(w,'Lanche','20','Alimentação'),'Alimentação','categoria valida da Sofia e mantida');
});
test('aprende com a correcao da pessoa: mesma descricao, mesma categoria da ultima vez',t=>{
 const w=setup(t);
 const conta=w.list({kind:'fin_account',limit:5})[0];
 w.save({kind:'fin_tx',title:'Oficialfarma',area:'Pessoal',data:{kind:'expense',amount:100,date:'2026-10-10',account_id:conta.id,paid:true,category:'Presentes',recurrence:'none'}});
 assert.equal(build(w,'Oficialfarma','210,36','Saúde'),'Presentes','a escolha da pessoa vale mais');
});
test('a Sofia conhece as categorias do app',()=>{
 const ctx=bridge.appsContext({list:()=>[]},null).content;
 assert.match(ctx,/escolha VOCÊ pela descrição, sem perguntar/);assert.match(ctx,/Rastreador Ugreen.*Compras/);assert.match(ctx,/Oficialfarma.*Saúde/);
});

test('0.3.199: frase completa - anteontem, dia da semana passado, cartao, parcelas e receita',t=>{
 const w=setup(t);
 const b=(title,changes,action={})=>bridge.buildEntity(w,'fin_tx',{title,changes,...action},title).data;
 const today=bridge.today();const add=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
 assert.equal(b('iFood',[{field:'data.amount',value:'45'},{field:'data.date',value:'anteontem'}]).date,add(today,-2));
 const sexta=b('iFood',[{field:'data.amount',value:'45'},{field:'data.date',value:'sexta'}]).date;
 assert.ok(sexta<=today&&sexta>add(today,-8),'sexta = a ultima sexta, nao a proxima');assert.equal(new Date(sexta+'T12:00:00Z').getUTCDay(),5);
 const rec=b('Freela logo',[{field:'data.kind',value:'income'},{field:'data.amount',value:'800'}]);assert.equal(rec.kind,'income');assert.equal(rec.category,'Freelance');
 const plan=bridge.installmentPlan(1000,3,'2026-01-31');
 assert.equal(plan.map(p=>p.amount).join(','),'333.34,333.33,333.33','centavos na 1a parcela');
 assert.equal(plan.map(p=>p.date).join(','),'2026-01-31,2026-02-28,2026-03-31','fim de mes respeita fevereiro');
 const ctx=bridge.appsContext({list:()=>[]},null).content;assert.match(ctx,/em 3x no Nubank/);assert.match(ctx,/valor TOTAL/);
 const core=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','src/core/sofia-core.js'),'utf8');
 assert.ok(core.includes("for(const p of bridge.installmentPlan(Number(built.data.amount),parts,built.data.date))"),'parcelas viram um lancamento por mes');
});

test('0.3.204: categoria pela natureza do que foi comprado (remedio vai para Saude mesmo sem "farmacia" no nome)',t=>{
 const w=setup(t);
 const b=(title,content,category)=>bridge.buildEntity(w,'fin_tx',{title,content,changes:[{field:'data.kind',value:'expense'},{field:'data.amount',value:'34,97'},...(category?[{field:'data.category',value:category}]:[])]},title).data.category;
 assert.equal(b('Bifarma – Tadalafila',''),'Saúde','loja de farmacia');
 assert.equal(b('Tadalafila 5mg',''),'Saúde','so o remedio');
 assert.equal(b('Pedido 5741','2 Tadalafila 5mg Eurofarma 30 Comprimidos'),'Saúde','pelos itens da nota');
 assert.equal(b('Drogasil',''),'Saúde');assert.equal(b('Xarope e vitamina C',''),'Saúde');
 assert.equal(b('Bifarma – Tadalafila','','Saúde'),'Saúde','a escolha certa da Sofia e mantida');
 const ctx=bridge.appsContext({list:()=>[]},null).content;
 assert.match(ctx,/FOTO DE COMPRA/);assert.match(ctx,/registre a despesa DIRETO, sem perguntar/);assert.match(ctx,/pela NATUREZA do que foi comprado/);
 const core=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','src/core/sofia-core.js'),'utf8');
 assert.ok(core.includes('Se for FOTO DE COMPRA (cupom, nota fiscal, comprovante, pedido, Pix, recibo)'),'a regra vai junto com a foto');
});

test('0.3.205: compra pela foto entra paga (sai do Saldo), mesmo com "aguardando pagamento"; conta a pagar de verdade continua a pagar',t=>{
 const w=setup(t);
 const b=(title,changes,fallback='')=>bridge.buildEntity(w,'fin_tx',{title,content:'2 Tadalafila 5mg Eurofarma 30 Comprimidos',changes:[{field:'data.kind',value:'expense'},{field:'data.amount',value:'34,97'},...changes]},fallback).data;
 assert.equal(b('Bifarma – Tadalafila',[{field:'data.paid',value:false}],'Veja a imagem que enviei.').paid,true,'a IA marcou a pagar lendo o Pix: entra pago');
 assert.equal(b('Bifarma – Tadalafila',[]).paid,true,'padrao: pago');
 assert.equal(b('Bifarma – Tadalafila',[{field:'data.paid',value:false}],'registra, vou pagar depois').paid,false,'a pessoa disse que paga depois');
 const amanha=new Date(Date.now()+2*864e5).toISOString().slice(0,10);
 assert.equal(b('DAS',[{field:'data.paid',value:false},{field:'data.date',value:amanha}],'DAS de novembro').paid,false,'conta com data futura continua a pagar');
 assert.match(bridge.appsContext({list:()=>[]},null).content,/Compra pela foto entra PAGA/);
});
