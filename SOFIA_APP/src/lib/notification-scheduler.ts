/** Agenda and Capsules share Android's per-app alarm quota and mutation queue. */
export const NOTIFICATION_CHANNEL_LIMIT=128;
export const NOTIFICATION_SIGNATURE_VERSION='scheduler-042';
const failedIdentifiers=new Set<string>();
let pending:Promise<unknown>=Promise.resolve();
export function enqueueNotifications<T>(task:()=>Promise<T>):Promise<T>{const next=pending.catch(()=>{}).then(task);pending=next;return next;}
type Request={identifier:string;content:{data?:Record<string,unknown>}};
type Adapter={getAllScheduledNotificationsAsync:()=>Promise<Request[]>;cancelScheduledNotificationAsync:(id:string)=>Promise<unknown>;scheduleNotificationAsync:(request:any)=>Promise<string>};
export async function reconcileNotificationRequests(adapter:Adapter,prefix:string,desired:any[],active=()=>true){
 const previous=await adapter.getAllScheduledNotificationsAsync(),own=previous.filter(n=>n.identifier.startsWith(prefix));
 const available=Math.max(0,Math.min(NOTIFICATION_CHANNEL_LIMIT,384-previous.filter(n=>!n.identifier.startsWith(prefix)).length));
 const candidate=desired.slice(0,available),plan=candidate.filter(n=>!n.content.data?.early||candidate.some(d=>!d.content.data?.early&&d.content.data?.planId===n.content.data?.planId&&d.content.data?.day===n.content.data?.day&&d.content.data?.time===n.content.data?.time)),wanted=new Set(plan.map(n=>n.identifier));
 // Retire obsolete alarms first: editing a full schedule must not temporarily double it.
 for(const old of own){if(!active())return;if(!wanted.has(old.identifier))await adapter.cancelScheduledNotificationAsync(old.identifier);}
 for(const request of plan){if(!active())return;const old=own.find(n=>n.identifier===request.identifier);if(!failedIdentifiers.has(request.identifier)&&old?.content.data?.signature===request.content.data?.signature)continue;
  // Expo persists a request before installing its Android alarm. Remove failed writes.
  if(old)await adapter.cancelScheduledNotificationAsync(request.identifier);
  try{await adapter.scheduleNotificationAsync(request);failedIdentifiers.delete(request.identifier);}catch(error){failedIdentifiers.add(request.identifier);await adapter.cancelScheduledNotificationAsync(request.identifier).catch(()=>{});throw error;}
 }
 return plan.length;
}
export function notificationFailure(error:unknown){const text=error instanceof Error?error.message:String(error);return /maximum|too many|limit|500/i.test(text)?'O Android atingiu o limite de alarmes deste app. Toque em Tentar novamente para reorganizar os próximos avisos.':/permission|denied|security/i.test(text)?'O Android bloqueou os lembretes. Confira as permissões de notificações e alarmes da Sofia e tente novamente.':'Falha ao programar os lembretes: '+text.slice(0,180)+'. Tente novamente.';}
