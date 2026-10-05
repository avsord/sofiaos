'use strict';
function requestedPriority(text){const s=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const m=s.match(/\b(?:prioridade|nivel(?: de prioridade)?)\s*(?:e |eh |:|=|de |como |para )?\s*(sem prioridade|nenhuma|sem|baixa|leve|media|normal|alta|importante|urgente)\b/);if(!m)return null;return ({sem:'none','sem prioridade':'none',nenhuma:'none',baixa:'light',leve:'light',media:'medium',normal:'medium',alta:'important',importante:'important',urgente:'important'})[m[1]];}
module.exports={requestedPriority};
