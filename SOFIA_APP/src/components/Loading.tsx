import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {useTheme} from '../lib/theme';

/** Anel fino girando, como o do Notion: discreto, cinza, sem a rodinha grossa
 * e colorida do Android. O arco ocupa 3/4 do círculo. */
export function Spinner({size = 22, color, stroke = 2}: {size?: number; color?: string; stroke?: number}) {
  const c = useTheme(), spin = useRef(new Animated.Value(0)).current;
  // Gira sempre, mesmo com 'remover animações' ligado no celular: é um sinal de
  // que algo está carregando, não enfeite (pedido do dono).
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, {toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true}));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const r = (size - stroke) / 2, len = 2 * Math.PI * r;
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Carregando"
      style={{width: size, height: size, transform: [{rotate: spin.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']})}]}}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color || c.muted} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${len * 0.72} ${len}`} />
      </Svg>
    </Animated.View>
  );
}

/** Linhas finas no lugar do conteúdo (como as linhas da tabela do Notion),
 * respirando de leve. Separadores entre elas, larguras variadas. */
export function LoadingLines({rows = 3, separated = true}: {rows?: number; separated?: boolean}) {
  const c = useTheme(), pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, {toValue: 1, duration: 700, useNativeDriver: true}),
      Animated.timing(pulse, {toValue: 0.5, duration: 700, useNativeDriver: true}),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const widths = ['78%', '64%', '72%', '56%', '68%', '60%'];
  return (
    <Animated.View style={{opacity: pulse}}>
      {Array.from({length: rows}, (_, i) => (
        <View key={i} style={{paddingVertical: 18, borderBottomWidth: separated ? 1 : 0, borderColor: c.line}}>
          <View style={{height: 10, width: widths[i % widths.length] as any, borderRadius: 5, backgroundColor: c.line}} />
        </View>
      ))}
    </Animated.View>
  );
}

/** Troca de esqueleto para conteúdo de verdade suavizada: os dois ficam
 * empilhados por ~160 ms, o conteúdo entra esmaecendo por cima e o esqueleto
 * sai, em vez de um corte seco (a "piscada" ao abrir um menu pela primeira
 * vez, quando o aquecimento em segundo plano termina bem na hora do toque). */
export function FadeSwap({ready, fallback, children}: {ready: boolean; fallback: React.ReactNode; children: React.ReactNode}) {
  const [everReady, setEverReady] = useState(ready), fade = useRef(new Animated.Value(ready ? 1 : 0)).current, [showFallback, setShowFallback] = useState(!ready);
  useEffect(() => {
    if (!ready) return;
    setEverReady(true);
    Animated.timing(fade, {toValue: 1, duration: 160, useNativeDriver: true}).start(() => setShowFallback(false));
  }, [ready, fade]);
  if (!everReady) return <>{fallback}</>;
  return (
    <View style={{flex: 1}}>
      <Animated.View style={{flex: 1, opacity: fade}}>{children}</Animated.View>
      {showFallback ? <View style={StyleSheet.absoluteFill} pointerEvents="none">{fallback}</View> : null}
    </View>
  );
}

/** Carregando com o que já se sabe na tela: o título real aparece na hora,
 * o anel fino mostra que algo está vindo e as linhas marcam onde o conteúdo
 * vai entrar. Sem título, fica só o anel no centro. */
export function PageLoading({title, eyebrow, label, rows = 4, testID}: {title?: string; eyebrow?: string; label?: string; rows?: number; testID?: string}) {
  const c = useTheme();
  if (!title) return <View testID={testID} style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg}}><Spinner size={26} /></View>;
  return (
    <View testID={testID} style={{flex: 1, backgroundColor: c.bg, paddingHorizontal: 20, paddingTop: 22, gap: 18}}>
      <View style={{paddingLeft: 52, gap: 4}}>
        {eyebrow ? <Text style={{fontSize: 11, letterSpacing: 1.2, color: c.muted, fontWeight: '600'}}>{eyebrow}</Text> : null}
        <Text style={{fontSize: 24, fontWeight: '800', color: c.text}}>{title}</Text>
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', backgroundColor: c.surface, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: c.line}}>
        <Spinner size={16} stroke={1.8} />
        <Text style={{color: c.text, fontSize: 13, fontWeight: '600'}}>{label || 'Carregando'}</Text>
      </View>
      <LoadingLines rows={rows} />
    </View>
  );
}
