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
test('o cadastro de conta fixa rola com o teclado aberto',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('<ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:560}} contentContainerStyle={{gap:13,paddingBottom:24}}'));
});
