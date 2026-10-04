export function dateDisplay(value:string,dateOnly=false):string{
 if(!value)return '';const d=new Date(value.length===10?value+'T12:00:00':value);
 if(!Number.isFinite(d.getTime()))return '';
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`+(dateOnly?'':` ${pad(d.getHours())}:${pad(d.getMinutes())}`);
}
export function intervalValid(start?:string,end?:string){return !start||!end||Date.parse(end)>=Date.parse(start);}
