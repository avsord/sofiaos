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
import {GOOD, BAD} from './core';
import {Header} from './Add';
import {Found} from './Detail';
export function AddStores({api, monitor, onClose, onAdded}: {api: SofiaApi; monitor: Entity; onClose: () => void; onAdded: (urls: string[]) => Promise<void>}) {
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
                <TextInput accessibilityLabel="Termo de busca" value={terms} onChangeText={setTerms} style={{fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} />
              </View>
              <Button title={searching ? 'Procurando…' : `Procurar em ${targets.length} ${targets.length === 1 ? 'loja' : 'lojas'}`} loading={searching} disabled={!terms.trim() || searching} onPress={() => void search()} />
              {targets.map(t => {
                const f = found[t.key];
                if (!f) return null;
                return (
                  <View key={t.key} style={{backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, padding: 14, gap: 8, boxShadow: '0 1px 2px rgba(24,18,48,0.04), 0 6px 20px rgba(24,18,48,0.05)'}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                      <Text style={{flex: 1, fontWeight: '600', color: c.text}}>{t.name}</Text>
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
                            {on ? <Icon name="check" size={14} color={PALETTE.white} /> : null}
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
                style={{borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, color: c.text, backgroundColor: c.input, fontSize: 16}} />
              <Pressable onPress={async () => { const t = await Clipboard.getStringAsync().catch(() => ''); const m = t.match(/https:\/\/\S+/); if (m) setUrl(m[0]); }} style={{alignSelf: 'flex-start'}}>
                <Text style={{color: c.accent, fontWeight: '600'}}>Colar da área de transferência</Text>
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
export function PageViewer(props: {api: SofiaApi; monitor: Entity; store: StoreSeries; onClose: () => void; onSaved: () => Promise<void>}) {
  return isMercadoLivreUrl(props.store.url) ? <MercadoLivrePreview {...props} /> : <StorePageViewer {...props} />;
}
export function MercadoLivrePreview({api, monitor, store, onClose, onSaved}: {api: SofiaApi; monitor: Entity; store: StoreSeries; onClose: () => void; onSaved: () => Promise<void>}) {
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
      {!reading && !busy && status && mlConnected === false ? <View style={{backgroundColor: c.input, padding: 14, borderRadius: 14, gap: 6}}><Text style={{color: c.text, fontWeight: '600'}}>Conecte sua conta do Mercado Livre</Text><Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Com a conta conectada, a Sofia lê o preço pelo caminho oficial do Mercado Livre: sem página, sem verificação. É uma vez só, em Perfil → Lojas do Price Tracker.</Text></View> : null}
      {reading ? <><Text style={{color: c.text, fontSize: 20, fontWeight: '600'}}>{reading.title}</Text><Text style={{color: c.text}}>Vendedor: {reading.seller.name} · {reading.itemId}</Text><Text style={{color: c.text, fontSize: 28}}>{money(reading.amountCents / 100, 'BRL')}</Text><Text style={{color: c.muted}}>Preço sem frete. Lido em {new Date(reading.observedAt).toLocaleString('pt-BR')}.</Text><Button title="Confirmar esta leitura" loading={busy} onPress={() => void save()} /></> : <Button title="Ler preço no servidor" loading={busy} onPress={() => void read()} />}
    </View></View></MotionModal>;
}

export function StorePageViewer({api, monitor, store, onClose, onSaved}: {api: SofiaApi; monitor: Entity; store: StoreSeries; onClose: () => void; onSaved: () => Promise<void>}) {
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
    setCands(r.result.candidates); setStatus(r.result.needsConfirmation ? tap('Toque no preço certo:') : 'Encontrei o preço. Confirme:');
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
          {status ? <Text style={{color: c.text, fontSize: 13}}>{status}</Text> : <Text style={{color: c.muted, fontSize: 12}}>{tap('Se aparecer verificação, aviso de cookies ou “abrir no app”, resolva por aqui (sem sair). Quando o produto e o preço aparecerem, toque em Ler preço.')}</Text>}
          {cands.length ? <View style={{gap: 8}}>{cands.slice(0, 4).map((cand, i) => (
            <Pressable key={i} disabled={busy} onPress={() => void save(cand)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: c.line}}>
              <Text style={{fontWeight: '600', color: c.text}}>{money(cand.amount, cand.currency || 'BRL')}</Text>
              <Text style={{flex: 1, fontSize: 11, color: c.muted}} numberOfLines={1}>{cand.origins.join(' · ')}</Text>
            </Pressable>))}</View> : null}
          <Button title="Ler preço desta página" loading={busy} onPress={() => { setCands([]); setStatus('Lendo…'); ref.current?.injectJavaScript(buildInjectedScript()); }} />
        </View>
      </View>
    </MotionModal>
  );
}
