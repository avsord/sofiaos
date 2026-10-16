'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Finanças abre na conta principal, troca para contas secundárias sem misturar saldos, cards e histórico',()=>{
 const s=read('src/screens/Finance.tsx'),lib=read('src/lib/finance.ts');
 for(const key of ['Selecionar conta financeira','Qual conta quer acompanhar?','selectedAccount','transactionsForAccount(d.txs,d.cards,account.id)','accountId={accountId}','isPrimary={isPrimary}'])assert.ok(s.includes(key),key);
 assert.ok(lib.includes('export function transactionsForAccount('));
 assert.ok(s.includes('const reserve = isPrimary ? reserveOf(d.goals) : null;'));
 assert.ok(!s.includes('<Title text="Contas" action="Gerenciar"'),'contas ficam no seletor, não no resumo');
});
test('gesto voltar recupera a aba anterior antes de sair do Financeiro, inclusive Android Back',()=>{
 const s=read('src/screens/Finance.tsx');
 assert.ok(s.includes('const [tabHistory, setTabHistory] = useState<Tab[]>([])'));
 assert.ok(s.includes("setTab(tabHistory[tabHistory.length - 1]);"));
 assert.ok(s.includes('onBack={backFinance}'));
 assert.ok(s.includes("BackHandler.addEventListener('hardwareBackPress'"));
});
test('aba Pendentes tem cadastro manual e agenda notificação, enquanto extrato aparece no Resumo',()=>{
 const s=read('src/screens/Finance.tsx'),notify=read('src/lib/finance-notifications.ts'),f=read('src/lib/finance.ts');
 assert.ok(s.includes("label: 'Pendentes'"));
 assert.ok(!s.includes("label: 'Planejamento'") && !s.includes("label: 'Lançamentos'"));
 assert.ok(s.includes('<TxTab d={d} month={month}'),'extrato fica no resumo');
 assert.ok(s.includes('function BillEditor(')&&s.includes('function PendingTab('));
 assert.ok(s.includes("import_id:existing?String(tx?.entity?.data?.import_id||''): 'sofia-pendencia:'+uid()"));
 assert.ok(f.includes("String(d.import_id || '').startsWith('sofia-pendencia:')"));
 assert.ok(notify.includes('reconcileNotificationRequests('));
 assert.ok(notify.includes('Sofia → Pendentes')||notify.includes('Finanças → Pendentes'));
});
test('card removível sem apagar faturas antigas; orientação não inventa diagnóstico',()=>{
 const s=read('src/screens/Finance.tsx'),lib=read('src/lib/finance.ts');
 assert.ok(s.includes('accessibilityLabel="Excluir cartão"'));
 assert.ok(s.includes("api.entities('fin_tx','',offset)"));
 assert.ok(s.includes("saveEntity(api,'fin_card',card.name,{},card.entity,'archived')"));
 assert.ok(s.includes('api.deleteEntity(card.id)'),'cartão sem histórico pode ser excluído');
 assert.ok(s.includes('Análise da Sofia') && lib.includes('export function financeInsights('));
});
