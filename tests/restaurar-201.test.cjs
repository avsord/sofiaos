'use strict';
// 0.3.201: com o repositorio + o arquivo do Drive + a senha, a Sofia volta inteira (sem o servidor antigo).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {fixture}=require('./helpers.cjs');const {seal}=require('../src/services/backup');const {Store}=require('../src/memory/store');
test('restaurar-backup.cjs recria o banco a partir do backup com senha; senha errada nao abre; nao sobrescreve sem --substituir',t=>{
 const {core,store}=fixture(t);const w=core.workspace;
 w.save({kind:'user_page',title:'Página que precisa voltar',area:'Pessoal',data:{blocks_json:'[]'}});
 const conta=w.save({kind:'fin_account',title:'Conta principal',area:'Pessoal',data:{account_type:'corrente',initial_balance:'0',include_total:true}});
 w.save({kind:'fin_tx',title:'Salário',area:'Pessoal',data:{kind:'income',amount:7821,date:'2026-10-25',paid:false,recurrence:'monthly',account_id:conta.id}});
 const st=store||core.store;const file=path.join(os.tmpdir(),'sofia-teste-'+Date.now()+'.sofia-backup');
 fs.writeFileSync(file,seal(st.export(),{passphrase:'senha-de-teste-123'}));t.after(()=>{try{fs.unlinkSync(file);}catch{}});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-restaura-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const run=(pass,extra=[])=>spawnSync(process.execPath,[path.join(__dirname,'..','scripts','restaurar-backup.cjs'),file,dir,...extra],{env:{...process.env,SOFIA_BACKUP_PASSPHRASE:pass},encoding:'utf8',timeout:60000});
 const bad=run('senha-errada-999');assert.notEqual(bad.status,0);assert.match(bad.stderr,/Nao foi possivel restaurar/);
 const ok=run('senha-de-teste-123');assert.equal(ok.status,0,ok.stderr);assert.match(ok.stdout,/Restaurado em/);
 const back=new Store(path.join(dir,'sofia.sqlite'));
 const titles=back.db.prepare('SELECT title FROM entities').all().map(r=>r.title);back.close();
 assert.ok(titles.includes('Página que precisa voltar'));assert.ok(titles.includes('Salário'));
 const again=run('senha-de-teste-123');assert.equal(again.status,3,'sem --substituir nao mexe no banco existente');
 const repl=run('senha-de-teste-123',['--substituir']);assert.equal(repl.status,0,repl.stderr);assert.ok(fs.existsSync(path.join(dir,'sofia.sqlite.antes-da-restauracao')));
});
test('o guia COMO-RESTAURAR.md explica os passos',()=>{
 const g=fs.readFileSync(path.join(__dirname,'..','scripts','COMO-RESTAURAR.md'),'utf8');
 for(const s of ['Backup com senha','SOFIA_BACKUP_PASSPHRASE','scripts/restaurar-backup.cjs','--substituir','Conta Google'])assert.ok(g.includes(s),s);
});
