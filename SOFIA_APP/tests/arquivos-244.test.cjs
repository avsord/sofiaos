'use strict';
// 0.3.244: Arquivos da Sofia (área oculta do Drive) — textos da tela, rotas da API, abertura sob demanda,
// apagar com confirmação, limpeza semanal dos comprovantes e aviso do sino abrindo a tela.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const D=load('src/lib/drive-files.ts');
test('tamanhos em pt-BR e datas curtas',()=>{
 assert.equal(D.fileSize(0),'0 B');assert.equal(D.fileSize(1536),'1,5 KB');assert.equal(D.fileSize(5*1048576),'5,0 MB');assert.equal(D.fileSize(214748364800),'200,0 GB');
 assert.equal(D.shortDate(''),'');assert.match(D.shortDate('2026-10-26T15:00:00Z'),/^\d{2}\/10\/2026$/);
});
test('aviso do topo: reconectar, migração, o que ficou e área apagada (nessa ordem)',()=>{
 assert.match(D.filesNotice({needs_reconnect:true,migration:{state:'none',moved:0,left:0},wiped_at:''}).text,/Reconectar/);
 const run=D.filesNotice({needs_reconnect:false,migration:{state:'running',moved:12,left:0},wiped_at:''});assert.match(run.text,/12 já foram/);assert.equal(run.tone,'info');
 const left=D.filesNotice({needs_reconnect:false,migration:{state:'done',moved:30,left:1},wiped_at:''});assert.match(left.text,/1 arquivo não pôde/);assert.equal(left.tone,'danger');
 assert.match(D.filesNotice({needs_reconnect:false,migration:{state:'done',moved:3,left:0},wiped_at:'2026-10-26'}).text,/apagados/);
 assert.equal(D.filesNotice({needs_reconnect:false,migration:{state:'done',moved:3,left:0},wiped_at:''}),null);
});
test('API: lista, conteúdo com a sessão, apagar, limpeza e exportação usam as rotas do servidor',()=>{
 const a=read('src/lib/api.ts');
 for(const s of ["'/md/drive/files'","'/md/drive/files?cat='","'/api/mobile/md/drive/files/'+encodeURIComponent(id)+'/content',headers:{Authorization:'Bearer '+this.token}","'/md/drive/files/'+encodeURIComponent(id),{},'DELETE'","'/md/drive/receipts-cleanup',{enabled}","'/md/drive/export',{categories}"])assert.ok(a.includes(s),s);
});
test('a tela só carrega quando aberta (não pesa na abertura do app) e o aviso do sino do Drive leva a ela',()=>{
 assert.ok(read('src/lib/screen-loader.tsx').includes("loadSofiaFiles=()=>once('sofia-files',()=>require('../components/SofiaFiles').SofiaFiles)"));
 const app=read('App.tsx');assert.ok(!/from '\.\/src\/components\/SofiaFiles'/.test(app),'sem import direto no App');
 assert.ok(app.includes("if(area==='Arquivos da Sofia')setFilesOpen(true);"));assert.ok(app.includes('<DeferredScreen load={loadSofiaFiles}'));
 assert.ok(read('src/components/NotificationCenter.tsx').includes("if(/^drive$|arquivo/.test(category))return 'Arquivos da Sofia';"));
});
test('Conta Google: Reconectar quando falta a área oculta, progresso da migração e botão Arquivos da Sofia',()=>{
 const g=read('src/components/GoogleCalendarSettings.tsx');
 assert.ok(g.includes('status.drive.needs_reconnect')&&g.includes('Reconectar para proteger os arquivos'));
 assert.ok(g.includes("status.drive.migration?.state==='running'"));
 assert.ok(g.includes('<Button title="Arquivos da Sofia" onPress={()=>setFilesOpen(true)}/>'));
 assert.ok(g.includes('function authorize()')&&g.includes("onPress:authorize"),'conectar e reconectar usam a mesma janela do Google');
});
test('tela: apagar pede confirmação e cópia de página não tem lixeira; comprovantes com a chave da limpeza; carrega com esqueleto',()=>{
 const s=read('src/components/SofiaFiles.tsx');
 assert.ok(s.includes("appAlert('Apagar este arquivo?'")&&s.includes("style:'destructive'"));
 assert.ok(s.includes('{item.deletable?<IconButton name="trash"'));
 assert.ok(s.includes("cat.key==='Comprovantes'&&summary?.receipts_cleanup")&&s.includes('onValueChange={toggleCleanup}'));
 assert.ok(s.includes('<Skeleton rows={6}/>')&&s.includes('ShimmerGroup'),'nunca tela cinza: esqueleto com brilho');
 assert.ok(s.includes('Sharing.shareAsync(file.uri'),'abrir = tela do Android para abrir/salvar/compartilhar');
 assert.ok(s.includes("BackHandler.addEventListener('hardwareBackPress',back)"),'voltar do Android volta da lista para os tipos');
});
