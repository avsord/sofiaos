'use strict';
// 0.3.157: volta o "S" da marca em tudo (icone, abertura, login, chat e site).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('icone do Android vem do S vetorial, como antes',()=>{
  const a=read('tools/assets.cjs');
  assert.ok(a.includes("['icon-master.svg','icon.png'],['adaptive-foreground.svg','adaptive-foreground.png']"));
  for(const f of ['assets/icon-master.svg','assets/adaptive-foreground.svg'])assert.ok(read(f).length>0);
  const png=fs.readFileSync(path.join(root,'assets/icon.png'));assert.equal(png.readUInt32BE(16),1024);
});
test('abertura, login e chat com o S (sem a esfera)',()=>{
  const k=read('plugins/native/SofiaLaunchOverlay.kt'),logo=read('plugins/with-sofia-logo.cjs');
  assert.ok(k.includes('getDrawable(R.drawable.sofia_launch_mark'));assert.ok(!k.includes('sofia_launch_orb'));
  assert.ok(k.includes('Color.rgb(114, 88, 232)'),'fundo roxo da marca');
  assert.ok(logo.includes('sofia_launch_mark.xml'));assert.ok(!logo.includes('sofia-launch-orb.webp'));
  assert.ok(read('src/screens/Login.tsx').includes('<Brand/>'));
  const chat=read('src/screens/Chat.tsx');assert.ok(chat.includes('<Brand size={25}/>')&&chat.includes('<Brand/>'));
  assert.ok(!chat.includes('SofiaLogo'));
});
test('0.3.158: o build procura os arquivos do S, nao os da esfera (era isso que quebrava a compilacao)',()=>{
  const wf=read('../.github/workflows/sofia-native-047-update.yml');
  assert.ok(wf.includes("grep -q '@drawable/sofia_logo_foreground' android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"));
  assert.ok(wf.includes('test -f android/app/src/main/res/drawable/sofia_launch_mark.xml'));
  assert.ok(!wf.includes('sofia_launch_orb'));
});
test('site publico e paginas do servidor voltam ao S roxo',()=>{
  const site=read('../public/site.html'),handler=read('../src/core/http-handler.js');
  assert.ok(site.includes('<span class="mark">S</span>'));assert.ok(!site.includes('sofia-logo.png'));
  assert.ok(handler.includes('<span class=\"mark\">S</span>'));
  assert.ok(handler.includes('background:#7258e8'));
});
