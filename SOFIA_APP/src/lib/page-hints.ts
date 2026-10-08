import type {PageBlock} from './page-editor';

/** Only an untouched, plain-text body receives the initial writing hint. */
export function pageBodyIsEmpty(blocks:readonly PageBlock[]):boolean {
  return blocks.every(b=>b.type==='text' && !String(b.text||'').trim()
    && !String(b.html||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').trim());
}
export function pageBlockHint(block:PageBlock,index:number,emptyBody:boolean,focused:boolean):string {
  if(String(block.text||'').trim())return '';
  if(index===0 && emptyBody)return 'Escreva algo…';
  return focused?'Digite / para opções':'';
}

export function pageTitleHint(emptyBody:boolean,hasChildren:boolean,focused:boolean):string {
  return focused||(emptyBody&&!hasChildren)?'Título':'';
}
