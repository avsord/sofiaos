'use strict';
// 0.3.167: no Android o teclado cobria os campos das folhas (Modal translucido nao redimensiona).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('a folha mede o teclado e se afasta dele',()=>{
  const s=read('src/components/Sheet.tsx');
  assert.ok(s.includes("Keyboard.addListener('keyboardDidShow'"));
  assert.ok(s.includes("Keyboard.addListener('keyboardDidHide'"));
  assert.ok(s.includes('marginBottom:keyboard?Math.max(0,keyboard-insets.bottom):0'));
  assert.ok(s.includes("if(Platform.OS==='ios')return;"),'no iOS o KeyboardAvoidingView ja resolve');
  assert.ok(s.includes('show.remove();hide.remove();'),'sem ouvintes vazados');
});
test('0.3.170: o painel encolhe para caber acima do teclado e o conteudo rola, sem altura fixa',()=>{
  const sheet=read('src/components/Sheet.tsx'),fin=read('src/screens/Finance.tsx');
  assert.ok(sheet.includes('maxHeight:Math.max(220,windowHeight-keyboard-insets.top-24)'),'o painel cabe no que sobra');
  assert.ok(sheet.includes('paddingBottom:keyboard?16:Math.max(20,insets.bottom+12)'));
  assert.ok(fin.includes('<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:13,paddingBottom:24}}'));
  assert.ok(!/style=\{\{maxHeight: ?\d{3}\}\}/.test(fin),'nenhuma folha com altura fixa');
});
