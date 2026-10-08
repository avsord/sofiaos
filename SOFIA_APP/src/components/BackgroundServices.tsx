import React,{useEffect} from 'react';
import type {SofiaApi} from '../lib/api';
import {preloadAgenda} from '../lib/use-agenda-month';
import {useCapsuleNotifications} from '../lib/capsule-notifications';
import {useAgendaNotifications} from '../lib/agenda-notifications';
export function BackgroundServices({api,scope,enabled,onCapsules,onAgenda}:{api:SofiaApi;scope:string;enabled:boolean|null;onCapsules:()=>void;onAgenda:(date:string,id?:string,create?:boolean)=>void}){
 useEffect(()=>{if(enabled)void api.preload(()=>preloadAgenda(api)).catch(()=>{});},[api,enabled]);
 useCapsuleNotifications(api,scope,enabled,onCapsules);
 useAgendaNotifications(api,scope,enabled,onAgenda);
 return null;
}
