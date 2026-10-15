import {useEffect,useRef} from 'react';
import type {ScrollView} from 'react-native';

// 0.3.145: depois de RETURN_TO_TOP_MS seguidos fora de uma tela (Inicio, Agenda, Apps),
// ela volta ao topo AINDA ESCONDIDA - quem volta ja encontra no topo, sem ver a pagina
// subir. Ir e voltar antes do prazo cancela a contagem.
export const RETURN_TO_TOP_MS=10000;
export function useReturnToTop(active:boolean,ms=RETURN_TO_TOP_MS){
 const ref=useRef<ScrollView>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),pending=useRef(false);
 useEffect(()=>{
  if(active){
   if(timer.current){clearTimeout(timer.current);timer.current=null;}
   // seguranca: se o sistema adiou o scroll enquanto escondida, aplica antes do proximo quadro visivel
   if(pending.current){pending.current=false;ref.current?.scrollTo({y:0,animated:false});}
   return;
  }
  timer.current=setTimeout(()=>{timer.current=null;pending.current=true;ref.current?.scrollTo({y:0,animated:false});},ms);
  return()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}};
 },[active,ms]);
 return ref;
}
