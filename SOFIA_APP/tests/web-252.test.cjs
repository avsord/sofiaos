'use strict';
// 0.3.252: Conversa de cabeca para baixo na web; Financas e Perfil com layout de computador.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Conversa: sem puxar-para-atualizar na web (a lista invertida era invertida duas vezes)',()=>{
  assert.ok(read('src/screens/Chat.tsx').includes("{...(Platform.OS==='web'?{}:{refreshing,onRefresh:()=>void refresh()})}"));
});
test('Financas: Resumo em duas colunas e + no topo no computador; botao flutuante so no celular',()=>{
  const f=read('src/screens/Finance.tsx');assert.ok(f.includes('testID="finance-home-split"')&&f.includes('{!desktop ? <Pressable accessibilityRole="button" accessibilityLabel="Novo lançamento"')&&f.includes('＋ Novo lançamento'));
});
test('Perfil: abas viram menu lateral de configuracoes no computador',()=>{
  const p=read('src/screens/Profile.tsx');assert.ok(p.includes('testID="profile-layout"')&&p.includes('{width:230,gap:2}'));
});
