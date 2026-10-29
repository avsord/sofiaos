'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.262: telas do computador (Inicio, Agenda, Paginas)',()=>{
  assert.ok(read('src/screens/Home.tsx').includes('testID="home-desk"')); // 0.3.264: desenho aprovado do Inicio
  const a=read('src/screens/Agenda.tsx');assert.ok(a.includes("const byDay=useMemo(()=>{if(!wideAgenda)return null;")&&a.includes('+{(byDay.get(dayKey(day))||[]).length-3} mais'));
  assert.ok(read('src/screens/Pages.tsx').includes('testID="pages-recent"'));
});
test('0.3.262: acabamento premium',()=>{
  const h=read('../src/core/http-handler.js');assert.ok(h.includes('function compressedWeb(req,res,full)')&&h.includes("res.setHeader('Content-Encoding',kind)"));
  assert.ok(read('src/lib/sofia-font.ts').includes('font-variant-numeric:tabular-nums'));
  assert.ok(read('src/screens/Finance.tsx').includes('function BigMoney('));
  assert.ok(read('src/components/UI.tsx').includes("weight=\"duotone\"/></View></View><Text style={{fontSize:18,fontWeight:'600'"));
  const i=read('src/components/Icon.tsx');assert.ok(i.includes('function SofiaGlyph(')&&i.includes('function CapsuleGlyph('));
  assert.ok(read('App.tsx').includes("{id:'chat',label:'Conversa',icon:'sofia'}"));
});
