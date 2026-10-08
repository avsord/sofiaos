import type {Appearance,Prefs} from './types';
export const validThemeTime=(value:unknown):value is string=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function themeTimes(p:Pick<Prefs,'lightAt'|'darkAt'>){return {lightAt:validThemeTime(p.lightAt)?p.lightAt:'05:00',darkAt:validThemeTime(p.darkAt)?p.darkAt:'19:00'};}
export function themeAppearance(p:Prefs,system:string|null|undefined,now=new Date()):'light'|'dark'{
 if(p.appearance==='light'||p.appearance==='dark')return p.appearance;
 if(p.appearance==='system')return system==='dark'?'dark':'light';
 const {lightAt,darkAt}=themeTimes(p),minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3)),light=minutes(lightAt),dark=minutes(darkAt),time=now.getHours()*60+now.getMinutes();
 return (light<dark?time>=light&&time<dark:time>=light||time<dark)?'light':'dark';
}
