'use strict';
// O chat não descia conforme as mensagens chegavam.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('lista do chat desce sozinha para a mensagem nova quando a pessoa está no fim',()=>{
 assert.ok(read('src/screens/Chat.tsx').includes('maintainVisibleContentPosition={{minIndexForVisible:0,autoscrollToTopThreshold:120}}'));
});
test('seguir a mensagem nova confere de novo no quadro seguinte, sem animação de viagem',()=>{
 const s=read('src/lib/chat-tail.ts');assert.ok(s.includes('requestAnimationFrame(()=>{if(intent.following&&!intent.interacting)list.current?.scrollToOffset({offset:0,animated:false});})'));assert.ok(!s.includes('animated:true'));
});
