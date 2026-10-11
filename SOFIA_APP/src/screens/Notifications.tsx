import React from 'react';
import {ScrollView,View,RefreshControl} from 'react-native';
import {SofiaApi} from '../lib/api';
import {ScreenTitle,IconButton} from '../components/UI';
import {NotificationList,useNotifications} from '../components/NotificationCenter';
export function Notifications({api,onBack}:{api:SofiaApi;onBack?:()=>void}){const n=useNotifications();return <ScrollView contentContainerStyle={{paddingBottom:28}} refreshControl={<RefreshControl refreshing={n.loading} onRefresh={()=>void n.refresh()}/>}><ScreenTitle eyebrow="ATIVIDADES · AVISOS" title="Todas as notificações" right={<View style={{flexDirection:'row'}}>{n.unread>0?<IconButton name="check" label="Marcar tudo como lido" onPress={()=>void n.readAll()}/>:null}{onBack?<IconButton name="back" label="Voltar" onPress={onBack}/>:null}</View>}/><View style={{paddingHorizontal:22}}><NotificationList grouped/></View></ScrollView>;}
