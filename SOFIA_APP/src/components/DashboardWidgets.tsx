import {agendaPriority,priorityColorsByDay,isHoliday,HOLIDAY_COLOR} from '../lib/agenda-priority';
import {useRenderCost} from '../lib/render-cost';
import {perfSync} from '../lib/fluency-metrics';
import {expandAgenda,eventStart,readRepeat} from '../lib/agenda-recurrence';
import {useAgendaView} from '../lib/agenda-view';
import {MotionModal} from './MotionModal';
import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Linking,Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import Svg,{Circle,Line,Polyline} from 'react-native-svg';
import type {DayRecord} from '../lib/dashboard';

import {localDateKey,monthCells} from '../lib/dashboard';
import {useTheme} from '../lib/theme';
import {Button,IconButton} from './UI';
import {MonthSwipe} from './MonthSwipe';
export function MiniAgenda({items,onOpen,onItem,onCreate,onGestureLock,viewOwner,active=true,onMonthChange,loading=false,pending=false}:{onCreate?:(day:string)=>void;loading?:boolean;pending?:boolean;onMonthChange?:(month:Date)=>void;active?:boolean;viewOwner:object;onGestureLock?:(locked:boolean)=>void;items:DayRecord[];onOpen:(day:string)=>void;onItem:(item:DayRecord)=>void}){useRenderCost('home:mini-agenda');
 const c=useTheme(),{month,setMonth,selected,setSelected}=useAgendaView(viewOwner,'home',active);
 useEffect(()=>{if(active)onMonthChange?.(month);},[active,month.getTime(),onMonthChange]);
 const expanded=useMemo(()=>perfSync('home:expand',()=>items.flatMap(record=>record.isTask||!record.original||readRepeat(record.original as import('../lib/types').AgendaItem).frequency==='none'?[record]:expandAgenda([record.original as import('../lib/types').AgendaItem],month).map(event=>({...record,id:record.id+eventStart(event),date:eventStart(event),original:event})))),[items,month.getTime()]);
 const dates=useMemo(()=>new Set(expanded.map(item=>localDateKey(item.date))),[expanded]),chosen=expanded.filter(i=>localDateKey(i.date)===selected);
 const priorityDays=useMemo(()=>perfSync('home:priority',()=>priorityColorsByDay(expanded.map(i=>({date:localDateKey(i.date),priority_level:i.original?(i.isTask?(i.original as import('../lib/types').Task).priority_level:(i.original as import('../lib/types').AgendaItem).data?.priority_level):'none',calendar_id:i.original&&!i.isTask?(i.original as import('../lib/types').AgendaItem).data?.calendar_id:undefined})),c.accent)),[expanded,c.accent]);
 const today=()=>{const now=new Date();setMonth(new Date(now.getFullYear(),now.getMonth(),1));setSelected(localDateKey(now));};
 return <MonthSwipe onLock={onGestureLock} onMonth={delta=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+delta,1))}><View testID="mini-agenda" style={{padding:14,borderRadius:22,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,gap:10}}>
  <View style={{flexDirection:'row',alignItems:'center'}}><Text style={{flex:1,color:c.text,fontWeight:'700',fontSize:19}}>Agenda</Text><Pressable accessibilityRole="button" accessibilityLabel="Abrir agenda completa" onPress={()=>onOpen(selected)} style={{padding:8}}><Text style={{fontSize:12,color:c.accent}}>Abrir agenda</Text></Pressable></View>
  <View testID="agenda-split-row" style={{flexDirection:'row',alignItems:'stretch'}}>
   <View testID="agenda-items-half" style={{width:'50%',minWidth:0,paddingRight:10}}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Abrir agenda de '+selected} onPress={()=>onOpen(selected)} style={{minHeight:34,justifyContent:'center',paddingBottom:5}}><Text style={{fontSize:12,fontWeight:'700',color:c.text}}>Dia {selected.slice(8)}/{selected.slice(5,7)}</Text><Text style={{fontSize:10,color:c.muted}}>{loading?'…':chosen.length} {chosen.length===1?'compromisso':'compromissos'}</Text></Pressable>
    <ScrollView testID="agenda-day-items" nativeID="sofia-agenda-items" nestedScrollEnabled={false} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" style={{height:190}} contentContainerStyle={{gap:6,paddingBottom:4}}>
     {chosen.length?chosen.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} onPress={()=>onItem(item)} style={(()=>{const holiday=!!item.original&&!item.isTask&&isHoliday(item.original as import('../lib/types').AgendaItem);return {paddingHorizontal:8,paddingVertical:8,borderRadius:10,backgroundColor:c.accentSoft,borderLeftWidth:3,borderLeftColor:holiday?HOLIDAY_COLOR:agendaPriority({data:{priority_level:item.original?(item.isTask?(item.original as import('../lib/types').Task).priority_level:(item.original as import('../lib/types').AgendaItem).data?.priority_level):'none'}}).color||c.accent,gap:4};})()}><Text numberOfLines={2} style={{color:c.text,fontSize:12,lineHeight:17,fontWeight:'500'}}>{item.title}</Text><Text style={{color:c.accent,fontSize:10}}>{item.date.length===10?'Dia inteiro':new Date(item.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</Text></Pressable>):<Text style={{color:c.muted,fontSize:12,lineHeight:18,paddingVertical:12}}>{loading?'Carregando compromissos…':pending?'Atualizando compromissos do Google…':'Nenhum compromisso neste dia.'}</Text>}
    </ScrollView>
   </View>
   <View testID="agenda-calendar-half" style={{width:'50%',minWidth:0,paddingLeft:8,borderLeftWidth:1,borderColor:c.line}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:34}}>
     <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} style={{width:24,height:34,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.accent,fontSize:22}}>‹</Text></Pressable>
     <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao dia de hoje" onPress={today} style={{flex:1,minWidth:0}}><Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{color:c.text,fontSize:11,fontWeight:'600',textAlign:'center',textTransform:'capitalize'}}>{month.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}</Text></Pressable>
     <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} style={{width:24,height:34,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.accent,fontSize:22}}>›</Text></Pressable>
    </View>
    <View style={{flexDirection:'row',paddingVertical:4}}>{['D','S','T','Q','Q','S','S'].map((v,i)=><Text key={i} maxFontSizeMultiplier={1.2} style={{width:'14.2857%',fontSize:9,color:c.muted,textAlign:'center'}}>{v}</Text>)}</View>
    <View style={{flexDirection:'row',flexWrap:'wrap',height:180}}>{monthCells(month).map((day,i)=>{const key=day?localDateKey(day):'',active=key===selected;return <View key={i} style={{width:'14.2857%',paddingVertical:1}}>{day?<Pressable testID={'agenda-day-'+key} accessibilityRole="button" accessibilityLabel={day.toLocaleDateString('pt-BR')+(dates.has(key)?', com compromissos':'')} accessibilityState={{selected:active}} onPress={()=>setSelected(key)} onLongPress={()=>{setSelected(key);onCreate?.(key);}} style={{height:28,borderRadius:7,alignItems:'center',justifyContent:'center',backgroundColor:active?c.accent:'transparent',gap:2}}><Text maxFontSizeMultiplier={1.25} style={{fontSize:11,color:active?'#fff':c.text}}>{day.getDate()}</Text><View style={{height:3,flexDirection:'row',gap:2}}>{(priorityDays.get(key)||[]).map(color=><View key={color} style={{width:3,height:3,borderRadius:2,backgroundColor:color===c.accent&&active?'#fff':color}}/>)}</View></Pressable>:null}</View>;})}</View>
   </View>
  </View>
 </View></MonthSwipe>;
}

