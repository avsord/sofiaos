import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Pressable, Linking } from 'react-native';
import { SofiaApi, SITE } from '../lib/api';
import { useTheme } from '../lib/theme';
import { errorText } from '../lib/chat-model';
import type { Auth } from '../lib/types';
import { Brand, Button, ErrorBanner, IconButton, forms } from '../components/UI';
export function Login({ onLogin }: { onLogin: (a: Auth) => Promise<void> }) {
 const c=useTheme(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 async function enter() { if(loading||!email.trim()||!password)return;setLoading(true);setError('');try{const auth=await new SofiaApi().login(email,password,`Sofia App · ${Platform.OS}`);await onLogin(auth);setPassword('');}catch(e){setError(errorText(e));}finally{setLoading(false);} }
 return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,padding:28,justifyContent:'center'}}>
 <View style={{gap:24}}><View style={{flexDirection:'row',gap:12,alignItems:'center'}}><Brand/><Text style={{color:c.text,fontWeight:'700',fontSize:18}}>Sofia OS</Text></View>
 <View><Text style={{fontSize:42,lineHeight:46,letterSpacing:-1.7,fontWeight:'700',color:c.text}}>Seu dia.{'\n'}Sua Sofia.</Text><Text style={{color:c.muted,lineHeight:23,marginTop:14,fontSize:16}}>Um lugar para conversar, lembrar e organizar o que importa.</Text></View>
 <View style={[forms.card,{backgroundColor:c.surface,borderWidth:1,borderColor:c.line,padding:20,gap:18}]}>
 <View><Text style={[forms.label,{color:c.muted}]}>E-MAIL</Text><TextInput accessibilityLabel="E-mail de login" value={email} onChangeText={setEmail} style={[forms.input,{color:c.text,borderColor:c.line,backgroundColor:c.input}]} placeholder="Seu e-mail cadastrado" placeholderTextColor={c.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={160}/></View>
 <View><Text style={[forms.label,{color:c.muted}]}>SENHA</Text><View style={[forms.input,{flexDirection:'row',alignItems:'center',paddingRight:4,borderColor:c.line,backgroundColor:c.input}]}><TextInput accessibilityLabel="Senha da Sofia" value={password} onChangeText={setPassword} style={{flex:1,color:c.text,fontSize:16,minHeight:50}} placeholder="Senha da sua conta" placeholderTextColor={c.muted} secureTextEntry={!visible} autoComplete="current-password" textContentType="password" maxLength={200} onSubmitEditing={()=>void enter()} returnKeyType="go"/><IconButton name={visible?'eyeOff':'eye'} label={visible?'Ocultar senha':'Mostrar senha'} onPress={()=>setVisible(!visible)}/></View></View>
 <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(SITE+'/forgot-password')} style={{alignSelf:'flex-end',minHeight:32,justifyContent:'center'}}><Text style={{color:c.accent,fontSize:13,fontWeight:'600'}}>Esqueceu a senha?</Text></Pressable>
 <Button title="Entrar" onPress={()=>void enter()} loading={loading} disabled={!email.trim()||!password}/></View>{error?<ErrorBanner text={error}/>:null}
 <Text style={{fontSize:12,lineHeight:19,color:c.muted,textAlign:'center'}}>A mesma conta e os mesmos dados do site.{'\n'}A conversa no app não depende do WhatsApp.</Text>
 <View style={{flexDirection:'row',justifyContent:'center',gap:24}}>{[['Privacidade','privacy'],['Termos','terms']].map(([label,path])=><Pressable key={path} accessibilityRole="link" onPress={()=>void Linking.openURL(SITE+'/'+path)} style={{minHeight:40,justifyContent:'center'}}><Text style={{fontSize:12,color:c.muted}}>{label}</Text></Pressable>)}</View>
 </View></ScrollView></KeyboardAvoidingView>;
}
