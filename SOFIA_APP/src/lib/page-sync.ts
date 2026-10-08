import type {Entity} from './types';
export function mergeRemotePages(current:readonly Entity[],remote:readonly Entity[],pending:(id:string)=>boolean):Entity[]{
 const old=new Map(current.map(p=>[p.id,p]));
 const ids=new Set(remote.map(p=>p.id));
 const result=remote.map(p=>{const local=old.get(p.id);return local&&(pending(p.id)||local.revision>p.revision)?local:p;});
 for(const page of current)if(!ids.has(page.id)&&pending(page.id))result.push(page);
 return result;
}
