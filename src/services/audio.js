'use strict';
const {AppError}=require('../core/util');
class AudioService{
  constructor(config,fetchImpl=global.fetch){this.config=config;this.fetch=fetchImpl;}
  key(route='auto'){
    if(route==='shared')return this.config.sharedApiKey||this.config.apiKey||this.config.privateApiKey;
    if(route==='private')return this.config.privateApiKey||this.config.apiKey||this.config.sharedApiKey;
    // Auto transcreve primeiro na rota privada quando disponível, pois o áudio ainda não foi semanticamente classificado.
    return this.config.privateApiKey||this.config.apiKey||this.config.sharedApiKey;
  }
  async transcribe(bytes,{mime='audio/webm',filename='sofia-voice.webm',route='auto',signal}={}){
    const key=this.key(route);if(!key)throw new AppError('AUDIO_KEY_MISSING','Não há chave disponível para transcrever este áudio.',409);
    if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes||[]);if(!bytes.length||bytes.length>25*1024*1024)throw new AppError('VOICE_SIZE','O áudio está vazio ou ultrapassa 25 MB.',413);
    const form=new FormData();form.set('model',this.config.transcriptionModel||'gpt-transcribe');form.set('file',new Blob([bytes],{type:mime}),filename);form.append('languages[]','pt');form.append('languages[]','en');form.set('prompt','Mensagem de voz para a assistente Sofia OS. Preserve nomes próprios, datas, horários, produtos, projetos e termos técnicos exatamente quando forem falados.');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),this.config.apiTimeoutMs||90000);if(signal)signal.addEventListener('abort',()=>controller.abort(),{once:true});
    try{const res=await this.fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:controller.signal,redirect:'error'});const requestId=res.headers?.get?.('x-request-id')||null;let data;try{data=await res.json();}catch{data=null;}if(!res.ok)throw new AppError('AUDIO_API_ERROR',data?.error?.message||'A transcrição do áudio falhou na API.',502);const text=String(data?.text||'').trim();if(!text)throw new AppError('AUDIO_EMPTY','Não consegui identificar fala neste áudio.',422);return {text,languages:Array.isArray(data?.languages)?data.languages:[],requestId,model:this.config.transcriptionModel||'gpt-transcribe'};
    }catch(e){if(e?.name==='AbortError')throw new AppError('AUDIO_TIMEOUT','A transcrição demorou mais que o limite configurado.',504);throw e;}finally{clearTimeout(timeout);}
  }
}
module.exports={AudioService};
