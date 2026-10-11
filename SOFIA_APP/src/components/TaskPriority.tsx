import React from 'react';
import {View,Text} from 'react-native';
import type {Task} from '../lib/types';
import {taskPriority} from '../lib/task-filters';
import {useTheme} from '../lib/theme';
export function TaskPriority({task}:{task:Partial<Task>}){const c=useTheme(),p=taskPriority(task),color=p.color||c.muted;return <View accessible accessibilityLabel={'Prioridade: '+p.label} style={{flexDirection:'row',alignItems:'center',gap:5,alignSelf:'flex-start'}}><Text style={{color,fontWeight:'800',fontSize:13}}>{p.symbol}</Text><Text style={{color,fontSize:11}}>{p.label}</Text></View>;}
