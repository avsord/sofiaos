const {test}=require('node:test');
const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('v72: sidebar inteira rola sem cortar aplicativos e sem criar scrollbar interna que desloca o menu',()=>{
  const C=read('public/style.css');
  assert.match(C,/\.mode-user \.sidebar\{[\s\S]*?overflow-y:scroll!important;[\s\S]*?scrollbar-gutter:stable!important;[\s\S]*?contain:none!important/);
  assert.match(C,/\.mode-user #userNavigation\{[\s\S]*?flex:0 0 auto!important;[\s\S]*?overflow:visible!important/);
  assert.match(C,/\.mode-user #userPagesNav\{[\s\S]*?max-height:none!important;[\s\S]*?overflow:visible!important/);
});

test('v72: Chat mantém ícone à esquerda e centraliza o nome do botão',()=>{
  const C=read('public/style.css');
  assert.match(C,/#newConversation\.chat-nav\{[\s\S]*?justify-content:center!important;[\s\S]*?text-align:center!important/);
  assert.match(C,/#newConversation\.chat-nav>\.nav-icon\{[\s\S]*?position:absolute!important;[\s\S]*?left:8px!important/);
  assert.match(C,/#newConversation\.chat-nav>\.nav-label\{[\s\S]*?text-align:center!important/);
});

test('v72: título APLICATIVOS DA SOFIA usa a mesma régua à esquerda de PARTICULAR',()=>{
  const C=read('public/style.css');
  assert.match(C,/#appsMenuToggle\{[\s\S]*?margin:22px 10px 7px!important;[\s\S]*?padding:8px 0!important;[\s\S]*?text-align:left!important/);
  assert.match(C,/#appsMenuToggle \.sidebar-section-title\{[\s\S]*?text-align:left!important/);
});

test('v72: cartão de uso tem fechar e atualiza percentagem após mudança do alerta',()=>{
  const A=read('public/app.js');
  assert.match(A,/className='usage-close'|el\('button','usage-close','×'\)/);
  assert.match(A,/close\.onclick=\(\)=>\{state\.homeUsage=null;/);
  assert.match(A,/async function refreshUsageStatus/);
  assert.match(A,/await maybeUsageAlert\(\{forceShow:Boolean\(r\?\.details\?\.usage\|\|r\?\.details\?\.usage_alert_changed\),preferredFilter:/);
});

test('v72: gradiente representa a percentagem real em vez de comprimir verde-amarelo-vermelho no trecho preenchido',()=>{
  const A=read('public/app.js'),C=read('public/style.css');
  assert.match(A,/usage-bar-spectrum/);
  assert.match(A,/usage-bar-remainder/);
  assert.match(C,/\.usage-bar-spectrum\{[\s\S]*?linear-gradient\(90deg/);
});

test('v72: backend devolve o uso recalculado junto da alteração do alerta',()=>{
  const C=read('src/core/sofia-core.js');
  assert.match(C,/usage_alert_changed:true[\s\S]*?usage:\{source:'local',used,limit,remaining,percent:pct/);
  assert.match(C,/\$\{pct\.toFixed\(2\)\}% do novo alerta/);
});


test('v72: versionamento posterior preserva os assets e identidade introduzidos na v72',()=>{
  const cfg=read('src/config/sofia.js'),H=read('public/index.html'),pkg=JSON.parse(read('package.json'));
  const version=cfg.match(/VERSION = '(\d+)\.0\.0'/),title=H.match(/Sofia OS · v(\d+)/),css=H.match(/style\.css\?v=(\d+)/),js=H.match(/app\.js\?v=(\d+)/),core=H.match(/Core v(\d+)/);for(const x of [version,title,css,js,core])assert.ok(Number(x?.[1])>=72);assert.ok(Number(pkg.version.split('.')[1])>=23);
});
