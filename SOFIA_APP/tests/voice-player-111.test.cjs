// 0.3.112: the voice player must survive Activity hide/show. Real React 19.2 + the REAL expo hooks
// (see tests/helpers/expo-audio-harness.cjs). Reproduces the crash seen in the device log of 0.3.109.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {expoAudio}=require('./helpers/expo-audio-harness.cjs');
const root=path.join(__dirname,'..');const jsx=require('react/jsx-runtime');
function compile(file,deps){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;const exports={};vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in deps,'Unexpected '+n);return deps[n];},console,Promise,Map,Set,Object,Error,String,Math,JSON,setTimeout,clearTimeout},{});return exports;}
const rn={View:'View',Text:'Text',ActivityIndicator:'Spinner'};
const registry=new Map();
const focus={registerVoice:(id,pause)=>{registry.set(id,pause);return()=>registry.delete(id);},silenceVoices:async()=>{}};
function setup(profile,file='src/components/VoicePlayer.tsx'){
 const audio=expoAudio(profile);
 const {VoicePlayer}=compile(path.join(root,file),{react:React,'react/jsx-runtime':jsx,'react-native':rn,'expo-audio':audio,'../lib/chat-model':{durationLabel:ms=>Math.round(ms/1000)+'s'},'../lib/audio-focus':focus,'../lib/theme':{useTheme:()=>({accent:'a',line:'l',muted:'m',danger:'d'})},'./UI':{IconButton:p=>React.createElement('Button',p)}});
 return {audio,VoicePlayer};
}
class Boundary extends React.Component{state={e:null};static getDerivedStateFromError(e){return {e};}componentDidCatch(e){this.props.onError(e);}render(){return this.state.e?React.createElement('Text',null,'FALLBACK'):this.props.children;}}
const quiet=async fn=>{const q=console.error;console.error=()=>{};try{return await fn();}finally{console.error=q;}};
const button=t=>t.root.findAllByType('Button')[0];
const labelOf=t=>button(t).props.label;
async function mount(profile,file){
 const {audio,VoicePlayer}=setup(profile,file);let caught=null,tree;
 const view=mode=>React.createElement(Boundary,{onError:e=>{caught=e;}},React.createElement(React.Activity,{mode},React.createElement(VoicePlayer,{source:{uri:'x'},duration:5000})));
 await quiet(async()=>{await act(async()=>{tree=create(view('visible'));});});
 return {audio,tree,view,error:()=>caught};
}

for(const profile of ['strict','native']){
 test(`[${profile}] esconder a aba com mensagens de voz nunca derruba o app (reproduz o erro do log da 0.3.109 com o componente antigo)`,async()=>{
  const m=await mount(profile);
  await quiet(async()=>{await act(async()=>{m.tree.update(m.view('hidden'));});await act(async()=>{await new Promise(r=>setTimeout(r,10));});await act(async()=>{m.tree.update(m.view('visible'));});});
  assert.equal(m.error(),null,'erro ao esconder/mostrar: '+(m.error()&&m.error().message));
 });
}
test('o componente ANTIGO (cópia fixa da 0.3.111) realmente falha no mesmo roteiro: o teste reproduz o defeito, não é decorativo',async()=>{
 // Copia fixa em tests/fixtures: não depende do histórico do git.
 const tmp=path.join(root,'src/components/__VoicePlayer.old.tsx');fs.copyFileSync(path.join(__dirname,'fixtures','VoicePlayer.0.3.111.tsx.txt'),tmp);
 try{const m=await mount('strict','src/components/__VoicePlayer.old.tsx');
  await quiet(async()=>{await act(async()=>{m.tree.update(m.view('hidden'));});});
  assert.ok(m.error()&&/already released/.test(m.error().message),'o defeito original precisa reaparecer');
 }finally{fs.unlinkSync(tmp);}
});
test('nenhum player nativo é criado ao montar a Conversa: só depois do primeiro toque',async()=>{
 const m=await mount('strict');assert.equal(m.audio.players.length,0,'montar não pode criar player');
 assert.equal(labelOf(m.tree),'Reproduzir mensagem de voz');
 await quiet(async()=>{await act(async()=>{await button(m.tree).props.onPress();});});
 assert.equal(m.audio.players.length,1,'o toque cria exatamente um player');
});
test('tocar, receber o áudio, reproduzir e pausar funciona',async()=>{
 const m=await mount('strict');
 await quiet(async()=>{await act(async()=>{await button(m.tree).props.onPress();});}); // carrega e aguarda
 const p=m.audio.players[0];
 await act(async()=>{p.load();});                                                          // áudio carregado -> autoplay
 assert.equal(labelOf(m.tree),'Pausar mensagem de voz');
 await quiet(async()=>{await act(async()=>{await button(m.tree).props.onPress();});});    // pausa
 assert.equal(labelOf(m.tree),'Reproduzir mensagem de voz');assert.equal(m.error(),null);
});
test('trocar de aba TOCANDO: o áudio para, nada quebra, e ao voltar o botão está limpo e funciona de novo',async()=>{
 const m=await mount('strict');
 await quiet(async()=>{await act(async()=>{await button(m.tree).props.onPress();});});
 await act(async()=>{m.audio.players[0].load();});assert.equal(labelOf(m.tree),'Pausar mensagem de voz');
 await quiet(async()=>{await act(async()=>{m.tree.update(m.view('hidden'));});});
 assert.equal(m.audio.players[0].released,true,'o player foi liberado ao esconder');
 await quiet(async()=>{await act(async()=>{m.tree.update(m.view('visible'));});});
 assert.equal(m.error(),null);assert.equal(labelOf(m.tree),'Reproduzir mensagem de voz','volta ocioso, sem estado velho de "tocando"');
 await quiet(async()=>{await act(async()=>{await button(m.tree).props.onPress();});});
 assert.equal(m.audio.players.length,2,'um player NOVO é criado, nunca reaproveita o liberado');
 await act(async()=>{m.audio.players[1].load();});assert.equal(labelOf(m.tree),'Pausar mensagem de voz');
});
test('20 ciclos de esconder e mostrar com o áudio tocando não vazam players nem derrubam o app',async()=>{
 const m=await mount('strict');
 for(let i=0;i<20;i++){
  await quiet(async()=>{await act(async()=>{await button(m.tree).props.onPress();});});
  await act(async()=>{m.audio.players.at(-1).load();});
  await quiet(async()=>{await act(async()=>{m.tree.update(m.view('hidden'));});await act(async()=>{m.tree.update(m.view('visible'));});});
 }
 assert.equal(m.error(),null);
 assert.equal(m.audio.players.filter(p=>!p.released).length,0,'todo player criado foi liberado');
});
test('foco de áudio: outra mensagem começando silencia esta e a pausa não falha com player já liberado',async()=>{
 const m=await mount('strict');
 await quiet(async()=>{await act(async()=>{await button(m.tree).props.onPress();});});await act(async()=>{m.audio.players[0].load();});
 await act(async()=>{for(const pause of registry.values())assert.doesNotThrow(()=>pause());});
 assert.equal(labelOf(m.tree),'Reproduzir mensagem de voz');
 m.audio.players[0].release();for(const pause of registry.values())assert.doesNotThrow(()=>pause(),'pausa em player liberado não pode lançar');
});
test('desmontar de verdade (rolar a lista) também libera sem erro',async()=>{
 const m=await mount('strict');
 await quiet(async()=>{await act(async()=>{await button(m.tree).props.onPress();});});
 await quiet(async()=>{await act(async()=>{m.tree.unmount();});});
 assert.equal(m.error(),null);assert.equal(m.audio.players.every(p=>p.released),true);
});
