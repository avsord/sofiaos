import React,{useEffect,useRef,useState} from 'react';
import {Pressable,Text,Vibration,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Sheet} from './Sheet';
import {ReorderList} from './ReorderList';

/** 0.3.221: segurar qualquer widget do Inicio abre o seletor "Organizar Inicio": lista com puxador (≡) para
 * arrastar, tirar e adicionar widgets. Na tela inicial nada se arrasta - a rolagem fica livre. */
type Item={id:string;title:string;content:React.ReactNode};
const HOLD=450;
export function SortableWidgets({items,order,onSave,onLock,fixed=[],noHold=[],columns=1,openKey=0,lead,sheetOnly=false}:{items:Item[];order:string[];onSave:(order:string[])=>Promise<void>;onLock:(locked:boolean)=>void;fixed?:string[];noHold?:string[];columns?:number;openKey?:number;lead?:React.ReactNode;sheetOnly?:boolean}){
 // 0.3.264 (computador): colunas EQUILIBRADAS - cada widget vai para a coluna mais curta no momento (pela altura medida),
 // na ordem escolhida. Antes era 1o na coluna 1, 2o na 2...: uma coluna acabava cedo e sobrava um vazio enorme ao lado.
 const [heights,setHeights]=useState<Record<string,number>>({}),[leadH,setLeadH]=useState(0);
 const measure=(id:string,h:number)=>setHeights(prev=>Math.abs((prev[id]||0)-h)<2?prev:{...prev,[id]:h});
 const c=useTheme(),[open,setOpen]=useState(false),[draft,setDraft]=useState(order),[nonce,setNonce]=useState<Record<string,number>>({});
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),start=useRef({x:0,y:0});
 useEffect(()=>{if(!open)setDraft(prev=>prev.length===order.length&&prev.every((x,i)=>x===order[i])?prev:order);},[order,open]);// 0.3.240: lista igual nao redesenha
 const cancel=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 useEffect(()=>()=>{cancel();onLock(false);},[]);
 // 0.3.227: ao abrir o seletor, o widget segurado e remontado - o toque dele e cancelado e ele nao abre a tela/app ao soltar
 function hold(id:string,x:number,y:number){cancel();start.current={x,y};timer.current=setTimeout(()=>{timer.current=null;try{Vibration.vibrate(12);}catch{/* sem vibracao */}setNonce(n=>({...n,[id]:(n[id]||0)+1}));setDraft(order);setOpen(true);},HOLD);}
 function moved(x:number,y:number){if(timer.current&&Math.abs(x-start.current.x)+Math.abs(y-start.current.y)>8)cancel();}
 const save=(next:string[])=>{setDraft(next);void onSave(next).catch(()=>setDraft(order));};
 // 0.3.250 (computador): sem segurar com o mouse - o botao Organizar do Inicio abre o seletor
 const seenOpen=useRef(openKey);useEffect(()=>{if(openKey===seenOpen.current)return;seenOpen.current=openKey;setDraft(order);setOpen(true);},[openKey]);
 const visible=draft.filter(id=>items.some(i=>i.id===id)),hidden=items.filter(i=>!visible.includes(i.id));
 const cellIds:string[]=[];
 const cells=order.map(id=>{const item=items.find(i=>i.id===id);if(!item)return null;cellIds.push(id);
   // widget que ja usa o segurar para outra coisa (agenda: segurar um dia cria compromisso) nao abre o seletor
   if(noHold.includes(id))return <View key={id} onLayout={e=>measure(id,e.nativeEvent.layout.height)}>{item.content}</View>;
   return <View key={id+':'+(nonce[id]||0)} collapsable={false} onLayout={e=>measure(id,e.nativeEvent.layout.height)} onTouchStart={e=>hold(id,e.nativeEvent.pageX,e.nativeEvent.pageY)} onTouchMove={e=>moved(e.nativeEvent.pageX,e.nativeEvent.pageY)} onTouchEnd={cancel} onTouchCancel={cancel}>{item.content}</View>;}).filter(Boolean);
 // 0.3.250 (computador): painel em colunas, os widgets distribuidos na ordem escolhida (1o na coluna 1, 2o na 2...)
 const grid=columns>1?(()=>{
  // melhor divisao: entre todas as combinacoes (poucos widgets), a que deixa a coluna mais alta o mais baixa possivel;
  // a ordem escolhida se mantem dentro de cada coluna
  const n=cells.length,h=cellIds.map(id=>(heights[id]||320)+18),base=Array.from({length:columns},(_,k)=>k===0&&lead?leadH+18:0);
  let best:number[]=cells.map((_,i)=>i%columns),bestCost=Infinity,bestGap=Infinity;
  if(columns===2&&n<=12){for(let mask=0;mask<(1<<n);mask++){const used=[...base];for(let i=0;i<n;i++)used[(mask>>i)&1]+=h[i];const cost=Math.max(...used),gap=Math.abs(used[0]-used[1]);if(cost<bestCost-1||(Math.abs(cost-bestCost)<=1&&gap<bestGap)){bestCost=cost;bestGap=gap;best=cells.map((_,i)=>(mask>>i)&1);}}}
  const cols:React.ReactNode[][]=Array.from({length:columns},()=>[]);cells.forEach((cell,i)=>cols[best[i]].push(cell));return cols;})():null;
 return <View style={{gap:18}}>
  {/* 0.3.265: no Inicio do computador os cartoes tem desenho proprio; aqui fica so a janela do Organizar */}
  {sheetOnly?null:grid?<View testID="home-widget-grid" style={{flexDirection:'row',gap:18,alignItems:'flex-start'}}>{grid.map((col,k)=><View key={k} style={{flex:1,minWidth:0,gap:18}}>{k===0&&lead?<View onLayout={e=>{const h=e.nativeEvent.layout.height;setLeadH(v=>Math.abs(v-h)<2?v:h);}}>{lead}</View>:null}{col}</View>)}</View>:<>{lead}{cells}</>}
  <Sheet visible={open} onClose={()=>setOpen(false)} label="Fechar organizar a tela inicial">
   <View style={{gap:14,paddingBottom:12}}>
    <View style={{flexDirection:'row',alignItems:'center'}}>
     <Text style={{flex:1,fontSize:20,fontWeight:'700',color:c.text}}>Organizar Início</Text>
     <Pressable accessibilityRole="button" onPress={()=>setOpen(false)} style={{paddingHorizontal:14,paddingVertical:8,borderRadius:99,backgroundColor:c.accent}}><Text style={{color:c.onAccent,fontWeight:'600',fontSize:13}}>Pronto</Text></Pressable>
    </View>
    <Text style={{color:c.muted,fontSize:12}}>Arraste pelo ≡ para mudar a ordem.</Text>
    <ReorderList rows={visible.map(id=>({id,title:items.find(i=>i.id===id)!.title,removable:!fixed.includes(id)}))} onChange={save} onRemove={id=>save(visible.filter(x=>x!==id))}/>
    {hidden.length?<View style={{gap:6}}>
     <Text style={{color:c.muted,fontSize:12,fontWeight:'600'}}>Adicionar</Text>
     {hidden.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Adicionar '+item.title} onPress={()=>save([...visible,item.id])} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,paddingHorizontal:14,borderRadius:14,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,boxShadow:'0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
      <View style={{width:22,height:22,borderRadius:11,backgroundColor:c.accent,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.onAccent,fontWeight:'700',fontSize:16,lineHeight:20}}>+</Text></View>
      <Text style={{color:c.text,fontSize:16,fontWeight:'500'}}>{item.title}</Text>
     </Pressable>)}
    </View>:null}
   </View>
  </Sheet>
 </View>;
}
