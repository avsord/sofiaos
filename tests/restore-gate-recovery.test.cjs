'use strict';
// Regressão do travamento em loop na Railway: a checagem de integridade na
// subida abria o banco só para leitura. Se o disco encheu no meio de uma
// escrita, só uma conexão com permissão de escrita consegue terminar (ou
// desfazer) essa transação sozinha — é o próprio SQLite fazendo isso, não
// nada que a Sofia escreva. Só-leitura fica presa reportando "corrompido"
// para sempre, mesmo quando falta só essa etapa automática.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {existing}=require('../tools/restore-gate.cjs');

function makeVolume(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'restore-gate-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 fs.mkdirSync(path.join(base,'data'),{recursive:true});fs.mkdirSync(path.join(base,'secure'),{recursive:true});
 fs.writeFileSync(path.join(base,'secure','backup-master-v1.key'),'x');
 const db=new DatabaseSync(path.join(base,'data','sofia.sqlite'));db.exec('PRAGMA journal_mode=WAL');db.exec('CREATE TABLE t(v TEXT)');db.exec("INSERT INTO t VALUES('ok')");db.close();
 fs.writeFileSync(path.join(base,'restore-complete.json'),JSON.stringify({verified:true}));
 return base;
}

test('a checagem de integridade na subida não abre o banco só para leitura (é isso que trava a recuperação automática do SQLite)',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../tools/restore-gate.cjs'),'utf8');
 const call=src.slice(src.indexOf('function existing'),src.indexOf('function run('));
 assert.ok(!/readOnly\s*:\s*true/.test(call),'readOnly:true impede o SQLite de terminar uma transação interrompida sozinho');
 assert.ok(call.includes('wal_checkpoint'),'também força o checkpoint, em vez de deixar um WAL pendurado');
});

test('volume saudável: continua passando e devolvendo true normalmente',t=>{
 assert.equal(existing(makeVolume(t)),true);
});

test('arquivo da chave ausente ainda é recusado com uma mensagem clara (não veio da integridade, veio de arquivo faltando)',t=>{
 const base=makeVolume(t);fs.unlinkSync(path.join(base,'secure','backup-master-v1.key'));
 assert.throws(()=>existing(base),/Persistent restore incomplete/);
});

test('o erro de verdade aparece no log agora, em vez de uma frase genérica escondendo o motivo',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../tools/restore-gate.cjs'),'utf8');
 assert.ok(src.includes('Motivo: ')&&src.includes('e&&e.message'),'o motivo real precisa aparecer no log da Railway na próxima vez');
});
