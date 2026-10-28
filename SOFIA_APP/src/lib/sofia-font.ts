import {Platform, StyleSheet, type TextStyle} from 'react-native';
import React from 'react';
/** 0.3.259 (rodada premium, fase 1): fonte propria da Sofia - Plus Jakarta Sans (licenca OFL), igual no app e no site.
 * Site: @font-face com os arquivos em /assets/fonts (servidos junto com o site) e a familia aplicada em tudo.
 * Android: os arquivos vao para android/app/src/main/assets/fonts (plugin with-sofia-fonts) e cada peso tem o seu arquivo;
 * o Text/TextInput do react-native passam a escolher o arquivo pelo peso (sem negrito "fabricado" por cima). */
export const SOFIA_FONT = 'Sofia Sans';
const FILES: Record<string, string> = {'400': 'Regular', '500': 'Medium', '600': 'SemiBold', '700': 'Bold', '800': 'ExtraBold'};
export function nativeFamily(weight: TextStyle['fontWeight'], italic = false): string {
  if (italic) return 'SofiaSans-Italic';
  const w = weight === 'bold' ? '700' : weight === 'normal' || weight == null ? '400' : String(weight);
  const n = Math.min(800, Math.max(400, Math.round(Number(w) / 100) * 100 || 400));
  return 'SofiaSans-' + FILES[String(n)];
}
export function webFontCss(base = '/assets/fonts/'): string {
  const face = (w: string, file: string, style = 'normal') => `@font-face{font-family:'${SOFIA_FONT}';src:url('${base}SofiaSans-${file}.woff2') format('woff2');font-weight:${w};font-style:${style};font-display:swap}`;
  return [face('400', 'Regular'), face('500', 'Medium'), face('600', 'SemiBold'), face('700', 'Bold'), face('800', 'ExtraBold'), face('400', 'Italic', 'italic'),
    `html,body,#root,input,textarea,button,select,div,span{font-family:'${SOFIA_FONT}',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}`,
    `code,pre,kbd,samp,[data-mono]{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`,
    `body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:'cv11' 1}`].join('\n');
}
let installed = false;
export function installSofiaFont() {
  if (installed) return; installed = true;
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined' || document.getElementById('sofia-font')) return;
    const el = document.createElement('style'); el.id = 'sofia-font'; el.textContent = webFontCss(); document.head.appendChild(el);
    return;
  }
  if (Platform.OS !== 'android') return;
  try {
    const RN = require('react-native');
    const wrap = (Base: any, name: string) => {
      const Wrapped = (props: any) => {
        const flat = (StyleSheet.flatten(props.style) || {}) as TextStyle;
        if (flat.fontFamily) return React.createElement(Base, props);
        const family = nativeFamily(flat.fontWeight, flat.fontStyle === 'italic');
        return React.createElement(Base, {...props, style: [props.style, {fontFamily: family, fontWeight: 'normal', fontStyle: 'normal'}]});
      };
      Wrapped.displayName = 'Sofia' + name;
      Object.assign(Wrapped, Base);
      return Wrapped;
    };
    for (const name of ['Text', 'TextInput']) {
      const desc = Object.getOwnPropertyDescriptor(RN, name);
      if (!desc || !desc.configurable) continue;
      const Base = RN[name], Wrapped = wrap(Base, name);
      Object.defineProperty(RN, name, {configurable: true, enumerable: true, get: () => Wrapped});
    }
  } catch { /* sem a fonte propria: o app segue com a do sistema */ }
}
