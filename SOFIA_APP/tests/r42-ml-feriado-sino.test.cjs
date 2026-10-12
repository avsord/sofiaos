'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('app do Mercado Livre não abre: nenhum link passa pelo Linking.openURL da biblioteca',()=>{
 const s=read('src/lib/price-reader.tsx');assert.ok(s.includes("originWhitelist={['*']}"));assert.ok(!s.includes("originWhitelist={['https://*', 'http://*']}"));
 // A biblioteca só chama Linking.openURL para o que NÃO passa na lista; com '*' nada fica de fora.
 const lib=fs.readFileSync(path.join(__dirname,'../node_modules/react-native-webview/lib/WebViewShared.js'),'utf8');
 assert.ok(lib.includes('if(!passesWhitelist(compileWhitelist(originWhitelist),url)){_reactNative.Linking.canOpenURL(url)'),'comportamento da biblioteca que motivou a correção');
 const toRegex=w=>new RegExp('^'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\\\*/g,'.*'));
 for(const url of ['meli://item/MLB123','intent://item#Intent;scheme=meli;end','aliexpress://product/1'])assert.ok(toRegex('*').test(url.match(/^[A-Za-z][A-Za-z0-9+\-.]+:(\/\/)?[^/]*/)[0]),url);
});
test('feriado igual na Agenda e na Início: barrinha verde no item e ponto verde no dia',()=>{
 const a=read('src/screens/Agenda.tsx');assert.ok(a.includes('backgroundColor:agendaPriority(item).color||c.accent'),'Agenda como era: barrinha pela cor da prioridade (verde no feriado)');
 assert.ok(!a.includes("isHoliday(item)?'Feriado'"),'Agenda sem o cartão todo verde');
 const w=read('src/components/DashboardWidgets.tsx');assert.ok(w.includes('borderLeftColor:holiday?HOLIDAY_COLOR:'),'Início: barrinha verde no feriado');assert.ok(w.includes('calendar_id:i.original&&!i.isTask'),'Início: ponto do dia verde');
});
test('sino: arrastar para apagar não perde para a rolagem, e rolagem menos solta',()=>{
 const s=read('src/components/NotificationCenter.tsx');assert.ok(s.includes('onPanResponderTerminationRequest:()=>false'));assert.ok(s.includes('decelerationRate="fast"'));
});
