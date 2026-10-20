'use strict';
// 0.3.209: importar o extrato sem duplicar o que ja foi lancado a mao e sem descontar de novo o que ja esta no saldo.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');const bank=require('../src/services/bank-import');
const ofx=rows=>'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>'+rows.map(([d,v,m],i)=>`<STMTTRN><TRNTYPE>${v<0?'DEBIT':'CREDIT'}<DTPOSTED>${d.replace(/-/g,'')}120000<TRNAMT>${v}<FITID>F${i}<MEMO>${m}</STMTTRN>`).join('')+'</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
test('extrato: o que ja esta no app e o que e de antes do ponto de partida entram desmarcados; descricao e categoria legiveis',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const conta=w.save({kind:'fin_account',title:'Conta principal',area:'Pessoal',data:{account_type:'corrente',initial_balance:'1779.53',include_total:true,balance_set_at:'2026-10-17'}});
 w.save({kind:'fin_tx',title:'DAS(imposto)',area:'Pessoal',data:{kind:'expense',amount:469,date:'2026-10-20',account_id:conta.id,paid:true,category:'Contas',recurrence:'monthly'}});
 w.save({kind:'fin_tx',title:'OficialFarma – L-Citrulina e suplementos',area:'Pessoal',data:{kind:'expense',amount:206.68,date:'2026-10-20',account_id:conta.id,paid:true,category:'Saúde',recurrence:'none'}});
 const r=bank.preview(w,{text:ofx([['2026-10-07',-187.48,'Pix enviado: "Cp :10573521-PIX Marketplace"'],['2026-10-19',-206.68,'Pix enviado: "Cp :12345678-Mercado Oficial"'],['2026-10-19',-70,'Pix enviado: "Cp :99999999-Estacionamento Modelo Ltda"'],['2026-10-06',19.99,'Pix enviado devolvido: "Cp :10573521-PIX Marketplace"'],['2026-10-20',-469.26,'Pagamento Simples Nacional']]),target:'account',target_id:conta.id});
 const by=d=>r.items.find(i=>i.date===d&&Math.abs(i.amount)===Math.abs({'2026-10-07':187.48,'2026-10-19':i.amount,'2026-10-06':19.99}[d]||i.amount));
 const mk=r.items.find(i=>i.date==='2026-10-07'),mo=r.items.find(i=>i.amount===206.68),est=r.items.find(i=>i.amount===70),dev=r.items.find(i=>i.amount===19.99);
 assert.equal(mk.desc,'Pix · PIX Marketplace');assert.equal(mk.before,true);assert.equal(mk.checked,false,'antes do ponto de partida: desmarcado');
 assert.ok(mo.match&&/OficialFarma/.test(mo.match.title),'ja esta no app (data com 1 dia de diferenca)');assert.equal(mo.checked,false);
 assert.equal(est.desc,'Pix · Estacionamento Modelo');assert.equal(est.checked,true,'o que falta no app vem marcado');assert.equal(est.category,'Transporte');
 assert.equal(dev.desc,'Pix devolvido · PIX Marketplace');assert.equal(dev.kind,'income');
 const das=r.items.find(i=>i.amount===469.26);assert.ok(das.match&&das.match.title==='DAS(imposto)'&&das.match.amount===469,'DAS com 26 centavos de diferenca: ja esta no app');assert.equal(das.checked,false);
 assert.equal(r.matched,2);assert.equal(r.before,2);
});

test('0.3.211: desfazer a importacao tira so o que veio do extrato e devolve o saldo; o que foi lancado a mao fica',t=>{
 const {core}=fixture(t);const w=core.workspace;
 const conta=w.save({kind:'fin_account',title:'Conta principal',area:'Pessoal',data:{account_type:'corrente',initial_balance:'1000',include_total:true}});
 const manual=w.save({kind:'fin_tx',title:'Ugreen',area:'Pessoal',data:{kind:'expense',amount:138.08,date:'2026-10-19',account_id:conta.id,paid:true,category:'Compras',recurrence:'none',import_id:'sofia-pendencia:x'}});
 const r=bank.preview(w,{text:ofx([['2026-10-07',-187.48,'Pix enviado: "Cp :10573521-PIX Marketplace"'],['2026-10-19',-70,'Pix enviado: "Cp :99999999-Estacionamento Modelo Ltda"']]),target:'account',target_id:conta.id});
 bank.commit(w,{items:r.items,target:'account',target_id:conta.id});
 assert.equal(w.list({kind:'fin_tx',limit:50}).filter(e=>e.state!=='archived').length,3);
 const u=bank.undo(w,{target_id:conta.id});
 assert.equal(u.removed,2);assert.equal(u.amount,257.48);
 const left=w.list({kind:'fin_tx',limit:50}).filter(e=>e.state!=='archived');assert.equal(left.length,1);assert.equal(left[0].id,manual.id,'o lancado a mao fica');
});
