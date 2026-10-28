import React,{Component,type ErrorInfo} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {perfError,type PerfError} from '../lib/fluency-metrics';
import {rememberError,errorLine} from '../lib/last-error';

/** One failing screen must never take the whole app down. The error is
 * recorded (type + component names, no user content) and only this screen
 * shows a retry. Retrying remounts just this screen. */
type Props={name:string;children:React.ReactNode};
type State={failed:boolean;generation:number;row:PerfError|null};
export class ScreenBoundary extends Component<Props,State>{
 state:State={failed:false,generation:0,row:null};
 static getDerivedStateFromError():Partial<State>{return {failed:true};}
 componentDidCatch(error:Error,info:ErrorInfo){const row=perfError('screen:'+this.props.name,error,info?.componentStack);rememberError(row);this.setState({row});}
 retry=()=>this.setState(s=>({failed:false,generation:s.generation+1}));
 render(){
  if(this.state.failed)return <ScreenFallback onRetry={this.retry} line={errorLine(this.state.row)}/>;
  return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>;
 }
}
function ScreenFallback({onRetry,line}:{onRetry:()=>void;line:string}){
 const c=useTheme();
 return <View testID="screen-error" style={{flex:1,backgroundColor:c.bg,padding:28,justifyContent:'center'}}>
  <Text style={{fontSize:20,fontWeight:'600',color:c.text}}>Algo deu errado nesta tela.</Text>
  <Text style={{marginTop:10,lineHeight:21,color:c.muted}}>O restante da Sofia continua funcionando. Seus rascunhos salvos não foram apagados.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel="Recarregar esta tela" onPress={onRetry} style={{marginTop:22,alignSelf:'flex-start',paddingVertical:12,paddingHorizontal:18,borderRadius:10,backgroundColor:c.accent}}>
   <Text style={{color:c.onAccent,fontWeight:'500'}}>Recarregar esta tela</Text>
  </Pressable>
  {line?<Text testID="screen-error-detail" selectable style={{marginTop:22,fontSize:11,lineHeight:16,color:c.muted}}>{'Detalhe técnico: '+line}</Text>:null}
 </View>;
}
