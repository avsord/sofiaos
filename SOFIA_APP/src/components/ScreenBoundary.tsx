import React,{Component,type ErrorInfo} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {perfError} from '../lib/fluency-metrics';

/** One failing screen must never take the whole app down. The error is
 * recorded (type + component names, no user content) and only this screen
 * shows a retry. Retrying remounts just this screen. */
type Props={name:string;children:React.ReactNode};
type State={failed:boolean;generation:number};
export class ScreenBoundary extends Component<Props,State>{
 state:State={failed:false,generation:0};
 static getDerivedStateFromError():Partial<State>{return {failed:true};}
 componentDidCatch(error:Error,info:ErrorInfo){perfError('screen:'+this.props.name,error,info?.componentStack);}
 retry=()=>this.setState(s=>({failed:false,generation:s.generation+1}));
 render(){
  if(this.state.failed)return <ScreenFallback onRetry={this.retry}/>;
  return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>;
 }
}
function ScreenFallback({onRetry}:{onRetry:()=>void}){
 const c=useTheme();
 return <View testID="screen-error" style={{flex:1,backgroundColor:c.bg,padding:28,justifyContent:'center'}}>
  <Text style={{fontSize:20,fontWeight:'700',color:c.text}}>Algo deu errado nesta tela.</Text>
  <Text style={{marginTop:10,lineHeight:21,color:c.muted}}>O restante da Sofia continua funcionando. Seus rascunhos salvos não foram apagados.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel="Recarregar esta tela" onPress={onRetry} style={{marginTop:22,alignSelf:'flex-start',paddingVertical:12,paddingHorizontal:18,borderRadius:10,backgroundColor:c.accent}}>
   <Text style={{color:'#FFFFFF',fontWeight:'600'}}>Recarregar esta tela</Text>
  </Pressable>
 </View>;
}
