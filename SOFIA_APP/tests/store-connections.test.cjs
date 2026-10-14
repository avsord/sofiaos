'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Perfil: card "Lojas do Price Tracker" ao lado da Conta Google, mesmo padrao de conexao (janela da loja -> volta ao app)',()=>{
 const p=read('src/screens/Profile.tsx');assert.ok(p.includes('<GoogleCalendarSettings api={api}/><StoreConnections api={api}/>'));
 const s=read('src/components/StoreConnections.tsx');
 assert.ok(s.includes("WebBrowser.openAuthSessionAsync(url,'sofiaapp://stores')"),'mesmo mecanismo da Conta Google');
 assert.ok(s.includes("back.searchParams.get('ok')!=='1'"),'erro da loja vira mensagem, nao conexao fantasma');
 assert.ok(s.includes("if(v==='active')void load();"),'ao voltar da janela, recarrega o estado');
 assert.ok(!/react-native-webview|Linking\.openURL/.test(s),'sem WebView propria nem app externo');
});
test('api: rotas de conexao com o mesmo formato para todas as lojas',()=>{
 const a=read('src/lib/api.ts');
 for(const x of ["this.request<StoreConnectionsState>('/price-tracker/connections')","'/price-tracker/connections/'+provider+'/connect',{app:true}","'/price-tracker/connections/'+provider+'/disconnect',{}"])assert.ok(a.includes(x),x);
 const t=read('src/lib/store-connections-types.ts');assert.ok(/mode: 'login' \| 'server'/.test(t));
});
test('leitura do Mercado Livre: quando falha e a conta nao esta conectada, a tela aponta para Perfil -> Lojas',()=>{
 const m=read('src/screens/Monitoring.tsx');
 assert.ok(m.includes("api.storeConnections().then(st => setMlConnected("));
 assert.ok(m.includes('Conecte sua conta do Mercado Livre')&&m.includes('Perfil → Lojas do Price Tracker'));
});

test('com a conta conectada o celular nao abre o navegador invisivel: vai direto ao servidor (API)',()=>{
 const a=read('src/lib/api.ts');
 assert.ok(a.includes("const page=await this.mlAccountConnected()?{ok:false as const,code:'API'}:await readMercadoLivrePageOnDevice("));
 assert.ok(a.includes("page.code!=='API'"),'o atalho da API nao vira "(celular: ...)" na mensagem');
 assert.ok(a.includes('this.mlConnectedCache=null; return this.request<{url:string}>'),'conectar invalida o cache');
});
