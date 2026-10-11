import React,{Component,type ErrorInfo} from 'react';
import {Pressable,Text,View} from 'react-native';
import {perfError,type PerfError} from '../lib/fluency-metrics';
import {rememberError,errorLine} from '../lib/last-error';

/** Last line of defence. It never leaves the user on a dead end:
 *  - the first failure in a window retries on its own after a short delay;
 *  - if it fails again, the screen stays, shows WHY (type and component names,
 *    no user content) and offers "Tentar de novo" without closing the app;
 *  - the cause is also stored so it survives closing the app (see the panel).
 * Plain styles on purpose: the theme itself may be what failed. */
type Props={children:React.ReactNode;retryDelayMs?:number;cooldownMs?:number;now?:()=>number};
type State={failed:boolean;generation:number;row:PerfError|null};
export class AppBoundary extends Component<Props,State>{
 state:State={failed:false,generation:0,row:null};
 private lastAutoAt=-Infinity;private timer:ReturnType<typeof setTimeout>|undefined;
 static getDerivedStateFromError():Partial<State>{return {failed:true};}
 componentDidCatch(error:Error,info:ErrorInfo){
  const row=perfError('app',error,info?.componentStack);
  rememberError(row);this.setState({row});
  const now=(this.props.now??Date.now)();
  if(now-this.lastAutoAt>(this.props.cooldownMs??15000)){
   this.lastAutoAt=now;clearTimeout(this.timer);
   this.timer=setTimeout(this.retry,this.props.retryDelayMs??450);
  }
 }
 componentWillUnmount(){clearTimeout(this.timer);}
 retry=()=>{clearTimeout(this.timer);this.setState(s=>({failed:false,generation:s.generation+1}));};
 render(){
  if(!this.state.failed)return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>;
  const line=errorLine(this.state.row);
  return <View nativeID="sofia-launch-error" style={{flex:1,backgroundColor:'#F7F6FA',padding:30,justifyContent:'center'}}>
   <Text style={{fontSize:25,fontWeight:'700',color:'#272334'}}>Vamos reabrir a Sofia.</Text>
   <Text style={{marginTop:16,lineHeight:23,color:'#7F7A8D'}}>O aplicativo encontrou um problema. Feche e abra novamente. Mensagens ainda não enviadas podem precisar ser refeitas.</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Tentar de novo" onPress={this.retry} style={{marginTop:24,alignSelf:'flex-start',paddingVertical:12,paddingHorizontal:18,borderRadius:10,backgroundColor:'#7258E8'}}>
    <Text style={{color:'#FFFFFF',fontWeight:'600'}}>Tentar de novo</Text>
   </Pressable>
   {line?<Text testID="app-error-detail" selectable style={{marginTop:26,fontSize:11,lineHeight:16,color:'#9A95A8'}}>{'Detalhe técnico: '+line}</Text>:null}
  </View>;
 }
}
