'use strict';
// 0.3.139: logo oficial da Sofia (esfera) no icone, na abertura e no login.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const png=f=>{const b=fs.readFileSync(path.join(root,f));assert.equal(b.toString('ascii',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};

test('0.3.139: icones e logo da abertura sao a imagem nova',()=>{
  assert.deepEqual(png('assets/icon.png'),[1024,1024]);
  assert.deepEqual(png('assets/adaptive-foreground.png'),[1024,1024]);
  const [w,h]=png('assets/sofia-logo-app.png');assert.equal(w,h);assert.ok(w>=128);
  const orb=fs.readFileSync(path.join(root,'assets/sofia-launch-orb.webp'));
  assert.equal(orb.toString('ascii',0,4),'RIFF');assert.equal(orb.toString('ascii',8,12),'WEBP');
  assert.ok(orb.length<200000,'logo da abertura leve para nao atrasar a primeira tela');
  const config=JSON.parse(read('app.json')).expo;
  assert.equal(config.android.adaptiveIcon.foregroundImage,'./assets/adaptive-foreground.png');
  assert.equal(config.android.adaptiveIcon.backgroundColor,'#FFFFFF');
  const assets=read('tools/assets.cjs');
  assert.ok(!assets.includes('icon-master.svg'),'o build nao pode regerar o icone antigo a partir do S vetorial');
});

test('0.3.139: plugin copia o logo sem escala de densidade e o launcher usa a imagem',()=>{
  const logo=read('plugins/with-sofia-logo.cjs');
  assert.ok(logo.includes("assets/sofia-launch-orb.webp'),path.join(res,'drawable-nodpi/sofia_launch_orb.webp')"));
  assert.ok(logo.includes('<color name="sofiaLaunchBackground">#FFFFFF</color>'));
  assert.ok(!logo.includes('#7258E8</color>'));
  assert.ok(logo.includes('android:drawable="@drawable/sofia_launch_orb"/></layer-list>'));
  assert.ok(!logo.includes("replace('@mipmap/ic_launcher_foreground','@drawable/sofia_logo_foreground')"));
  assert.ok(logo.includes('<item name="android:windowLightStatusBar">true</item>'));
});

test('0.3.139: abertura nativa desenha a esfera em fundo branco, crescendo e girando desde o primeiro quadro',()=>{
  const native=read('plugins/native/SofiaLaunchOverlay.kt');
  assert.ok(native.includes('getDrawable(R.drawable.sofia_launch_orb, activity.theme)'));
  assert.ok(!native.includes('R.drawable.sofia_launch_mark,'));
  assert.ok(native.includes('android.graphics.Color.rgb(255, 255, 255)'));
  assert.ok(!native.includes('canvas.rotate('),'0.3.140: logo parado, sem giro');
  const motion=read('plugins/native/SofiaLaunchMotion.java');
  assert.ok(motion.includes('DURATION_MS = 1100L'),'escala lenta e organica');
  assert.ok(motion.includes('public static float rotationAt(long startedAt, long now)'));
});

test('0.3.139: login mostra o logo oficial; iniciais de perfil continuam com Brand',()=>{
  const ui=read('src/components/UI.tsx'),login=read('src/screens/Login.tsx');
  assert.ok(ui.includes("require('../../assets/sofia-logo-app.png')"));
  assert.ok(ui.includes('export function SofiaLogo('));
  assert.ok(login.includes('<SofiaLogo/>'));
  assert.ok(!login.includes('<Brand/>'));
  assert.ok(ui.includes('export function Brand('));
});
