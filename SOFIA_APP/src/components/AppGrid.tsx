import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityActionEvent,Animated,PanResponder,Vibration,View} from 'react-native';

/** 0.3.221: grade de apps como no iPhone - segura o app, ele cresce e segue o dedo; os outros deslizam para abrir
 * espaco; ao soltar, ele assenta no lugar. Toque rapido abre. Rolagem vertical continua normal antes de segurar. */
const GAP=12,H=148,COLS=2,HOLD=320;
export function AppGrid<T extends {id:string;title:string}>({items,renderCard,onOpen,onReorder,onDragging}:{items:T[];renderCard:(item:T,lifted:boolean)=>React.ReactNode;onOpen:(id:string)=>void;onReorder:(ids:string[])=>void;onDragging?:(on:boolean)=>void}){
 const [w,setW]=useState(0),cellW=w?(w-GAP)/COLS:0,key=items.map(i=>i.id).join('|');
 const [ids,setIds]=useState(items.map(i=>i.id)),[active,setActive]=useState<string|null>(null),[pressed,setPressed]=useState<string|null>(null);
 const idsRef=useRef(ids);idsRef.current=ids;
 const geo=useRef({cellW:0});geo.current.cellW=cellW;
 const cb=useRef({onOpen,onReorder,onDragging});cb.current={onOpen,onReorder,onDragging};
 const drag=useRef<{id:string;startX:number;startY:number;moved:boolean;live:boolean;timer:ReturnType<typeof setTimeout>|null}|null>(null);
 const pos=useRef(new Map<string,Animated.ValueXY>()).current,scale=useRef(new Animated.Value(1)).current,placed=useRef(false);
 const slot=(k:number)=>({x:(k%COLS)*(geo.current.cellW+GAP),y:Math.floor(k/COLS)*(H+GAP)});
 const p=(id:string)=>{let v=pos.get(id);if(!v){const k=Math.max(0,idsRef.current.indexOf(id));v=new Animated.ValueXY(slot(k));pos.set(id,v);}return v;};
 useEffect(()=>{if(!drag.current)setIds(items.map(i=>i.id));},[key]);
 useEffect(()=>{if(!w)return;const first=!placed.current;placed.current=true;
  // 0.3.236: so anima enquanto a pessoa arrasta; ordem que chega de fora (ao abrir) aparece direto no lugar
  const live=!!drag.current?.live;
  ids.forEach((id,k)=>{if(live&&drag.current?.id===id)return;const s=slot(k);if(first||!live)p(id).setValue(s);else Animated.spring(p(id),{toValue:s,useNativeDriver:true,speed:16,bounciness:6}).start();});},[ids,w]);
 function end(terminated:boolean){const d=drag.current;drag.current=null;setPressed(null);if(!d)return;if(d.timer)clearTimeout(d.timer);
  if(!d.live){if(!d.moved&&!terminated)cb.current.onOpen(d.id);return;}
  const k=idsRef.current.indexOf(d.id);
  Animated.parallel([Animated.spring(p(d.id),{toValue:slot(k),useNativeDriver:true,speed:14,bounciness:7}),Animated.spring(scale,{toValue:1,useNativeDriver:true,speed:14,bounciness:4})]).start(()=>setActive(a=>a===d.id?null:a));
  cb.current.onDragging?.(false);cb.current.onReorder([...idsRef.current]);}
 const responders=useRef(new Map<string,ReturnType<typeof PanResponder.create>>()).current;
 const responder=(id:string)=>{let r=responders.get(id);if(r)return r;r=PanResponder.create({
  onStartShouldSetPanResponder:()=>true,
  // antes de segurar, a rolagem da tela pode assumir; durante o arrasto, nao
  onShouldBlockNativeResponder:()=>false,onPanResponderTerminationRequest:()=>!drag.current?.live,
  onPanResponderGrant:()=>{const k=idsRef.current.indexOf(id),s=slot(k);const d={id,startX:s.x,startY:s.y,moved:false,live:false,timer:null as ReturnType<typeof setTimeout>|null};setPressed(id);
   d.timer=setTimeout(()=>{if(drag.current!==d)return;d.live=true;setActive(id);setPressed(null);cb.current.onDragging?.(true);try{Vibration.vibrate(12);}catch{/* sem vibracao */}Animated.spring(scale,{toValue:1.06,useNativeDriver:true,speed:18,bounciness:6}).start();},HOLD);drag.current=d;},
  onPanResponderMove:(_e,g)=>{const d=drag.current;if(!d||d.id!==id)return;
   if(!d.live){if(Math.abs(g.dx)+Math.abs(g.dy)>10){d.moved=true;if(d.timer)clearTimeout(d.timer);setPressed(null);}return;}
   p(id).setValue({x:d.startX+g.dx,y:d.startY+g.dy});
   const cw=geo.current.cellW,cx=d.startX+g.dx+cw/2,cy=d.startY+g.dy+H/2;
   const col=Math.max(0,Math.min(COLS-1,Math.floor(cx/(cw+GAP)))),row=Math.max(0,Math.floor(cy/(H+GAP)));
   const target=Math.max(0,Math.min(idsRef.current.length-1,row*COLS+col)),cur=idsRef.current.indexOf(id);
   if(target!==cur){const next=[...idsRef.current];next.splice(cur,1);next.splice(target,0,id);idsRef.current=next;setIds(next);}},
  onPanResponderRelease:()=>end(false),onPanResponderTerminate:()=>end(true)});responders.set(id,r);return r;};
 const move=(id:string,delta:number)=>{const cur=idsRef.current.indexOf(id),to=cur+delta;if(cur<0||to<0||to>=idsRef.current.length)return;const next=[...idsRef.current];next.splice(cur,1);next.splice(to,0,id);setIds(next);cb.current.onReorder(next);};
 const rows=Math.ceil(ids.length/COLS);
 return <View onLayout={e=>setW(e.nativeEvent.layout.width)} style={{height:rows?rows*H+(rows-1)*GAP:0}}>
  {w?ids.map(id=>{const item=items.find(i=>i.id===id);if(!item)return null;const lifted=active===id;
   return <Animated.View key={id} {...responder(id).panHandlers} accessible accessibilityRole="button" accessibilityLabel={'Abrir '+item.title+'. Segure e arraste para mudar de lugar.'}
    accessibilityActions={[{name:'activate'},{name:'moveBefore',label:'Mover para antes'},{name:'moveAfter',label:'Mover para depois'}]}
    onAccessibilityAction={(e:AccessibilityActionEvent)=>{const n=e.nativeEvent.actionName;if(n==='activate')cb.current.onOpen(id);else if(n==='moveBefore')move(id,-1);else if(n==='moveAfter')move(id,1);}}
    style={{position:'absolute',left:0,top:0,width:cellW,height:H,zIndex:lifted?20:1,elevation:lifted?10:0,shadowColor:'#000',shadowOpacity:lifted?0.22:0,shadowRadius:14,shadowOffset:{width:0,height:6},opacity:pressed===id?0.85:1,
     transform:[...p(id).getTranslateTransform(),{scale:lifted?scale:1}]}}>
    {renderCard(item,lifted)}
   </Animated.View>;}):null}
 </View>;
}
