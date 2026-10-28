'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.259: fonte propria (Plus Jakarta Sans) no app e no site',()=>{
  for(const w of ['Regular','Medium','SemiBold','Bold','ExtraBold','Italic']){assert.ok(fs.existsSync(path.join(__dirname,'..','assets/fonts/SofiaSans-'+w+'.ttf')),w);assert.ok(fs.existsSync(path.join(__dirname,'..','public/assets/fonts/SofiaSans-'+w+'.woff2')),w+' web');}
  assert.ok(read('app.json').includes('./plugins/with-sofia-fonts.cjs'));assert.ok(read('App.tsx').includes('installSofiaFont();'));
  const f=read('src/lib/sofia-font.ts');assert.ok(f.includes("font-family:'${SOFIA_FONT}'")&&f.includes("Object.defineProperty(RN, name"));
  assert.ok(read('assets/fonts/LICENSE.txt').includes('SIL Open Font License'));
});
test('0.3.259: escala de letras com 13 tamanhos e pesos um degrau abaixo',()=>{
  const glob=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?glob(path.join(d,e.name)):/\.tsx?$/.test(e.name)?[path.join(d,e.name)]:[]);
  const txt=glob(path.join(__dirname,'..','src')).map(f=>fs.readFileSync(f,'utf8')).join('\n');
  const sizes=[...new Set([...txt.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)].map(m=>m[1]))].map(Number).sort((a,b)=>a-b);
  assert.deepEqual(sizes,[10,11,12,13,14,16,18,20,24,28,32,40,56]);
  assert.equal((txt.match(/fontWeight:\s*'800'/g)||[]).length,0,'sem extra-negrito solto');
});
test('0.3.259: icones de um conjunto profissional com dois estados; escuro desenhado',()=>{
  const i=read('src/components/Icon.tsx');assert.ok(i.includes("weight={weight || (active ? 'fill' : 'regular')}")&&i.includes("phosphor-react-native/src/icons/House"));
  assert.ok(read('src/components/MenuTab.tsx').includes('color={c.accent} active/>'));
  const th=read('src/lib/theme.tsx');assert.ok(th.includes("bg:'#121017'")&&th.includes("good:'#1F9D6E'")&&th.includes("elevated:'#2A2636'"));
});
test('0.3.259: categorias de Financas com icone do conjunto e cores de status vindas do tema',()=>{
  const f=read('src/lib/finance.ts');assert.ok(f.includes("{name: 'Mercado', icon: '🛒', color: '#2fc58b', glyph: 'cart'}"));
  const s=read('src/screens/Finance.tsx');assert.ok(s.includes('<Icon name={(cat.glyph || \'circle\') as IconName}')&&!/[^.\w]GOOD\b(?! =)/.test(s.replace("const GOOD = '#2fc58b'",'')));
  assert.ok(read('src/components/NotificationCenter.tsx').includes("'Agenda':{icon:'📅',glyph:'calendar',color:PALETTE.blue}"));
});
