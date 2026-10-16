/** Vencimentos que a pessoa cadastrou manualmente; não derivados de extratos ou compras. */
import * as Notifications from 'expo-notifications';
import {manualDues,todayISO} from './finance';
import type {Tx} from './finance';
import {ensureSystemNotificationPermission} from './system-notification-permission';
import {enqueueNotifications,reconcileNotificationRequests,notificationFailure,NOTIFICATION_SIGNATURE_VERSION} from './notification-scheduler';

const CHANNEL = 'sofia-pendencias';
const PREFIX = 'sofia-pendencias:';
let generation = 0;
function ownerKey(scope: string): string {
  let hash = 2166136261;
  for (const x of scope) hash = Math.imul(hash ^ x.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
/** O Android conserva os alarmes locais mesmo com o aplicativo fechado.
 * Reconciliamos apenas notificações da Sofia, com prazo de 60 dias. */
export async function syncFinanceDueNotifications(txs: Tx[], owner: string, now = new Date()): Promise<string> {
  const epoch = ++generation, key = ownerKey(owner);
  const items = manualDues(txs, '', todayISO(now), 60)
    .filter(d => d.date >= todayISO(now)).slice(0, 64);
  if (items.length && !(await ensureSystemNotificationPermission())) return 'Ative as notificações da Sofia para receber avisos de vencimento no celular.';
  await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Contas a pagar',importance:Notifications.AndroidImportance.HIGH,sound:'default'});
  const desired: Notifications.NotificationRequestInput[] = [];
  for (const due of items) {
    const [year,month,day] = due.date.split('-').map(Number);
    const date = new Date(year,month-1,day,9,0,0);
    if (date.getTime() <= now.getTime()) continue;
    const signature=JSON.stringify([NOTIFICATION_SIGNATURE_VERSION,due.title,due.amount,due.date]);
    desired.push({
      identifier:PREFIX + key + ':' + due.id,
      content:{title:'Conta vence hoje: '+due.title,body:'Valor: R$ '+due.amount.toFixed(2).replace('.',',')+'. Abra Finanças → Pendentes para confirmar o pagamento.',sound:'default',
        data:{sofiaFinanceDue:true,scope:key,entityId:due.tx?.entity?.id||'',signature}},
      trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date,channelId:CHANNEL}
    });
  }
  try { await enqueueNotifications(()=>reconcileNotificationRequests(Notifications,PREFIX + key + ':',desired,()=>epoch===generation));return ''; }
  catch(e){return notificationFailure(e);}
}
