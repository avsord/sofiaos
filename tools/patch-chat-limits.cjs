'use strict';
const fs=require('node:fs'),path=require('node:path');
function patch(file,replacements,required){
 const target=path.resolve(__dirname,'..',file);let source=fs.readFileSync(target,'utf8'),changed=false;
 for(const [before,after] of replacements){
  if(source.includes(after))continue;
  const count=source.split(before).length-1;
  if(count!==1)throw Error('Unexpected source while expanding chat limits in '+file+': '+before.slice(0,90));
  source=source.replace(before,after);changed=true;
 }
 if(changed)fs.writeFileSync(target,source);
 for(const token of required)if(!source.includes(token))throw Error('Chat limit patch incomplete in '+file+': '+token);
}
patch('src/channels/mobile.js',[
 ["const MAX_AUDIO = 10 * 1024 * 1024;","const MAX_AUDIO = 64 * 1024 * 1024, MAX_AUDIO_DURATION = 6 * 60 * 60 * 1000, MAX_TEXT = 1000000;"],
 ["limits: { audio_bytes: MAX_AUDIO, audio_seconds: 300, text_chars: config.maxMessageChars || 12000 },","limits: { audio_bytes: MAX_AUDIO, audio_seconds: Math.trunc(MAX_AUDIO_DURATION/1000), text_chars: MAX_TEXT },"],
 ["rate(session, 'message'); const b = await bodyJson(req, 65536);","rate(session, 'message'); const b = await bodyJson(req, 2 * 1024 * 1024);"],
 ["cleanText(b.message, 'Mensagem', config.maxMessageChars || 12000)","cleanText(b.message, 'Mensagem', MAX_TEXT)"],
 ["rate(session, 'audio', 12); const b = await bodyJson(req, 14 * 1024 * 1024),","rate(session, 'audio', 12); const b = await bodyJson(req, Math.ceil(MAX_AUDIO * 4 / 3) + 65536),"],
 ["if (!bytes.length || bytes.length > MAX_AUDIO) fail('VOICE_SIZE', 'O áudio deve ter até 10 MB.', 413);","if (!bytes.length || bytes.length > MAX_AUDIO) fail('VOICE_SIZE', 'Este arquivo de áudio excede o limite técnico de transporte.', 413);"],
 ["if (!Number.isSafeInteger(duration) || duration < 1 || duration > 300000) fail('VOICE_DURATION', 'Grave um áudio de até cinco minutos.');","if (!Number.isSafeInteger(duration) || duration < 1 || duration > MAX_AUDIO_DURATION) fail('VOICE_DURATION', 'A gravação excede o limite técnico de uma única mensagem.');"],
 ["cleanText(t.text, 'Transcrição', config.maxMessageChars || 12000)","cleanText(t.text, 'Transcrição', MAX_TEXT)"]
],['MAX_AUDIO_DURATION = 6 * 60 * 60 * 1000','text_chars: MAX_TEXT','duration > MAX_AUDIO_DURATION',"cleanText(b.message, 'Mensagem', MAX_TEXT)"]);
patch('src/core/sofia-core.js',[
 ["const s=this.store,refs=[],records=[];const lookup=cleanText(query||user.content,'Busca de contexto',500,true)||user.content;","const s=this.store,refs=[],records=[];const rawLookup=String(query||user.content||'').replace(/\\s+/g,' ').trim(),lookup=cleanText(rawLookup.length<=500?rawLookup:rawLookup.slice(0,340)+' … '+rawLookup.slice(-150),'Busca de contexto',500,true)||rawLookup.slice(0,500);"]
],["rawLookup.length<=500?rawLookup:rawLookup.slice(0,340)"]);
console.log('[Sofia] Long text/audio transport enabled; retrieval query remains bounded.');
