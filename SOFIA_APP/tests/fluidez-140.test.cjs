'use strict';
// 0.3.140: chat mais fluido, Inicio volta ao topo apos 30 s longe, grupos de rotinas, logo parado com escala organica.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('0.3.140: chat - esperar a resposta nao trava o menu; so gravacao e exclusao travam',()=>{
  const chat=read('src/screens/Chat.tsx');
  assert.ok(chat.includes('useEffect(()=>{onLock(recordingLock||deleting);},[recordingLock,deleting,onLock]);'));
  assert.ok(!chat.includes('onLock(sending||'));
});
test('0.3.140: chat - da para digitar com mensagem selecionada; mensagem nova entra suave',()=>{
  const chat=read('src/screens/Chat.tsx');
  const composer=chat.slice(chat.indexOf('<Composer key='),chat.indexOf('onText={text}'));
  assert.ok(!composer.includes('selectedIds.size>0'),'selecao nao bloqueia o teclado');
  assert.ok(!composer.includes('||sending||'),'esperar resposta nao bloqueia o teclado');
  assert.ok(chat.includes("Animated.timing(entry,{toValue:1,duration:220,easing:Easing.out(Easing.cubic),useNativeDriver:true})"));
  assert.ok(chat.includes("const fresh=React.useRef(Date.now()-new Date(message.created_at).getTime()<4000).current;"),'historico carrega parado');
});
test('0.3.140: rotinas em grupos (a area do registro e o grupo; sem campo novo no servidor)',()=>{
  const r=read('src/screens/Routines.tsx');
  assert.ok(r.includes("export function groupName(area:unknown)"));
  assert.ok(r.includes("groups.map(([group,list])=>"));
  assert.ok(r.includes('accessibilityLabel="Novo grupo"'));
  assert.ok(r.includes('area:groupName(editing.area),'));
});
test('0.3.140: logo parado, escala lenta e organica, sem giro',()=>{
  const k=read('plugins/native/SofiaLaunchOverlay.kt'),m=read('plugins/native/SofiaLaunchMotion.java');
  assert.ok(!k.includes('canvas.rotate('));
  assert.ok(m.includes('DURATION_MS = 1100L'));
  assert.ok(m.includes('return (float) (0.86d + 0.14d * (0.5d * organic + 0.5d * settle));'));
});
