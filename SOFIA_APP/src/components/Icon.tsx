import React from 'react';
import Svg, { Path } from 'react-native-svg';
const paths = {
 capsule:'M5 13l8-8a4.24 4.24 0 0 1 6 6l-8 8a4.24 4.24 0 0 1-6-6zM9 9l6 6',
 filter:'M4 6h16M7 12h10M10 18h4',
 more:'M5 12h.01M12 12h.01M19 12h.01',camera:'M3 7h4l2-3h6l2 3h4v14H3V7zm5 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0',clip:'M8 12l7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L13 3',
 settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3zm-1 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
 undo:'M3 10h10a7 7 0 0 1 7 7v3M3 10l6-6M3 10l6 6', redo:'M21 10H11a7 7 0 0 0-7 7v3M21 10l-6-6M21 10l-6 6', image:'M3 3h18v18H3V3zm0 13 6-6 6 6 3-3 3 3M15 7h1', copy:'M8 8h13v13H8V8zM3 16V3h13',
 home:'M3 10l9-7 9 7v10H3V10zm6 10v-7h6v7', chat:'M4 4h16v12H9l-5 4V4z',
 calendar:'M4 5h16v16H4V5zm0 5h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 4h2',
 bell:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3zm5 3h4',
 user:'M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0zm-4 14v-2a8 6 0 0 1 16 0v2',
 mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5zm-3 5v2a6 6 0 0 0 12 0v-2m-6 8v4m-4 0h8',
 send:'M3 3l19 9-19 9 4-9-4-9zm4 9h15', play:'M8 4l12 8-12 8V4z', pause:'M8 5v14m8-14v14', stop:'M6 6h12v12H6V6z',
 plus:'M12 4v16M4 12h16', close:'M6 6l12 12M6 18L18 6', back:'M15 5l-7 7 7 7',
 history:'M3 9a9 9 0 1 1 0 6M3 3v6h6m3-3v6l4 2', trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm7 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
 eyeOff:'M3 3l18 18M9 5c7-2 13 7 13 7l-3 4M6 6l-4 6s4 7 10 7l4-1',
 check:'M4 12l5 5L20 6', refresh:'M20 7a9 9 0 1 0 1 8M20 2v5h-5', logout:'M10 3H4v18h6m4-14 5 5-5 5M8 12h11',
 volume:'M3 9h4l5-5v16l-5-5H3V9zm13-2c4 3 4 7 0 10m3-13c6 5 6 11 0 16',
 chevron:'M9 5l7 7-7 7', shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3zm-4 9 3 3 5-6',
 grid:'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z',
 book:'M3 4h7l2 2 2-2h7v16h-7l-2 1-2-1H3V4zm9 2v15',
 list:'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
 edit:'M15 4l5 5M4 15L16 3l5 5L9 20l-6 1 1-6z',
 monitor:'M3 4h18v13H3V4zm5 17h8m-4-4v4M6 13l4-4 4 2 4-5'
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size=22, color='#7258E8' }: { name: IconName; size?: number; color?: string }) {
 return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={paths[name]} stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
