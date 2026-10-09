'use strict';
// Adaptador puro e testável. Nenhum endpoint público ou envio real é ativado neste pacote.
const crypto = require('node:crypto');
const { AppError } = require('../core/util');
function verifySignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof appSecret!=='string' || !appSecret || typeof signature!=='string' || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false;
  const actual=Buffer.from(signature.slice(7),'hex');
  const expected=crypto.createHmac('sha256',appSecret).update(rawBody).digest();
  return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
}
function normalizeWebhook(payload) {
  if (payload?.object!=='whatsapp_business_account') throw new AppError('WRONG_WEBHOOK','Objeto de webhook não suportado.');
  const events=[];
  for (const entry of Array.isArray(payload.entry)?payload.entry:[]) for (const change of Array.isArray(entry.changes)?entry.changes:[]) {
    if (change.field!=='messages') continue;
    const value=change.value || {};
    for (const m of Array.isArray(value.messages)?value.messages:[]) {
      if (typeof m.id!=='string' || typeof m.from!=='string') continue;
      events.push({type:m.type==='text'?'message.text':'message.unsupported',externalId:m.id,sender:m.from,channel:'whatsapp',phoneNumberId:value.metadata?.phone_number_id || null,text:m.type==='text'&&typeof m.text?.body==='string'?m.text.body:null,timestamp:m.timestamp || null});
    }
    for (const s of Array.isArray(value.statuses)?value.statuses:[]) {
      if (typeof s.id!=='string') continue;
      events.push({type:'message.status',externalId:s.id,status:s.status || 'unknown',recipient:s.recipient_id || null,timestamp:s.timestamp || null,errorCodes:(Array.isArray(s.errors)?s.errors:[]).map(e=>e.code).filter(Number.isSafeInteger)});
    }
  }
  return events;
}
function authorizeOwner(event, ownerPhone) { return Boolean(ownerPhone && event.type==='message.text' && /^\d{8,15}$/.test(ownerPhone) && event.sender===ownerPhone); }
module.exports={verifySignature,normalizeWebhook,authorizeOwner};
