import React, {useRef, useState} from 'react';
import {View, Text, TextInput, Pressable, ActivityIndicator} from 'react-native';
import WebView from 'react-native-webview';
import {useTheme} from '../lib/theme';
import {buildInjectedScript, parsePriceMessage, formatCurrency} from '../lib/price-extractor';
import type {PriceReaderMessage} from '../lib/price-extractor';

const TIMEOUT_MS = 15000;

type Status = 'idle' | 'loading' | 'done' | 'error';

// Ferramenta de teste manual para validar loja por loja antes de ativar a
// coleta automática (item 2 do briefing). Lê uma vez, mostra o resultado
// bruto e descarta a WebView — nunca registra nada no monitor sozinha.
export function PriceReaderTest({initialUrl = ''}: {initialUrl?: string}) {
  const c = useTheme();
  const [url, setUrl] = useState(initialUrl);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<PriceReaderMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [probeUrl, setProbeUrl] = useState<string | null>(null);

  function clearTimer() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }

  function start() {
    const trimmed = url.trim();
    if (!trimmed || !/^https:\/\//.test(trimmed)) {
      setStatus('error');
      setMessage({ok: false, error: 'Cole um link completo começando com https://'});
      return;
    }
    setStatus('loading');
    setMessage(null);
    setProbeUrl(trimmed);
    clearTimer();
    timer.current = setTimeout(() => {
      setStatus('error');
      setMessage({ok: false, error: 'A loja não respondeu em 15 segundos. Tente de novo.'});
      setProbeUrl(null);
    }, TIMEOUT_MS);
  }

  function finish(parsed: PriceReaderMessage) {
    clearTimer();
    setMessage(parsed);
    setStatus(parsed.ok ? 'done' : 'error');
    setProbeUrl(null);
  }

  return (
    <View style={{gap: 10, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 14, backgroundColor: c.surface}}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(v => !v)}>
        <Text style={{color: c.accent, fontWeight: '700', fontSize: 13}}>{open ? '▾' : '▸'} Testar leitura desta loja</Text>
      </Pressable>
      {open ? (
        <View style={{gap: 10}}>
          <Text style={{color: c.muted, fontSize: 12}}>
            Lê o preço na página, uma vez, sem salvar nada. Use para conferir se esta loja funciona antes de ativar o monitor.
          </Text>
          <TextInput
            accessibilityLabel="Link para testar"
            value={url}
            onChangeText={setUrl}
            placeholder="https://..."
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.input}}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ler preço"
            disabled={status === 'loading'}
            onPress={start}
            style={{backgroundColor: c.accent, borderRadius: 10, padding: 10, alignItems: 'center', opacity: status === 'loading' ? 0.6 : 1}}
          >
            {status === 'loading' ? <ActivityIndicator color="#fff" /> : <Text style={{color: '#fff', fontWeight: '700'}}>Ler preço</Text>}
          </Pressable>
          {message && !message.ok ? (
            <Text accessibilityLabel="Erro da leitura" style={{color: '#fb6b72', fontSize: 13}}>{message.error}</Text>
          ) : null}
          {message && message.ok ? (
            <View style={{gap: 6}}>
              {message.title ? <Text style={{color: c.text, fontWeight: '600'}}>{message.title}</Text> : null}
              {message.result.best ? (
                <Text accessibilityLabel="Melhor preço encontrado" style={{color: c.text, fontSize: 16, fontWeight: '700'}}>
                  {formatCurrency(message.result.best.amount, message.result.best.currency)}
                  {message.result.needsConfirmation ? '  (precisa confirmar)' : '  (leitura confiável)'}
                </Text>
              ) : (
                <Text style={{color: c.muted}}>Não encontrei preço nesta página.</Text>
              )}
              {message.result.candidates.length > 1 ? (
                <View style={{gap: 2}}>
                  <Text style={{color: c.muted, fontSize: 11}}>Outros valores encontrados:</Text>
                  {message.result.candidates.slice(1).map((cand, i) => (
                    <Text key={i} style={{color: c.muted, fontSize: 12}}>
                      {formatCurrency(cand.amount, cand.currency)} · {cand.origins.join(', ')} · confiança {Math.round(cand.confidence * 100)}%
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {probeUrl ? (
            <View style={{width: 1, height: 1, opacity: 0, overflow: 'hidden', position: 'absolute'}} pointerEvents="none">
              <WebView
                source={{uri: probeUrl}}
                injectedJavaScript={buildInjectedScript()}
                onMessage={e => finish(parsePriceMessage(e.nativeEvent.data))}
                onError={() => finish({ok: false, error: 'Não consegui abrir essa página.'})}
                onHttpError={e => { if (e.nativeEvent.statusCode >= 400) finish({ok: false, error: 'A loja recusou o acesso (código ' + e.nativeEvent.statusCode + ').'}); }}
                javaScriptEnabled
                domStorageEnabled
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
