// 0.3.227: trocar de janela sem piscar (a de baixo segura o fundo ate a nova aparecer), pausa menor entre menus,
// secoes dos Relatorios (Meta) sem abrir-e-fechar ao aparecer.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('0.3.227: janela que fecha para abrir outra segura o fundo; a nova entra com o fundo escuro',()=>{
  const s=read('src/components/Sheet.tsx');
  assert.ok(s.includes('export function markSheetHandoff(ms=800){handoffUntil=Date.now()+ms;}'));
  assert.ok(s.includes('<Modal visible={mounted||hold}'),'segura a janela de baixo');
  assert.ok(s.includes("opacity:hold||darkFromStart?1:progress"),'fundo nao clareia entre as duas');
  assert.ok(s.includes('if(darkFromStart){handoffUntil=0;setTimeout(releaseHolders,40);}'),'solta a de baixo quando a nova aparece');
  assert.ok(s.includes('},500);'),'nunca fica preso');
});
test('0.3.227: menus de Financas trocam de janela com a passagem e mais rapido',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('function afterSheet(run: () => void) { markSheetHandoff(); setTimeout(run, 120); }'));
});
test('0.3.227: secoes dos Relatorios so desenham sabendo se estavam abertas (Meta nao pisca)',()=>{
  const s=read('src/screens/Finance.tsx');
  assert.ok(s.includes('useState<boolean | null>(foldMemory ? (foldMemory[id] ?? true) : null)'));
  assert.ok(s.includes('useEffect(() => { void preloadFolds(); }, []);'),'le ao abrir Financas');
  assert.ok(!s.includes('useEffect(() => { if (foldMemory) return; SecureStore.getItemAsync(FOLD_KEY)'),'sem o abre-e-fecha antigo');
});
