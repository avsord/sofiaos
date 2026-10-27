'use strict';
// 0.3.247: o app roda no navegador (Expo para web) - mesmo codigo, substitutos de web para o que so existe no celular.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('web configurada: bundler metro, saida unica, script de build, dependencias de web',()=>{
  const app=JSON.parse(read('app.json')),pk=JSON.parse(read('package.json'));
  assert.equal(app.expo.web.bundler,'metro');assert.equal(app.expo.web.output,'single');
  assert.equal(pk.scripts['build:web'],'expo export --platform web --output-dir ../public/web');
  for(const d of ['react-native-web','react-dom','@expo/metro-runtime'])assert.ok(pk.dependencies[d],d);
});
test('modulos so de celular ganham substitutos na web (as telas nao mudam)',()=>{
  const m=read('metro.config.js');
  for(const mod of ['expo-notifications','expo-secure-store','react-native-webview','expo-task-manager','expo-background-task']){
    assert.ok(m.includes("'"+mod+"'"),mod+' no metro.config');
    const file=m.match(new RegExp("'"+mod.replace(/[-/]/g,x=>'\\'+x)+"':'([^']+)'"))[1];
    assert.ok(fs.existsSync(path.join(__dirname,'..','src/web/shims',file)),'substituto existe: '+file);
  }
  assert.ok(m.includes("if(platform==='web'&&WEB_SHIMS[moduleName])"),'so na web');
  const sec=read('src/web/shims/expo-secure-store.ts');assert.ok(sec.includes('localStorage'));
  const not=read('src/web/shims/expo-notifications.ts');for(const fn of ['scheduleNotificationAsync','getPermissionsAsync','setNotificationHandler','addNotificationResponseReceivedListener','SchedulableTriggerInputTypes'])assert.ok(not.includes(fn),fn);
});
test('no navegador o app fala com o servidor que o serviu; sem verificacao de APK; Conversa vazia nao fica de cabeca para baixo',()=>{
  const api=read('src/lib/api.ts');assert.ok(api.includes("const inBrowser = typeof document !== 'undefined' && typeof location !== 'undefined'")&&api.includes("inBrowser ? location.origin :")&&api.includes("!(inBrowser && parsedBase.protocol === 'http:')"));
  assert.ok(read('src/lib/update.ts').includes("if (typeof document !== 'undefined') return null;"));
  assert.ok(read('src/screens/Chat.tsx').includes("Platform.OS==='web'?{transform:[{scaleY:-1}]}:null"));
});
