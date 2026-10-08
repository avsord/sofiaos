import React,{useEffect} from 'react';
import type {SofiaApi} from '../lib/api';
import {preloadAgenda} from '../lib/use-agenda-month';
import {useCapsuleNotifications} from '../lib/capsule-notifications';
import {useAgendaNotifications} from '../lib/agenda-notifications';

/** Mounted only after the launch shell has painted. */
export function BackgroundServices({api,scope,onCapsules,onAgenda}:{api:SofiaApi;scope:string;onCapsules:()=>void;onAgenda:(date:string,id?:string,create?:boolean)=>void}){
 useEffect(()=>{void api.preload(()=>preloadAgenda(api));},[api]);
 useCapsuleNotifications(api,scope,true,onCapsules);
 useAgendaNotifications(api,scope,true,onAgenda);
 return null;
}
