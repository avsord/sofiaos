import type {Entity} from './types';
import {normalizeLibraryTag as norm} from './library-filters';
import type {TagOption} from './library-tags';
/** 0.3.255: categorias das Notas. Nao ha categorias prontas: a pessoa cria ao escrever ("ideia") e, nas proximas notas,
 * ela aparece para tocar. Uma nota pode ter varias. Ficam nas etiquetas do registro com o prefixo "cat:".
 * Notas antigas do tipo Ideia ou Licao (sem categoria) aparecem com essa categoria, para nada se perder. */
export const NOTE_CAT_PREFIX='cat:';
const LEGACY:Record<string,string>={idea:'Ideia',lesson_learned:'Lição'};
const clean=(v:string)=>String(v||'').trim().replace(/\s+/g,' ').slice(0,56);
export function noteCategories(e:Partial<Entity>):string[]{
 const own=(e.tags||[]).filter(t=>t.startsWith(NOTE_CAT_PREFIX)).map(t=>clean(t.slice(NOTE_CAT_PREFIX.length))).filter(Boolean);
 if(own.length){const seen=new Map<string,string>();for(const c of own)if(!seen.has(norm(c)))seen.set(norm(c),c);return [...seen.values()];}
 return LEGACY[e.kind||'']?[LEGACY[e.kind||'']]:[];
}
/** Troca as categorias da nota mantendo as outras etiquetas (o servidor aceita ate 20). */
export function withNoteCategories(tags:string[]|undefined,cats:string[]):string[]{
 const other=(tags||[]).filter(t=>!t.startsWith(NOTE_CAT_PREFIX));
 const seen=new Map<string,string>();for(const c of cats.map(clean).filter(Boolean))if(!seen.has(norm(c)))seen.set(norm(c),c);const unique=[...seen.values()]; // a primeira grafia vence
 return [...other,...unique.map(c=>NOTE_CAT_PREFIX+c)].slice(0,20);
}
export function noteCategoryOptions(records:Partial<Entity>[]):TagOption[]{
 const map=new Map<string,TagOption>();
 for(const r of records)for(const label of noteCategories(r)){const k=norm(label),o=map.get(k);if(o)o.count++;else map.set(k,{label,count:1});}
 return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'));
}
export const hasNoteCategory=(e:Partial<Entity>,cat:string)=>!cat||noteCategories(e).some(c=>norm(c)===norm(cat));
/** 0.3.255: Biblioteca sem a lista pronta de tipos - ficam so Filmes, Livros e Receitas; o resto a pessoa cria (areas). */
export const LIBRARY_BASE_KINDS=['film','reading','recipe'];
