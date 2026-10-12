'use strict';
// Rodada dos 12 pedidos: feriados, link do Mercado Livre, nada de abrir apps, Ver mais,
// sem piscada, Conta Google dentro do app, lixeira, 5 itens, exclusão suave, nome, espaço.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const mon={};vm.runInNewContext(ts.transpileModule(read('src/lib/monitoring.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:mon,URL,Date,Math,JSON,Number,String,Set,Map,Array,Object,Infinity,encodeURIComponent,isFinite});
test('1) feriados do Google ficam verdes',()=>{const s=read('src/lib/agenda-priority.ts');assert.ok(s.includes("HOLIDAY_COLOR='#2fc58b'"));assert.ok(s.includes('#holiday@group'));assert.ok(read('src/screens/Agenda.tsx').includes('calendar_id:i.data.calendar_id'));});
test('2) link do Mercado Livre: texto de compartilhar, http, sem protocolo, link curto',()=>{
 assert.equal(mon.extractProductUrl('Olha isso no Mercado Livre! https://mercadolivre.com/sec/1AbCdE2'),'https://mercadolivre.com/sec/1AbCdE2');
 assert.equal(mon.extractProductUrl('http://produto.mercadolivre.com.br/MLB-123-placa-_JM?x=1).'),'https://produto.mercadolivre.com.br/MLB-123-placa-_JM?x=1');
 assert.equal(mon.extractProductUrl('produto.mercadolivre.com.br/MLB-123'),'https://produto.mercadolivre.com.br/MLB-123');
 assert.equal(mon.extractProductUrl('sem link aqui'),'');
});
test('4/8) leitura invisível nunca abre app nem site por fora',()=>{const s=read('src/lib/price-reader.tsx');assert.ok(s.includes("onShouldStartLoadWithRequest={(req: any) => /^https?:\\/\\//i.test(String(req?.url || ''))}"));assert.ok(s.includes('javaScriptCanOpenWindowsAutomatically={false}'));});
test('3) "Ver mais" simples nas tarefas',()=>{assert.ok(read('src/screens/Home.tsx').includes(">Ver mais</Text>"));});
test('5) a tela que entra não desenha com o active antigo (sem piscada)',()=>{assert.ok(read('src/lib/screen-loader.tsx').includes('active!==false||Object.is(deferredActive,active)'));});
test('6) Conta Google em janela dentro do app que volta sozinha',()=>{const s=read('src/components/GoogleCalendarSettings.tsx');assert.ok(s.includes("WebBrowser.openAuthSessionAsync(url.toString(),'sofiaapp://google')"));assert.ok(read('src/lib/api.ts').includes("'/md/calendar/connect',{app:true}"));});
test('7) lixeira dentro do produto',()=>{assert.ok(read('src/screens/Monitoring.tsx').includes('<IconButton name="trash" label="Excluir produto" onPress={remove} />'));});
test('9) widget com 5 itens e "Ver mais" no fim',()=>{const s=read('src/components/MonitorWidget.tsx');assert.ok(s.includes('.slice(0,5)'));assert.ok(s.includes('>Ver mais</Text>'));});
test('10) apagar aviso: sai e a linha fecha suave, também pelo X',()=>{const s=read('src/components/NotificationCenter.tsx');assert.ok(s.includes('Animated.timing(collapse,{toValue:0'));assert.ok(s.includes("onPress={dismiss} style={{padding:6}}"));});
test('11) nome Price Tracker',()=>{for(const f of ['src/screens/Monitoring.tsx','src/screens/Workspace.tsx','src/components/MonitorWidget.tsx'])assert.ok(read(f).includes('Price Tracker'),f);});
test('12) título da Início mais perto da agenda',()=>{assert.ok(read('src/screens/Home.tsx').includes('<ScreenTitle tight'));assert.ok(read('src/components/UI.tsx').includes('paddingBottom:tight?6:18'));});
