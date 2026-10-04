import type {Entity} from './types';
import {libraryTags,libraryRating} from './library-filters';
export const AREA_TAG='sofia-library-area-v1',MEMBER_TAG='sofia-library-in-v1:',AREA_PREFIX='@library-area:';
export type LibraryField={id:string;label:string};
export type LibraryArea={record:Entity;fields:LibraryField[]};
export const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export const isAreaRecord=(record:Partial<Entity>)=>record.kind==='asset'&&!!record.tags?.includes(AREA_TAG);
export function memberArea(record:Partial<Entity>):string {return record.kind==='asset'?(record.tags||[]).find(t=>t.startsWith(MEMBER_TAG))?.slice(MEMBER_TAG.length)||'':'';}
const metadata=(record:Partial<Entity>)=>{try{const data=JSON.parse(record.data?.description||'');return data?.version===1?data:null;}catch{return null;}};
export function readArea(record:Entity):LibraryArea|null {if(!isAreaRecord(record))return null;const data=metadata(record);if(!Array.isArray(data?.fields)||data.fields.length>6||data.fields.some((f:any)=>!f||typeof f.id!=='string'||typeof f.label!=='string'))return null;return {record,fields:data.fields};}
export function suggestedFields(name:string):string[]{const value=normalized(name);if(/fotograf|pintur|pintor|artista|escultur/.test(value))return ['Estilo','Técnica','País'];if(/lugar|viage|restaurante/.test(value))return ['Cidade','Categoria','Faixa de preço'];if(/jogo|game/.test(value))return ['Gênero','Plataforma'];if(/curso|estudo/.test(value))return ['Assunto','Nível'];return ['Categoria','Tema'];}
export function areaPayload(title:string,content:string,fields:LibraryField[],old?:Entity):Partial<Entity>{
 if(!title.trim()||title.trim().length>80)throw Error('Dê um nome à área com até 80 caracteres.');
 if(fields.length>6)throw Error('Use até 6 campos de filtro por área.');
 const names=new Set<string>(),ids=new Set<string>();
 for(const field of fields){const name=normalized(field.label);if(!name||field.label.trim().length>40||names.has(name)||!field.id||ids.has(field.id))throw Error('Use nomes diferentes de até 40 caracteres para os filtros.');names.add(name);ids.add(field.id);}
 return {...old,kind:'asset',title:title.trim(),content,privacy:old?.privacy||'private',area:old?.area||'Pessoal',state:old?.state||'saved',tags:[...new Set([...(old?.tags||[]),AREA_TAG])],data:{...old?.data,type:'other',description:JSON.stringify({version:1,fields:fields.map(f=>({...f,label:f.label.trim()}))})}};
}
export function customValues(record:Partial<Entity>):Record<string,string>{const values=metadata(record)?.values;return values&&typeof values==='object'&&!Array.isArray(values)?Object.fromEntries(Object.entries(values).filter((entry):entry is [string,string]=>typeof entry[1]==='string')):{};}
export function customPayload(area:LibraryArea,item:Partial<Entity>,title:string,content:string,url:string,rating:number,values:Record<string,string>):Partial<Entity>{
 if(!title.trim())throw Error('Preencha o nome do registro.');
 for(const field of area.fields)if((values[field.id]||'').length>300)throw Error(field.label+': use até 300 caracteres.');
 if(url.trim()){let link:URL;try{link=new URL(url.trim());}catch{throw Error('Informe um link completo http(s).');}if(!['https:','http:'].includes(link.protocol)||link.username||link.password)throw Error('Informe um link http(s) sem senha.');}
 const tag=MEMBER_TAG+area.record.id;if(tag.length>60)throw Error('Não foi possível vincular esta área.');
 return {...item,kind:'asset',title:title.trim(),content,privacy:item.privacy||area.record.privacy||'private',area:item.area||area.record.area||'Pessoal',state:item.state||'saved',tags:libraryTags([...(item.tags||[]).filter(t=>!t.startsWith(MEMBER_TAG)&&t!==AREA_TAG),tag],rating),data:{...item.data,type:'reference',url:url.trim(),description:JSON.stringify({version:1,values})}};
}
function valuesFor(record:Entity,field:string){return (customValues(record)[field]||'').split(/[,;|]/).map(s=>s.trim()).filter(Boolean);}
export function customFacets(records:Entity[],fields:LibraryField[]){return fields.map(field=>({...field,options:[...new Map(records.flatMap(record=>valuesFor(record,field.id).map(label=>[normalized(label),label] as const))).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([value,label])=>({value,label}))})).filter(field=>field.options.length);}
export function filterCustom(records:Entity[],areaId:string,stars:string,filters:Record<string,string>,query='') {const search=normalized(query);return records.filter(record=>memberArea(record)===areaId&&(stars==='all'||libraryRating(record)===Number(stars))&&Object.entries(filters).every(([field,value])=>!value||valuesFor(record,field).some(v=>normalized(v)===value))&&(!search||normalized(record.title+' '+record.content+' '+Object.values(customValues(record)).join(' ')).includes(search)));}
