'use strict';
const https=require('node:https');
const {URL}=require('node:url');

const agent=new https.Agent({keepAlive:true,maxSockets:6,maxFreeSockets:2,keepAliveMsecs:1000});

function headerAdapter(headers){
  const map=new Map();
  for(const [k,v] of Object.entries(headers||{}))map.set(String(k).toLowerCase(),Array.isArray(v)?v.join(', '):String(v??''));
  return {get(name){return map.get(String(name).toLowerCase())||null;}};
}

function httpsFetch(url,options={}){
  return new Promise((resolve,reject)=>{
    const target=new URL(url);
    let settled=false;
    const req=https.request({
      protocol:target.protocol,
      hostname:target.hostname,
      port:target.port||443,
      path:target.pathname+target.search,
      method:options.method||'GET',
      headers:options.headers||{},
      agent,
      autoSelectFamily:true,
      autoSelectFamilyAttemptTimeout:250,
      signal:options.signal
    },res=>{
      const chunks=[];let bytes=0;const limit=12*1024*1024;
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){req.destroy(Object.assign(new Error('Resposta HTTP excedeu o limite local.'),{code:'ERESPONSETOOLARGE'}));return;}chunks.push(chunk);});
      res.on('end',()=>{
        if(settled)return;settled=true;
        const raw=Buffer.concat(chunks).toString('utf8');
        resolve({
          ok:res.statusCode>=200&&res.statusCode<300,
          status:res.statusCode||0,
          headers:headerAdapter(res.headers),
          async text(){return raw;},
          async json(){return JSON.parse(raw);}
        });
      });
    });
    req.on('error',error=>{if(settled)return;settled=true;reject(error);});
    if(options.body!==undefined)req.write(options.body);
    req.end();
  });
}
module.exports={httpsFetch};
