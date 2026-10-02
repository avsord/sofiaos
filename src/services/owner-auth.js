'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {atomicWrite}=require('../core/util');

function safeState(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  return value;
}
function normalizeEmail(value){return String(value||'').trim().toLowerCase();}
function sha256(value){return crypto.createHash('sha256').update(String(value||''),'utf8').digest('hex');}
function safeEqualHex(a,b){
  const aa=Buffer.from(String(a||''),'hex'),bb=Buffer.from(String(b||''),'hex');
  return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb);
}
function derive(password,salt){return crypto.scryptSync(String(password||''),Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('hex');}

class OwnerAuth {
  constructor(config,store){this.config=config;this.store=store;this.file=path.join(config.dataDir,'owner-auth.json');}
  registeredEmail(){return normalizeEmail(this.store.settings().profileEmail);}
  read(){try{return safeState(JSON.parse(fs.readFileSync(this.file,'utf8')));}catch{return {};}}
  write(state){fs.mkdirSync(path.dirname(this.file),{recursive:true});atomicWrite(this.file,Buffer.from(JSON.stringify(state,null,2)+'\n'));}
  hasStoredPassword(){const state=this.read();return Boolean(state.password_salt&&state.password_hash);}
  passwordConfigured(){return this.hasStoredPassword()||String(this.config.loginPassword||'').length>=1;}
  verifyPassword(password){
    const state=this.read();
    if(state.password_salt&&state.password_hash){const derived=derive(password,state.password_salt);return safeEqualHex(derived,state.password_hash);}
    const expected=String(this.config.loginPassword||'');
    const aa=Buffer.from(String(password||''),'utf8'),bb=Buffer.from(expected,'utf8');
    return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb);
  }
  verifyLogin(email,password){return normalizeEmail(email)===this.registeredEmail()&&this.verifyPassword(password);}
  setPassword(password){
    const value=String(password||'');
    if(value.length<12)throw new Error('A nova senha precisa ter pelo menos 12 caracteres.');
    const state=this.read(),salt=crypto.randomBytes(16).toString('hex');
    state.password_salt=salt;state.password_hash=derive(value,salt);state.password_changed_at=new Date().toISOString();
    delete state.reset_token_hash;delete state.reset_expires_at;this.write(state);
  }
  createResetToken(ttlMs=30*60*1000){
    const token=crypto.randomBytes(32).toString('base64url'),state=this.read();
    state.reset_token_hash=sha256(token);state.reset_expires_at=Date.now()+ttlMs;state.reset_requested_at=new Date().toISOString();this.write(state);return token;
  }
  tokenValid(token){const state=this.read();return Boolean(state.reset_token_hash&&Number(state.reset_expires_at)>Date.now()&&safeEqualHex(sha256(token),state.reset_token_hash));}
  consumeReset(token,newPassword){if(!this.tokenValid(token))return false;this.setPassword(newPassword);return true;}
}
module.exports={OwnerAuth,normalizeEmail};
