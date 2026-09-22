'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {makeConfig}=require('./config/runtime');
const {createRuntime}=require('./core/runtime');
const {acquireLock}=require('./core/lock');
const {AppError}=require('./core/util');
async function startServer(options={}) {
  const root=options.root || path.resolve(__dirname,'..');
  const envFile=path.join(root,'.env');
  if(fs.existsSync(envFile)) {
    // Usa o parser já instalado no projeto. Não regrava nem solicita a chave.
    require('dotenv').config({path:envFile,quiet:true,override:true});
  }
  const config=makeConfig({root,...options.config});
  const release=acquireLock(config.dataDir);
  let runtime,server,timer,stopped=false;
  try {
    runtime=createRuntime(config,options.runtimeOptions);
    const app=options.appFactory?options.appFactory(runtime):require('./app').createApp(runtime);
    const PORT = Number(process.env.PORT) || config.port || 8080;
const HOST = process.env.PORT ? '0.0.0.0' : (config.host || '127.0.0.1');

server=http.createServer((req,res)=>{
      try {
        const parsed=new URL(req.url,'http://localhost');
        // SOFIA_PRIVACY_PAGE_V117
        if(req.method==='GET' && parsed.pathname==='/privacy') {
          const html=`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sofia OS - Política de Privacidade</title>
<style>
body{font-family:Arial,sans-serif;max-width:820px;margin:48px auto;padding:0 20px;line-height:1.65;color:#171717}
h1,h2{line-height:1.25} h1{margin-bottom:8px} .muted{color:#666} a{color:inherit}
</style>
</head>
<body>
<h1>Política de Privacidade — Sofia OS</h1>
<p class="muted">Última atualização: 22 de setembro de 2026.</p>

<p>A Sofia OS utiliza informações fornecidas pelos usuários somente na medida necessária para operar e melhorar suas funcionalidades.</p>

<h2>1. Dados tratados</h2>
<p>Quando uma pessoa interage com a Sofia OS, inclusive pelo WhatsApp, podem ser tratados dados como mensagens enviadas, identificadores técnicos, metadados necessários ao funcionamento do serviço e informações que o próprio usuário decidir fornecer.</p>

<h2>2. Finalidades</h2>
<p>Esses dados podem ser usados para receber e responder solicitações, executar funcionalidades solicitadas, manter a segurança e a estabilidade do serviço, solucionar falhas e cumprir obrigações legais aplicáveis.</p>

<h2>3. Prestadores e integrações</h2>
<p>Para funcionar, a Sofia OS pode utilizar serviços de terceiros estritamente necessários à operação, como Meta/WhatsApp, infraestrutura de hospedagem e provedores de inteligência artificial quando configurados. Cada prestador também pode tratar dados de acordo com seus próprios termos e políticas.</p>

<h2>4. Compartilhamento e venda</h2>
<p>A Sofia OS não vende dados pessoais. Informações somente podem ser compartilhadas quando necessário para prestar o serviço, proteger a operação, cumprir uma obrigação legal ou atender a uma solicitação válida do próprio usuário.</p>

<h2>5. Retenção e segurança</h2>
<p>Os dados são mantidos pelo período necessário às finalidades do serviço, às configurações adotadas e às obrigações aplicáveis. São adotadas medidas razoáveis de segurança para reduzir riscos de acesso, alteração, perda ou divulgação não autorizados.</p>

<h2>6. Direitos e exclusão</h2>
<p>O usuário pode solicitar acesso, correção ou exclusão de informações relacionadas ao serviço pelo canal oficial de atendimento da Sofia OS no WhatsApp. Solicitações serão tratadas de acordo com a legislação aplicável e com eventuais obrigações de retenção.</p>

<h2>7. Atualizações desta política</h2>
<p>Esta política pode ser atualizada para refletir mudanças no serviço, em integrações ou em requisitos legais. A versão publicada nesta página será a versão vigente.</p>

<p><strong>Sofia OS</strong></p>
</body>
</html>`;

          res.statusCode=200;
          res.setHeader('Content-Type','text/html; charset=utf-8');
          res.setHeader('Cache-Control','no-store');
          res.end(html);
          return;
        }
        if(req.method==='GET' && parsed.pathname==='/webhook') {
          // META_WEBHOOK_VERIFY_V116
          const expected=String(process.env.WHATSAPP_VERIFY_TOKEN || '');
          const mode=parsed.searchParams.get('hub.mode');
          const token=parsed.searchParams.get('hub.verify_token');
          const challenge=parsed.searchParams.get('hub.challenge');

          if(!expected) {
            res.statusCode=503;
            res.setHeader('Content-Type','text/plain; charset=utf-8');
            res.end('WHATSAPP_VERIFY_TOKEN_NOT_CONFIGURED');
            return;
          }

          if(mode==='subscribe' && token===expected && challenge!==null) {
            res.statusCode=200;
            res.setHeader('Content-Type','text/plain; charset=utf-8');
            res.end(challenge);
            return;
          }

          res.statusCode=403;
          res.setHeader('Content-Type','text/plain; charset=utf-8');
          res.end('Forbidden');
          return;
        }
      } catch (_) {}
      return app(req,res);
    });
server.requestTimeout=120000;
server.headersTimeout=15000;

await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(PORT,HOST,resolve);
});

server.on('error',()=>console.error('[Sofia] Falha no servidor HTTP.'));
runtime.backups.daily();
runtime.scheduler.start();

timer=setInterval(()=>{
  if(!runtime.core.busy)runtime.backups.daily();
},60000);
timer.unref();

console.log(`Sofia OS online em http://${HOST}:${PORT}`);
    console.log('Core v125 | Memória em data/sofia.sqlite | Acesso apenas neste computador.');
    console.log('Início normal: chave preservada, sem nova colagem. Ctrl+C encerra com segurança.');
    if(!runtime.store.settings().routingEnabled)console.log('Memória e módulos locais disponíveis. A IA ainda não está conectada aos filtros.');
    if(runtime.backups.lastError)console.error('[Sofia] '+runtime.backups.lastError);
  }catch(e) {
    clearInterval(timer);try{runtime?.store.close();}catch{}release();
    if(e.code==='EADDRINUSE')throw new AppError('PORT_IN_USE','A porta está ocupada. Pare somente o servidor antigo da Sofia; não encerrei nenhum processo.',409);
    throw e;
  }
  const stop=async()=>{
    if(stopped)return;stopped=true;clearInterval(timer);runtime.core.shutdown();await runtime.scheduler.stop();runtime.vault.lock();
    server.close();
    // Abort provider work first; do not start background work or retry during shutdown.
    const deadline=Date.now()+10000;
    while(runtime.core.busy && Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
    if(!runtime.core.busy) {
      for(const c of runtime.store.conversations(100000,0).filter(c=>c.state==='active')) {
        if(runtime.store.messages(c.id,1).length)try{runtime.store.checkpoint(c.id,{reason:'shutdown'});}catch{}
      }
      runtime.backups.tryCreate('shutdown');
      runtime.store.close();
    }else console.error('[Sofia] Uma chamada ainda estava encerrando. O banco recuperará a tentativa como interrompida no próximo início.');
    server.closeAllConnections();release();process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
    console.log('Sofia encerrada. As mensagens já confirmadas permanecem salvas.');
  };
  const onSignal=()=>{stop().catch(()=>console.error('[Sofia] Falha ao finalizar. O banco local não foi apagado.'));};
  process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
  return {...runtime,server,stop};
}
if(require.main===module)startServer().catch(e=>{console.error('ERRO: '+(e instanceof AppError?e.message:'Não foi possível abrir a Sofia. Execute DIAGNOSTICO_SOFIA.cmd; não envie seu .env.'));process.exitCode=1;});
module.exports={startServer};
