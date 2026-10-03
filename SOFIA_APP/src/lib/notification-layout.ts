export type BellAnchor={x:number;y:number;width:number;height:number};
export function notificationPopoverLayout(anchor:BellAnchor,screen:{width:number;height:number},insets:{top:number;bottom:number}){
 const margin=16,width=Math.max(1,Math.min(400,screen.width-margin*2));
 const left=Math.max(margin,Math.min(screen.width-margin-width,anchor.x+anchor.width-width));
 // Start below the bell, not in the centre. Clamp only in very short/landscape windows.
 const top=Math.max(insets.top+8,Math.min(anchor.y+anchor.height+8,screen.height-insets.bottom-180));
 const height=Math.max(1,Math.min(560,screen.height-insets.bottom-top-margin));
 return {left,top,width,height};
}

/** Calendar-day groups (not elapsed 24h, which is wrong around daylight changes). */
export function noticeDateGroup(createdAt:string,now=new Date()):string {
 const date=new Date(createdAt);
 if(!Number.isFinite(date.getTime()))return 'Anteriores';
 const serial=(d:Date)=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;
 const days=serial(now)-serial(date);
 if(days<=0)return 'Hoje';
 if(days===1)return 'Ontem';
 return days<7?'Últimos 7 dias':'Anteriores';
}
