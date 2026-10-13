'use strict';
// Modo escuro: a cor de destaque (c.accent) fica CLARA no escuro, de propósito, para se ver
// contra o fundo escuro. Um texto branco fixo em cima dela (botões, cartões, abas) por isso
// ficava quase ilegível no modo escuro, mesmo sendo perfeito no claro. onAccent resolve: branco
// no claro (destaque escuro), escuro no escuro (destaque claro).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');

function loadTheme() {
  const src = fs.readFileSync(path.join(__dirname, '../src/lib/theme.tsx'), 'utf8');
  const js = ts.transpileModule(src, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React}}).outputText;
  const ctx = {exports: {}, require: () => ({createContext: () => null, useContext: () => null})};
  vm.runInNewContext(js, ctx);
  return ctx.exports;
}
function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

test('cada tema define onAccent, e ele tem contraste de verdade contra o destaque daquele tema (WCAG >= 3:1, o minimo para texto grande/icone)', () => {
  const {light, dark} = loadTheme();
  assert.ok(light.onAccent && dark.onAccent, 'os dois temas definem onAccent');
  assert.ok(contrastRatio(light.onAccent, light.accent) >= 3, 'claro: onAccent ' + light.onAccent + ' contra accent ' + light.accent);
  assert.ok(contrastRatio(dark.onAccent, dark.accent) >= 3, 'escuro: onAccent ' + dark.onAccent + ' contra accent ' + dark.accent);
  const before = contrastRatio('#FFFFFF', dark.accent);
  assert.ok(before < 3, 'confirma o problema de verdade: branco fixo contra o destaque do modo escuro so tinha ' + before.toFixed(2) + ':1 de contraste');
});

test('botao principal, logo, recarregar tela, sino, e-mails, foto de perfil e mini agenda usam onAccent (nao branco fixo) sobre o destaque', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.ok(read('src/components/UI.tsx').includes('color:secondary?c.accent:c.onAccent'));
  assert.ok(read('src/components/UI.tsx').includes('color:c.onAccent}}>{label}</Text></View>; }'));
  assert.ok(read('src/components/ScreenBoundary.tsx').includes('color:c.onAccent,fontWeight'));
  const nc = read('src/components/NotificationCenter.tsx');
  assert.ok(nc.includes('color:c.onAccent,fontSize:10'));
  assert.ok(nc.includes('color:filter===value?c.onAccent:c.text'));
  assert.ok(read('src/screens/Mail.tsx').includes('color: o.value === value ? c.onAccent : c.text'));
  assert.ok(read('src/components/ProfilePhotoEditor.tsx').includes('color={c.onAccent}'));
  assert.ok(read('src/components/DashboardWidgets.tsx').includes('color:active?c.onAccent:c.text'));
});

test('Financas: cartao "Saldo geral", botao Nova despesa, cabecalho do lancamento e a aba selecionada usam cor que funciona nos dois modos', () => {
  const fin = fs.readFileSync(path.join(__dirname, '../src/screens/Finance.tsx'), 'utf8');
  for (const t of [
    'color: c.onAccent, fontSize: 32',
    "color: c.onAccent, fontSize: 22, fontWeight: '800'}}>\u2212",
    "headText = head === c.accent ? c.onAccent : '#fff'",
    'selectedTabText = head === c.accent ? light.accent : head',
    'color: kind === k ? selectedTabText : headText',
  ]) assert.ok(fin.includes(t), t);
  assert.ok(!/backgroundColor: c\.accent[^S][^\n]*color: '#fff'/.test(fin), 'nenhum branco fixo direto sobre um fundo de destaque solido');
});
