import type {Message} from './types';
import {mergeMessages} from './chat-model';
import {recentChatPage} from './chat-window';
/** Polls and send acknowledgements may update the window, never reopen hidden history. */
export function reconcileChatWindow(current:Message[],snapshot:{messages:Message[];has_more:boolean;deleted_ids?:string[]}):Message[]{
 if(!current.length)return reconcileMessages(current,recentChatPage(snapshot));
 const persisted=current.filter(m=>m.sequence),floor=persisted.length?Math.min(...persisted.map(m=>m.sequence!)):0;
 const known=new Set(current.map(m=>m.id));
 const overlap=snapshot.messages.findIndex(m=>known.has(m.id));
 const allowed=new Set((overlap>=0?snapshot.messages.slice(overlap):recentChatPage(snapshot).messages).map(m=>m.id));
 const next=reconcileMessages(current,snapshot).filter(m=>known.has(m.id)||(floor&&m.sequence?m.sequence>=floor:allowed.has(m.id)));
 return JSON.stringify(next)===JSON.stringify(current)?current:next;
}
/** The returned window is authoritative; tombstones also remove older loaded rows. */
export function reconcileMessages(current:Message[],snapshot:{messages:Message[];has_more:boolean;deleted_ids?:string[]}):Message[]{
 const incoming=snapshot.messages,deleted=new Set(snapshot.deleted_ids||[]);
 // A transient empty result without explicit tombstones is not a deletion.
 if(current.length&&incoming.length===0&&deleted.size===0)return current;
 const floor=snapshot.has_more&&incoming.length?Math.min(...incoming.map(m=>m.sequence||0)):0;
 const retained=current.filter(m=>!deleted.has(m.id)&&(!m.sequence||m.sequence<floor));
 const next=mergeMessages(retained,incoming.filter(m=>!deleted.has(m.id)));
 return JSON.stringify(next)===JSON.stringify(current)?current:next;
}
export function toggleMessageSelection(selected:Set<string>,id:string):Set<string>{const next=new Set(selected);if(next.has(id))next.delete(id);else if(next.size<100)next.add(id);return next;}
export function retainMessageSelection(selected:Set<string>,messages:Message[]):Set<string>{const valid=new Set(messages.map(m=>m.id));return new Set([...selected].filter(id=>valid.has(id)));}
