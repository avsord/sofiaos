'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.261: a fonte da Sofia vale de verdade no site (os nomes da fonte do sistema apontam para os arquivos dela)',()=>{
  const f=load('src/lib/sofia-font.ts',{'react-native':{Platform:{OS:'web'},StyleSheet:{flatten:x=>x}},react:{createElement(){}}});
  const css=f.webFontCss();
  for(const n of ['Segoe UI','Roboto','-apple-system','BlinkMacSystemFont','Arial','Helvetica'])assert.ok(css.includes("font-family:'"+n+"';src:url('/assets/fonts/SofiaSans-SemiBold.woff2')"),n);
  assert.ok(!css.includes('monospace!important'),'monospace continua monospace');
});
test('0.3.261: login do computador em duas colunas; no celular continua o mesmo',()=>{
  const l=read('src/screens/Login.tsx');
  assert.ok(l.includes('testID="login-desktop"')&&l.includes("maxWidth:400,alignSelf:'center'")&&l.includes('<DialogContext.Provider value={true}>'));
  assert.ok((l.match(/\{fields\}/g)||[]).length===2,'os mesmos campos no computador e no celular');
  assert.ok(l.includes('>E-mail</Text>')&&!l.includes('>E-MAIL<'));
  assert.ok(fs.existsSync(path.join(__dirname,'..','..','docs','DESIGN.md')));
});
