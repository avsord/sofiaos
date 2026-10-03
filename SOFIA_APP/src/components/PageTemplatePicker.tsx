import React,{useState} from 'react';
import {Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {useTheme} from '../lib/theme';
import {PAGE_TEMPLATES,PageTemplate} from '../lib/page-templates';
import {IconButton} from './UI';

export function PageCreateMenu({visible,parentTitle,onClose,onBlank,onTemplate}:{visible:boolean;parentTitle?:string;onClose:()=>void;onBlank:()=>void;onTemplate:(template:PageTemplate)=>void}){
 const c=useTheme(),[mode,setMode]=useState<'create'|'templates'>('create');
 const close=()=>{setMode('create');onClose();};
 return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
  <Pressable onPress={close} style={{flex:1,backgroundColor:'#00000055',justifyContent:'flex-end'}}>
   <Pressable onPress={()=>{}} style={{maxHeight:'82%',borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:c.surface,padding:20,paddingBottom:30}}>
    <View style={{flexDirection:'row',alignItems:'center',marginBottom:14}}>
     {mode==='templates'?<IconButton name="back" label="Voltar" onPress={()=>setMode('create')}/>:null}
     <Text style={{flex:1,fontSize:22,fontWeight:'700',color:c.text}}>{mode==='templates'?'Templates':'Criar página'}</Text>
     <IconButton name="close" label="Fechar" onPress={close}/>
    </View>
    {parentTitle?<Text style={{fontSize:12,color:c.muted,marginBottom:12}}>Dentro de {parentTitle}</Text>:null}
    {mode==='create'?<View style={{gap:10}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Criar página em branco" onPress={()=>{close();onBlank();}} style={{padding:16,borderRadius:14,backgroundColor:c.input,borderWidth:1,borderColor:c.line}}>
       <Text style={{fontSize:17,fontWeight:'700',color:c.text}}>＋ Página em branco</Text>
       <Text style={{fontSize:12,color:c.muted,marginTop:5}}>Começar com título e área de escrita vazios.</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Usar template de conteúdo" onPress={()=>setMode('templates')} style={{padding:16,borderRadius:14,backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accent}}>
       <Text style={{fontSize:17,fontWeight:'700',color:c.accent}}>▦ Usar template</Text>
       <Text style={{fontSize:12,color:c.muted,marginTop:5}}>Tarefas pessoal, Bloco de nota ou Lista de reprodução.</Text>
      </Pressable>
    </View>:<ScrollView style={{maxHeight:520}} contentContainerStyle={{gap:10,paddingBottom:10}}>
      {PAGE_TEMPLATES.map(template=><Pressable key={template.id} accessibilityRole="button" accessibilityLabel={'Aplicar template '+template.title}
       onPress={()=>{close();onTemplate(template);}} style={{padding:15,borderRadius:14,backgroundColor:c.input,borderWidth:1,borderColor:c.line,flexDirection:'row',gap:12,alignItems:'center'}}>
       <Text style={{fontSize:32}}>{template.icon}</Text><View style={{flex:1}}><Text style={{fontSize:16,fontWeight:'700',color:c.text}}>{template.title}</Text><Text style={{fontSize:12,lineHeight:17,color:c.muted,marginTop:3}}>{template.description}</Text></View>
      </Pressable>)}
    </ScrollView>}
   </Pressable>
  </Pressable>
 </Modal>;
}
