'use strict';
// 0.3.153: dialogo no visual do app, historico separado do extrato importado, guardado verde atras do roxo.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('nenhuma caixa nativa do Android: confirmacoes usam a janela da Sofia',()=>{
  const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
  const left=walk(path.join(root,'src')).concat([path.join(root,'App.tsx')]).filter(f=>/\.tsx?$/.test(f)&&!f.endsWith('app-alert.tsx')&&fs.readFileSync(f,'utf8').includes('Alert.alert('));
  assert.deepEqual(left,[]);assert.ok(read('App.tsx').includes('<AppAlertHost/>'));
});
test('historico: Lancamentos x Extrato importado; guardado verde com valor a esquerda',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes("{value: 'import' as const, label: 'Extrato importado'}"));
  assert.ok(s.includes("(source === 'import' ? imported(t) : !imported(t))"));
  assert.ok(s.includes("GUARD = '#1f9d63'"));assert.ok(!s.includes("#e99334"));assert.ok(!s.includes("'#0d2f1f'"),'0.3.159: numero em branco, nao preto');
  const strip=s.slice(s.indexOf('accessibilityLabel="Gerenciar dinheiro guardado"'),s.indexOf("fontWeight: '700', fontSize: 13}}>Guardado</Text>"));
  assert.ok(strip.includes("show(split.saved)"),'valor vem antes do rotulo');
});
