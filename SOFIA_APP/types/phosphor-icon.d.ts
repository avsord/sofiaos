// 0.3.259: tipos dos icones Phosphor importados um a um (o TypeScript nao precisa checar o codigo-fonte do pacote).
import type {ComponentType} from 'react';
type Weight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
type PhosphorIcon = ComponentType<{size?: number; color?: string; weight?: Weight; mirrored?: boolean; testID?: string}>;
declare const icons: {[name: string]: PhosphorIcon};
export = icons;
