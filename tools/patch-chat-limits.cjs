'use strict';
const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(__dirname,'../src/channels/mobile.js');
let source=fs.readFileSync(target,'utf8'),changed=false;
function one(before,after){
 if(source.includes(after))return;
 const count=source.split(before).length-1;
 if(count!==1)throw Error('Unexpected mobile API source while expanding chat limits: '+before.slice(0,90));
 source=source.replace(before,after);changed=true;
}
one("const MAX_AUDIO = 10 * 1024 * 1024;","const MAX_AUDIO = 64 * 1024 * 1024, MAX_AUDIO_DURATION = 6 * 60 * 60 * 1000, MAX_TEXT = 1000000;");
one("limits: { audio_bytes: MAX_AUDIO, audio_seconds: 300, text_chars: config.maxMessageChars || 12000 },","limits: { audio_bytes: MAX_AUDIO, audio_seconds: Math.trunc(MAX_AUDIO_DURATION/1000), text_chars: MAX_TEXT },");
one("rate(session, 'message'); const b = await bodyJson(req, 65536);","rate(session, 'message'); const b = await bodyJson(req, 2 * 1024 * 1024);");
one("cleanText(b.message, 'Mensagem', config.maxMessageChars || 12000)","cleanText(b.message, 'Mensagem', MAX_TEXT)");
one("rate(session, 'audio', 12); const b = await bodyJson(req, 14 * 1024 * 1024),","rate(session, 'audio', 12); const b = await bodyJson(req, Math.ceil(MAX_AUDIO * 4 / 3) + 65536),");
one("if (!bytes.length || bytes.length > MAX_AUDIO) fail('VOICE_SIZE', 'O áudio deve ter até 10 MB.', 413);","if (!bytes.length || bytes.length > MAX_AUDIO) fail('VOICE_SIZE', 'Este arquivo de áudio excede o limite técnico de transporte.', 413);");
one("if (!Number.isSafeInteger(duration) || duration < 1 || duration > 300000) fail('VOICE_DURATION', 'Grave um áudio de até cinco minutos.');","if (!Number.isSafeInteger(duration) || duration < 1 || duration > MAX_AUDIO_DURATION) fail('VOICE_DURATION', 'A gravação excede o limite técnico de uma única mensagem.');");
one("cleanText(t.text, 'Transcrição', config.maxMessageChars || 12000)","cleanText(t.text, 'Transcrição', MAX_TEXT)");
if(changed)fs.writeFileSync(target,source);
for(const required of ['MAX_AUDIO_DURATION = 6 * 60 * 60 * 1000','text_chars: MAX_TEXT','duration > MAX_AUDIO_DURATION',"cleanText(b.message, 'Mensagem', MAX_TEXT)"])if(!source.includes(required))throw Error('Chat limit patch incomplete: '+required);
console.log('[Sofia] Long text/audio transport enabled.');
