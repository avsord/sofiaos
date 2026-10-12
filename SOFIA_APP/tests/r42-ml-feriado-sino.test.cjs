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
test('feriado: cartão inteiro verde e etiqueta "Feriado" na Agenda e na Início',()=>{
 const a=read('src/screens/Agenda.tsx');assert.ok(a.includes("backgroundColor:isHoliday(item)?HOLIDAY_COLOR+'1f':c.surface"));assert.ok(a.includes("isHoliday(item)?'Feriado'"));
 assert.ok(read('src/components/DashboardWidgets.tsx').includes("backgroundColor:holiday?HOLIDAY_COLOR+'26':c.accentSoft"));
});
test('sino: arrastar para apagar não perde para a rolagem, e rolagem menos solta',()=>{
 const s=read('src/components/NotificationCenter.tsx');assert.ok(s.includes('onPanResponderTerminationRequest:()=>false'));assert.ok(s.includes('decelerationRate="fast"'));
});
