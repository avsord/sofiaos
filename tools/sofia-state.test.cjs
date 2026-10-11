'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {newestPublished,diaryMaxVersion,collect,render}=require('./sofia-state.cjs');
const ROOT=path.resolve(__dirname,'..');
function git(dir,...args){return cp.execFileSync('git',['-c','user.name=test','-c','user.email=test@example.invalid',...args],{cwd:dir,encoding:'utf8'})}
function repo(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-state-'));git(dir,'init','-q','-b','main');return dir}
function write(dir,file,value){const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,value)}
function commit(dir,message){git(dir,'add','-A');git(dir,'commit','-q','-m',message)}
const app=version=>JSON.stringify({expo:{version,android:{versionCode:1}}});
const row=(v,date='2026-10-10')=>'| '+date+' | '+v+' | #1 | descrição | ok |';
const master=lines=>'# MASTER\n\n## 9. Pendências\n\n## 10. Diário de rodadas\n\n| Data | Versão | PR | O quê | Resultado |\n|---|---|---|---|---|\n'+lines+'\n';
function initialized(version='0.3.106',diary=version){const d=repo();write(d,'SOFIA_APP/app.json',app(version));write(d,'docs/SOFIA_MASTER.md',master(row(diary)));commit(d,'base');return d}
test('release: escolhe maior versão com APK; ignora rascunho, prévia e ordenação',()=>{
 const assets=[{name:'Sofia-OS.apk'}];
 const r=newestPublished([{tag_name:'sofia-android-v0.3.9',assets},{tag_name:'sofia-android-v0.3.57',assets},{tag_name:'sofia-android-v0.3.60',draft:true,assets},{tag_name:'sofia-android-v0.3.61',prerelease:true,assets},{tag_name:'sofia-android-v0.3.71',assets:[]}]);
 assert.equal(r.version,'0.3.57');
});
test('release: aceita páginas aninhadas do gh --slurp',()=>{
 const rows=[[{tag_name:'sofia-android-v0.3.5',assets:[{name:'Sofia-OS.apk'}]}],[{tag_name:'sofia-android-v0.3.7',assets:[{name:'Sofia-OS.apk'}]}]];
 assert.equal(newestPublished(rows).version,'0.3.7');
});
test('diário: maior versão e ignorar linhas de documentos',()=>{
 assert.equal(diaryMaxVersion(master(row('0.3.104')+'\n| 2026-10-10 | — | — | docs | ok |\n'+row('0.3.106'))).version,'0.3.106');
 assert.equal(diaryMaxVersion('sem seção'),null);
});
test('MASTER atualizado não alerta',()=>{const d=initialized();const s=collect(d);assert.deepEqual(s.warnings,[]);assert.match(render(s),/Nenhum alerta detectado/)});
test('MASTER atrasado aponta commit de código e versão do diário',()=>{
 const d=initialized('0.3.105');
 write(d,'SOFIA_APP/src/Tela.tsx','mudou');write(d,'SOFIA_APP/app.json',app('0.3.106'));commit(d,'fix(android): nova rodada');
 const s=collect(d);
 assert.equal(s.warnings.length,2);assert.match(s.warnings[0],/1 commit/);assert.match(s.warnings[1],/0\.3\.105.*0\.3\.106/);
 assert.match(render(s),/fix\(android\): nova rodada/);
});
test('docs e testes não configuram defasagem',()=>{
 const d=initialized();write(d,'SOFIA_APP/tests/novo.test.cjs','x');write(d,'docs/outro.md','x');commit(d,'docs');assert.deepEqual(collect(d).warnings,[]);
});
test('atualizar MASTER limpa a defasagem',()=>{
 const d=initialized('0.3.105');write(d,'SOFIA_APP/src/x.ts','x');write(d,'SOFIA_APP/app.json',app('0.3.106'));commit(d,'app');
 write(d,'docs/SOFIA_MASTER.md',master(row('0.3.105')+'\n'+row('0.3.106')));commit(d,'master');
 assert.deepEqual(collect(d).warnings,[]);
});
test('backend no src é alteração significativa',()=>{
 const d=initialized();write(d,'src/core/workspace.js','x');commit(d,'backend');assert.match(collect(d).warnings[0],/1 commit/);
});
test('GitHub inacessível informa não consultado, não inventa ausência de releases',()=>{
 const d=initialized();const s=render(collect(d,{releases:null,runs:null,pulls:null}));
 assert.match(s,/Atualizador oferece: não consultado/);assert.match(s,/Últimas execuções do workflow de APK\n\n- Não consultado/);
});
test('nova versão ainda não publicada e histórico de execuções mostram a realidade',()=>{
 const d=initialized();const s=collect(d,{releases:[{tag_name:'sofia-android-v0.3.57',assets:[{name:'Sofia-OS.apk'}]}],runs:{workflow_runs:[{status:'completed',conclusion:'failure',head_sha:'abcdef1234',display_title:'erro',html_url:'https://example.invalid'}]},pulls:[{number:9,title:'R3',merged_at:'2026-10-10'},{number:8,merged_at:null,title:'aberto'}]});
 const md=render(s);assert.equal(s.unpublished,true);assert.match(md,/0\.3\.57/);assert.match(md,/não publicado/);assert.match(md,/completed\/failure/);assert.match(md,/#9 R3/);assert.doesNotMatch(md,/aberto/);
});
const secrets=[
 ['GitHub',/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/],
 ['GitHub fine-grained',/\bgithub_pat_[A-Za-z0-9_]{20,}/],
 ['OpenAI',/\bsk-[A-Za-z0-9_-]{20,}/],
 ['private key',/-----BEGIN [A-Z ]*PRIVATE KEY-----/],
 ['URL credenciais',/[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i],
 ['variável secreta',/\b(OPENAI_API_KEY|META_APP_SECRET|SOFIA_LOGIN_PASSWORD|SOFIA_SMTP_PASS|WHATSAPP_VERIFY_TOKEN)\s*[=:]\s*[^\s\x60,.;)]{6,}/],
];
const scan=s=>secrets.filter(([,r])=>r.test(s)).map(([name])=>name);
test('scanner detecta exemplos de segredo e aceita nomes de variáveis',()=>{
 assert.deepEqual(scan('ghp_'+'x'.repeat(30)),['GitHub']);
 assert.deepEqual(scan('postgres://user:senha@host/database'),['URL credenciais']);
 assert.deepEqual(scan('OPENAI_API_KEY=valorExemplo123'),['variável secreta']);
 assert.deepEqual(scan('\x60OPENAI_API_KEY\x60 e \x60META_APP_SECRET\x60'),[]);
});
test('KEY contém seis passos e não instrui usuário a revelar segredos',()=>{
 const key=fs.readFileSync(path.join(ROOT,'docs/SOFIA_KEY.md'),'utf8');
 for(let i=1;i<=6;i++)assert.ok(key.includes('PASSO '+i));
 for(const s of ['ESTADO_VIVO.md','AGENTS.md','docs/SOFIA_MASTER.md','Nunca peça ao Pedro para colar token'])assert.ok(key.includes(s));
 assert.deepEqual(scan(key),[]);
});
test('proteção de publicação e continuidade sem segredos',()=>{
 for(const f of ['docs/SOFIA_KEY.md','docs/SOFIA_MASTER.md','AGENTS.md','PROMPT_FIXO_NOVO_AGENTE.md'])assert.deepEqual(scan(fs.readFileSync(path.join(ROOT,f),'utf8')),[],'segredo no '+f);
 const agents=fs.readFileSync(path.join(ROOT,'AGENTS.md'),'utf8');
 const masterText=fs.readFileSync(path.join(ROOT,'docs/SOFIA_MASTER.md'),'utf8');
 assert.ok(agents.includes('Manter o MASTER vivo')&&agents.includes('[approved-apk]'));
 assert.ok(!agents.includes('implemente, valide e publique a atualização aplicável no mesmo trabalho'));
 for(const h of ['## 3. Estado vivo','## 7. Decisões fechadas','## 9. Pendências','## 10. Diário de rodadas'])assert.ok(masterText.includes(h));
});
test('modificar runtime sem MASTER gera alerta, sem mexer no workflow Android',()=>{
 const d=initialized('0.3.105');write(d,'SOFIA_APP/src/Widget.tsx','novo');commit(d,'comportamento sem diário');
 assert.match(render(collect(d)),/⚠/);
 const state=fs.readFileSync(path.join(ROOT,'.github/workflows/sofia-state.yml'),'utf8');
 assert.match(state,/branches: \[sofia-app-android\]/);
 assert.doesNotMatch(state,/assembleRelease/);
});
