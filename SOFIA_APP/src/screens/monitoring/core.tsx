import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {PALETTE} from '../../lib/palette';
import {rightClick} from '../../lib/web-page';
import {tap,useColumnPad} from '../../lib/desktop';
import {ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {useTheme} from '../../lib/theme';
import type {SofiaApi} from '../../lib/api';
import type {Entity} from '../../lib/types';
import {errorText} from '../../lib/chat-model';
import {useRenderCost} from '../../lib/render-cost';
import {MotionModal} from '../../components/MotionModal';
import {Sheet} from '../../components/Sheet';
import {InternalBackGesture} from '../../components/InternalBackGesture';
import {EmojiIcon, Icon} from '../../components/Icon';
import {Button, IconButton} from '../../components/UI';
import {PriceChart} from '../../components/PriceChart';
import {Spinner, LoadingLines} from '../../components/Loading';
import {readPrice, readLinks, USER_AGENT, DESKTOP_AGENT} from '../../lib/price-reader';
import {readStorePrice, identityOf, storedMLIdentity, isMercadoLivreUrl} from '../../lib/price-direct';
import type {MercadoLivreReading} from '../../lib/mercado-livre-types';
import {buildInjectedScript, parsePriceMessage} from '../../lib/price-extractor';
import type {StoreLink} from '../../lib/price-extractor';
import {fallbackSearchUrl} from '../../lib/price-extractor';
import {collectorState, onCollector, runCollection, cancelCollection, loadProducts, recordPrice, clearIssue, issueKey} from '../../lib/monitor-collector';
import type {StoreIssue} from '../../lib/monitor-collector';
import {
  PRODUCT_COLORS, WINDOWS, DROP_CHOICES, INTERVALS, money, percent, since, storeName, hostOf, nextColor,
  alertsOf, alertSummary, analyzeProduct, allReadings, searchTerms, extractProductUrl, replaceSource, readerUrl, readerAgent, searchTargetsFor, addSource, removeSource, makePrimary, withMemory, storesOf,
} from '../../lib/monitoring';
import type {ProductSeries, Window, Candidate, StoreSeries} from '../../lib/monitoring';
import {appAlert} from '../../lib/app-alert';
// 0.3.263: parte de Monitoring (ver src/screens/Monitoring.tsx).

export const GOOD = PALETTE.green, BAD = PALETTE.red;
export const ORIGIN: Record<string, string> = {
  'json-ld:offer': 'dados do produto na página', 'json-ld:priceSpecification': 'dados do produto na página', 'json-ld:lowPrice': 'preço “a partir de”',
  'microdata:price': 'marcação de preço da loja', 'microdata:lowPrice': 'preço “a partir de”', 'meta:product:price:amount': 'etiqueta de preço da página',
  'meta:og:price:amount': 'etiqueta de preço da página', 'meta:twitter:data1': 'resumo da página', 'texto-visivel': 'texto que aparece na tela',
};
export const originLabel = (o: string[]) => [...new Set(o.map(x => ORIGIN[x] || x))].join(' · ');
export const storeColor = (s: StoreSeries, i: number, product: ProductSeries) => s.primary ? product.color : PRODUCT_COLORS[(PRODUCT_COLORS.indexOf(product.color as any) + i + 1) % PRODUCT_COLORS.length];

export function useCollector() {
  const [, tick] = useState(0);
  useEffect(() => onCollector(() => tick(n => n + 1)), []);
  return collectorState();
}

export function Delta({value, size = 12}: {value: number | null; size?: number}) {
  if (value === null || Math.abs(value) < 0.05) return null;
  const down = value < 0;
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: (down ? GOOD : BAD) + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99}}>
      <Text style={{color: down ? GOOD : BAD, fontSize: size, fontWeight: '600'}}>{down ? '▼ ' : '▲ '}{percent(value).replace(/^[−+]/, '')}</Text>
    </View>
  );
}

export function Chips<T extends string | number>({value, options, onChange}: {value: T; options: Array<{value: T; label: string}>; onChange: (v: T) => void}) {
  const c = useTheme();
  return (
    <View style={{flexDirection: 'row', backgroundColor: c.input, borderRadius: 99, padding: 3}}>
      {options.map(o => (
        <Pressable key={String(o.value)} accessibilityRole="button" accessibilityState={{selected: o.value === value}} onPress={() => onChange(o.value)}
          style={{paddingHorizontal: 11, paddingVertical: 5, borderRadius: 99, backgroundColor: o.value === value ? c.surface : 'transparent'}}>
          <Text style={{fontSize: 12, fontWeight: '500', color: o.value === value ? c.text : c.muted}}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Spark({product, height = 34}: {product: ProductSeries; height?: number}) {
  return <View style={{width: 86}}><PriceChart axes={false} height={height} window="30d" lines={[{id: product.monitor.id, color: product.color, points: product.best.map(p => ({t: p.t, v: p.v}))}]} empty="" /></View>;
}

export function issuesFor(product: ProductSeries, issues: Record<string, StoreIssue>) {
  return product.stores.map(s => issues[issueKey(product.monitor.id, s.url)]).filter(Boolean) as StoreIssue[];
}
