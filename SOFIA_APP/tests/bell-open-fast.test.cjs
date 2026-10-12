'use strict';
// Sino abria com atraso: medida do sino no toque, lista inteira no primeiro
// quadro e busca de avisos disputando com a animação.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../src/components/NotificationCenter.tsx'),'utf8');
const bell=s.slice(s.indexOf('export function NotificationBell('));
test('posição do sino já medida antes do toque; o painel abre no mesmo quadro',()=>{
 assert.ok(bell.includes('onLayout={measureBell}'));
 assert.ok(/function show\(\)\{if\(opening\.current\)return;opening\.current=true;if\(anchorKnown\.current\|\|!bell\.current\)reveal\(\);/.test(bell));
});
test('a busca de avisos novos espera a animação de abertura',()=>{
 assert.ok(bell.includes('setTimeout(()=>{void n.refresh();},420)'));
 assert.ok(!/setOpen\(true\);void n\.refresh\(\)/.test(bell));
});
test('primeiro quadro leve: só o primeiro grupo com 6 avisos; o resto entra quando a animação termina',()=>{
 assert.ok(bell.includes('<NotificationList firstPaint={!settled}/>'));
 assert.ok(bell.includes('.start(()=>setSettled(true))'));
 assert.ok(s.includes('slice(0,firstPaint?1:undefined)')&&s.includes('const limit=firstPaint?6:'));
});
test('cada aviso é memorizado e não redesenha à toa',()=>{assert.ok(s.includes('export const NoticeRow=React.memo(function NoticeRow('));});
