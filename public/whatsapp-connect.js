'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const state={config:null,session:null,sessionEvent:'',sdkReady:false,busy:false};
  const allowedOrigins=new Set(['https://www.facebook.com','https://web.facebook.com']);
  function status(text,kind=''){const el=$('connectionState');el.textContent=text;el.className='status'+(kind?' '+kind:'');}
  function cleanId(value){const v=String(value||'').trim();return /^[A-Za-z0-9._:-]{1,160}$/.test(v)?v:'';}
  function renderSession(data,event){const payload=data&&typeof data==='object'?data:{};const waba=cleanId(payload.waba_id||payload.wabaId||payload.business_account_id);const phone=cleanId(payload.phone_number_id||payload.phoneNumberId);state.session={waba_id:waba,phone_number_id:phone};state.sessionEvent=String(event||'');$('wabaId').textContent=waba||'Recebido pela Meta';$('phoneId').textContent=phone||'Será confirmado após o fluxo';$('flowEvent').textContent=state.sessionEvent||'Concluído';$('connectionDetails').hidden=false;}
  function parseMessage(raw){if(raw&&typeof raw==='object')return raw;if(typeof raw!=='string')return null;try{return JSON.parse(raw);}catch{return null;}}
  window.addEventListener('message',event=>{
    if(!allowedOrigins.has(event.origin))return;
    const msg=parseMessage(event.data);if(!msg||msg.type!=='WA_EMBEDDED_SIGNUP')return;
    const ev=String(msg.event||'');const data=msg.data||{};
    if(ev==='FINISH'||ev==='FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'){renderSession(data,ev);status('Cadastro incorporado concluído. Finalizando a autorização com segurança…');}
    else if(ev==='CANCEL')status('Cadastro cancelado antes da conclusão. Você pode tentar novamente.','error');
    else if(ev==='ERROR')status('A Meta informou um erro no cadastro. Nenhuma migração foi forçada.','error');
  });
  async function postResult(code){const body={code:String(code||''),event:state.sessionEvent,session:state.session||{}};const res=await fetch('/whatsapp/onboarding-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Não foi possível concluir a autorização.');return data;}
  function loadSdk(){return new Promise((resolve,reject)=>{if(window.FB)return resolve();const script=document.createElement('script');script.src='https://connect.facebook.net/pt_BR/sdk.js';script.async=true;script.defer=true;script.crossOrigin='anonymous';script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível carregar o SDK oficial da Meta.'));document.head.append(script);});}
  async function prepare(){try{const res=await fetch('/whatsapp/onboarding-config',{cache:'no-store'});const cfg=await res.json();if(!res.ok||!cfg.ok)throw new Error(cfg.error||'Configuração da Meta indisponível.');state.config=cfg;await loadSdk();window.FB.init({appId:cfg.appId,cookie:true,xfbml:false,version:cfg.graphVersion});state.sdkReady=true;$('connectWhatsApp').disabled=false;status('Pronto. O próximo passo abre a janela oficial da Meta.');}catch(error){status(error.message||'Não foi possível preparar a conexão.','error');}}
  function launch(){if(state.busy||!state.sdkReady||!state.config)return;state.busy=true;state.session=null;state.sessionEvent='';$('connectionDetails').hidden=true;status('Aguardando a conclusão do cadastro na janela da Meta…');
    window.FB.login(response=>{void (async()=>{try{const code=response?.authResponse?.code||'';if(!code)throw new Error('A autorização foi encerrada antes de devolver o código de cadastro.');const saved=await postResult(code);status(saved.exchanged?'WhatsApp Business autorizado pela Meta. Cadastro de coexistência concluído.':'Cadastro de coexistência concluído. A autorização foi registrada; o App Secret continua somente no servidor.','ok');if(saved.session)renderSession(saved.session,saved.event||state.sessionEvent);}catch(error){status(error.message||'Não foi possível finalizar o cadastro.','error');}finally{state.busy=false;}})();},{config_id:state.config.configId,response_type:'code',override_default_response_type:true,extras:{setup:{},featureType:'whatsapp_business_app_onboarding',sessionInfoVersion:'3'}});
  }
  $('connectWhatsApp').addEventListener('click',launch);
  prepare();
})();
