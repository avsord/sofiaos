import type {DriveSummary} from './api';
// 0.3.244: textos da tela Arquivos da Sofia (separados para teste).
export const fileSize=(b:number)=>{b=Number(b)||0;if(b<1024)return b+' B';if(b<1048576)return (b/1024).toFixed(b<10240?1:0).replace('.',',')+' KB';if(b<1073741824)return (b/1048576).toFixed(1).replace('.',',')+' MB';return (b/1073741824).toFixed(1).replace('.',',')+' GB';};
export const shortDate=(iso:string)=>{if(!iso)return '';const d=new Date(iso);return isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});};
/** Texto do aviso do topo (reconectar, migração em andamento, arquivos que ficaram, área apagada). */
export function filesNotice(s:Pick<DriveSummary,'needs_reconnect'|'migration'|'wiped_at'>):{text:string;tone:'info'|'danger'}|null{
 if(s.needs_reconnect)return {text:'Seus arquivos ainda estão na pasta visível "Sofia OS" do Drive. Toque em Reconectar em Perfil → Conta Google para levá-los à área oculta.',tone:'info'};
 if(s.migration?.state==='running')return {text:'Levando seus arquivos da pasta antiga para a área oculta: '+(s.migration.moved||0)+' já foram. Pode usar normalmente enquanto isso.',tone:'info'};
 if(s.migration?.left)return {text:s.migration.left+(s.migration.left===1?' arquivo não pôde ser levado e continua':' arquivos não puderam ser levados e continuam')+' na pasta "Sofia OS" do Drive.',tone:'danger'};
 if(s.wiped_at)return {text:'Os dados ocultos da Sofia foram apagados nas configurações do Drive. Páginas e backup foram enviados de novo.',tone:'danger'};
 return null;
}
