import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../lib/theme';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {useRenderCost} from '../lib/render-cost';
import {Sheet} from '../components/Sheet';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {Icon} from '../components/Icon';
import {Button, IconButton} from '../components/UI';
import {relativeTime} from '../components/NotificationCenter';
import {Spinner, LoadingLines} from '../components/Loading';
import {parseBill, parseMoney, todayISO, toAccount} from '../lib/finance';
import {money} from '../lib/monitoring';

type Tab = 'hits' | 'rules' | 'accounts';
const PROVIDERS: Array<{value: string; label: string; help: string; link?: string}> = [
  {value: 'gmail', label: 'Gmail', help: 'No Google: ative a verificação em duas etapas e crie uma "senha de app" (16 letras). Cole aqui essa senha, não a sua senha normal.', link: 'https://myaccount.google.com/apppasswords'},
  {value: 'outlook', label: 'Outlook / Hotmail', help: 'Crie uma senha de app na conta Microsoft (Segurança → Opções avançadas). Algumas contas pessoais da Microsoft não permitem mais IMAP; se recusar, o app avisa.', link: 'https://account.live.com/proofs/AppPassword'},
  {value: 'yahoo', label: 'Yahoo', help: 'Em Segurança da conta, gere uma senha de app e cole aqui.', link: 'https://login.yahoo.com/myaccount/security/'},
  {value: 'icloud', label: 'iCloud', help: 'Em appleid.apple.com → Senhas de app, gere uma e cole aqui.', link: 'https://appleid.apple.com/'},
  {value: 'imap', label: 'Outro (IMAP)', help: 'Informe o servidor IMAP do seu provedor (ex.: imap.seudominio.com) e a senha da caixa ou senha de app.'},
];
const FIELDS = [{value: 'any', label: 'Em qualquer lugar'}, {value: 'from', label: 'Remetente'}, {value: 'subject', label: 'Assunto'}, {value: 'body', label: 'Texto'}];
const TEMPLATES = [
  {title: 'Contas e faturas', field: 'any', contains: 'fatura, boleto, vencimento, pagamento', important: true},
  {title: 'Entregas', field: 'subject', contains: 'pedido, entrega, enviado, rastreio', important: false},
  {title: 'Trabalho urgente', field: 'subject', contains: 'urgente, prazo, aprovação', important: true},
];

async function listAll(api: SofiaApi, kind: string) {
  const all: Entity[] = [];
  for (let o = 0; ; o += 100) { const r = await api.entities(kind, '', o); all.push(...r.items); if (r.items.length < 100) break; }
  return all;
}
function Chips<T extends string>({value, options, onChange}: {value: T; options: Array<{value: T; label: string}>; onChange: (v: T) => void}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{options.map(o => <Pressable key={o.value} onPress={() => onChange(o.value)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: o.value === value ? c.accent : c.input}}><Text style={{color: o.value === value ? '#fff' : c.text, fontWeight: '600', fontSize: 13}}>{o.label}</Text></Pressable>)}</View>;
}
function Field({label, value, onChange, placeholder, secure = false, email = false}: {label: string; value: string; onChange: (v: string) => void; placeholder?: string; secure?: boolean; email?: boolean}) {
  const c = useTheme();
  return <View style={{gap: 6}}><Text style={{fontSize: 12, color: c.muted}}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} keyboardType={email ? 'email-address' : 'default'} style={{fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} /></View>;
}

export function Mail({api, active, onBack}: {api: SofiaApi; active: boolean; onBack: () => void}) {
  useRenderCost('apps:mail');
  const c = useTheme(), insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('hits'), [accounts, setAccounts] = useState<Entity[] | null>(null), [rules, setRules] = useState<Entity[]>([]), [hits, setHits] = useState<Entity[]>([]);
  const [error, setError] = useState(''), [checking, setChecking] = useState(false), [info, setInfo] = useState('');
  const [addAccount, setAddAccount] = useState<Entity | 'new' | null>(null), [ruleSheet, setRuleSheet] = useState<Entity | Partial<Entity> | null>(null), [open, setOpen] = useState<Entity | null>(null);
  const [onlyImportant, setOnlyImportant] = useState(false);
  const load = useCallback(async () => {
    try { const [a, r, h] = await Promise.all([listAll(api, 'mail_account'), listAll(api, 'mail_rule'), listAll(api, 'mail_hit')]); setAccounts(a.filter(x => x.state !== 'archived')); setRules(r.filter(x => x.state !== 'archived')); setHits(h.filter(x => x.state !== 'archived').sort((x, y) => String(y.data.received_at).localeCompare(String(x.data.received_at)))); setError(''); }
    catch (e) { setError(errorText(e)); setAccounts(a => a || []); }
  }, [api]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  async function check() {
    setChecking(true); setInfo('');
    try { const r = await api.mailCheck(); setInfo(r.skipped ? 'Uma verificação já está em andamento.' : `${r.scanned} e-mails novos lidos · ${r.hits} bateram com as regras${r.errors.length ? ' · ' + r.errors.length + ' conta(s) com erro' : ''}.`); await load(); }
    catch (e) { setInfo(errorText(e)); } finally { setChecking(false); }
  }
  const unread = hits.filter(h => h.state === 'new').length, shown = hits.filter(h => !onlyImportant || h.data.important);
  const accountName = (id: string) => accounts?.find(a => a.id === id)?.data.address || '';

  return (
    <InternalBackGesture enabled={active && !open && !addAccount && !ruleSheet} onBack={onBack}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 14, paddingBottom: 6}}>
          <IconButton name="back" label="Voltar aos apps" onPress={onBack} />
          <View style={{flex: 1, paddingHorizontal: 4}}><Text style={{fontSize: 11, letterSpacing: 1.2, color: c.muted, fontWeight: '600'}}>A SOFIA DE OLHO NO QUE IMPORTA</Text><Text style={{fontSize: 24, fontWeight: '800', color: c.text}}>E-mails</Text></View>
          <IconButton name="refresh" label="Verificar agora" disabled={checking || !accounts?.length} onPress={() => void check()} />
        </View>
        <View style={{paddingHorizontal: 16, paddingBottom: 8}}>
          <Chips value={tab} onChange={setTab} options={[{value: 'hits' as Tab, label: 'Encontrados' + (unread ? ' · ' + unread : '')}, {value: 'rules' as Tab, label: 'Regras ' + rules.length}, {value: 'accounts' as Tab, label: 'Contas ' + (accounts?.length || 0)}]} />
        </View>
        {accounts === null ? <View style={{padding: 16, gap: 6}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}><Spinner size={16} stroke={1.8} /><Text style={{color: c.muted, fontSize: 13}}>Carregando e-mails</Text></View><LoadingLines rows={4} /></View> : (
          <ScrollView contentContainerStyle={{padding: 16, gap: 12, paddingBottom: insets.bottom + 40}} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}>
            {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
            {checking ? <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}><ActivityIndicator color={c.accent} /><Text style={{color: c.muted}}>Lendo as caixas de entrada…</Text></View> : info ? <Text style={{color: c.muted, fontSize: 12}}>{info}</Text> : null}
            {!accounts.length ? (
              <View style={{alignItems: 'center', gap: 12, paddingVertical: 30}}>
                <View style={{width: 84, height: 84, borderRadius: 42, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center'}}><Text style={{fontSize: 38}}>✉️</Text></View>
                <Text style={{fontSize: 20, fontWeight: '800', color: c.text, textAlign: 'center'}}>Deixe a Sofia de olho no seu e-mail</Text>
                <Text style={{fontSize: 14, color: c.muted, textAlign: 'center', lineHeight: 21}}>Conecte uma ou mais contas e diga o que importa: um nome, um e-mail, um assunto ou uma palavra. Quando chegar, ela avisa no celular e guarda aqui.</Text>
                <View style={{alignSelf: 'stretch'}}><Button title="Conectar uma conta" onPress={() => setAddAccount('new')} /></View>
                <Text style={{fontSize: 11, color: c.muted, textAlign: 'center'}}>A Sofia lê só remetente, assunto e um trecho curto dos e-mails novos. Nada é apagado, movido ou respondido.</Text>
              </View>
            ) : tab === 'hits' ? (
              <>
                <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>{shown.length} e-mails encontrados pelas regras</Text><Text style={{color: c.text, fontSize: 13, marginRight: 6}}>Só importantes</Text><Switch value={onlyImportant} onValueChange={setOnlyImportant} /></View>
                {!rules.length ? <Pressable onPress={() => setTab('rules')} style={{padding: 14, borderRadius: 16, backgroundColor: c.accentSoft}}><Text style={{color: c.accent, fontWeight: '700'}}>Crie sua primeira regra →</Text><Text style={{color: c.text, fontSize: 12}}>Sem regras, a Sofia não sabe o que procurar.</Text></Pressable> : null}
                {shown.length ? shown.map(h => (
                  <Pressable key={h.id} onPress={() => { setOpen(h); if (h.state === 'new') void api.saveEntity({...h, state: 'read'}).then(load).catch(() => {}); }}
                    style={{flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, backgroundColor: h.state === 'new' ? '#38b6ff14' : c.surface, borderWidth: 1, borderColor: c.line}}>
                    <View style={{width: 38, height: 38, borderRadius: 19, backgroundColor: '#38b6ff26', alignItems: 'center', justifyContent: 'center'}}><Text style={{fontWeight: '800', color: '#38b6ff'}}>{String(h.data.from_name || h.data.from_addr || '?').charAt(0).toUpperCase()}</Text></View>
                    <View style={{flex: 1, gap: 2}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>{h.data.important ? <Text>⭐</Text> : null}<Text numberOfLines={1} style={{flex: 1, color: c.text, fontWeight: h.state === 'new' ? '700' : '500'}}>{h.data.from_name || h.data.from_addr}</Text><Text style={{color: c.muted, fontSize: 10}}>{relativeTime(String(h.data.received_at))}</Text></View>
                      <Text numberOfLines={1} style={{color: c.text, fontSize: 13}}>{h.title}</Text>
                      <Text numberOfLines={2} style={{color: c.muted, fontSize: 12}}>{h.data.snippet}</Text>
                      <Text style={{color: c.muted, fontSize: 10}}>Regra: {h.data.rule_names}</Text>
                    </View>
                  </Pressable>
                )) : <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 24}}>Nada encontrado ainda. A Sofia confere a cada 5 minutos.</Text>}
              </>
            ) : tab === 'rules' ? (
              <>
                <Button title="+ Nova regra" onPress={() => setRuleSheet({data: {field: 'from', notify: true}})} />
                {!rules.length ? <View style={{gap: 8}}><Text style={{color: c.muted, fontSize: 12}}>Comece por um modelo:</Text>{TEMPLATES.map(t => <Pressable key={t.title} onPress={() => setRuleSheet({title: t.title, data: {field: t.field, contains: t.contains, notify: true, important: t.important}})} style={{padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface}}><Text style={{color: c.text, fontWeight: '600'}}>{t.title}</Text><Text style={{color: c.muted, fontSize: 12}}>{t.contains}</Text></Pressable>)}</View> : null}
                {rules.map(r => (
                  <Pressable key={r.id} onPress={() => setRuleSheet(r)} style={{padding: 14, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 4, opacity: r.state === 'paused' ? 0.55 : 1}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>{r.data.important ? <Text>⭐</Text> : null}<Text style={{flex: 1, color: c.text, fontWeight: '700'}}>{r.title}</Text><Text style={{color: c.muted, fontSize: 11}}>{hits.filter(h => String(h.data.rule_names).includes(r.title)).length} encontrados</Text></View>
                    <Text style={{color: c.muted, fontSize: 12}}>{FIELDS.find(f => f.value === r.data.field)?.label} contém: <Text style={{color: c.text}}>{r.data.contains}</Text></Text>
                    <Text style={{color: c.muted, fontSize: 11}}>{r.data.account_id ? 'Só em ' + accountName(r.data.account_id) : 'Todas as contas'} · {r.data.notify === false ? 'sem aviso' : 'avisa no celular'}{r.state === 'paused' ? ' · pausada' : ''}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Button title="+ Conectar outra conta" onPress={() => setAddAccount('new')} />
                {accounts.map(a => (
                  <Pressable key={a.id} onPress={() => setAddAccount(a)} style={{padding: 14, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: a.data.last_error ? '#ff6b7a88' : c.line, gap: 4}}>
                    <Text style={{color: c.text, fontWeight: '700'}}>{a.data.address}</Text>
                    <Text style={{color: c.muted, fontSize: 12}}>{PROVIDERS.find(p => p.value === a.data.provider)?.label} · {a.state === 'paused' ? 'pausada' : a.data.secret_set ? 'conectada' : 'falta a senha de app'}{a.data.last_check ? ' · lida ' + relativeTime(String(a.data.last_check)) : ''}</Text>
                    {a.data.last_error ? <Text style={{color: '#ff6b7a', fontSize: 12}}>{a.data.last_error}</Text> : null}
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        )}
        {addAccount ? <AccountSheet api={api} account={addAccount === 'new' ? null : addAccount} onClose={() => setAddAccount(null)} onDone={() => { setAddAccount(null); void load(); }} /> : null}
        {ruleSheet ? <RuleSheet api={api} rule={ruleSheet} accounts={accounts || []} onClose={() => setRuleSheet(null)} onDone={() => { setRuleSheet(null); void load(); }} /> : null}
        <Sheet visible={!!open} onClose={() => setOpen(null)} label="Fechar e-mail">
          {open ? (
            <View style={{gap: 10}}>
              <Text style={{fontSize: 18, fontWeight: '800', color: c.text}}>{open.title}</Text>
              <Text style={{color: c.text}}>{open.data.from_name} <Text style={{color: c.muted}}>&lt;{open.data.from_addr}&gt;</Text></Text>
              <Text style={{color: c.muted, fontSize: 12}}>{new Date(String(open.data.received_at)).toLocaleString('pt-BR')} · {accountName(open.data.account_id)}</Text>
              <Text style={{color: c.text, lineHeight: 21}}>{open.data.snippet}</Text>
              <Text style={{color: c.muted, fontSize: 12}}>Encontrado pela regra: {open.data.rule_names}. Abra seu app de e-mail para ler a mensagem inteira.</Text>
              <BillFromMail api={api} hit={open} onDone={() => setOpen(null)} />
              <Pressable onPress={() => { const id = open.id; setOpen(null); void api.deleteEntity(id).then(load).catch(() => {}); }} style={{paddingVertical: 12}}><Text style={{color: c.danger}}>Tirar da lista</Text></Pressable>
            </View>
          ) : null}
        </Sheet>
      </View>
    </InternalBackGesture>
  );
}

function AccountSheet({api, account, onClose, onDone}: {api: SofiaApi; account: Entity | null; onClose: () => void; onDone: () => void}) {
  const c = useTheme();
  const [provider, setProvider] = useState(String(account?.data.provider || 'gmail')), [address, setAddress] = useState(String(account?.data.address || ''));
  const [host, setHost] = useState(String(account?.data.host || '')), [port, setPort] = useState(account?.data.port ? String(account.data.port) : '993');
  const [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [ok, setOk] = useState('');
  const p = PROVIDERS.find(x => x.value === provider)!;
  async function connect() {
    setBusy(true); setError(''); setOk('');
    try {
      const data = {provider, address: address.trim().toLowerCase(), host: provider === 'imap' ? host.trim() : '', port: provider === 'imap' ? Number(port) || 993 : ''};
      const saved = account ? await api.saveEntity({...account, title: data.address, data: {...account.data, ...data}}) : await api.saveEntity({kind: 'mail_account', title: data.address, content: '', area: 'Pessoal', state: 'active', privacy: 'private', tags: [], data});
      if (password.trim()) {
        const r = await api.mailSecret(saved.id, password.replace(/\s+/g, provider === 'gmail' ? '' : ' ').trim());
        setOk('Conectado! Caixa de entrada com ' + r.messages + ' mensagens. A Sofia passa a ler só as novas.');
        setPassword(''); setTimeout(onDone, 1200);
      } else if (!account?.data.secret_set) setError('Conta salva. Falta colar a senha de app para conectar.');
      else onDone();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet visible onClose={onClose} label="Fechar conta de e-mail">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{maxHeight: 620}} contentContainerStyle={{gap: 12}} keyboardShouldPersistTaps="handled">
          <Text style={{fontSize: 18, fontWeight: '800', color: c.text}}>{account ? 'Conta de e-mail' : 'Conectar e-mail'}</Text>
          <Chips value={provider} onChange={setProvider} options={PROVIDERS.map(x => ({value: x.value, label: x.label}))} />
          <Field label="Seu e-mail" value={address} onChange={setAddress} placeholder="voce@gmail.com" email />
          {provider === 'imap' ? <View style={{flexDirection: 'row', gap: 10}}><View style={{flex: 3}}><Field label="Servidor IMAP" value={host} onChange={setHost} placeholder="imap.seudominio.com" /></View><View style={{flex: 1}}><Field label="Porta" value={port} onChange={setPort} /></View></View> : null}
          <View style={{padding: 12, borderRadius: 14, backgroundColor: c.accentSoft, gap: 6}}>
            <Text style={{color: c.text, fontSize: 13, lineHeight: 19}}>{p.help}</Text>
            {p.link ? <Pressable onPress={() => void Linking.openURL(p.link!)}><Text style={{color: c.accent, fontWeight: '700'}}>Abrir página da senha de app →</Text></Pressable> : null}
          </View>
          <Field label={account?.data.secret_set ? 'Nova senha de app (deixe vazio para manter)' : 'Senha de app'} value={password} onChange={setPassword} placeholder="xxxx xxxx xxxx xxxx" secure />
          {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
          {ok ? <Text style={{color: '#2fc58b', fontWeight: '600'}}>{ok}</Text> : null}
          <Button title={account ? 'Salvar e testar' : 'Conectar e testar'} loading={busy} disabled={!address.includes('@')} onPress={() => void connect()} />
          {account ? (
            <View style={{gap: 4}}>
              <Pressable onPress={async () => { try { await api.saveEntity({...account, state: account.state === 'paused' ? 'active' : 'paused'}); onDone(); } catch (e) { setError(errorText(e)); } }} style={{paddingVertical: 10}}><Text style={{color: c.text}}>{account.state === 'paused' ? 'Voltar a vigiar esta conta' : 'Pausar esta conta'}</Text></Pressable>
              <Pressable onPress={() => Alert.alert('Desconectar?', 'A senha de app é apagada do servidor. Os e-mails já encontrados ficam.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Desconectar', style: 'destructive', onPress: async () => { try { await api.mailForget(account.id); await api.deleteEntity(account.id); onDone(); } catch (e) { setError(errorText(e)); } }}])} style={{paddingVertical: 10}}><Text style={{color: c.danger}}>Desconectar e remover</Text></Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

function RuleSheet({api, rule, accounts, onClose, onDone}: {api: SofiaApi; rule: Entity | Partial<Entity>; accounts: Entity[]; onClose: () => void; onDone: () => void}) {
  const c = useTheme(), existing = (rule as Entity).id ? rule as Entity : null, d = rule.data || {};
  const [title, setTitle] = useState(rule.title || ''), [field, setField] = useState(String(d.field || 'from')), [contains, setContains] = useState(String(d.contains || ''));
  const [accountId, setAccountId] = useState(String(d.account_id || '')), [notify, setNotify] = useState(d.notify !== false), [important, setImportant] = useState(!!d.important);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const hint = field === 'from' ? 'Ex.: ana@empresa.com, Banco Itaú, @receita.fazenda' : field === 'subject' ? 'Ex.: contrato, aprovado, entrevista' : 'Ex.: nota fiscal, ingresso';
  async function save() {
    if (!contains.trim()) { setError('Diga o que procurar.'); return; }
    setBusy(true); setError('');
    const data = {field, contains: contains.trim(), account_id: accountId, notify, important};
    const name = title.trim() || contains.split(',')[0].trim().slice(0, 60);
    try { if (existing) await api.saveEntity({...existing, title: name, data: {...existing.data, ...data}}); else await api.saveEntity({kind: 'mail_rule', title: name, content: '', area: 'Pessoal', state: 'active', privacy: 'private', tags: [], data}); onDone(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet visible onClose={onClose} label="Fechar regra">
      <ScrollView style={{maxHeight: 620}} contentContainerStyle={{gap: 12}} keyboardShouldPersistTaps="handled">
        <Text style={{fontSize: 18, fontWeight: '800', color: c.text}}>{existing ? 'Editar regra' : 'Nova regra'}</Text>
        <Text style={{fontSize: 12, color: c.muted}}>Procurar em</Text>
        <Chips value={field} onChange={setField} options={FIELDS} />
        <Field label="Contém (separe opções por vírgula)" value={contains} onChange={setContains} placeholder={hint} />
        <Field label="Nome da regra (opcional)" value={title} onChange={setTitle} placeholder="Ex.: Mensagens da Ana" />
        {accounts.length > 1 ? <><Text style={{fontSize: 12, color: c.muted}}>Em qual conta</Text><Chips value={accountId} onChange={setAccountId} options={[{value: '', label: 'Todas'}, ...accounts.map(a => ({value: a.id, label: String(a.data.address)}))]} /></> : null}
        <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text}}>Avisar no celular</Text><Switch value={notify} onValueChange={setNotify} /></View>
        <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text}}>Marcar como importante ⭐</Text><Switch value={important} onValueChange={setImportant} /></View>
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar regra" loading={busy} onPress={() => void save()} />
        {existing ? (
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            <Pressable onPress={async () => { await api.saveEntity({...existing, state: existing.state === 'paused' ? 'active' : 'paused'}).catch(() => {}); onDone(); }} style={{padding: 10}}><Text style={{color: c.text}}>{existing.state === 'paused' ? 'Reativar' : 'Pausar'}</Text></Pressable>
            <Pressable onPress={async () => { await api.deleteEntity(existing.id).catch(() => {}); onDone(); }} style={{padding: 10}}><Text style={{color: c.danger}}>Apagar regra</Text></Pressable>
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

/** E-mail de cobrança → conta a pagar no Finanças, com valor e vencimento já lidos. A pessoa confere antes. */
function BillFromMail({api, hit, onDone}: {api: SofiaApi; hit: Entity; onDone: () => void}) {
  const c = useTheme(), guess = parseBill(hit.title + ' ' + hit.data.snippet);
  const [open, setOpen] = useState(false), [amount, setAmount] = useState(guess.amount ? String(guess.amount).replace('.', ',') : ''), [due, setDue] = useState(guess.due || todayISO());
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  async function create() {
    const v = parseMoney(amount);
    if (!v || v <= 0) { setMsg('Digite o valor.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) { setMsg('Data no formato AAAA-MM-DD.'); return; }
    setBusy(true); setMsg('');
    try {
      const accounts = (await api.entities('fin_account')).items.map(toAccount).filter(a => !a.archived);
      if (!accounts.length) { setMsg('Crie primeiro uma conta em Apps → Finanças.'); return; }
      await api.saveEntity({kind: 'fin_tx', title: String(hit.title).slice(0, 200), content: 'Criado a partir do e-mail de ' + (hit.data.from_name || hit.data.from_addr), area: 'Pessoal', state: 'active', privacy: 'private', tags: [],
        data: {kind: 'expense', amount: v, date: due, category: 'Contas', account_id: accounts[0].id, paid: false, recurrence: 'none'}});
      setMsg('Conta a pagar criada em Finanças: ' + money(v) + ' para ' + due.split('-').reverse().join('/') + '.'); setTimeout(onDone, 1400);
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }
  if (!open) return <Pressable onPress={() => setOpen(true)} style={{paddingVertical: 12}}><Text style={{color: c.accent, fontWeight: '700'}}>💳 Lançar como conta a pagar{guess.amount ? ' · ' + money(guess.amount) : ''}</Text></Pressable>;
  return (
    <View style={{gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.accentSoft}}>
      <Text style={{color: c.text, fontWeight: '700'}}>Conta a pagar</Text>
      <Field label="Valor (R$)" value={amount} onChange={setAmount} placeholder="0,00" />
      <Field label="Vencimento (AAAA-MM-DD)" value={due} onChange={setDue} />
      {msg ? <Text style={{color: msg.startsWith('Conta a pagar criada') ? '#2fc58b' : c.danger}}>{msg}</Text> : null}
      <Button title="Criar em Finanças" loading={busy} onPress={() => void create()} />
    </View>
  );
}
