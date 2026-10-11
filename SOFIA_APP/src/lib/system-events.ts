const listeners=new Set<(owner:object)=>void>();

/** One successful Sofia response may have created or changed records through tools. */
export function systemChanged(owner:object){listeners.forEach(listener=>listener(owner));}
export function subscribeSystemChanged(listener:(owner:object)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
