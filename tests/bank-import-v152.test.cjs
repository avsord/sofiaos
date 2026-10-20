'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const imp=require('../src/services/bank-import');
const OFX=`OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-3:BRT]<TRNAMT>-45,90<FITID>2026100301<MEMO>COMPRA CARTAO - SUPERMERCADO EXTRA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>5000.00<FITID>2026100502<MEMO>SALARIO EMPRESA LTDA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-1200.00<FITID>2026100603<MEMO>PAGAMENTO DE FATURA CARTAO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const CSV_NUBANK_CONTA=`Data,Valor,Identificador,Descrição
03/10/2026,-45.90,abc-1,Compra no débito - Supermercado Extra
05/10/2026,5000.00,abc-2,Transferência recebida - Salário
07/10/2026,-18.50,abc-3,Uber *Trip`;
const CSV_NUBANK_CARTAO=`date,category,title,amount
2026-10-03,supermercado,Extra Supermercado,45.90
2026-10-04,transporte,Uber,18.50
2026-10-10,,Pagamento recebido,-1000.00`;

test('OFX: data, valor com vírgula ou ponto, descrição, FITID; pagamento de fatura reconhecido',t=>{
 const f=fixture(t);const r=imp.preview(f.core.workspace,{text:OFX,target:'account'});
 assert.equal(r.format,'ofx');assert.equal(r.items.length,3);
 const [a,b,c]=r.items;assert.equal(a.date,'2026-10-03');assert.equal(a.amount,45.9);assert.equal(a.kind,'expense');assert.equal(a.category,'Mercado');assert.equal(a.import_id,'fitid:2026100301');
 assert.equal(b.kind,'income');assert.equal(b.amount,5000);assert.equal(b.category,'Salário','0.3.209: categoria do app (antes "Receita", que nao existe no app)');
 assert.equal(c.kind,'card_payment');
});
test('CSV da conta (Nubank): separador vírgula, data BR, negativo = despesa; CSV do cartão: positivo = compra, negativo = pagamento (fica de fora)',t=>{
 const f=fixture(t);
 const conta=imp.preview(f.core.workspace,{text:CSV_NUBANK_CONTA,target:'account'});
 assert.equal(conta.items.length,3);assert.equal(conta.items[0].kind,'expense');assert.equal(conta.items[1].kind,'income');assert.equal(conta.items[2].category,'Transporte');assert.equal(conta.items[0].import_id,'fitid:abc-1');
 const cartao=imp.preview(f.core.workspace,{text:CSV_NUBANK_CARTAO,target:'card'});
 assert.equal(cartao.items.length,3);assert.equal(cartao.items[0].kind,'expense');assert.equal(cartao.items[0].amount,45.9);assert.equal(cartao.items[0].category,'supermercado');assert.ok(cartao.items[2].skip);assert.equal(cartao.total,2);
});
test('gravar: cria lançamentos pagos na conta certa, fatura certa no cartão, e NUNCA duplica (mesmo importando de novo)',t=>{
 const f=fixture(t);const w=f.core.workspace;
 const acc=w.save({kind:'fin_account',title:'Nubank',area:'Pessoal',data:{account_type:'corrente'}});
 const card=w.save({kind:'fin_card',title:'Nubank Cartão',area:'Pessoal',data:{limit:5000,closing_day:5,due_day:12,account_id:acc.id}});
 const p1=imp.preview(w,{text:OFX,target:'account',target_id:acc.id});
 const c1=imp.commit(w,{items:p1.items,target:'account',target_id:acc.id});
 assert.equal(c1.created,3);const txs=w.list({kind:'fin_tx'});assert.equal(txs.length,3);assert.ok(txs.every(e=>e.data.account_id===acc.id&&e.data.paid===true&&e.data.import_id));
 const p2=imp.preview(w,{text:OFX,target:'account',target_id:acc.id});assert.equal(p2.duplicates,3,'segunda prévia marca tudo como já importado');
 const c2=imp.commit(w,{items:p2.items,target:'account',target_id:acc.id});assert.equal(c2.created,0);assert.equal(c2.skipped,3);assert.equal(w.list({kind:'fin_tx'}).length,3);
 const pc=imp.preview(w,{text:CSV_NUBANK_CARTAO,target:'card',target_id:card.id});
 const cc=imp.commit(w,{items:pc.items.filter(i=>!i.skip),target:'card',target_id:card.id});
 assert.equal(cc.created,2);const compra=w.list({kind:'fin_tx'}).find(e=>e.title==='Extra Supermercado');assert.equal(compra.data.card_id,card.id);assert.equal(compra.data.invoice_month,'2026-10','dia 3 <= fechamento 5: fatura de outubro');
 const uber=w.list({kind:'fin_tx'}).find(e=>e.title==='Uber');assert.equal(uber.data.invoice_month,'2026-10');
 assert.throws(()=>imp.commit(w,{items:pc.items,target:'card',target_id:acc.id}),/não é um cartão/);
});
test('CSV sem Data/Valor no cabeçalho dá erro claro',t=>{const f=fixture(t);assert.throws(()=>imp.preview(f.core.workspace,{text:'a,b\n1,2'}),/Data e Valor/);});
