const listeners=new Set<(owner:object)=>void>();
export function agendaChanged(owner:object){listeners.forEach(f=>f(owner));}
export function subscribeAgenda(f:(owner:object)=>void){listeners.add(f);return()=>{listeners.delete(f);};}
