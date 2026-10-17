import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {useTheme} from '../lib/theme';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {useRenderCost} from '../lib/render-cost';
import {MotionModal} from '../components/MotionModal';
import {Sheet} from '../components/Sheet';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {Icon} from '../components/Icon';
import {Button, IconButton} from '../components/UI';
import {PriceChart} from '../components/PriceChart';
import {Spinner, LoadingLines} from '../components/Loading';
import {readPrice, readLinks, USER_AGENT, DESKTOP_AGENT} from '../lib/price-reader';
import {readStorePrice, identityOf, storedMLIdentity, isMercadoLivreUrl} from '../lib/price-direct';
import type {MercadoLivreReading} from '../lib/mercado-livre-types';
import {buildInjectedScript, parsePriceMessage} from '../lib/price-extractor';
import type {StoreLink} from '../lib/price-extractor';
import {fallbackSearchUrl} from '../lib/price-extractor';
import {collectorState, onCollector, runCollection, cancelCollection, loadProducts, recordPrice, clearIssue, issueKey} from '../lib/monitor-collector';
import type {StoreIssue} from '../lib/monitor-collector';
import {
  PRODUCT_COLORS, WINDOWS, DROP_CHOICES, INTERVALS, money, percent, since, storeName, hostOf, nextColor,
  alertsOf, alertSummary, analyzeProduct, allReadings, searchTerms, extractProductUrl, replaceSource, readerUrl, readerAgent, searchTargetsFor, addSource, removeSource, makePrimary, withMemory, storesOf,
} from '../lib/monitoring';
import type {ProductSeries, Window, Candidate, StoreSeries} from '../lib/monitoring';
import {appAlert} from '../lib/app-alert';

const GOOD = '#2fc58b', BAD = '#ff6b7a';
const ORIGIN: Record<string, string> = {
  'json-ld:offer': 'dados do produto na página', 'json-ld:priceSpecification': 'dados do produto na página', 'json-ld:lowPrice': 'preço "a partir de"',
  'microdata:price': 'marcação de preço da loja', 'microdata:lowPrice': 'preço "a partir de"', 'meta:product:price:amount': 'etiqueta de preço da página',
  'meta:og:price:amount': 'etiqueta de preço da página', 'meta:twitter:data1': 'resumo da página', 'texto-visivel': 'texto que aparece na tela',
};
const originLabel = (o: string[]) => [...new Set(o.map(x => ORIGIN[x] || x))].join(' · ');
const storeColor = (s: StoreSeries, i: number, product: ProductSeries) => s.primary ? product.color : PRODUCT_COLORS[(PRODUCT_COLORS.indexOf(product.color as any) + i + 1) % PRODUCT_COLORS.length];

function useCollector() {
  const [, tick] = useState(0);
  useEffect(() => onCollector(() => tick(n => n + 1)), []);
  return collectorState();
}

function Delta({value, size = 12}: {value: number | null; size?: number}) {
  if (value === null || Math.abs(value) < 0.05) return null;
  const down = value < 0;
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: (down ? GOOD : BAD) + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99}}>
      <Text style={{color: down ? GOOD : BAD, fontSize: size, fontWeight: '700'}}>{down ? '▼ ' : '▲ '}{percent(value).replace(/^[−+]/, '')}</Text>
    </View>
  );
}

function Chips<T extends string | number>({value, options, onChange}: {value: T; options: Array<{value: T; label: string}>; onChange: (v: T) => void}) {
  const c = useTheme();
  return (
    <View style={{flexDirection: 'row', backgroundColor: c.input, borderRadius: 99, padding: 3}}>
      {options.map(o => (
        <Pressable key={String(o.value)} accessibilityRole="button" accessibilityState={{selected: o.value === value}} onPress={() => onChange(o.value)}
          style={{paddingHorizontal: 11, paddingVertical: 5, borderRadius: 99, backgroundColor: o.value === value ? c.surface : 'transparent'}}>
          <Text style={{fontSize: 12, fontWeight: '600', color: o.value === value ? c.text : c.muted}}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Spark({product, height = 34}: {product: ProductSeries; height?: number}) {
  return <View style={{width: 86}}><PriceChart axes={false} height={height} window="30d" lines={[{id: product.monitor.id, color: product.color, points: product.best.map(p => ({t: p.t, v: p.v}))}]} empty="" /></View>;
}

function issuesFor(product: ProductSeries, issues: Record<string, StoreIssue>) {
  return product.stores.map(s => issues[issueKey(product.monitor.id, s.url)]).filter(Boolean) as StoreIssue[];
}

// ======================= TELA PRINCIPAL =======================
export function Monitoring({api, active, onBack, focusId = ''}: {api: SofiaApi; active: boolean; onBack: () => void; focusId?: string}) {
  useRenderCost('apps:monitoring');
  const c = useTheme(), insets = useSafeAreaInsets(), col = useCollector();
  const [products, setProducts] = useState<ProductSeries[] | null>(null), [error, setError] = useState('');
  const [win, setWin] = useState<Window>('30d'), [hidden, setHidden] = useState<string[]>([]);
  const [adding, setAdding] = useState(false), [openId, setOpenId] = useState<string | null>(null);
  const scope = api.owner;
  // Vindo de um aviso: abre direto o produto.
  useEffect(() => { if (focusId && products?.some(p => p.monitor.id === focusId)) setOpenId(focusId); }, [focusId, products]);

  const load = useCallback(async () => {
    try { setProducts(await loadProducts(api)); setError(''); } catch (e) { setError(errorText(e)); setProducts(p => p || []); }
  }, [api]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  useEffect(() => { if (!col.running && col.lastRun && active) void load(); }, [col.running, col.lastRun, active, load]);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => { if (AppState.currentState === 'active') void runCollection(api, {scope}); }, 800);
    return () => clearTimeout(t);
  }, [active, api, scope]);

  const visible = (products || []).filter(p => !hidden.includes(p.monitor.id));
  const lines = visible.map(p => ({id: p.monitor.id, color: p.color, points: p.best}));
  const open = products?.find(p => p.monitor.id === openId) || null;
  const lastRead = Math.max(0, ...(products || []).map(p => p.lastAt || 0)) || null;

  return (
    <InternalBackGesture enabled={active && !adding && !open} onBack={onBack}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 14, paddingBottom: 6}}>
          <IconButton name="back" label="Voltar aos apps" onPress={onBack} />
          <View style={{flex: 1, paddingHorizontal: 4}}>
            <Text style={{fontSize: 11, letterSpacing: 1.2, color: c.muted, fontWeight: '600'}}>PREÇOS QUE VOCÊ ACOMPANHA</Text>
            <Text style={{fontSize: 24, fontWeight: '800', color: c.text}}>Price Tracker</Text>
          </View>
          <IconButton name="plus" label="Adicionar produto" filled onPress={() => setAdding(true)} />
        </View>

        <ScrollView contentContainerStyle={{padding: 18, paddingTop: 8, paddingBottom: insets.bottom + 40, gap: 16}}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void runCollection(api, {force: true, scope})} />}>
          <Pressable accessibilityRole="button" accessibilityLabel="Atualizar preços agora" disabled={col.running} onPress={() => void runCollection(api, {force: true, scope})}
            style={{flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6}}>
            {col.running ? <ActivityIndicator size="small" color={c.accent} /> : <Icon name="refresh" size={14} color={c.accent} />}
            <Text style={{fontSize: 12, color: c.text}} numberOfLines={1}>
              {col.running ? (col.total ? `Lendo ${col.label} (${Math.min(col.done + 1, col.total)}/${col.total})` : 'Conferindo o que precisa ser lido…') : `Lido ${since(lastRead)} · atualizar agora`}
            </Text>
          </Pressable>

          {error ? <Text style={{color: c.danger, fontSize: 13}}>{error}</Text> : null}
          {products === null ? <View style={{gap: 6}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}><Spinner size={16} stroke={1.8} /><Text style={{color: c.muted, fontSize: 13}}>Carregando produtos</Text></View><LoadingLines rows={4} /></View> : !products.length ? (
            <View style={{alignItems: 'center', gap: 14, paddingVertical: 40, paddingHorizontal: 10}}>
              <View style={{width: 84, height: 84, borderRadius: 42, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center'}}><Icon name="monitor" size={38} color={c.accent} /></View>
              <Text style={{fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center'}}>Acompanhe o preço do que você quer comprar</Text>
              <Text style={{fontSize: 14, lineHeight: 21, color: c.muted, textAlign: 'center'}}>Cole o link de um produto. A Sofia lê o preço, encontra o mesmo item em outras lojas, desenha o histórico e te avisa quando valer a pena.</Text>
              <View style={{alignSelf: 'stretch', marginTop: 8}}><Button title="Adicionar meu primeiro produto" onPress={() => setAdding(true)} /></View>
            </View>
          ) : (
            <>
              <View style={{backgroundColor: c.surface, borderRadius: 24, borderWidth: 1, borderColor: c.line, padding: 16, gap: 14}}>
                <View style={{alignSelf: 'flex-start'}}><Chips value={win} onChange={setWin} options={WINDOWS.map(w => ({value: w.value, label: w.label}))} /></View>
                <PriceChart lines={lines} height={210} window={win} mode="price" currency={visible[0]?.currency || 'BRL'} />
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                  {products.map(p => {
                    const off = hidden.includes(p.monitor.id);
                    return (
                      <Pressable key={p.monitor.id} accessibilityRole="switch" accessibilityState={{checked: !off}} accessibilityLabel={(off ? 'Mostrar ' : 'Esconder ') + p.monitor.title + ' no gráfico'}
                        onPress={() => setHidden(h => off ? h.filter(x => x !== p.monitor.id) : [...h, p.monitor.id])} onLongPress={() => setOpenId(p.monitor.id)}
                        style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: off ? c.line : p.color + '88', backgroundColor: off ? 'transparent' : p.color + '18', opacity: off ? 0.5 : 1}}>
                        <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: p.color}} />
                        <Text numberOfLines={1} style={{maxWidth: 140, fontSize: 12, color: c.text}}>{p.monitor.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{fontSize: 11, color: c.muted}}>Cada linha é a evolução do próprio produto (o melhor preço entre as lojas dele). Toque num nome para esconder ou mostrar a linha.</Text>
              </View>

              {products.map(p => {
                const iss = issuesFor(p, col.issues), alerts = alertsOf(p.monitor);
                return (
                  <Pressable key={p.monitor.id} accessibilityRole="button" accessibilityLabel={'Abrir ' + p.monitor.title} onPress={() => setOpenId(p.monitor.id)}
                    style={{flexDirection: 'row', backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: p.atLow ? GOOD + '88' : c.line, overflow: 'hidden', opacity: p.monitor.state === 'paused' ? 0.6 : 1}}>
                    <View style={{width: 5, backgroundColor: p.color}} />
                    <View style={{flex: 1, padding: 14, gap: 6}}>
                      <Text numberOfLines={2} style={{fontSize: 15, fontWeight: '600', color: c.text}}>{p.monitor.title}</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                        <View style={{flex: 1, gap: 3}}>
                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                            <Text style={{fontSize: 21, fontWeight: '800', color: c.text}}>{p.now ? money(p.now.price, p.currency) : '—'}</Text>
                            <Delta value={p.change} />
                          </View>
                          <Text numberOfLines={1} style={{fontSize: 12, color: c.muted}}>
                            {p.now ? 'na ' + p.now.store.name : 'aguardando a primeira leitura'} · {p.stores.length} {p.stores.length === 1 ? 'loja' : 'lojas'}{p.monitor.state === 'paused' ? ' · pausado' : ''}
                          </Text>
                        </View>
                        <Spark product={p} />
                      </View>
                      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                        {p.atLow ? <Tag color={GOOD} text="Menor preço já visto" /> : null}
                        {iss.length ? <Tag color="#ffb547" text={iss.some(i => i.kind === 'confirm') ? 'Confirme um preço' : iss.length + (iss.length === 1 ? ' loja não leu' : ' lojas não leram')} /> : null}
                        <Tag color={c.muted} text={alertSummary(alerts, p.currency)} subtle />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
              <Text style={{fontSize: 11, lineHeight: 17, color: c.muted, textAlign: 'center', paddingHorizontal: 12}}>
                Os preços são lidos neste celular, direto na página da loja, enquanto a Sofia está aberta. Sem leitura, sem ponto no gráfico: nada é estimado. Frete não incluído.
              </Text>
            </>
          )}
        </ScrollView>

        {adding ? <AddProduct api={api} used={(products || []).map(p => p.color)} existing={products || []} onClose={() => setAdding(false)}
          onCreated={id => { setAdding(false); void load().then(() => setOpenId(id)); }} /> : null}
        {open ? <ProductDetail others={(products || []).filter(p => p.monitor.id !== open.monitor.id).map(p => p.monitor)} api={api} product={open} issues={col.issues} running={col.running} onClose={() => setOpenId(null)} onChanged={load} onDeleted={() => { setOpenId(null); void load(); }} /> : null}
      </View>
    </InternalBackGesture>
  );
}

function Tag({text, color, subtle = false}: {text: string; color: string; subtle?: boolean}) {
  return (
    <View style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: subtle ? 'transparent' : color + '22', borderWidth: subtle ? 1 : 0, borderColor: color + '55'}}>
      <Text numberOfLines={1} style={{fontSize: 11, fontWeight: subtle ? '400' : '700', color}}>{text}</Text>
    </View>
  );
}

function Header({title, onClose, right}: {title: string; onClose: () => void; right?: React.ReactNode}) {
  const c = useTheme(), insets = useSafeAreaInsets();
  return (
    <View style={{paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.line}}>
      <IconButton name="back" label="Voltar" onPress={onClose} />
      <Text numberOfLines={1} style={{flex: 1, fontSize: 17, fontWeight: '700', color: c.text}}>{title}</Text>
      {right}
    </View>
  );
}

// ======================= ADICIONAR PRODUTO =======================
function AddProduct({api, used, existing, onClose, onCreated}: {api: SofiaApi; used: string[]; existing: ProductSeries[]; onClose: () => void; onCreated: (id: string) => void}) {
  const c = useTheme();
  const [url, setUrl] = useState(''), [step, setStep] = useState<'link' | 'reading' | 'review'>('link'), [error, setError] = useState('');
  const [title, setTitle] = useState(''), [candidates, setCandidates] = useState<Candidate[]>([]), [picked, setPicked] = useState<Candidate | null>(null);
  const [color] = useState(nextColor(used)), [busy, setBusy] = useState(false);
  const [mlReading, setMlReading] = useState<MercadoLivreReading | undefined>();
  const readController = React.useRef<AbortController | null>(null);
  useEffect(() => () => readController.current?.abort(), []);


  async function paste() { const t = (await Clipboard.getStringAsync().catch(() => '')).trim(); const u = extractProductUrl(t); if (u) setUrl(u); else if (t) setError('Não achei um link no que foi copiado.'); }
  async function read() {
    const clean = extractProductUrl(url);
    if (!clean) { setError('Não achei um link aí. Cole o link do produto (pode ser o texto inteiro do compartilhar).'); return; }
    if (existing.some(p => storesOf(p.monitor).some(s => s.url === clean))) { setError('Você já acompanha esse link.'); return; }
    setUrl(clean); setError(''); setStep('reading');
    // Leitor direto da loja primeiro (sem abrir página), igual à coleta automática.
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller; setMlReading(undefined);
    const r = await readStorePrice(clean, api, readPrice, {allowCatalogWinner: true, signal: controller.signal});
    if (controller.signal.aborted) return;
    if (!r.ok) { setError(r.error + ' Você ainda pode acompanhar: a Sofia tenta ler de novo depois.'); setTitle(''); setCandidates([]); setPicked(null); setStep('review'); return; }
    if (r.mercadoLivre) {
      const reading = r.mercadoLivre;
      if (existing.some(p => storesOf(p.monitor).some(s => storedMLIdentity(p.monitor.data.source_identities, s.url)?.identityKey === reading.identityKey))) {setError('Você já acompanha esse anúncio.'); setStep('link'); return;}
      setMlReading(reading); setUrl(reading.normalizedUrl);
    }
    setTitle(r.title.replace(/\s*[|–-]\s*(KaBuM!?|Mercado Livre|Pichau|Amazon\.com\.br|Magalu|AliExpress|Shopee).*$/i, '').trim());
    setCandidates(r.result.candidates);
    setPicked(r.result.best && !r.result.needsConfirmation ? r.result.best : null);
    setStep('review');
  }
  async function save() {
    const name = title.trim() || storeName(url) + ' · produto';
    setBusy(true); setError('');
    try {
      const saved = await api.saveEntity({kind: 'monitor', title: name.slice(0, 200), content: '', area: 'Pessoal', state: 'active', privacy: 'private', tags: [],
        data: {method: 'product', variant: name.slice(0, 200), preferred_url: url, source_urls: '', discover: false, currency: 'BRL', interval_minutes: 360, new_low: true, line_color: color,
          ...(picked ? {reader_memory: JSON.stringify({[url]: picked.origins.slice(0, 4)})} : {}), ...(mlReading ? {source_identities: JSON.stringify({[url]: identityOf(mlReading)})} : {})}});
      if (picked) await recordPrice(api, saved, url, picked.amount, '', [], '', mlReading).catch(() => undefined);
      onCreated(saved.id);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="Novo produto" onClose={onClose} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 22, gap: 18}}>
          {step === 'link' ? (
            <>
              <Text style={{fontSize: 22, fontWeight: '800', color: c.text}}>Qual produto?</Text>
              <Text style={{fontSize: 14, color: c.muted, lineHeight: 20}}>Abra o produto no app ou site da loja, toque em compartilhar → copiar link, e cole aqui. Só isso.</Text>
              <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                <TextInput accessibilityLabel="Link do produto" value={url} onChangeText={setUrl} placeholder="https://…" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url"
                  onSubmitEditing={() => void read()} style={{flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, color: c.text, backgroundColor: c.input, fontSize: 15}} />
                <Pressable accessibilityRole="button" accessibilityLabel="Colar link" onPress={() => void paste()} style={{paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, backgroundColor: c.accentSoft}}>
                  <Text style={{color: c.accent, fontWeight: '700'}}>Colar</Text>
                </Pressable>
              </View>
              {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
              <Button title="Ler produto" disabled={!url.trim()} onPress={() => void read()} />
              <Text style={{fontSize: 12, color: c.muted, lineHeight: 18}}>Mercado Livre é consultado no servidor, sem abrir a loja. Outras lojas usam o leitor interno. A loja pode recusar a consulta; nesse caso nenhum preço é inventado.</Text>
            </>
          ) : step === 'reading' ? (
            <View style={{alignItems: 'center', gap: 14, paddingVertical: 60}}>
              <ActivityIndicator size="large" color={c.accent} />
              <Text style={{color: c.text, fontSize: 16}}>Lendo a página da {storeName(url)}…</Text>
              <Text style={{color: c.muted, fontSize: 12}}>Pode levar alguns segundos.</Text>
            </View>
          ) : (
            <>
              <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 2, borderColor: color, padding: 18, gap: 10}}>
                <Text style={{fontSize: 11, letterSpacing: 1, fontWeight: '700', color}}>{storeName(url).toUpperCase()}</Text>
                <TextInput accessibilityLabel="Nome do produto" value={title} onChangeText={setTitle} placeholder="Nome do produto" placeholderTextColor={c.muted} multiline
                  style={{fontSize: 18, fontWeight: '700', color: c.text, padding: 0}} />
                <Text style={{fontSize: 30, fontWeight: '800', color: c.text}}>{picked ? money(picked.amount) : '—'}</Text>
                {mlReading ? <Text style={{fontSize: 13, color: c.muted}}>Vendedor: {mlReading.seller.name} · {mlReading.itemId}. Preço do produto, sem frete. Ao salvar, você confirma esta oferta.</Text> : null}
                {!picked && candidates.length ? <Text style={{fontSize: 13, color: '#d9962b'}}>A página mostra mais de um valor. Toque no preço certo:</Text> : null}
                {!picked && !candidates.length ? <Text style={{fontSize: 13, color: c.muted}}>Preço não encontrado agora. A Sofia tenta de novo nas próximas leituras.</Text> : null}
                {candidates.length > 1 || (!picked && candidates.length) ? (
                  <View style={{gap: 8}}>
                    {candidates.map((cand, i) => (
                      <Pressable key={i} accessibilityRole="radio" accessibilityState={{checked: picked === cand}} onPress={() => setPicked(cand)}
                        style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: picked === cand ? color : c.line, backgroundColor: picked === cand ? color + '18' : 'transparent'}}>
                        <Text style={{fontWeight: '700', color: c.text, fontSize: 15}}>{money(cand.amount, cand.currency || 'BRL')}</Text>
                        <Text style={{flex: 1, fontSize: 11, color: c.muted}} numberOfLines={2}>{originLabel(cand.origins)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={{flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.accentSoft, padding: 12, borderRadius: 14}}>
                <Icon name="bell" size={18} color={c.accent} />
                <Text style={{flex: 1, fontSize: 13, color: c.text, lineHeight: 19}}>Vou te avisar quando ele bater o menor preço já visto. Dá pra ajustar os avisos e buscar outras lojas logo depois.</Text>
              </View>
              {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
              <Button title="Começar a acompanhar" loading={busy} disabled={!candidates.length ? false : !picked} onPress={() => void save()} />
              <Pressable onPress={() => { setStep('link'); setError(''); }} style={{alignSelf: 'center', padding: 8}}><Text style={{color: c.accent}}>Trocar o link</Text></Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </MotionModal>
  );
}

function ColorRow({value, onChange}: {value: string; onChange: (c: string) => void}) {
  const c = useTheme();
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12}}>
      {PRODUCT_COLORS.map(color => (
        <Pressable key={color} accessibilityRole="radio" accessibilityState={{checked: value === color}} accessibilityLabel={'Cor ' + color} onPress={() => onChange(color)}
          style={{width: 34, height: 34, borderRadius: 17, backgroundColor: color, borderWidth: value === color ? 3 : 0, borderColor: c.text}} />
      ))}
    </View>
  );
}

// ======================= DETALHE DO PRODUTO =======================
type DetailTab = 'summary' | 'stores' | 'history' | 'settings';
const VERDICT_COLOR: Record<string, string> = {great: GOOD, good: GOOD, normal: '#4fa3ff', high: BAD, unknown: '#8a84a0'};
const VERDICT_ICON: Record<string, string> = {great: '🏆', good: '👍', normal: '〰️', high: '⏳', unknown: '🔎'};
const dateShort = (t: number) => new Date(t).toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'}).replace('.', '');
const dateTime = (t: number) => new Date(t).toLocaleString('pt-BR', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}).replace('.', '');

function ProductDetail({api, product, issues, running, onClose, onChanged, onDeleted, others = []}:
  {api: SofiaApi; product: ProductSeries; issues: Record<string, StoreIssue>; running: boolean; onClose: () => void; onChanged: () => Promise<void>; onDeleted: () => void; others?: Entity[]}) {
  const c = useTheme();
  const [monitor, setMonitor] = useState<Entity>(product.monitor), [win, setWin] = useState<Window>('30d'), [tab, setTab] = useState<DetailTab>('summary');
  const [saving, setSaving] = useState(''), [error, setError] = useState(''), [storeSheet, setStoreSheet] = useState(false);
  const [confirm, setConfirm] = useState<{store: StoreSeries; issue: Extract<StoreIssue, {kind: 'confirm'}>} | null>(null);
  const [menu, setMenu] = useState<StoreSeries | null>(null), [rename, setRename] = useState(product.monitor.title), [target, setTarget] = useState('');
  const [relink, setRelink] = useState<{store: StoreSeries; text: string; error: string} | null>(null), [productMenu, setProductMenu] = useState(false);
  const [viewer, setViewer] = useState<StoreSeries | null>(null);
  const [showAll, setShowAll] = useState(false), [storeFocus, setStoreFocus] = useState<string | null>(null), [showOthers, setShowOthers] = useState(false), [moving, setMoving] = useState<StoreSeries | null>(null);
  useEffect(() => { setMonitor(product.monitor); }, [product.monitor]);
  const alerts = alertsOf(monitor);
  useEffect(() => { setTarget(alerts.target ? String(alerts.target).replace('.', ',') : ''); }, [monitor.id]); // eslint-disable-line
  const a = useMemo(() => analyzeProduct(product, win), [product, win]);
  const readings = useMemo(() => allReadings(product), [product]);

  const patch = useCallback(async (data: Record<string, any>, extra: Partial<Entity> = {}, label = 'Salvo') => {
    if ((extra.state && extra.state !== 'active') || data.preferred_url !== undefined || data.source_urls !== undefined) cancelCollection(api, monitor.id);
    setSaving('Salvando…'); setError('');
    try {
      const saved = await api.saveEntity({...monitor, ...extra, data: {...monitor.data, ...data}});
      setMonitor(saved); setSaving(label); await onChanged(); setTimeout(() => setSaving(''), 1400);
      return saved;
    } catch (e) { setError(errorText(e)); setSaving(''); return null; }
  }, [api, monitor, onChanged]);

  const stores = [...product.stores].sort((x, y) => (x.last ? x.last.total : Infinity) - (y.last ? y.last.total : Infinity));
  const bestPrice = product.now?.price ?? null;
  const paused = monitor.state === 'paused';
  const readNow = () => void runCollection(api, {force: true, only: monitor.id, scope: api.owner});
  const statsOf = (url: string) => a.stores.find(s => s.url === url);
  const colorOfStore = (s: StoreSeries) => storeColor(s, product.stores.indexOf(s), product);
  const vc = VERDICT_COLOR[a.verdict.kind];

  function remove() {
    appAlert('Parar de acompanhar?', `“${monitor.title}” e todo o histórico de preços serão apagados.`, [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Apagar', style: 'destructive', onPress: () => { cancelCollection(api, monitor.id); api.deleteEntity(monitor.id).then(onDeleted).catch(e => setError(errorText(e))); }},
    ]);
  }
  // Comprou: vira despesa no Finanças (valor e loja do melhor preço) e o acompanhamento pausa.
  async function bought() {
    if (!product.now) return;
    appAlert('Comprou?', `Lançar ${money(product.now.price, product.currency)} na ${product.now.store.name} como despesa em Finanças e pausar este acompanhamento?`, [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Lançar', onPress: async () => {
        try {
          const accounts = (await api.entities('fin_account')).items.filter(a => a.state !== 'archived');
          if (!accounts.length) { setError('Crie primeiro uma conta em Apps → Finanças.'); return; }
          const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          await api.saveEntity({kind: 'fin_tx', title: monitor.title.slice(0, 200), content: 'Comprado na ' + product.now!.store.name + ' (Monitoramento)', area: 'Pessoal', state: 'active', privacy: 'private', tags: [],
            data: {kind: 'expense', amount: product.now!.price, date: today, category: 'Compras', account_id: accounts[0].id, paid: true, recurrence: 'none'}});
          await patch({}, {state: 'paused'}, 'Lançado em Finanças e pausado');
        } catch (e) { setError(errorText(e)); }
      }},
    ]);
  }
  async function saveTarget(text: string) {
    const v = Number(text.replace(/\./g, '').replace(',', '.'));
    if (!text.trim()) { await patch({target_price: ''}); return; }
    if (!Number.isFinite(v) || v <= 0) { setError('Digite um valor em reais, por exemplo 2.300'); return; }
    await patch({target_price: Math.round(v * 100) / 100});
  }

  const storeRow = (s: StoreSeries, i: number, expanded: boolean) => {
    const iss = issues[issueKey(monitor.id, s.url)], sc = colorOfStore(s), st = statsOf(s.url);
    const diff = s.last && bestPrice !== null ? s.last.total - bestPrice : null;
    const open = expanded && storeFocus === s.url;
    return (
      <View key={s.url} style={{borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
        <Pressable accessibilityRole="button" accessibilityLabel={(expanded ? 'Ver análise de ' : 'Opções de ') + s.name}
          onPress={() => expanded ? setStoreFocus(f => f === s.url ? null : s.url) : setMenu(s)} onLongPress={() => setMenu(s)}
          style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12}}>
          <View style={{width: 38, height: 38, borderRadius: 19, backgroundColor: sc + '26', alignItems: 'center', justifyContent: 'center'}}><Text style={{color: sc, fontWeight: '800'}}>{s.name.charAt(0)}</Text></View>
          <View style={{flex: 1, gap: 2}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <Text style={{fontSize: 15, fontWeight: '600', color: c.text}}>{s.name}</Text>
              {s.primary ? <Text style={{fontSize: 10, color: c.muted, borderWidth: 1, borderColor: c.line, borderRadius: 6, paddingHorizontal: 4}}>PRINCIPAL</Text> : null}
            </View>
            {iss?.kind === 'confirm' ? <Pressable onPress={() => setConfirm({store: s, issue: iss})}><Text style={{fontSize: 12, color: '#d9962b', fontWeight: '600'}}>Toque para confirmar o preço</Text></Pressable>
              : iss?.kind === 'failed' ? <Pressable onPress={() => setViewer(s)}><Text style={{fontSize: 12, color: BAD}} numberOfLines={3}>Não consegui ler: {iss.error}</Text><Text style={{fontSize: 12, color: c.accent, fontWeight: '700'}}>{isMercadoLivreUrl(s.url) ? 'Consultar no servidor →' : 'Ver a página e ler daqui →'}</Text></Pressable>
              : <Text style={{fontSize: 12, color: c.muted}}>{s.last ? 'lido ' + since(s.last.at) : 'ainda não lido'}{st && st.cheapestShare !== null && stores.length > 1 ? ' · mais barata ' + Math.round(st.cheapestShare * 100) + '% do tempo' : ''}</Text>}
          </View>
          <View style={{alignItems: 'flex-end', gap: 3}}>
            <Text style={{fontSize: 16, fontWeight: '700', color: c.text}}>{s.last ? money(s.last.total, product.currency) : '—'}</Text>
            {diff === 0 && stores.filter(x => x.last).length > 1 ? <Tag color={GOOD} text="Melhor preço" /> : diff ? <Text style={{fontSize: 11, color: c.muted}}>+{money(diff, product.currency)}</Text> : null}
          </View>
          <IconButton name="more" label={'Opções de ' + s.name} size={36} onPress={() => setMenu(s)} />
        </Pressable>
        {open && st ? (
          <View style={{gap: 10, paddingBottom: 14}}>
            <PriceChart lines={[{id: s.url, color: sc, points: s.points}]} height={120} window={win} currency={product.currency} refs={st.avg ? [{value: st.avg, color: c.muted}] : []} />
            <View style={{flexDirection: 'row', gap: 8}}>
              <Mini label="Menor" value={st.min !== null ? money(st.min, product.currency) : '—'} />
              <Mini label="Média" value={st.avg !== null ? money(st.avg, product.currency) : '—'} />
              <Mini label="Maior" value={st.max !== null ? money(st.max, product.currency) : '—'} />
            </View>
            <Text style={{fontSize: 12, color: c.muted}}>{st.changes ? `Mudou de preço ${st.changes} ${st.changes === 1 ? 'vez' : 'vezes'} no período · última ${dateShort(st.lastChange!)}` : 'Preço estável no período'} · {st.readings} {st.readings === 1 ? 'leitura' : 'leituras'}</Text>
            <Pressable onPress={() => void Linking.openURL(s.url)} style={{alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: sc}}><Text style={{color: '#fff', fontWeight: '700'}}>Abrir na {s.name}</Text></Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title={monitor.title} onClose={onClose} right={<IconButton name="more" label="Opções do produto" onPress={() => setProductMenu(true)} />} />
        <ScrollView keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]} contentContainerStyle={{paddingBottom: 50}}>
          {/* Destaque */}
          <View style={{padding: 18, paddingBottom: 10, gap: 6}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: product.color}} />
              <Text style={{fontSize: 12, color: c.muted}}>{product.now ? 'Melhor oferta agora · ' + product.now.store.name : 'Aguardando a primeira leitura'}</Text>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <Text style={{fontSize: 36, fontWeight: '800', color: c.text}}>{product.now ? money(product.now.price, product.currency) : '—'}</Text>
              <Delta value={product.change} size={13} />
            </View>
            {product.now ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(product.now!.store.url)} style={{alignSelf: 'flex-start', marginTop: 4, backgroundColor: product.color, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 99}}>
                <Text style={{color: '#fff', fontWeight: '700'}}>Abrir na {product.now.store.name}</Text>
              </Pressable>
            ) : null}
            {product.now ? <Pressable accessibilityRole="button" onPress={() => void bought()} style={{alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: product.color}}><Text style={{color: product.color, fontWeight: '700'}}>✓ Comprei — lançar em Finanças</Text></Pressable> : null}
          </View>
          <View style={{backgroundColor: c.bg, paddingHorizontal: 18, paddingVertical: 8}}>
            <Chips value={tab} onChange={setTab} options={[{value: 'summary' as DetailTab, label: 'Análise'}, {value: 'stores' as DetailTab, label: 'Lojas ' + product.stores.length}, {value: 'history' as DetailTab, label: 'Histórico'}, {value: 'settings' as DetailTab, label: 'Avisos'}]} />
          </View>

          <View style={{padding: 18, paddingTop: 8, gap: 16}}>
            {tab !== 'settings' ? <View style={{alignSelf: 'flex-start'}}><Chips value={win} onChange={setWin} options={WINDOWS.map(w => ({value: w.value, label: w.label}))} /></View> : null}

            {tab === 'summary' ? (
              <>
                <View style={{borderRadius: 22, padding: 16, gap: 12, backgroundColor: vc + '1c', borderWidth: 1, borderColor: vc + '55'}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <Text style={{fontSize: 26}}>{VERDICT_ICON[a.verdict.kind]}</Text>
                    <View style={{flex: 1}}><Text style={{fontSize: 17, fontWeight: '800', color: c.text}}>{a.verdict.title}</Text><Text style={{fontSize: 13, color: c.muted, lineHeight: 18}}>{a.verdict.text}</Text></View>
                  </View>
                  {a.min && a.max && a.max.v > a.min.v && bestPrice !== null ? (
                    <View style={{gap: 6}}>
                      <View style={{height: 10, borderRadius: 5, backgroundColor: c.line, overflow: 'visible'}}>
                        <View style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 5, flexDirection: 'row', overflow: 'hidden'}}>
                          <View style={{flex: 1, backgroundColor: GOOD + '88'}} /><View style={{flex: 2, backgroundColor: '#4fa3ff55'}} /><View style={{flex: 1, backgroundColor: BAD + '88'}} />
                        </View>
                        {a.avg !== null ? <View style={{position: 'absolute', top: -3, width: 2, height: 16, backgroundColor: c.muted, left: `${Math.min(100, Math.max(0, (a.avg - a.min.v) / (a.max.v - a.min.v) * 100))}%`}} /> : null}
                        <View style={{position: 'absolute', top: -5, width: 20, height: 20, marginLeft: -10, borderRadius: 10, backgroundColor: product.color, borderWidth: 3, borderColor: c.surface, left: `${Math.min(100, Math.max(0, (a.position ?? 0) * 100))}%`}} />
                      </View>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                        <Text style={{fontSize: 11, color: GOOD, fontWeight: '700'}}>{money(a.min.v, product.currency)}</Text>
                        <Text style={{fontSize: 11, color: c.muted}}>média {a.avg !== null ? money(a.avg, product.currency) : '—'}</Text>
                        <Text style={{fontSize: 11, color: BAD, fontWeight: '700'}}>{money(a.max.v, product.currency)}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 14, gap: 10}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Text style={{fontWeight: '700', color: c.text}}>Melhor preço ao longo do tempo</Text>
                  </View>
                  <PriceChart lines={[{id: 'best', color: product.color, points: product.best}]} height={200} window={win} currency={product.currency}
                    refs={[...(a.avg !== null ? [{value: a.avg, color: c.muted}] : []), ...(alerts.target ? [{value: alerts.target, color: GOOD}] : [])]} />
                  <View style={{flexDirection: 'row', gap: 14, flexWrap: 'wrap'}}>
                    <Legend color={product.color} text="melhor preço entre as lojas" />
                    {a.avg !== null ? <Legend color={c.muted} text="média do período" dashed /> : null}
                    {alerts.target ? <Legend color={GOOD} text="seu preço-alvo" dashed /> : null}
                  </View>
                </View>

                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
                  {a.flat && a.min ? (
                    <Stat wide label="Preço no período" value={money(a.min.v, product.currency)} sub={'sem variação desde ' + dateShort(a.min.t)} />
                  ) : (
                    <>
                      <Stat label="Menor do período" value={a.min ? money(a.min.v, product.currency) : '—'} sub={a.min ? dateShort(a.min.t) : ''} color={a.min ? GOOD : undefined} />
                      <Stat label="Maior do período" value={a.max ? money(a.max.v, product.currency) : '—'} sub={a.max ? dateShort(a.max.t) : ''} color={a.max ? BAD : undefined} />
                    </>
                  )}
                  <Stat label="Agora vs média" value={a.vsAvg === null ? '—' : percent(a.vsAvg)} sub={a.avg !== null ? 'média ' + money(a.avg, product.currency) : ''} color={a.vsAvg === null ? undefined : a.vsAvg < 0 ? GOOD : a.vsAvg > 0 ? BAD : undefined} />
                  <Stat label="Mediana" value={a.median !== null ? money(a.median, product.currency) : '—'} sub="metade das leituras abaixo" />
                  <Stat label="Mudanças de preço" value={String(a.changes.length)} sub={a.changes.length ? 'última ' + dateShort(a.changes[0].t) : 'estável'} />
                  <Stat label="Acompanhando" value={Math.max(1, Math.round(a.days)) + (Math.round(a.days) === 1 ? ' dia' : ' dias')} sub={a.readings + ' leituras'} />
                </View>

                {a.saving || a.spread ? (
                  <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 16, gap: 10}}>
                    <Text style={{fontWeight: '700', color: c.text}}>Quanto vale a pena</Text>
                    {a.spread && a.spread.diff > 0 ? <Insight icon="🏪" text={`Hoje a ${a.spread.cheap} está ${money(a.spread.diff, product.currency)} mais barata que a ${a.spread.expensive}.`} /> : null}
                    {a.saving ? <Insight icon="💰" text={`Comprando agora você paga ${money(a.saving, product.currency)} a menos que no pico do período (${a.max ? dateShort(a.max.t) : ''}).`} /> : null}
                    {product.low && bestPrice !== null && bestPrice > product.low.price ? <Insight icon="📌" text={`Já esteve ${money(bestPrice - product.low.price, product.currency)} mais barato, em ${dateShort(product.low.at)}.`} /> : null}
                  </View>
                ) : null}

                <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 16, gap: 4}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Text style={{fontWeight: '700', color: c.text}}>Onde comprar</Text>
                    <Pressable onPress={() => setTab('stores')}><Text style={{color: c.accent, fontSize: 13, fontWeight: '600'}}>Ver lojas</Text></Pressable>
                  </View>
                  {stores.slice(0, 3).map((s, i) => storeRow(s, i, false))}
                </View>
              </>
            ) : tab === 'stores' ? (
              <>
                <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 14, gap: 10}}>
                  <Text style={{fontWeight: '700', color: c.text}}>Cada loja no tempo</Text>
                  <PriceChart lines={product.stores.map(s => ({id: s.url, color: colorOfStore(s), points: s.points}))} height={190} window={win} currency={product.currency} />
                  <View style={{flexDirection: 'row', gap: 14, flexWrap: 'wrap'}}>{product.stores.map(s => <Legend key={s.url} color={colorOfStore(s)} text={s.name} />)}</View>
                </View>
                <Section title="Lojas" hint="Toque numa loja para ver a análise dela. Segure para mais opções.">
                  {/* 0.3.146: a oferta principal (escolhida por voce) e a que aparece no Inicio; as outras
                      ficam recolhidas aqui e continuam sendo acompanhadas normalmente. */}
                  {stores.filter(s => s.primary).map((s, i) => storeRow(s, i, true))}
                  {stores.some(s => !s.primary) ? <Pressable accessibilityRole="button" accessibilityState={{expanded: showOthers}} onPress={() => setShowOthers(v => !v)} style={{paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6}}><Text style={{color: c.accent, fontWeight: '700'}}>{showOthers ? 'Esconder' : 'Ver'} outras ofertas ({stores.filter(s => !s.primary).length})</Text><Text style={{color: c.muted, fontSize: 11}}>· acompanhadas, fora do Início</Text></Pressable> : null}
                  {showOthers ? stores.filter(s => !s.primary).map((s, i) => storeRow(s, i + 1, true)) : null}
                  <Pressable accessibilityRole="button" onPress={() => setStoreSheet(true)}
                    style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent}}>
                    <Icon name="plus" size={16} color={c.accent} />
                    <Text style={{color: c.accent, fontWeight: '700'}}>Adicionar outra loja</Text>
                  </Pressable>
                </Section>
              </>
            ) : tab === 'history' ? (
              <>
                <Section title="Mudanças de preço" hint="Só aparece quando o valor muda de verdade numa loja.">
                  {a.changes.length ? a.changes.slice(0, showAll ? 200 : 12).map((ch, i) => (
                    <View key={ch.url + ch.t} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
                      <View style={{width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: (ch.pct < 0 ? GOOD : BAD) + '22'}}><Text style={{color: ch.pct < 0 ? GOOD : BAD, fontWeight: '800'}}>{ch.pct < 0 ? '↓' : '↑'}</Text></View>
                      <View style={{flex: 1}}><Text style={{fontSize: 14, color: c.text}}>{ch.store}: {money(ch.from, product.currency)} → <Text style={{fontWeight: '700'}}>{money(ch.to, product.currency)}</Text></Text><Text style={{fontSize: 11, color: c.muted}}>{dateTime(ch.t)}</Text></View>
                      <Text style={{fontSize: 13, fontWeight: '700', color: ch.pct < 0 ? GOOD : BAD}}>{percent(ch.pct)}</Text>
                    </View>
                  )) : <Text style={{fontSize: 13, color: c.muted}}>Nenhuma mudança neste período.</Text>}
                </Section>
                <Section title="Todas as leituras" hint={readings.length + ' leituras desde o início. Sem leitura, sem ponto: nada é estimado.'}>
                  {readings.slice(0, showAll ? 500 : 15).map((r, i) => (
                    <View key={r.store + r.t + i} style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
                      <Text style={{fontSize: 12, color: c.muted}}>{dateTime(r.t)} · {r.store}</Text>
                      <Text style={{fontSize: 13, color: c.text, fontWeight: '600'}}>{money(r.v, product.currency)}</Text>
                    </View>
                  ))}
                  {readings.length > 15 || a.changes.length > 12 ? <Pressable onPress={() => setShowAll(v => !v)} style={{paddingTop: 8}}><Text style={{color: c.accent, fontWeight: '600'}}>{showAll ? 'Mostrar menos' : 'Mostrar tudo'}</Text></Pressable> : null}
                </Section>
              </>
            ) : (
              <>
                <Section title="Me avise quando" hint={paused ? 'Produto pausado: nenhum aviso sai enquanto estiver pausado.' : 'Pode ligar um, vários ou todos. O aviso chega no celular na hora em que a Sofia lê o preço.'}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4}}>
                    <View style={{flex: 1}}><Text style={{fontSize: 15, fontWeight: '700', color: c.text}}>Todos os avisos</Text><Text style={{fontSize: 12, color: c.muted}}>{[alerts.newLow, alerts.drop !== null, alerts.target !== null].filter(Boolean).length} de 3 ligados</Text></View>
                    <Switch accessibilityLabel="Ligar todos os avisos" value={alerts.newLow && alerts.drop !== null && alerts.target !== null} onValueChange={v => {
                      if (!v) { setTarget(''); void patch({new_low: false, drop_percent: '', target_price: ''}, {}, 'Avisos desligados'); return; }
                      const t = alerts.target ?? (bestPrice ? Math.round(bestPrice * 0.9) : null);
                      if (t) setTarget(String(t));
                      void patch({new_low: true, drop_percent: alerts.drop ?? 10, ...(t ? {target_price: t} : {})}, {}, t ? 'Todos os avisos ligados' : 'Avisos ligados; o preço-alvo entra após a primeira leitura');
                    }} />
                  </View>
                  <AlertCard icon="🏆" title="Bater o menor preço da história" text={product.low ? 'Hoje o menor já visto é ' + money(product.low.price, product.currency) + '.' : 'Vale a partir da segunda leitura.'}
                    value={alerts.newLow} onChange={v => void patch({new_low: v})} />
                  <AlertCard icon="📉" title="Cair de repente" text="Comparado à leitura anterior da mesma loja." value={alerts.drop !== null} onChange={v => void patch({drop_percent: v ? 10 : ''})}>
                    {alerts.drop !== null ? <DropSimulator drop={alerts.drop} stores={stores} currency={product.currency} onChange={p => void patch({drop_percent: p})} /> : null}
                  </AlertCard>
                  <AlertCard icon="🎯" title="Chegar no meu preço" text={alerts.target ? (bestPrice !== null && bestPrice <= alerts.target ? 'Já está no seu preço agora: ' + money(bestPrice, product.currency) + '.' : bestPrice !== null ? 'Faltam ' + money(bestPrice - alerts.target, product.currency) + ' (' + percent((alerts.target - bestPrice) / bestPrice * 100).replace('−', '') + ') para chegar em ' + money(alerts.target, product.currency) + '.' : 'Aviso quando estiver em ' + money(alerts.target, product.currency) + ' ou menos.') : 'Defina quanto você aceita pagar.'}
                    value={alerts.target !== null} onChange={v => { if (!v) { setTarget(''); void patch({target_price: ''}); } else if (bestPrice) { const s = Math.round(bestPrice * 0.9); setTarget(String(s)); void patch({target_price: s}); } else setTarget(' '); }}>
                    {alerts.target !== null || target ? (
                      <View style={{gap: 10}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                          <Text style={{color: c.muted, fontSize: 16}}>R$</Text>
                          <TextInput accessibilityLabel="Meu preço" value={target.trim()} onChangeText={setTarget} onEndEditing={e => void saveTarget(e.nativeEvent.text)} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
                            style={{flex: 1, fontSize: 20, fontWeight: '700', color: c.text, borderBottomWidth: 1, borderColor: c.line, paddingVertical: 4}} />
                        </View>
                        <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap'}}>
                          {bestPrice ? [5, 10, 20].map(p => { const v = Math.round(bestPrice * (1 - p / 100)); return (
                            <Pressable key={p} onPress={() => { setTarget(String(v)); void patch({target_price: v}); }} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: c.input}}>
                              <Text style={{fontSize: 12, color: c.text}}>−{p}% · {money(v, product.currency).replace(/,00$/, '')}</Text>
                            </Pressable>); }) : null}
                          {product.low ? <Pressable onPress={() => { const v = Math.round(product.low!.price); setTarget(String(v)); void patch({target_price: v}); }} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: c.input}}>
                            <Text style={{fontSize: 12, color: c.text}}>menor já visto · {money(product.low.price, product.currency).replace(/,00$/, '')}</Text></Pressable> : null}
                        </View>
                      </View>
                    ) : null}
                  </AlertCard>
                </Section>
                <Section title="Ajustes">
                  <View style={{gap: 6}}>
                    <Text style={{fontSize: 12, color: c.muted}}>Nome</Text>
                    <TextInput accessibilityLabel="Nome do produto" value={rename} onChangeText={setRename} onEndEditing={() => { if (rename.trim() && rename.trim() !== monitor.title) void patch({}, {title: rename.trim()}); }}
                      style={{fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} />
                  </View>
                  <View style={{gap: 8}}><Text style={{fontSize: 12, color: c.muted}}>Cor da linha</Text><ColorRow value={product.color} onChange={col => void patch({line_color: col})} /></View>
                  <View style={{gap: 8}}>
                    <Text style={{fontSize: 12, color: c.muted}}>Ler o preço a cada</Text>
                    <Chips value={Number(monitor.data.interval_minutes) || 360} onChange={v => void patch({interval_minutes: v})} options={INTERVALS} />
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <View style={{flex: 1}}><Text style={{color: c.text, fontSize: 15}}>Pausar acompanhamento</Text><Text style={{color: c.muted, fontSize: 12}}>Mantém o histórico, mas não lê nem avisa.</Text></View>
                    <Switch value={paused} onValueChange={v => void patch({}, {state: v ? 'paused' : 'active'})} />
                  </View>
                  <Pressable accessibilityRole="button" onPress={remove} style={{paddingVertical: 12, alignItems: 'center'}}><Text style={{color: c.danger, fontWeight: '700'}}>Parar de acompanhar e apagar histórico</Text></Pressable>
                </Section>
              </>
            )}
            {saving ? <Text style={{textAlign: 'center', color: c.muted, fontSize: 12}}>{saving}</Text> : null}
            {error ? <Text style={{textAlign: 'center', color: c.danger}}>{error}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={!!menu || !!moving} onClose={() => { setMenu(null); setMoving(null); }} label="Fechar opções da loja">
        {moving ? (
          <View style={{gap: 6}}>
            <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 6}}>Mover {moving.name} para…</Text>
            <Text style={{fontSize: 12, color: c.muted, marginBottom: 4}}>A oferta sai deste produto e passa a ser acompanhada no escolhido. Só mova se for exatamente o mesmo produto.</Text>
            {others.map(o => <SheetItem key={o.id} label={String(o.title || 'Produto')} onPress={() => { const u = moving.url, target = o; setMoving(null); void (async () => { try { await api.saveEntity({...target, data: {...target.data, source_urls: addSource(target, u)}}); await patch(removeSource(monitor, u), {}, 'Oferta movida'); } catch (e) { setError(errorText(e)); } })(); }} />)}
            <SheetItem label="Cancelar" onPress={() => setMoving(null)} />
          </View>
        ) : menu ? (
          <View style={{gap: 6}}>
            <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 6}}>{menu.name}</Text>
            <SheetItem label="Abrir na loja" onPress={() => { const u = menu.url; setMenu(null); void Linking.openURL(u); }} />
            <SheetItem label="Ler o preço agora" onPress={() => { setMenu(null); readNow(); }} />
            <SheetItem label={isMercadoLivreUrl(menu.url) ? "Ler pelo servidor" : "Ver a página que a Sofia lê"} onPress={() => { const s = menu; setMenu(null); setViewer(s); }} />
            <SheetItem label="Trocar o link" onPress={() => { const s = menu; setMenu(null); setRelink({store: s, text: s.url, error: ''}); }} />
            {!menu.primary ? <SheetItem label="Tornar oferta principal (a do Início)" onPress={() => { const u = menu.url; setMenu(null); void patch(makePrimary(monitor, u)); }} /> : null}
            {product.stores.length > 1 && others.length ? <SheetItem label="Mover para outro produto" onPress={() => { const s = menu; setMenu(null); setMoving(s); }} /> : null}
            {product.stores.length > 1 ? <SheetItem danger label="Remover esta loja" onPress={() => { const u = menu.url; setMenu(null); void patch(removeSource(monitor, u)); }} />
              : <Text style={{fontSize: 12, color: c.muted, paddingVertical: 8}}>Esta é a única loja. Para parar, use “Parar de acompanhar” nos ajustes.</Text>}
          </View>
        ) : null}
      </Sheet>

      {storeSheet ? <AddStores api={api} monitor={monitor} onClose={() => setStoreSheet(false)} onAdded={async urls => {
        let data = monitor;
        for (const u of urls) data = {...data, data: {...data.data, source_urls: addSource(data, u)}};
        const saved = await patch({source_urls: data.data.source_urls}, {}, urls.length === 1 ? 'Loja adicionada' : urls.length + ' lojas adicionadas');
        setStoreSheet(false);
        if (saved) void runCollection(api, {only: saved.id, scope: api.owner});
      }} /> : null}

      {viewer ? <PageViewer api={api} monitor={monitor} store={viewer} onClose={() => setViewer(null)} onSaved={async () => { setViewer(null); clearIssue(issueKey(monitor.id, viewer.url)); await onChanged(); }} /> : null}

      <Sheet visible={productMenu} onClose={() => setProductMenu(false)} label="Fechar opções do produto">
        <View style={{gap: 2}}>
          <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 6}} numberOfLines={1}>{monitor.title}</Text>
          <SheetItem label={running ? 'Lendo os preços…' : 'Atualizar preços agora'} onPress={() => { setProductMenu(false); if (!running) readNow(); }} />
          {product.stores[0] ? <SheetItem label="Trocar o link principal" onPress={() => { setProductMenu(false); const s = product.stores.find(x => x.primary) || product.stores[0]; setRelink({store: s, text: s.url, error: ''}); }} /> : null}
          <SheetItem label="Adicionar outra loja (colar link)" onPress={() => { setProductMenu(false); setStoreSheet(true); }} />
          <SheetItem danger label="Excluir produto" onPress={() => { setProductMenu(false); remove(); }} />
        </View>
      </Sheet>

      <Sheet visible={!!relink} onClose={() => setRelink(null)} label="Fechar troca de link">
        {relink ? (
          <View style={{gap: 12}}>
            <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>Trocar o link · {relink.store.name}</Text>
            <Text style={{fontSize: 12, color: c.muted}}>Cole o link novo do mesmo produto (pode ser o texto inteiro do "Compartilhar"). O histórico do link antigo deixa de aparecer no gráfico.</Text>
            <TextInput accessibilityLabel="Link novo" value={relink.text} onChangeText={text => setRelink(r => r && {...r, text, error: ''})} autoCapitalize="none" autoCorrect={false} keyboardType="url"
              style={{borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, color: c.text, backgroundColor: c.input}} />
            <Pressable onPress={async () => { const t = await Clipboard.getStringAsync().catch(() => ''); const u = extractProductUrl(t); if (u) setRelink(r => r && {...r, text: u, error: ''}); }} style={{alignSelf: 'flex-start'}}><Text style={{color: c.accent, fontWeight: '700'}}>Colar da área de transferência</Text></Pressable>
            {relink.error ? <Text style={{color: c.danger}}>{relink.error}</Text> : null}
            <Button title="Salvar link" onPress={async () => {
              const u = extractProductUrl(relink.text);
              if (!u) { setRelink(r => r && {...r, error: 'Não achei um link aí.'}); return; }
              if (u !== relink.store.url && product.stores.some(s => s.url === u)) { setRelink(r => r && {...r, error: 'Esse link já está em outra loja deste produto.'}); return; }
              const old = relink.store.url; setRelink(null);
              if (u === old) return;
              const memo = (() => { try { const m = JSON.parse(String(monitor.data.reader_memory || '{}')); delete m[old]; return JSON.stringify(m); } catch { return '{}'; } })();
              const saved = await patch({...replaceSource(monitor, old, u), reader_memory: memo}, {}, 'Link trocado');
              if (saved) void runCollection(api, {force: true, only: saved.id, scope: api.owner});
            }} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} label="Fechar confirmação de preço">
        {confirm ? (
          <View style={{gap: 10}}>
            <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>Qual é o preço na {confirm.store.name}?</Text>
            <Text style={{fontSize: 13, color: c.muted}}>A página mostrou mais de um valor. Escolha uma vez: nas próximas leituras a Sofia usa o mesmo lugar da página.</Text>
            {confirm.issue.candidates.map((cand, i) => (
              <Pressable key={i} onPress={async () => {
                const {store} = confirm; setConfirm(null);
                const saved = await patch({reader_memory: withMemory(monitor, store.url, cand.origins)}, {}, 'Preço confirmado');
                if (saved) { await recordPrice(api, saved, store.url, cand.amount, api.owner, undefined, store.name).catch(e => setError(errorText(e))); clearIssue(issueKey(saved.id, store.url)); await onChanged(); }
              }} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.line}}>
                <Text style={{fontWeight: '700', fontSize: 16, color: c.text}}>{money(cand.amount, cand.currency || product.currency)}</Text>
                <Text style={{flex: 1, fontSize: 11, color: c.muted}}>{originLabel(cand.origins)}</Text>
              </Pressable>
            ))}
            <SheetItem label="Nenhum destes — ignorar esta leitura" onPress={() => { clearIssue(issueKey(monitor.id, confirm.store.url)); setConfirm(null); }} />
          </View>
        ) : null}
      </Sheet>
    </MotionModal>
  );
}

function Mini({label, value}: {label: string; value: string}) {
  const c = useTheme();
  return <View style={{flex: 1, backgroundColor: c.input, borderRadius: 12, padding: 8}}><Text style={{fontSize: 10, color: c.muted}}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={{fontSize: 13, fontWeight: '700', color: c.text}}>{value}</Text></View>;
}
function Legend({color, text, dashed = false}: {color: string; text: string; dashed?: boolean}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><View style={{width: 14, height: 0, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid'}} /><Text style={{fontSize: 11, color: c.muted}}>{text}</Text></View>;
}
function Insight({icon, text}: {icon: string; text: string}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', gap: 10, alignItems: 'flex-start'}}><Text style={{fontSize: 16}}>{icon}</Text><Text style={{flex: 1, fontSize: 13, lineHeight: 19, color: c.text}}>{text}</Text></View>;
}
// Simula na hora quanto o preço precisa cair, loja por loja, para o aviso
// sair — sem a pessoa ter que fazer conta de porcentagem.
function DropSimulator({drop, stores, currency, onChange}: {drop: number; stores: StoreSeries[]; currency: string; onChange: (p: number) => void}) {
  const c = useTheme(), [custom, setCustom] = useState(DROP_CHOICES.includes(drop) ? '' : String(drop));
  const priced = stores.filter(s => s.last);
  const ref = priced[0]?.last?.total ?? null;
  function applyCustom(text: string) {
    const v = Math.round(Number(text.replace(',', '.')));
    if (Number.isFinite(v) && v >= 1 && v <= 90) onChange(v);
  }
  const preview = (() => { const v = Number(custom.replace(',', '.')); return custom.trim() && Number.isFinite(v) && v >= 1 && v <= 90 ? v : drop; })();
  return (
    <View style={{gap: 10}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
        {DROP_CHOICES.map(p => (
          <Pressable key={p} accessibilityRole="radio" accessibilityState={{checked: drop === p}} onPress={() => { setCustom(''); onChange(p); }}
            style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignItems: 'center', backgroundColor: drop === p ? c.accent : c.input}}>
            <Text style={{color: drop === p ? '#fff' : c.text, fontWeight: '700'}}>{p}%</Text>
            {ref !== null ? <Text style={{color: drop === p ? '#ffffffcc' : c.muted, fontSize: 10}}>{money(ref * (1 - p / 100), currency).replace(/,\d\d$/, '')}</Text> : null}
          </Pressable>
        ))}
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: !DROP_CHOICES.includes(drop) ? c.accentSoft : c.input}}>
          <TextInput accessibilityLabel="Outra porcentagem de queda" value={custom} onChangeText={setCustom} onEndEditing={e => applyCustom(e.nativeEvent.text)} keyboardType="number-pad" placeholder="outra" placeholderTextColor={c.muted} maxLength={2}
            style={{minWidth: 44, color: c.text, fontWeight: '700', paddingVertical: 6, textAlign: 'center'}} />
          <Text style={{color: c.muted}}>%</Text>
        </View>
      </View>
      {priced.length ? (
        <View style={{gap: 6, backgroundColor: c.surface, borderRadius: 12, padding: 10}}>
          <Text style={{fontSize: 12, color: c.muted}}>Com {preview}%, o aviso sai quando alguma loja baixar para:</Text>
          {priced.map(s => {
            const now = s.last!.total, limit = now * (1 - preview / 100);
            return (
              <View key={s.url} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Text style={{flex: 1, fontSize: 13, color: c.text}} numberOfLines={1}>{s.name}</Text>
                <Text style={{fontSize: 12, color: c.muted}}>{money(now, currency)} →</Text>
                <Text style={{fontSize: 13, fontWeight: '700', color: GOOD}}>{money(limit, currency)}</Text>
                <Text style={{fontSize: 11, color: c.muted}}>(−{money(now - limit, currency)})</Text>
              </View>
            );
          })}
          <Text style={{fontSize: 11, color: c.muted}}>A conta é refeita a cada leitura: vale a queda de uma leitura para a seguinte na mesma loja.</Text>
        </View>
      ) : <Text style={{fontSize: 12, color: c.muted}}>A simulação aparece depois da primeira leitura de preço.</Text>}
    </View>
  );
}

function Stat({label, value, sub, color, wide}: {label: string; value: string; sub?: string; color?: string; wide?: boolean}) {
  const c = useTheme();
  return (
    <View style={{flexGrow: 1, flexBasis: wide ? '100%' : '46%', backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 12, gap: 2}}>
      <Text style={{fontSize: 11, color: c.muted}}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{fontSize: 16, fontWeight: '800', color: color || c.text}}>{value}</Text>
      {sub ? <Text style={{fontSize: 10, color: c.muted}}>{sub}</Text> : null}
    </View>
  );
}
function Section({title, hint, children}: {title: string; hint?: string; children: React.ReactNode}) {
  const c = useTheme();
  return (
    <View style={{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 16, gap: 12}}>
      <View style={{gap: 2}}><Text style={{fontSize: 17, fontWeight: '700', color: c.text}}>{title}</Text>{hint ? <Text style={{fontSize: 12, color: c.muted}}>{hint}</Text> : null}</View>
      {children}
    </View>
  );
}
function AlertCard({icon, title, text, value, onChange, children}: {icon: string; title: string; text: string; value: boolean; onChange: (v: boolean) => void; children?: React.ReactNode}) {
  const c = useTheme();
  return (
    <View style={{borderRadius: 16, padding: 12, gap: 10, backgroundColor: value ? c.accentSoft : c.input}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <Text style={{fontSize: 22}}>{icon}</Text>
        <View style={{flex: 1}}><Text style={{fontSize: 15, fontWeight: '600', color: c.text}}>{title}</Text><Text style={{fontSize: 12, color: c.muted}}>{text}</Text></View>
        <Switch accessibilityLabel={title} value={value} onValueChange={onChange} />
      </View>
      {children}
    </View>
  );
}
function SheetItem({label, onPress, danger = false}: {label: string; onPress: () => void; danger?: boolean}) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={{paddingVertical: 14}}><Text style={{fontSize: 15, color: danger ? c.danger : c.text}}>{label}</Text></Pressable>;
}

// ======================= OUTRAS LOJAS =======================
type Found = {status: 'idle' | 'searching' | 'done' | 'none' | 'error'; links: StoreLink[]; error?: string};
function AddStores({api, monitor, onClose, onAdded}: {api: SofiaApi; monitor: Entity; onClose: () => void; onAdded: (urls: string[]) => Promise<void>}) {
  const c = useTheme();
  const stores = storesOf(monitor), targets = useMemo(() => searchTargetsFor(stores), [monitor.data.preferred_url, monitor.data.source_urls]); // eslint-disable-line
  const [tab, setTab] = useState<'search' | 'paste'>('paste');
  const [terms, setTerms] = useState(searchTerms(monitor.title)), [found, setFound] = useState<Record<string, Found>>({});
  const [selected, setSelected] = useState<string[]>([]), [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const searching = Object.values(found).some(f => f.status === 'searching');

  async function search() {
    const primaryHost = hostOf(String(monitor.data.preferred_url || ''));
    setSelected([]); setFound(Object.fromEntries(targets.map(t => [t.key, {status: 'idle', links: []} as Found])));
    for (const t of targets) {
      setFound(f => ({...f, [t.key]: {status: 'searching', links: []}}));
      let r = await readLinks(t.url(terms), t.host, primaryHost, terms);
      // A busca da loja não trouxe nada (ou bloqueou): tenta pelo buscador, só no domínio dela.
      if (!r.ok || !r.links.length) {
        const alt = await readLinks(fallbackSearchUrl(t.host, terms), t.host, primaryHost, terms);
        if (alt.ok && alt.links.length) r = alt;
      }
      const good = r.ok ? (r.links.some(l => (l.score || 0) >= 0.3) ? r.links.filter(l => (l.score || 0) >= 0.3) : r.links) : [];
      setFound(f => ({...f, [t.key]: r.ok ? {status: good.length ? 'done' : 'none', links: good.slice(0, 6), error: r.blocked ? 'A loja pediu verificação de segurança.' : undefined} : {status: 'error', links: [], error: r.error}}));
    }
  }
  async function add(urls: string[]) {
    setBusy(true); setError('');
    try { await onAdded(urls); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="Adicionar outra loja" onClose={onClose} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 18, gap: 16, paddingBottom: 120}}>
          {tab === 'search' ? (
            !targets.length ? <Text style={{color: c.muted}}>Você já tem todas as lojas que a Sofia sabe procurar. Use “Colar link” para outras.</Text> : (
            <>
              <Text style={{fontSize: 13, color: c.muted, lineHeight: 19}}>A Sofia procura pelo nome nas lojas abaixo. Você marca só o que for exatamente o mesmo produto — nada é adicionado sem você confirmar.</Text>
              <View style={{gap: 6}}>
                <Text style={{fontSize: 12, color: c.muted}}>Procurar por</Text>
                <TextInput accessibilityLabel="Termo de busca" value={terms} onChangeText={setTerms} style={{fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} />
              </View>
              <Button title={searching ? 'Procurando…' : `Procurar em ${targets.length} ${targets.length === 1 ? 'loja' : 'lojas'}`} loading={searching} disabled={!terms.trim() || searching} onPress={() => void search()} />
              {targets.map(t => {
                const f = found[t.key];
                if (!f) return null;
                return (
                  <View key={t.key} style={{backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, padding: 14, gap: 8}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                      <Text style={{flex: 1, fontWeight: '700', color: c.text}}>{t.name}</Text>
                      {f.status === 'searching' ? <ActivityIndicator size="small" color={c.accent} /> : f.status === 'idle' ? <Text style={{fontSize: 12, color: c.muted}}>na fila</Text> : null}
                    </View>
                    {f.status === 'none' ? <Text style={{fontSize: 12, color: c.muted}}>{f.error || 'Nada parecido encontrado.'} Tente encurtar o termo (marca + modelo).</Text> : null}
                    {f.status === 'error' ? <Text style={{fontSize: 12, color: BAD}}>{f.error}</Text> : null}
                    {f.links.map(l => {
                      const on = selected.includes(l.url);
                      return (
                        <Pressable key={l.url} accessibilityRole="checkbox" accessibilityState={{checked: on}} onPress={() => setSelected(s => on ? s.filter(x => x !== l.url) : [...s, l.url])}
                          style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : 'transparent'}}>
                          <View style={{width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? c.accent : c.muted, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                            {on ? <Icon name="check" size={14} color="#fff" /> : null}
                          </View>
                          <View style={{flex: 1}}><Text style={{fontSize: 13, color: c.text}} numberOfLines={3}>{l.title || l.url}</Text>{l.score ? <Text style={{fontSize: 10, color: l.score >= 0.7 ? GOOD : c.muted}}>{Math.round(l.score * 100)}% parecido com o que você procurou</Text> : null}</View>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </>)
          ) : (
            <>
              <Text style={{fontSize: 13, color: c.muted, lineHeight: 19}}>Achou o mesmo produto em outra loja? Cole o link da página do produto.</Text>
              <TextInput accessibilityLabel="Link de outra loja" value={url} onChangeText={setUrl} placeholder="https://…" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url"
                style={{borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, color: c.text, backgroundColor: c.input, fontSize: 15}} />
              <Pressable onPress={async () => { const t = await Clipboard.getStringAsync().catch(() => ''); const m = t.match(/https:\/\/\S+/); if (m) setUrl(m[0]); }} style={{alignSelf: 'flex-start'}}>
                <Text style={{color: c.accent, fontWeight: '700'}}>Colar da área de transferência</Text>
              </Pressable>
              <Button title="Adicionar loja" loading={busy} disabled={!/^https:\/\/\S+$/.test(url.trim())} onPress={() => {
                const u = url.trim();
                if (stores.some(s => s.url === u)) { setError('Essa loja já está na lista.'); return; }
                void add([u]);
              }} />
            </>
          )}
          {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        </ScrollView>
        {tab === 'search' && selected.length ? (
          <View style={{position: 'absolute', left: 18, right: 18, bottom: 24}}>
            <Button title={`Adicionar ${selected.length} ${selected.length === 1 ? 'loja' : 'lojas'}`} loading={busy} onPress={() => void add(selected)} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </MotionModal>
  );
}

// Página que a Sofia lê, VISÍVEL: mostra exatamente o que a loja devolve (mesmo
// endereço e mesmo tipo de navegador da leitura escondida). Se a loja pedir
// verificação, aceite de cookies ou login, a pessoa resolve aqui uma vez — os
// cookies ficam no aparelho e as próximas leituras escondidas passam a funcionar.
function PageViewer(props: {api: SofiaApi; monitor: Entity; store: StoreSeries; onClose: () => void; onSaved: () => Promise<void>}) {
  return isMercadoLivreUrl(props.store.url) ? <MercadoLivrePreview {...props} /> : <StorePageViewer {...props} />;
}
function MercadoLivrePreview({api, monitor, store, onClose, onSaved}: {api: SofiaApi; monitor: Entity; store: StoreSeries; onClose: () => void; onSaved: () => Promise<void>}) {
  const c = useTheme(), controller = React.useRef<AbortController | null>(null);
  const [reading, setReading] = useState<MercadoLivreReading | null>(null), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [mlConnected, setMlConnected] = useState<boolean | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { api.storeConnections().then(st => setMlConnected(!!st.stores.find(x => x.provider === 'mercadolivre')?.connected)).catch(() => setMlConnected(null)); }, [api]);
  async function read() {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setReading(null); setStatus('Consultando a Sofia, sem abrir o Mercado Livre…');
    const pinned = storedMLIdentity(monitor.data.source_identities, store.url);
    const r = await readStorePrice(store.url, api, readPrice, {monitorId: monitor.id, signal: abort.signal, expectedSellerId: pinned?.sellerId, fetchUrl: pinned?.normalizedUrl});
    if (abort.signal.aborted) return;
    if (r.ok && r.mercadoLivre) {setReading(r.mercadoLivre); setStatus('Confira a oferta abaixo.');}
    else setStatus(r.ok ? 'O servidor não retornou a identidade da oferta.' : ((r.code ? r.code + ': ' : '') + r.error));
    setBusy(false);
  }
  async function save() {
    if (!reading) return; setBusy(true);
    try {await recordPrice(api, monitor, store.url, reading.amountCents / 100, api.owner, undefined, store.name, reading); await onSaved();}
    catch (e) {setStatus(errorText(e));} finally {setBusy(false);}
  }
  return <MotionModal visible animationType="slide" onRequestClose={onClose}><View style={{flex: 1, backgroundColor: c.bg}}>
    <Header title="Mercado Livre · leitura no servidor" onClose={onClose} />
    <View style={{padding: 20, gap: 16}}>
      <Text style={{color: c.muted}}>A página é lida como texto. Nenhum navegador ou aplicativo da loja será aberto por esta consulta.</Text>
      {status ? <Text style={{color: c.text}}>{status}</Text> : null}
      {!reading && !busy && status && mlConnected === false ? <View style={{backgroundColor: c.input, padding: 14, borderRadius: 14, gap: 6}}><Text style={{color: c.text, fontWeight: '700'}}>Conecte sua conta do Mercado Livre</Text><Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Com a conta conectada, a Sofia lê o preço pelo caminho oficial do Mercado Livre: sem página, sem verificação. É uma vez só, em Perfil → Lojas do Price Tracker.</Text></View> : null}
      {reading ? <><Text style={{color: c.text, fontSize: 19, fontWeight: '700'}}>{reading.title}</Text><Text style={{color: c.text}}>Vendedor: {reading.seller.name} · {reading.itemId}</Text><Text style={{color: c.text, fontSize: 28}}>{money(reading.amountCents / 100, 'BRL')}</Text><Text style={{color: c.muted}}>Preço sem frete. Lido em {new Date(reading.observedAt).toLocaleString('pt-BR')}.</Text><Button title="Confirmar esta leitura" loading={busy} onPress={() => void save()} /></> : <Button title="Ler preço no servidor" loading={busy} onPress={() => void read()} />}
    </View></View></MotionModal>;
}

function StorePageViewer({api, monitor, store, onClose, onSaved}: {api: SofiaApi; monitor: Entity; store: StoreSeries; onClose: () => void; onSaved: () => Promise<void>}) {
  const c = useTheme(), ref = React.useRef<any>(null);
  const [status, setStatus] = useState(''), [cands, setCands] = useState<Candidate[]>([]), [busy, setBusy] = useState(false);
  const WebView = require('react-native-webview').default;
  const target = readerUrl(store.url), agent = readerAgent(target) === 'desktop' ? DESKTOP_AGENT : USER_AGENT;
  async function save(cand: Candidate) {
    setBusy(true);
    try {
      const saved = await api.saveEntity({...monitor, data: {...monitor.data, reader_memory: withMemory(monitor, store.url, cand.origins)}});
      await recordPrice(api, saved, store.url, cand.amount, api.owner, undefined, store.name);
      await onSaved();
    } catch (e) { setStatus(errorText(e)); } finally { setBusy(false); }
  }
  function onMessage(raw: string) {
    const r = parsePriceMessage(raw);
    if (!r.ok) { setStatus('Não consegui ler: ' + r.error); return; }
    if (!r.result.candidates.length) { setStatus('Esta página não mostra preço que a Sofia reconheça' + (r.title ? ' (título: "' + r.title.slice(0, 60) + '")' : '') + '. Se for o produto certo, role até o preço e tente de novo.'); return; }
    setCands(r.result.candidates); setStatus(r.result.needsConfirmation ? 'Toque no preço certo:' : 'Encontrei o preço. Confirme:');
  }
  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <Header title={store.name + ' · como a Sofia vê'} onClose={onClose} />
        <View style={{flex: 1}}>
          <WebView ref={ref} source={{uri: target}} userAgent={agent} javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled
            originWhitelist={['*']} onShouldStartLoadWithRequest={(req: any) => /^https?:\/\//i.test(String(req?.url || '')) && !isMercadoLivreUrl(String(req?.url || ''))} setSupportMultipleWindows={false} javaScriptCanOpenWindowsAutomatically={false}
            onMessage={(e: any) => onMessage(e.nativeEvent.data)} />
        </View>
        <View style={{padding: 14, gap: 10, borderTopWidth: 1, borderColor: c.line, backgroundColor: c.surface}}>
          {status ? <Text style={{color: c.text, fontSize: 13}}>{status}</Text> : <Text style={{color: c.muted, fontSize: 12}}>Se aparecer verificação, aviso de cookies ou "abrir no app", resolva por aqui (sem sair). Quando o produto e o preço aparecerem, toque em Ler preço.</Text>}
          {cands.length ? <View style={{gap: 8}}>{cands.slice(0, 4).map((cand, i) => (
            <Pressable key={i} disabled={busy} onPress={() => void save(cand)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: c.line}}>
              <Text style={{fontWeight: '700', color: c.text}}>{money(cand.amount, cand.currency || 'BRL')}</Text>
              <Text style={{flex: 1, fontSize: 11, color: c.muted}} numberOfLines={1}>{cand.origins.join(' · ')}</Text>
            </Pressable>))}</View> : null}
          <Button title="Ler preço desta página" loading={busy} onPress={() => { setCands([]); setStatus('Lendo…'); ref.current?.injectJavaScript(buildInjectedScript()); }} />
        </View>
      </View>
    </MotionModal>
  );
}
