export type KanbanRow={id:string;values:Record<string,any>;page_content?:string};
export type ColumnRect={value:string;x:number;width:number};
export function columnAt(columns:readonly ColumnRect[],x:number):string|null{
 if(!Number.isFinite(x)||!columns.length)return null;
 const hit=columns.find(c=>x>=c.x&&x<=c.x+c.width);if(hit)return hit.value;
 return columns.reduce((a,b)=>Math.abs(a.x+a.width/2-x)<Math.abs(b.x+b.width/2-x)?a:b).value;
}
export function edgeSpeed(pointerX:number,width:number){const edge=Math.min(56,width/5);if(width<=0)return 0;if(pointerX<edge)return -Math.min(14,Math.max(0,(edge-pointerX)/edge)*14);if(pointerX>width-edge)return Math.min(14,Math.max(0,(pointerX-width+edge)/edge)*14);return 0;}
/** Move by measured target, not by a hard-coded column-width/drag-distance guess. */
export function moveKanbanRow<T extends KanbanRow>(rows:readonly T[],id:string,key:string,column:string,beforeId?:string):T[]{
 const row=rows.find(r=>r.id===id);if(!row)return [...rows];
 const moved={...row,values:{...row.values,[key]:column}},next=rows.filter(r=>r.id!==id);
 const before=beforeId?next.findIndex(r=>r.id===beforeId&&String(r.values[key]||'')===column):-1;
 let insertion=before;if(insertion<0){const last=next.reduce((n,r,i)=>String(r.values[key]||'')===column?i:n,-1);insertion=last<0?next.length:last+1;}
 next.splice(insertion,0,moved);return next;
}
