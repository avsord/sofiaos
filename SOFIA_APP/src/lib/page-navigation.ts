import type {Entity} from './types';
export function pageBackTarget(pages:ReadonlyMap<string,Entity>,id:string|null):string|null{
 const parent=id?String(pages.get(id)?.data?.parent_id||''):'';
 return parent&&parent!==id&&pages.has(parent)?parent:null;
}
/** Edge navigation must not steal horizontal board scrolling or text selection. */
export function shouldBeginPageBack(g:{x0:number;dx:number;dy:number},paneWidth:number,screenWidth:number,editing:boolean,interacting:boolean):boolean{
 const left=Math.max(0,(screenWidth-paneWidth)/2);
 return !editing&&!interacting&&g.x0>=left&&g.x0<=left+28&&g.dx>8&&Math.abs(g.dx)>Math.abs(g.dy)*1.15;
}
