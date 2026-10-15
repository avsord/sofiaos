import {Linking} from 'react-native';

// 0.3.146: "Abrir no Gmail". A Sofia guarda a chave da mensagem: '<conta>:gmail:<id>' (Conta
// Google) ou '<conta>:<uidvalidity>:<uid>' (IMAP). Com o id do Gmail, abre a propria mensagem
// na conta certa (/u/<endereco>/); sem ele, abre a busca pelo assunto e remetente na mesma
// conta - nunca leva para outra conta em silencio. O link https e entregue ao app do Gmail
// quando ele esta instalado; senao, o Android abre o navegador.
export function gmailLinks(hit:{data?:Record<string,any>;title?:string},address:string){
 const key=String(hit.data?.message_key||''),m=/:gmail:([A-Za-z0-9_-]+)$/.exec(key),acct=encodeURIComponent(address||'0');
 const base='https://mail.google.com/mail/u/'+acct+'/';
 const query=['from:'+String(hit.data?.from_addr||'').trim(),String(hit.title||'').replace(/["\n]/g,' ').trim().slice(0,80)].filter(s=>s&&s!=='from:').join(' ');
 const search=base+'#search/'+encodeURIComponent(query);
 return {message:m?base+'#all/'+m[1]:'',search};
}
export async function openInGmail(hit:{data?:Record<string,any>;title?:string},address:string){
 const {message,search}=gmailLinks(hit,address);
 const target=message||search;
 try{await Linking.openURL(target);return true;}catch{try{await Linking.openURL(search);return true;}catch{return false;}}
}
