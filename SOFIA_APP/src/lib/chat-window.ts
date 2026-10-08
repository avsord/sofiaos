import type {Message} from './types';
export const CHAT_PAGE_SIZE=20;
type Page={messages:Message[];has_more:boolean};
/** Keep the archive intact; only the visible/launch window is shortened. */
export function recentChatPage<T extends Page>(page:T):T{
 return {...page,messages:page.messages.slice(-CHAT_PAGE_SIZE),has_more:page.has_more||page.messages.length>CHAT_PAGE_SIZE};
}
/** Read a previous local batch before requesting older records from the server. */
export function olderChatPage(page:Page|undefined,oldest:Message):Page|null{
 if(!page)return null;
 const index=page.messages.findIndex(m=>m.id===oldest.id);
 const prior=index>=0?page.messages.slice(0,index):oldest.sequence?page.messages.filter(m=>m.sequence&&m.sequence<oldest.sequence!):[];
 if(!prior.length)return index>=0&&!page.has_more?{messages:[],has_more:false}:null;
 return recentChatPage({...page,messages:prior});
}
/** One batch per deliberate scroll; layout/polling alone must not drain history. */
export class ChatHistoryGesture{
 private armed=false;
 begin(){this.armed=true;}
 reset(){this.armed=false;}
 consume(){const allowed=this.armed;this.armed=false;return allowed;}
}
