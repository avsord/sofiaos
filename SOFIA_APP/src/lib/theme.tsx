import { createContext, useContext } from 'react';
export const light = { bg:'#F7F6FA', surface:'#FFFFFF', text:'#272334', muted:'#7F7A8D', line:'#EAE6F0', accent:'#7258E8', accentSoft:'#EDE8FF', onAccent:'#FFFFFF', bubble:'#EBE5FF', card:'#F0ECF9', danger:'#B7475B', dangerBg:'#FFF0F2', success:'#3C8876', input:'#F4F2F7', shadow:'#302443', good:'#1F9D6E', warn:'#C27A12', info:'#2F7FD8', elevated:'#FFFFFF' };
// O destaque fica CLARO no escuro (pra se ver contra o fundo escuro). Por isso um texto
// branco fixo sobre ele (cartões, botões) ficava quase ilegível: o onAccent do modo escuro
// é escuro de propósito, sobre o destaque claro — o oposto do modo claro.
// 0.3.259: escuro DESENHADO (nao o claro invertido): base quase preta com um toque de violeta, e cada camada que sobe
// clareia um degrau (fundo -> superficie -> cartao -> elevado); linhas suaves; texto que nao e branco puro.
export const dark: typeof light = { bg:'#121017', surface:'#1C1924', text:'#F2EEFA', muted:'#A49DB6', line:'#2C2837', accent:'#B5A2FF', accentSoft:'#2E2644', onAccent:'#17122A', bubble:'#3A2C57', card:'#252130', danger:'#F5A0AE', dangerBg:'#3B2330', success:'#88CFB8', input:'#25212F', shadow:'#000000', good:'#5FD3A2', warn:'#F2B45C', info:'#7DB6FF', elevated:'#2A2636' };
export const ThemeContext = createContext(light);
export const useTheme = () => useContext(ThemeContext);
