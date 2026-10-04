import {useReducer} from 'react';
import type {SetStateAction} from 'react';
import {localDateKey} from './dashboard';
type CalendarView={month:Date;selected:string;targetNonce?:number};
const views=new WeakMap<object,Map<string,CalendarView>>();
/** Session-owned viewport: data reloads and screen remounts cannot reset the chosen month. */
function viewFor(owner:object,key:string){let scoped=views.get(owner);if(!scoped){scoped=new Map();views.set(owner,scoped);}let view=scoped.get(key);if(!view){const now=new Date();view={month:new Date(now.getFullYear(),now.getMonth(),1),selected:localDateKey(now)};scoped.set(key,view);}return view;}
export function useAgendaView(owner:object,key:string){
 const view=viewFor(owner,key),[,render]=useReducer(n=>n+1,0);
 const setMonth=(next:SetStateAction<Date>)=>{view.month=typeof next==='function'?next(view.month):next;render();};
 const setSelected=(next:string)=>{view.selected=next;render();};
 const acceptTarget=(date:string,nonce:number)=>{if(view.targetNonce===nonce)return false;const value=new Date(date+'T12:00:00');if(!Number.isFinite(value.getTime()))return false;view.targetNonce=nonce;view.selected=date;view.month=new Date(value.getFullYear(),value.getMonth(),1);render();return true;};
 return {month:view.month,selected:view.selected,setMonth,setSelected,acceptTarget};
}
