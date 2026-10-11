import React, {useEffect, useRef} from 'react';
import {Animated, Text, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {useReducedMotion} from '../lib/motion';

/** Esqueleto que aparece no MESMO toque em que o app é aberto (estilo Notion/
 * Telegram): título real, blocos pulsando no lugar do conteúdo. O conteúdo
 * entra por cima quando estiver pronto — o toque nunca fica "travado". */
export function ModuleSkeleton({title, eyebrow, blocks = [150, 92, 92, 92]}: {title: string; eyebrow?: string; blocks?: number[]}) {
  const c = useTheme(), reduced = useReducedMotion(), pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, {toValue: 1, duration: 650, useNativeDriver: true}),
      Animated.timing(pulse, {toValue: 0.55, duration: 650, useNativeDriver: true}),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return (
    <View testID="module-skeleton" accessibilityRole="progressbar" accessibilityLabel={'Abrindo ' + title} style={{flex: 1, backgroundColor: c.bg, paddingHorizontal: 18, paddingTop: 22, gap: 14}}>
      <View style={{paddingLeft: 52, gap: 4}}>
        {eyebrow ? <Text style={{fontSize: 11, letterSpacing: 1.2, color: c.muted, fontWeight: '600'}}>{eyebrow}</Text> : null}
        <Text style={{fontSize: 24, fontWeight: '800', color: c.text}}>{title}</Text>
      </View>
      <Animated.View style={{gap: 14, opacity: pulse}}>
        <View style={{height: 30, width: '58%', borderRadius: 15, backgroundColor: c.line}} />
        {blocks.map((h, i) => <View key={i} style={{height: h, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line}} />)}
      </Animated.View>
    </View>
  );
}

/** Monta o conteúdo pesado um quadro depois do toque, com o esqueleto já na tela. */
export function useAfterFrame(key: string): boolean {
  const [ready, setReady] = React.useState('');
  useEffect(() => {
    if (!key) { setReady(''); return; }
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setReady(key)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [key]);
  return ready === key;
}
