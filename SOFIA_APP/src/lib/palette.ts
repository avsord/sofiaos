/** 0.3.263 (fase 1, cores): todas as cores fixas do app num lugar so. As que dependem do claro/escuro ficam no tema
 * (useTheme: text, muted, surface, accent, good, danger, warn, info...). Aqui ficam as que NAO mudam com o tema:
 * a paleta das categorias e graficos, o branco/preto sobre fundos coloridos e os veus (sombras de fundo). */
export const PALETTE = {
  white: '#FFFFFF', black: '#000000',
  brand: '#7258E8', brandLight: '#AC8CFF', brandDeep: '#21172F', ink: '#272334', paper: '#F7F6FA', lavender: '#F2EEFA',
  green: '#2FC58B', greenDeep: '#2FB37E', greenDark: '#378E78', red: '#FF6B7A', redDeep: '#D94B57', redBright: '#FF4747',
  blue: '#4FA3FF', blueBright: '#4F8CFF', sky: '#38B6FF', amber: '#FFB547', amberDeep: '#D9962B', amberDark: '#B77713', gold: '#F2A93B', yellow: '#FFE600',
  // demais tons usados em pontos isolados (nome pelo matiz)
  grayDark1: '#111111', teal1: '#14B8A6', violetDark1: '#16112A', blueDark1: '#16151D', blueDark2: '#1F3C88', green1: '#1F9D63', teal2: '#2A9B81', green2: '#35C58D', teal3: '#38BFA4', blue1: '#54A5ED', blue2: '#5C9DFF', blue3: '#659DF2', violet1: '#7353B8', gray1: '#7F7A8D', gray2: '#8A8A99', orange1: '#8D5B3A', gray3: '#8F88A3', gray4: '#9A95A8', violetLight1: '#AF9AFF', violet2: '#B39DDB', violetLight2: '#B497F5', violetLight3: '#B5A2FF', red1: '#C45061', violetLight4: '#C9C2DA', orange2: '#DA9C26', yellow1: '#DBAA36', pink1: '#ED79CB', red2: '#F26B7A', red3: '#FB6B72', red4: '#FF5D6C', orange3: '#FF9F43', orange4: '#FFBB44', yellow2: '#FFD23F', yellowLight1: '#FFF59D',
  slate: '#8A84A0', slateLight: '#9B95AA', pink: '#EF7BD0', rose: '#FF7EB6', teal: '#3FD0D4', lilac: '#A98BFF', orange: '#FF8A5B', lime: '#C6D84A', navy: '#2D3277',
} as const;
