import type {DriveSummary} from './api';
// 0.3.244: textos da tela Arquivos da Sofia (separados para teste).
/** Tamanho como o Drive mostra: 1,5 KB · 5 MB · 4,2 GB · 200 GB (sem ",0" no fim). */
export const fileSize=(b:number)=>{b=Number(b)||0;const one=(v:number,u:string)=>(v>=100?Math.round(v).toString():v.toFixed(1).replace(/\.0$/,'').replace('.',','))+' '+u;if(b<1024)return b+' B';if(b<1048576)return one(b/1024,'KB');if(b<1073741824)return one(b/1048576,'MB');if(b<1099511627776)return one(b/1073741824,'GB');return one(b/1099511627776,'TB');};
export const shortDate=(iso:string)=>{if(!iso)return '';const d=new Date(iso);return isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});};
/** Texto do aviso do topo (reconectar, migração em andamento, arquivos que ficaram, área apagada). */
export function filesNotice(s:Pick<DriveSummary,'needs_reconnect'|'migration'|'wiped_at'>):{text:string;tone:'info'|'danger'}|null{
 if(s.needs_reconnect)return {text:'Seus arquivos ainda estão na pasta visível "Sofia OS" do Drive. Toque em Reconectar em Perfil → Conta Google para levá-los à área oculta.',tone:'info'};
 if(s.migration?.state==='running')return {text:'Levando seus arquivos da pasta antiga para a área oculta: '+(s.migration.moved||0)+' já foram. Pode usar normalmente enquanto isso.',tone:'info'};
 if(s.migration?.left)return {text:s.migration.left+(s.migration.left===1?' arquivo não pôde ser levado e continua':' arquivos não puderam ser levados e continuam')+' na pasta "Sofia OS" do Drive.',tone:'danger'};
 if(s.wiped_at)return {text:'Os dados ocultos da Sofia foram apagados nas configurações do Drive. Páginas e backup foram enviados de novo.',tone:'danger'};
 return null;
}

export type StoragePart={key:'sofia'|'drive'|'mail'|'trash';label:string;bytes:number};
/** Divide o espaço usado como o Drive: Sofia, o resto do Drive, a lixeira do Drive e Gmail + Fotos. */
export function storageParts(q:{limit:number;usage:number;usage_in_drive:number;usage_in_trash:number},sofia:number):{parts:StoragePart[];used:number;total:number;free:number|null;percent:number}{
 const used=Math.max(0,q.usage||0),inDrive=Math.min(used,Math.max(0,q.usage_in_drive||0)),trash=Math.min(inDrive,Math.max(0,q.usage_in_trash||0)),mine=Math.min(Math.max(0,sofia||0),Math.max(0,inDrive-trash));
 const parts:StoragePart[]=[{key:'sofia',label:'Sofia',bytes:mine},{key:'drive',label:'Outros arquivos do Drive',bytes:Math.max(0,inDrive-trash-mine)},{key:'mail',label:'Gmail e Google Fotos',bytes:Math.max(0,used-inDrive)},{key:'trash',label:'Lixeira do Drive',bytes:trash}];
 const total=Math.max(0,q.limit||0);
 return {parts,used,total,free:total?Math.max(0,total-used):null,percent:total?Math.min(100,used/total*100):0};
}
