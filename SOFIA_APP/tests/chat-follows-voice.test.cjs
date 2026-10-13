'use strict';
// "Quando mando um áudio o chat não desce": a mensagem de voz entra com seu
// tamanho final (composer já recolhida da gravação) só depois que o envio
// termina — mais tarde que a bolha otimista que o texto usa. Reconfere a
// descida nesse instante também, sem forçar se a pessoa rolou de propósito.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('useChatTail expõe resettle(): confere agora e no quadro seguinte, sem forçar follow',()=>{
 const s=read('src/lib/chat-tail.ts');
 assert.ok(s.includes('const resettle=useCallback(()=>{keep();requestAnimationFrame(keep);},[keep]);'));
 assert.ok(s.includes('return {showJump,follow,pause:()=>intent.pause(),resettle,'));
});
test('o Chat chama resettle() assim que o envio termina (texto, anexo ou áudio)',()=>{
 const s=read('src/screens/Chat.tsx');
 assert.ok(s.includes('resettle:resettle}=useChatTail(list,active)')||s.includes(',resettle,...chatScroll}=useChatTail(list,active);'),'destructuring');
 assert.ok(s.includes('setMessages(prev=>reconcileChatWindow(prev,result));setClarification(result.clarification);\n   // Reconfere a descida depois do envio'));
 assert.ok(s.includes('\n   resettle();\n'));
});
