'use strict';
(()=>{
  const input=document.getElementById('loginPassword');
  const toggle=document.getElementById('togglePassword');
  const caps=document.getElementById('capsWarning');
  const form=document.getElementById('loginForm');
  const submit=document.getElementById('loginSubmit');
  if(!input||!form)return;
  toggle?.addEventListener('click',()=>{
    const showing=input.type==='text';
    input.type=showing?'password':'text';
    toggle.textContent=showing?'Mostrar':'Ocultar';
    toggle.setAttribute('aria-label',showing?'Mostrar senha':'Ocultar senha');
    input.focus();
  });
  const updateCaps=event=>{if(!caps||typeof event.getModifierState!=='function')return;caps.hidden=!event.getModifierState('CapsLock');};
  input.addEventListener('keydown',updateCaps);
  input.addEventListener('keyup',updateCaps);
  input.addEventListener('blur',()=>{if(caps)caps.hidden=true;});
  form.addEventListener('submit',()=>{if(submit){submit.disabled=true;submit.textContent='Entrando…';}});
})();
