// 0.3.253: escala de computador. O app foi escrito com tamanhos de celular (texto 15-16, titulos 24-38,
// controles de 50, espacos de 20-22, cantos de 22-24). No navegador com tela larga esses numeros viram a
// escala de um produto de computador (texto 13-14, controles 34-40, espacos 8-24, cantos 8-12).
// Funcoes puras: so a camada web (rn-desktop.tsx) usa; o celular nunca passa por aqui.

const r2=(v:number)=>Math.round(v*2)/2;

export function scaleFont(v:number):number{
 if(v<=11)return v;
 if(v<=13)return r2(v-0.5);
 if(v<=17)return r2(v-1.5);        // corpo: 15 -> 13,5 ; 16 -> 14,5 ; 17 -> 15,5
 if(v<=22)return r2(v*0.86);       // subtitulos: 18 -> 15,5 ; 20 -> 17 ; 22 -> 19
 return Math.round(v*0.8);         // titulos: 24 -> 19 ; 29 -> 23 ; 38 -> 30 ; 58 (icone de pagina) -> 46
}
export function scaleLine(v:number):number{return v<=14?v:Math.round(v*0.88);}
export function scaleSpace(v:number):number{
 if(v<=4)return v;
 if(v<=10)return r2(v*0.85);
 return Math.round(v*0.72);        // 12 -> 9 ; 16 -> 12 ; 20 -> 14 ; 22 -> 16 ; 28 -> 20 ; 32 -> 23
}
export function scaleRadius(v:number):number{
 if(v>=40)return v;                // pilulas e circulos (99, 999) continuam
 if(v<=8)return v;
 return Math.max(8,Math.round(v*0.55)); // 12 -> 8 ; 16 -> 9 ; 18 -> 10 ; 22 -> 12 ; 28 -> 15
}
/** Alturas e larguras fixas: so as de controle e icone encolhem. Medidas grandes (cartoes, grades,
 * colunas, larguras maximas) ficam como estao - varias telas fazem conta com elas. */
export function scaleSize(v:number):number{
 if(v<=12||v>96)return v;
 return Math.round(v*0.82);        // 44 -> 36 ; 50 -> 41 ; 56 -> 46 ; 36 -> 30
}

const FONT=new Set(['fontSize']);
const LINE=new Set(['lineHeight']);
const SPACE=new Set(['padding','paddingTop','paddingBottom','paddingLeft','paddingRight','paddingHorizontal','paddingVertical','paddingStart','paddingEnd',
 'margin','marginTop','marginBottom','marginLeft','marginRight','marginHorizontal','marginVertical','marginStart','marginEnd','gap','rowGap','columnGap']);
const RADIUS=new Set(['borderRadius','borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius']);
const SIZE=new Set(['width','height','minWidth','minHeight','maxHeight']);
const POS=new Set(['top','bottom','left','right']);

/** Recebe um estilo ja achatado e devolve outro com os numeros na escala de computador. */
export function scaleStyle<T extends Record<string,any>>(style:T|null|undefined):T|null|undefined{
 if(!style||typeof style!=='object')return style;
 let out:Record<string,any>|null=null;
 for(const key in style){
  const v=style[key];
  if(typeof v!=='number'||!Number.isFinite(v)||v===0)continue;
  const neg=v<0,a=Math.abs(v);
  let n=a;
  if(FONT.has(key))n=scaleFont(a);
  else if(LINE.has(key))n=scaleLine(a);
  else if(SPACE.has(key))n=scaleSpace(a);
  else if(RADIUS.has(key))n=scaleRadius(a);
  else if(SIZE.has(key))n=scaleSize(a);
  else if(POS.has(key))n=a<=24?scaleSpace(a):a;
  else continue;
  if(n!==a){if(!out)out={...style};out[key]=neg?-n:n;}
 }
 return (out||style) as T;
}
