/** Vencimentos que a pessoa cadastrou manualmente; não derivados de extratos ou compras. */
import * as Notifications from 'expo-notifications';
import {manualDues,todayISO} from './finance';
import type {MoneySplit,Tx} from './finance';
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
export async function syncFinanceDueNotifications(txs: Tx[], owner: string, now = new Date(), reserve?: {split: MoneySplit; title: string}): Promise<string> {
  const epoch = ++generation, key = ownerKey(owner);
  const items = manualDues(txs, '', todayISO(now), 60)
    .filter(d => d.date >= todayISO(now)).slice(0, 64);
  const reserveItems = reserve ? reservePlanAlarms(reserve.split, reserve.title, now) : [];
  if ((items.length || reserveItems.length) && !(await ensureSystemNotificationPermission())) return 'Ative as notificações da Sofia para receber avisos de vencimento no celular.';
  await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Contas a pagar',importance:Notifications.AndroidImportance.HIGH,sound:'default'});
  const desired: Notifications.NotificationRequestInput[] = [];
  // 0.3.159: lembretes do aporte do mes - antes, no dia e, se escolhido, repetindo ate fechar.
  for (const alarm of reserveItems) {
    if (alarm.date.getTime() <= now.getTime()) continue;
    desired.push({identifier: PREFIX + key + ':plan:' + alarm.id,
      content: {title: alarm.title, body: alarm.body, sound: 'default', data: {sofiaFinancePlan: true, scope: key, signature: alarm.signature}},
      trigger: {type: Notifications.SchedulableTriggerInputTypes.DATE, date: alarm.date, channelId: CHANNEL}});
  }
  for (const due of items) {
    const [year,month,day] = due.date.split('-').map(Number);
    const receive = due.kind === 'receber', valor = 'R$ '+due.amount.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    // 0.3.151: aviso no dia (9h) e, se escolhido, alguns dias antes; tambem para contas a receber.
    const before = Math.max(0, Math.min(15, Number(due.tx?.remindDays) || 0));
    for (const offset of before ? [before, 0] : [0]) {
      const date = new Date(year,month-1,day-offset,9,0,0);
      if (date.getTime() <= now.getTime()) continue;
      const when = offset ? (offset === 1 ? 'amanhã' : 'em '+offset+' dias') : 'hoje';
      const signature=JSON.stringify([NOTIFICATION_SIGNATURE_VERSION,due.title,due.amount,due.date,offset,receive]);
      desired.push({
        identifier:PREFIX + key + ':' + due.id + (offset ? ':-' + offset : ''),
        content:{title:(receive ? 'Recebimento previsto ' : 'Conta vence ') + when + ': ' + due.title,body:'Valor: '+valor+'. Abra Finanças → Pendentes para confirmar '+(receive ? 'o recebimento.' : 'o pagamento.'),sound:'default',
          data:{sofiaFinanceDue:true,scope:key,entityId:due.tx?.entity?.id||'',signature}},
        trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date,channelId:CHANNEL}
      });
    }
  }
  try { await enqueueNotifications(()=>reconcileNotificationRequests(Notifications,PREFIX,desired,()=>epoch===generation));return ''; }
  catch(e){return notificationFailure(e);}
}

/** 0.3.159: alarmes do aporte do mes, conforme a configuracao da pessoa. */
export function reservePlanAlarms(split: MoneySplit, title: string, now = new Date()) {
  const out: {id: string; date: Date; title: string; body: string; signature: string}[] = [];
  if (!(split.planned > 0) || split.closed || split.missing <= 0) return out;
  const value = 'R$ ' + split.missing.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const [y, m] = todayISO(now).split('-').map(Number);
  const at = (day: number, time: string) => { const [h, min] = time.split(':').map(Number); return new Date(y, m - 1, day, h || 9, min || 0, 0); };
  const sig = (label: string) => JSON.stringify([NOTIFICATION_SIGNATURE_VERSION, 'plan', title, split.missing, label]);
  const before = Math.max(0, Math.min(15, split.planDay - 1, split.remindBefore));
  if (before > 0) out.push({id: 'before', date: at(split.planDay - before, split.remindTime || '09:00'),
    title: 'Aporte em ' + before + (before === 1 ? ' dia' : ' dias'), body: 'Guardar ' + value + ' no dia ' + split.planDay + '.', signature: sig('before')});
  out.push({id: 'day', date: at(split.planDay, split.remindTime || '09:00'),
    title: 'Dia de guardar ' + value, body: 'Abra Finanças e toque em “Guardar agora” para registrar o aporte.', signature: sig('day')});
  const repeat = Math.max(0, Number(split.remindRepeatDays) || 0);
  if (repeat > 0) for (let day = split.planDay + repeat, n = 0; day <= 28 && n < 5; day += repeat, n++)
    out.push({id: 'again-' + day, date: at(day, split.remindTime || '09:00'),
      title: 'Aporte em aberto', body: 'Faltam ' + value + ' para fechar o mês.', signature: sig('again-' + day)});
  return out;
}
