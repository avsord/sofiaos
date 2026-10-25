'use strict';
// 0.3.167: no Android o teclado cobria os campos das folhas (Modal translucido nao redimensiona).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('a folha mede o teclado e se afasta dele',()=>{
  const s=read('src/components/Sheet.tsx');
  assert.ok(s.includes("Keyboard.addListener('keyboardDidShow'"));
  assert.ok(s.includes("Keyboard.addListener('keyboardDidHide'"));
  assert.ok(s.includes('marginBottom:keyboard,'),'0.3.187: afasta so o quanto o teclado cobre');
  assert.ok(s.includes("if(Platform.OS==='ios')return;"),'no iOS o KeyboardAvoidingView ja resolve');
  assert.ok(s.includes('show.remove();hide.remove();'),'sem ouvintes vazados');
});
test('0.3.170: o painel encolhe para caber acima do teclado e o conteudo rola, sem altura fixa',()=>{
  const sheet=read('src/components/Sheet.tsx'),fin=read('src/screens/Finance.tsx');
  assert.ok(sheet.includes('maxHeight:Math.max(220,(rootH||windowHeight)-keyboard-insets.top-24)'),'o painel cabe no que sobra');
  assert.ok(sheet.includes('paddingBottom:kbOpen?16:Math.max(28,insets.bottom+24)'),'0.3.188: respiro maior no fim');
  assert.ok(fin.includes('<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:13,paddingBottom:24}}'));
  assert.ok(!/style=\{\{maxHeight: ?\d{3}\}\}/.test(fin),'nenhuma folha com altura fixa');
});

test('0.3.187: em aparelho que ja encolhe a janela, a folha nao e empurrada de novo (sem vao e sem corte)',()=>{
  const s=read('src/components/Sheet.tsx');
  assert.ok(s.includes('rootRef.current?.measureInWindow((_x,y,_w,h)=>{smooth();setKeyboard(Math.max(0,Math.round(y+h-kbTop.current)));})'),'mede o quanto o teclado cobre de verdade');
  assert.ok(s.includes("behavior={Platform.OS==='ios'?'padding':undefined}"),'sem o segundo ajuste no Android');
  assert.ok(s.includes('if(kbTop.current)measure();'),'mede de novo quando a janela muda de tamanho');
});

test('0.3.190: com o teclado aberto, o calendario espera o teclado fechar; a folha desce suave',()=>{
  const dt=read('src/components/DateTimeField.tsx'),sh=read('src/components/Sheet.tsx');
  assert.ok(dt.includes('afterKeyboard(()=>{busy.current=false;smooth();setOpen(true);})'));
  assert.ok(dt.includes("const sub=Keyboard.addListener('keyboardDidHide',finish),timer=setTimeout(finish,320);"),'abre quando o teclado fechou (ou logo depois, se o evento nao vier)');
  assert.ok(sh.includes('LayoutAnimation.configureNext(LayoutAnimation.create(180,'),'sem pulo seco');
});

test('0.3.191: calendario dentro do formulario (sem janela por cima) e uma janela espera a outra sair',()=>{
  const dt=read('src/components/DateTimeField.tsx'),fin=read('src/screens/Finance.tsx');
  assert.ok(!dt.includes("from './Sheet'")&&!dt.includes('<Sheet'),'sem segunda janela');
  assert.ok(dt.includes('{open?<View style={{marginTop:8,backgroundColor:c.input'),'abre logo abaixo do campo');
  assert.ok(dt.includes('if(dateOnly)commit(next);'),'so data: tocar no dia ja escolhe');
  assert.ok(fin.includes('function afterSheet(run: () => void) { markSheetHandoff(); setTimeout(run, 120); }'));
  assert.ok(fin.includes("setNewMenu(false); setBillScope('series'); setBillFlow(flow); afterSheet(() => setBillEditor('new'));"));
  assert.ok(fin.includes("setBreakdown(null); afterSheet(() => onTx(t));"));
});

test('0.3.193: com o teclado aberto, tocar num botao ja faz a acao (nao so fecha o teclado)',()=>{
  const fs2=require('node:fs'),path2=require('node:path');
  const walk=d=>fs2.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path2.join(d,e.name)):e.name.endsWith('.tsx')?[path2.join(d,e.name)]:[]);
  const faltando=[];
  const tagAt=(s,i)=>{let depth=0;for(let j=i;j<s.length;j++){const ch=s[j];if(ch==='{')depth++;else if(ch==='}')depth--;else if(ch==='>'&&depth===0&&s[j-1]!=='=')return s.slice(i,j+1);}return '';};
  for(const f of walk(path2.join(__dirname,'..','src'))){const s=fs2.readFileSync(f,'utf8');let i=-1;while((i=s.indexOf('<ScrollView',i+1))>=0){if(!/\s/.test(s[i+11]||''))continue;const t=tagAt(s,i);if(!t.includes('keyboardShouldPersistTaps')&&!t.includes('horizontal'))faltando.push(path2.basename(f));}}
  assert.deepEqual([...new Set(faltando)],[],'toda lista rolavel deixa o toque passar com o teclado aberto');
});
