import { createContext, useContext } from 'react';
export const light = { bg:'#F7F6FA', surface:'#FFFFFF', text:'#272334', muted:'#7F7A8D', line:'#EAE6F0', accent:'#7258E8', accentSoft:'#EDE8FF', bubble:'#EBE5FF', card:'#F0ECF9', danger:'#B7475B', dangerBg:'#FFF0F2', success:'#3C8876', input:'#F4F2F7', shadow:'#302443' };
export const dark: typeof light = { bg:'#17151E', surface:'#221F2B', text:'#F5F0FF', muted:'#A7A0B8', line:'#383243', accent:'#B19BFF', accentSoft:'#382E51', bubble:'#40305C', card:'#2B2539', danger:'#F5A0AE', dangerBg:'#3B2330', success:'#88CFB8', input:'#2B2735', shadow:'#000000' };
export const ThemeContext = createContext(light);
export const useTheme = () => useContext(ThemeContext);
