import type {Entity} from './types';

export function pageParentId(page:Entity):string {
  return String(page.data?.parent_id||'');
}

export function canReparentPage(pages:readonly Entity[],pageId:string,parentId:string):boolean {
  if(!pageId)return false;
  if(!parentId)return true;
  if(pageId===parentId)return false;
  const byId=new Map(pages.map(page=>[page.id,page]));
  let current=byId.get(parentId),depth=0;
  const seen=new Set<string>();
  while(current&&depth++<80){
    if(current.id===pageId)return false;
    if(seen.has(current.id))return false;
    seen.add(current.id);
    const next=pageParentId(current);
    if(!next)return true;
    current=byId.get(next);
  }
  return !current;
}

export function reparentedPage(page:Entity,parentId:string):Entity {
  return {...page,data:{...page.data,parent_id:parentId,node_type:parentId?'page':'space'}};
}

export function reparentPatch(page:Entity,parentId:string):Partial<Entity> {
  return {id:page.id,revision:page.revision,data:{...page.data,parent_id:parentId,node_type:parentId?'page':'space'}};
}
