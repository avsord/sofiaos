'use strict';
(()=>{
  const input=document.getElementById('loginPassword')||document.getElementById('newPassword');
  const confirm=document.getElementById('confirmPassword');
  const toggle=document.getElementById('togglePassword');
  const caps=document.getElementById('capsWarning');
  const form=document.getElementById('loginForm')||document.getElementById('resetPasswordForm');
  const submit=document.getElementById('loginSubmit')||form?.querySelector('button[type="submit"]');
  if(!input||!form)return;
  toggle?.addEventListener('click',()=>{
    const showing=input.type==='text';
    input.type=showing?'password':'text';
    if(confirm)confirm.type=input.type;
    toggle.textContent=showing?'Mostrar':'Ocultar';
    toggle.setAttribute('aria-label',showing?'Mostrar senha':'Ocultar senha');
    input.focus();
  });
  const updateCaps=event=>{if(!caps||typeof event.getModifierState!=='function')return;caps.hidden=!event.getModifierState('CapsLock');};
  for(const field of [input,confirm].filter(Boolean)){field.addEventListener('keydown',updateCaps);field.addEventListener('keyup',updateCaps);field.addEventListener('blur',()=>{if(caps)caps.hidden=true;});}
  if(confirm){const validate=()=>confirm.setCustomValidity(confirm.value&&confirm.value!==input.value?'As duas senhas precisam ser iguais.':'');input.addEventListener('input',validate);confirm.addEventListener('input',validate);}
  form.addEventListener('submit',()=>{if(submit){submit.disabled=true;submit.textContent=form.id==='loginForm'?'Entrando…':'Redefinindo…';}});
})();
