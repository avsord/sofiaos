import type {Entity} from './types';
const PREFIX='sofia-property-v1:';
export const isProperty=(tag:string)=>tag.startsWith(PREFIX);
export function propertyOf(record:Partial<Entity>){return (record.tags||[]).find(isProperty)?.slice(PREFIX.length)||'';}
export function propertyTags(tags:string[],value:string){return [...tags.filter(t=>!isProperty(t)),...(value.trim()?[PREFIX+value.trim().slice(0,60-PREFIX.length)]:[])];}
export function organizationOptions(records:Entity[],field:'area'|'property'){return [...new Set(records.map(r=>field==='area'?r.area:propertyOf(r)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
