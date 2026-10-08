import type {ChatSnapshot,Conversation,MessagePage} from './types';
type HistoryIndex={items:Conversation[];has_more:boolean;next_offset?:number};
type ChatReader={
 current:()=>Promise<ChatSnapshot>;
 index:(offset:number)=>Promise<HistoryIndex>;
 history:(id:string)=>Promise<MessagePage|ChatSnapshot>;
 select:(id:string,revision:number)=>Promise<ChatSnapshot>;
};
const personal=(c:Conversation)=>['web','mobile'].includes(c.channel);
const sameCursor=(a:ChatSnapshot,b:ChatSnapshot)=>a.current_id===b.current_id&&a.cursor_revision===b.cursor_revision;
/** Opening is a read. It never creates a replacement conversation. A legacy
 * empty cursor can be repaired to an existing, authorized personal thread; its
 * messages are never copied into another thread. Explicit deletions are final. */
export async function openExistingChat(reader:ChatReader,saved?:ChatSnapshot):Promise<ChatSnapshot>{
 const initial=await reader.current();
 if(initial.messages.length||initial.deleted_ids?.length)return initial;
 const seen=new Set<string>(),deleted=new Set(initial.deleted_conversation_ids||[]);
 const tryThread=async(c:Conversation):Promise<ChatSnapshot|null>=>{
  if(!personal(c)||deleted.has(c.id)||seen.has(c.id))return null;seen.add(c.id);
  if('message_count' in c&&Number(c.message_count)===0)return null;
  let page:MessagePage|ChatSnapshot;
  try{page=await reader.history(c.id);}catch(e){if((e as {status?:number}).status===404)return null;throw e;}
  if(!page.messages.length){if('deleted_ids' in page&&page.deleted_ids?.length)deleted.add(c.id);return null;}
  // A web/app selection or new reply during recovery wins over the old request.
  const latest=await reader.current();
  if(!sameCursor(initial,latest)||latest.messages.length||latest.deleted_ids?.length)return latest;
  try{return await reader.select(c.id,latest.cursor_revision);}
  catch(e){if((e as {status?:number}).status===409)return reader.current();throw e;}
 };
 if(saved?.conversation&&personal(saved.conversation)){
  const restored=await tryThread(saved.conversation);if(restored)return restored;
 }
 let offset=0;
 // A bounded repair pass; ordinary startup returns after its single current read.
 // The complete paginated history remains available in the History screen.
 for(let pageNumber=0;pageNumber<20;pageNumber++){
  const index=await reader.index(offset);
  for(const c of index.items){const restored=await tryThread(c);if(restored)return restored;}
  if(!index.has_more)break;
  const next=index.next_offset??offset+index.items.length;if(next<=offset)break;offset=next;
 }
 // A missing remote thread is not evidence of deletion. Preserve the retained
 // copy visibly as unsynchronized; never re-upload it into a replacement thread.
 if(saved?.conversation&&saved.messages.length&&!deleted.has(saved.conversation.id))return {...saved,recovery_pending:true};
 return initial;
}
