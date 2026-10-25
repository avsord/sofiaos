// 0.3.228: botao proprio "Ajustar valor guardado" no menu do guardado; pastas aninhadas e arrastar em Paginas.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.228: Ajustar valor guardado e um botao do menu, igual aos outros, e saiu de Editar meta',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("['Retirar da reserva', 'out'], ['Ajustar valor guardado', 'adjust'], ['Editar aportes', 'plan']"),'botao no menu');
  assert.ok(s.includes("</> : kind === 'adjust' ? <>"),'janela propria');
  const goal=s.slice(s.indexOf("</> : kind === 'goal' ? <>"),s.indexOf("</> : kind === 'plan' ? <>"));
  assert.ok(!goal.includes('Valor guardado hoje'),'nao fica mais escondido em Editar meta');
});
test('0.3.228: o arrastar das pastas trava a rolagem da pagina e mede os alvos depois de redesenhar',()=>{
  const n=read('src/components/NotebookBlock.tsx'),c=read('src/components/NativeCollectionBlock.tsx');
  assert.ok(c.includes('onInteractionChange={onInteractionChange}/>'),'rolagem travada durante o arrastar');
  assert.ok(n.includes("useEffect(()=>{if(!drag)return;rects.current=[];"),'mede depois de redesenhar');
  assert.ok(n.includes('const endRef=useRef(endDrag);endRef.current=endDrag;'),'soltar usa sempre os dados atuais');
});
