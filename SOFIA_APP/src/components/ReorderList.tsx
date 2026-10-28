import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Animated,PanResponder,Pressable,Text,Vibration,View} from 'react-native';
import {useTheme} from '../lib/theme';

/** 0.3.221: lista com puxador (≡) para reordenar arrastando - o item segue o dedo e os outros abrem espaco com mola. */
export type ReorderRow={id:string;title:string;removable?:boolean};
const ROW=56;
export function ReorderList({rows,onChange,onRemove}:{rows:ReorderRow[];onChange:(ids:string[])=>void;onRemove?:(id:string)=>void}){
 const c=useTheme(),key=rows.map(r=>r.id).join('|');
 const [ids,setIds]=useState(rows.map(r=>r.id)),[active,setActive]=useState<string|null>(null);
 const idsRef=useRef(ids);idsRef.current=ids;
 const drag=useRef<{id:string;from:number;to:number}|null>(null),reset=useRef(false);
 const onChangeRef=useRef(onChange);onChangeRef.current=onChange;
 useEffect(()=>{if(!drag.current)setIds(rows.map(r=>r.id));},[key]);
 const offsets=useRef(new Map<string,Animated.Value>()).current,dy=useRef(new Animated.Value(0)).current;
 const val=(id:string)=>{let v=offsets.get(id);if(!v){v=new Animated.Value(0);offsets.set(id,v);}return v;};
 // ao soltar: a lista muda de ordem e os deslocamentos voltam a zero no mesmo quadro (sem pulo)
 useLayoutEffect(()=>{if(reset.current){reset.current=false;for(const v of offsets.values())v.setValue(0);dy.setValue(0);}},[ids]);
 function shift(from:number,to:number,dragged:string){idsRef.current.forEach((id,k)=>{if(id===dragged)return;const t=from<to&&k>from&&k<=to?-ROW:from>to&&k>=to&&k<from?ROW:0;Animated.spring(val(id),{toValue:t,useNativeDriver:true,speed:22,bounciness:4}).start();});}
 function finish(){const d=drag.current;if(!d)return;Animated.spring(dy,{toValue:(d.to-d.from)*ROW,useNativeDriver:true,speed:26,bounciness:2}).start(()=>{const next=[...idsRef.current];next.splice(d.from,1);next.splice(d.to,0,d.id);drag.current=null;reset.current=true;setActive(null);setIds(next);if(d.from!==d.to)onChangeRef.current(next);});}
 const responders=useRef(new Map<string,ReturnType<typeof PanResponder.create>>()).current;
 const handle=(id:string)=>{let r=responders.get(id);if(r)return r;r=PanResponder.create({
  onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,onPanResponderTerminationRequest:()=>false,
  onPanResponderGrant:()=>{const from=idsRef.current.indexOf(id);drag.current={id,from,to:from};dy.setValue(0);setActive(id);try{Vibration.vibrate(10);}catch{/* sem vibracao */}},
  onPanResponderMove:(_e,g)=>{const d=drag.current;if(!d)return;const max=idsRef.current.length-1,pos=Math.max(-d.from*ROW,Math.min((max-d.from)*ROW,g.dy));dy.setValue(pos);const to=Math.max(0,Math.min(max,Math.round(d.from+pos/ROW)));if(to!==d.to){d.to=to;shift(d.from,to,d.id);}},
  onPanResponderRelease:finish,onPanResponderTerminate:finish});responders.set(id,r);return r;};
 return <View style={{height:ids.length*ROW,borderRadius:14,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
  {ids.map((id,k)=>{const row=rows.find(r=>r.id===id);if(!row)return null;const on=active===id;
   return <Animated.View key={id} style={{height:ROW,flexDirection:'row',alignItems:'center',borderTopWidth:k?1:0,borderColor:c.line,backgroundColor:c.surface,zIndex:on?10:1,elevation:on?6:0,shadowColor:'#000',shadowOpacity:on?0.18:0,shadowRadius:8,shadowOffset:{width:0,height:3},borderRadius:on?12:0,transform:[{translateY:on?dy:val(id)},{scale:on?1.02:1}]}}>
    <View {...handle(id).panHandlers} accessibilityLabel={'Arrastar '+row.title} style={{width:52,height:ROW,alignItems:'center',justifyContent:'center'}}>
     {[0,1,2].map(n=><View key={n} style={{width:18,height:2,borderRadius:1,backgroundColor:c.muted,marginVertical:2}}/>)}
    </View>
    <Text numberOfLines={1} style={{flex:1,color:c.text,fontSize:16,fontWeight:'500'}}>{row.title}</Text>
    {row.removable&&onRemove?<Pressable accessibilityRole="button" accessibilityLabel={'Tirar '+row.title+' da tela inicial'} hitSlop={8} onPress={()=>onRemove(id)} style={{width:44,height:ROW,alignItems:'center',justifyContent:'center'}}><View style={{width:22,height:22,borderRadius:11,backgroundColor:c.danger,alignItems:'center',justifyContent:'center'}}><View style={{width:10,height:2,borderRadius:1,backgroundColor:'#fff'}}/></View></Pressable>:<View style={{width:44}}/>}
   </Animated.View>;})}
 </View>;
}
