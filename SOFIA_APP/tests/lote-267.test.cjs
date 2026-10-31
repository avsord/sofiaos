'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.267: janela flutuante nao pula para o centro ao fechar',()=>{
  const s=read('src/components/Sheet.tsx');
  assert.ok(!/if\(!visible\)\{setAnchor\(null\)/.test(s),'a posicao nao pode ser zerada no instante em que fecha');
  assert.ok(/if\(!mounted\)\{[^}]*setAnchor\(null\)/.test(s),'a posicao e esquecida so depois de sair');
});
test('0.3.267: saida no computador com o mesmo ritmo da entrada',()=>{
  assert.ok(/Math\.min\(exitBase,170\)/.test(read('src/lib/motion.ts')));
});
test('0.3.267: painel do Price Tracker anima a saida',()=>{
  const m=read('src/screens/Monitoring.tsx'),d=read('src/screens/monitoring/Detail.tsx');
  assert.ok(m.includes('visible={!!open}')&&m.includes('lastOpen.current'),'continua montado enquanto sai');
  assert.ok(d.includes('<MotionModal visible={visible}'),'o painel recebe visible');
});
test('0.3.267: site sem contorno de clique e menu lateral sem itens repetidos',()=>{
  assert.ok(/\*:focus, \*:focus-visible \{ outline: none !important; \}/.test(read('public/index.html')));
  assert.ok(read('src/desktop/DesktopShell.tsx').includes("!['pages','apps','profile'].includes(t)"));
});
test('0.3.267: titulo da pagina numa linha no site e tique de Capsulas neutro',()=>{
  assert.ok(read('src/screens/Pages.tsx').includes("Platform.OS==='web'?{numberOfLines:1}"));
  const h=read('src/desktop/HomeDeskCards.tsx');
  assert.ok(h.includes("borderColor: on ? c.line : c.muted + '77'"),'tique cinza, sem a cor da capsula');
});
