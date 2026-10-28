import {useEffect} from 'react';
import {useNotifications} from './NotificationCenter';
/** 0.3.263 (site): numero de avisos nao lidos no titulo da aba do navegador, ex.: "(3) Financas · Sofia".
 * Fica dentro do centro de notificacoes (e ali que a contagem existe) e so roda no site. */
export function UnreadTitle(){
 const {unread}=useNotifications();
 useEffect(()=>{if(typeof document==='undefined')return;
  const apply=()=>{const base=document.title.replace(/^\(\d+\) /,'');const next=(unread>0?'('+Math.min(unread,99)+') ':'')+base;if(document.title!==next)document.title=next;};
  apply();const id=setInterval(apply,1000);return()=>clearInterval(id);
 },[unread]);
 return null;
}
