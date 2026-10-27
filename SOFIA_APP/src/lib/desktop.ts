// 0.3.250: layout de computador (estilo Notion). No navegador com tela larga o app troca a barra de abas de baixo
// por uma barra lateral fixa + barra de cima, e o conteudo ocupa a largura da tela. No celular nada muda:
// tudo aqui so liga com Platform.OS==='web' e largura >= DESKTOP_MIN.
import {createContext,useEffect,useState,useSyncExternalStore} from 'react';
import {Dimensions,Platform,useWindowDimensions} from 'react-native';
import type {Entity,Tab} from './types';
import type {IconName} from '../components/Icon';

export const DESKTOP_MIN=1024;
export const SIDEBAR_WIDTH=256,SIDEBAR_COLLAPSED=60;
export function isDesktopWidth(width:number):boolean{return Platform.OS==='web'&&Number.isFinite(width)&&width>=DESKTOP_MIN;}
export function useDesktop():boolean{const {width}=useWindowDimensions();return isDesktopWidth(width);}

/** Largura maxima do conteudo por aba: so onde a leitura pede (texto de Paginas, Conversa). O resto e fluido. */
export function contentMaxWidth(tab:Tab):number|undefined{
 // 0.3.251: Paginas ocupa a tela (capa e barra na largura toda; o texto se centraliza no proprio editor).
 // Apps: formularios e listas dos apps nao se esticam por 1900 px.
 if(tab==='chat')return 900;
 if(tab==='profile')return 860;
 if(tab==='apps')return 1240;
 return undefined;
}
/** Colunas do painel do Inicio pela largura disponivel do conteudo. */
export function dashboardColumns(width:number):number{return width>=1500?3:width>=880?2:1;}
/** Colunas da grade de Apps pela largura. */
export function gridColumns(width:number):number{if(Platform.OS!=='web')return 2;return Math.max(2,Math.min(6,Math.floor((width+12)/232)));}

// Atalhos de apps na barra lateral e na busca (Ctrl+K). Lista propria: importar a tela Apps aqui
// carregaria a tela inteira na abertura do celular.
export const APP_SHORTCUTS:{id:string;title:string;icon:IconName}[]=[
 {id:'tasks',title:'Tarefas',icon:'checklist'},
 {id:'finance',title:'Finanças',icon:'wallet'},
 {id:'monitor',title:'Price Tracker',icon:'tag'},
 {id:'mail',title:'E-mails',icon:'mail'},
 {id:'capsules',title:'Cápsulas',icon:'capsule'},
 {id:'reminders',title:'Lembretes',icon:'bell'},
 {id:'packages',title:'Encomendas',icon:'box'},
 {id:'lists',title:'Listas',icon:'cart'},
 {id:'library',title:'Biblioteca',icon:'book'},
 {id:'knowledge',title:'Notas',icon:'edit'},
];

/** Loja minima (sem dependencias) para a barra lateral e a de cima lerem o que as telas publicam. */
function store<T>(initial:T){
 let value=initial;const subs=new Set<()=>void>();
 return {
  get:()=>value,
  set(next:T){if(Object.is(next,value))return;value=next;subs.forEach(f=>f());},
  subscribe(f:()=>void){subs.add(f);return()=>{subs.delete(f);};},
 };
}
/** Paginas atuais (Paginas publica a lista que mostra; a barra lateral desenha a arvore). */
export const pagesDirectory=store<Entity[]|null>(null);
/** Caminho da pagina aberta (para o breadcrumb da barra de cima). */
export const pagePath=store<{id:string;title:string}[]>([]);
/** Modulo aberto em Apps (para o breadcrumb). */
export const appModuleTitle=store<string>('');
export function useStore<T>(s:{get:()=>T;subscribe:(f:()=>void)=>()=>void}):T{return useSyncExternalStore(s.subscribe,s.get,s.get);}
export function samePages(a:Entity[]|null,b:Entity[]):boolean{
 if(!a||a.length!==b.length)return false;
 for(let i=0;i<a.length;i++){const x=a[i],y=b[i];if(x.id!==y.id||x.title!==y.title||x.data?.parent_id!==y.data?.parent_id||x.data?.icon!==y.data?.icon||x.data?.sort_order!==y.data?.sort_order)return false;}
 return true;
}

/** Barra lateral recolhida fica lembrada neste navegador. */
const COLLAPSED_KEY='sofia.desktop.sidebar.collapsed';
export function useSidebarCollapsed():[boolean,(v:boolean)=>void]{
 const [value,setValue]=useState(()=>{try{return typeof localStorage!=='undefined'&&localStorage.getItem(COLLAPSED_KEY)==='1';}catch{return false;}});
 const save=(v:boolean)=>{setValue(v);try{localStorage.setItem(COLLAPSED_KEY,v?'1':'0');}catch{/* modo privado */}};
 return [value,save];
}

/** CSS de computador: cursor de clique, hover, foco por teclado e barras de rolagem finas.
 * O react-native-web desenha botoes como div com tabindex; o hover vem daqui, sem mudar cada tela. */
export function useDesktopCss(on:boolean,colors:{line:string;muted:string;accent:string;bg:string}){
 useEffect(()=>{
  if(!on||typeof document==='undefined')return;
  const el=document.createElement('style');el.id='sofia-desktop-css';
  el.textContent=[
   '[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"]{cursor:pointer}',
   '[role="button"],[role="link"],[role="menuitem"],[role="tab"]{transition:filter .12s ease,background-color .12s ease,opacity .12s ease}',
   '[role="button"]:hover,[role="link"]:hover,[role="menuitem"]:hover{filter:brightness(1.12)}',
   'div[tabindex="0"]{cursor:pointer}',
   '[role="button"]:focus-visible,[role="menuitem"]:focus-visible,[role="link"]:focus-visible{outline:2px solid '+colors.accent+'88;outline-offset:-2px}',
   'input:focus-visible,textarea:focus-visible,div[tabindex="0"]:not([role]):focus-visible{outline:none}',
   '*{scrollbar-width:thin;scrollbar-color:'+colors.line+' transparent}',
   '::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:'+colors.line+';border-radius:8px;border:2px solid '+colors.bg+'}::-webkit-scrollbar-track{background:transparent}',
   'input,textarea{outline:none}',
  ].join('\n');
  document.getElementById('sofia-desktop-css')?.remove();
  document.head.appendChild(el);
  return()=>{el.remove();};
 },[on,colors.line,colors.muted,colors.accent,colors.bg]);
}

/** Atalhos de teclado do computador. */
export type DesktopKeys={palette:()=>void;sidebar:()=>void;tab:(i:number)=>void;escape:()=>void};
export function useDesktopKeys(on:boolean,keys:DesktopKeys){
 useEffect(()=>{
  if(!on||typeof document==='undefined')return;
  const handler=(e:KeyboardEvent)=>{
   const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
   if(mod&&k==='k'){e.preventDefault();keys.palette();return;}
   if(mod&&(k==='\\'||e.code==='Backslash')){e.preventDefault();keys.sidebar();return;}
   if(e.altKey&&!mod&&/^[1-6]$/.test(e.key)){e.preventDefault();keys.tab(Number(e.key)-1);return;}
   if(k==='escape')keys.escape();
  };
  document.addEventListener('keydown',handler);
  return()=>document.removeEventListener('keydown',handler);
 },[on,keys]);
}

/** 0.3.251: textos de ajuda escritos para o dedo viram textos de mouse no computador (Toque -> Clique).
 * Segurar com o mouse funciona (o clique longo dispara o mesmo gesto), entao "Segure" vira "Clique e segure". */
export function tap(text:string):string{
 let w=0;try{w=Dimensions.get('window').width;}catch{return text;}
 if(!isDesktopWidth(w))return text;
 return text
  .replace(/\bToque e segure\b/g,'Clique e segure').replace(/\btoque e segure\b/g,'clique e segure')
  .replace(/\bcom um toque\b/g,'com um clique')
  .replace(/\bToque\b/g,'Clique').replace(/\btoque\b/g,'clique')
  .replace(/\bao tocar\b/g,'ao clicar')
  .replace(/(?<![Cc]lique e )\bSegure\b/g,'Clique e segure').replace(/(?<![Cc]lique e )\bsegure\b/g,'clique e segure')
  .replace(/fuso do celular/g,'fuso deste aparelho');
}

/** 0.3.251: dentro de uma janela (Sheet) os botoes continuam na largura da janela; fora dela, no computador,
 * o botao tem o tamanho do texto (botao de largura total e coisa de celular). */
export const DialogContext=createContext(false);
