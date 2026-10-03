import React,{useMemo,useState} from 'react';
import {Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import type {PageBlock} from '../lib/page-editor';
import {STATUS_COLORS,statusColorHex} from '../lib/page-templates';
import {useTheme} from '../lib/theme';
import {Button,IconButton} from './UI';

type Prop={key:string;label:string;type:string;options?:string[];option_colors?:Record<string,string>};
type Row={id:string;values:Record<string,any>;page_content?:string};
type ViewDef={id:string;label:string;type:string;group_by?:string;filter_key?:string;filter_value?:any;sort_by?:string;sort_dir?:string};
type Data={title:string;show_title:boolean;properties:Prop[];views:ViewDef[];active_view:string;rows:Row[];[key:string]:any};
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
const makeId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function normalized(block:PageBlock):Data{
 const d=block.data&&typeof block.data==='object'?clone(block.data):{};
 const properties=Array.isArray(d.properties)&&d.properties.length?d.properties:[{key:'name',label:'Nome',type:'text',options:[]}];
 const views=Array.isArray(d.views)&&d.views.length?d.views:[{id:'list',label:'Lista',type:'list'}];
 return {...d,title:String(d.title||''),show_title:d.show_title!==false,
  properties:properties.map((p:any,i:number)=>({key:String(p.key||'field'+i),label:String(p.label||p.key||'Campo'),type:String(p.type||'text'),options:Array.isArray(p.options)?p.options.map(String):[],option_colors:p.option_colors&&typeof p.option_colors==='object'?{...p.option_colors}:{}})),
  views:views.map((v:any,i:number)=>({id:String(v.id||'view'+i),label:String(v.label||'Visualização'),type:String(v.type||'list'),group_by:String(v.group_by||''),filter_key:String(v.filter_key||''),filter_value:v.filter_value??'',sort_by:String(v.sort_by||''),sort_dir:String(v.sort_dir||'desc')})),
  active_view:String(d.active_view||views[0]?.id||'list'),
  rows:Array.isArray(d.rows)?d.rows.map((r:any)=>({id:String(r?.id||makeId()),values:r?.values&&typeof r.values==='object'?{...r.values}:{},page_content:String(r?.page_content||'')})):[]
 };
}
function uniqueName(base:string,options:string[]){const clean=(base.trim()||'Nova coluna').slice(0,60);if(!options.includes(clean))return clean;let n=2;while(options.includes(clean+' '+n))n++;return clean+' '+n;}
const alpha=(hex:string,a='22')=>hex.length===7?hex+a:hex;

export function NativeCollectionBlock({block,onChange}:{block:PageBlock;onChange:(data:Record<string,any>,group?:string)=>void}){
 const c=useTheme(),d=useMemo(()=>normalized(block),[block]),active=d.views.find(v=>v.id===d.active_view)||d.views[0];
 const [statusEdit,setStatusEdit]=useState<{propKey:string;value:string|null;title:string;color:string}|null>(null);
 const commit=(next:Data,group='collection:'+block.id)=>onChange(next,group);
 const nameProp=d.properties.find(p=>p.key==='name')||d.properties[0];
 const addRow=(seed:Record<string,any>={})=>{const next=clone(d),values:Record<string,any>={};for(const p of next.properties)values[p.key]=p.type==='checkbox'?false:'';Object.assign(values,seed);next.rows.push({id:makeId(),values,page_content:''});commit(next);};
 const updateRow=(id:string,key:string,value:any)=>{const next=clone(d),row=next.rows.find(r=>r.id===id);if(!row)return;row.values[key]=value;commit(next,'collection-row:'+id+':'+key);};
 const removeRow=(id:string)=>{const next=clone(d);next.rows=next.rows.filter(r=>r.id!==id);commit(next);};
 const editStatus=(prop:Prop,value:string|null)=>setStatusEdit({propKey:prop.key,value,title:value||'',color:value?(prop.option_colors?.[value]||'gray'):'gray'});
 const saveStatus=()=>{if(!statusEdit)return;const next=clone(d),prop=next.properties.find(p=>p.key===statusEdit.propKey);if(!prop)return;prop.options=prop.options||[];prop.option_colors=prop.option_colors||{};
   if(statusEdit.value===null){const name=uniqueName(statusEdit.title,prop.options);prop.options.push(name);prop.option_colors[name]=statusEdit.color;}
   else{const old=statusEdit.value,name=uniqueName(statusEdit.title,prop.options.filter(x=>x!==old));prop.options=prop.options.map(x=>x===old?name:x);for(const row of next.rows)if(String(row.values[prop.key]||'')===old)row.values[prop.key]=name;delete prop.option_colors[old];prop.option_colors[name]=statusEdit.color;}
   setStatusEdit(null);commit(next);
 };
 const duplicateStatus=()=>{if(!statusEdit?.value)return;const next=clone(d),prop=next.properties.find(p=>p.key===statusEdit.propKey);if(!prop)return;prop.options=prop.options||[];prop.option_colors=prop.option_colors||{};const name=uniqueName(statusEdit.title+' cópia',prop.options);prop.options.push(name);prop.option_colors[name]=statusEdit.color;setStatusEdit(null);commit(next);};
 const deleteStatus=()=>{if(!statusEdit?.value)return;const next=clone(d),prop=next.properties.find(p=>p.key===statusEdit.propKey);if(!prop)return;const old=statusEdit.value;prop.options=(prop.options||[]).filter(x=>x!==old);if(prop.option_colors)delete prop.option_colors[old];for(const row of next.rows)if(String(row.values[prop.key]||'')===old)row.values[prop.key]='';setStatusEdit(null);commit(next);};

 const board=()=>{
  const group=d.properties.find(p=>p.key===active?.group_by)||d.properties.find(p=>p.type==='select');if(!group)return <Text style={{color:c.muted,fontSize:12}}>Adicione um campo de status para usar o quadro.</Text>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10,paddingVertical:4,paddingRight:16}}>
   {(group.options||[]).map(option=>{const colorId=group.option_colors?.[option]||'gray',hex=statusColorHex(colorId),rows=d.rows.filter(r=>String(r.values[group.key]||'')===option);
    return <View key={option} style={{width:220,padding:8,borderRadius:12,backgroundColor:alpha(hex,'12')}}>
     <Pressable accessibilityRole="button" accessibilityLabel={'Configurar coluna '+option} onPress={()=>editStatus(group,option)} style={{flexDirection:'row',alignItems:'center',gap:7,paddingBottom:7}}>
      <View style={{width:9,height:9,borderRadius:9,backgroundColor:hex}}/><Text numberOfLines={1} style={{flex:1,color:c.text,fontSize:12,fontWeight:'700'}}>{option}</Text><Text style={{color:c.muted,fontSize:11}}>{rows.length}</Text><Text style={{color:c.muted}}>•••</Text>
     </Pressable>
     {rows.map(row=><View key={row.id} style={{marginBottom:6,padding:9,borderRadius:9,backgroundColor:c.surface,borderWidth:1,borderColor:c.line}}>
      <TextInput value={String(row.values[nameProp.key]||'')} onChangeText={v=>updateRow(row.id,nameProp.key,v)} placeholder="Nova página" placeholderTextColor={c.muted} style={{color:c.text,fontSize:13,padding:0,minHeight:28}}/>
      <Pressable onPress={()=>removeRow(row.id)} accessibilityLabel="Excluir item" style={{alignSelf:'flex-end',paddingTop:4}}><Text style={{fontSize:10,color:c.muted}}>Excluir</Text></Pressable>
     </View>)}
     <Pressable onPress={()=>addRow({[group.key]:option})} style={{padding:8}}><Text style={{color:c.muted,fontSize:12}}>＋ Nova página</Text></Pressable>
    </View>;
   })}
   <Pressable accessibilityRole="button" accessibilityLabel="Adicionar coluna" onPress={()=>editStatus(group,null)} style={{width:120,minHeight:70,borderRadius:12,borderWidth:1,borderStyle:'dashed',borderColor:c.line,alignItems:'center',justifyContent:'center'}}>
    <Text style={{color:c.muted,fontSize:12}}>＋ Coluna</Text>
   </Pressable>
  </ScrollView>;
 };
 const list=()=>{
  return <View style={{gap:3}}>{d.rows.map(row=><View key={row.id} style={{flexDirection:'row',alignItems:'center',gap:7,minHeight:42,paddingHorizontal:6,borderRadius:8}}>
   <Text style={{fontSize:19}}>▧</Text><TextInput value={String(row.values[nameProp.key]||'')} onChangeText={v=>updateRow(row.id,nameProp.key,v)} placeholder="Nova página" placeholderTextColor={c.muted} style={{flex:1,color:c.text,fontSize:14,paddingVertical:7}}/><Pressable onPress={()=>removeRow(row.id)}><Text style={{color:c.muted}}>×</Text></Pressable>
  </View>)}<Pressable onPress={()=>addRow()} style={{padding:8}}><Text style={{color:c.muted,fontSize:12}}>＋ Nova página</Text></Pressable></View>;
 };
 const table=()=>{
  const props=d.properties.slice(0,4);
  return <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={{minWidth:Math.max(520,props.length*150)}}>
   <View style={{flexDirection:'row',borderBottomWidth:1,borderColor:c.line}}>{props.map(p=><Text key={p.key} style={{width:150,padding:8,color:c.muted,fontSize:11,fontWeight:'600'}}>{p.label}</Text>)}</View>
   {d.rows.map(row=><View key={row.id} style={{flexDirection:'row',borderBottomWidth:1,borderColor:c.line}}>{props.map(p=><TextInput key={p.key} value={String(row.values[p.key]??'')} onChangeText={v=>updateRow(row.id,p.key,v)} placeholder={p.label} placeholderTextColor={c.muted} style={{width:150,minHeight:42,padding:8,color:c.text,fontSize:12}}/>)}<Pressable onPress={()=>removeRow(row.id)} style={{width:34,justifyContent:'center'}}><Text style={{color:c.muted}}>×</Text></Pressable></View>)}
   <Pressable onPress={()=>addRow()} style={{padding:9}}><Text style={{color:c.muted,fontSize:12}}>＋ Nova página</Text></Pressable>
  </View></ScrollView>;
 };
 return <View style={{marginVertical:5}}>
  {d.show_title&&d.title?<Text style={{fontSize:15,fontWeight:'700',color:c.text,marginBottom:7}}>{d.title}</Text>:null}
  <View style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:8}}>
   {d.views.map(v=><Pressable key={v.id} onPress={()=>{const next=clone(d);next.active_view=v.id;commit(next);}} style={{paddingVertical:6,paddingHorizontal:10,borderRadius:8,backgroundColor:v.id===active?.id?c.input:'transparent'}}><Text style={{fontSize:11,color:v.id===active?.id?c.text:c.muted}}>{v.label}</Text></Pressable>)}
  </View>
  {active?.type==='board'?board():active?.type==='table'?table():list()}
  <Modal visible={!!statusEdit} transparent animationType="fade" onRequestClose={()=>setStatusEdit(null)}>
   <Pressable onPress={()=>setStatusEdit(null)} style={{flex:1,backgroundColor:'#00000055',justifyContent:'flex-end'}}>
    <Pressable onPress={()=>{}} style={{backgroundColor:c.surface,borderTopLeftRadius:22,borderTopRightRadius:22,padding:20,paddingBottom:30}}>
     <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,fontSize:20,fontWeight:'700',color:c.text}}>{statusEdit?.value?'Configurar coluna':'Nova coluna'}</Text><IconButton name="close" label="Fechar" onPress={()=>setStatusEdit(null)}/></View>
     <TextInput value={statusEdit?.title||''} onChangeText={title=>setStatusEdit(v=>v?{...v,title}:v)} placeholder="Nome da coluna" placeholderTextColor={c.muted} style={{marginTop:14,minHeight:48,borderRadius:12,backgroundColor:c.input,color:c.text,paddingHorizontal:12}}/>
     <Text style={{marginTop:16,marginBottom:8,color:c.muted,fontSize:12}}>Cor</Text>
     <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{STATUS_COLORS.map(color=><Pressable key={color.id} accessibilityLabel={'Cor '+color.label} onPress={()=>setStatusEdit(v=>v?{...v,color:color.id}:v)} style={{width:36,height:36,borderRadius:18,backgroundColor:color.hex,borderWidth:statusEdit?.color===color.id?3:0,borderColor:c.text}}/>)}</View>
     <View style={{gap:9,marginTop:18}}><Button title="Salvar" disabled={!statusEdit?.title.trim()} onPress={saveStatus}/>{statusEdit?.value?<Button title="Duplicar coluna" secondary onPress={duplicateStatus}/>:null}{statusEdit?.value?<Button title="Excluir coluna" secondary onPress={deleteStatus}/>:null}</View>
    </Pressable>
   </Pressable>
  </Modal>
 </View>;
}
