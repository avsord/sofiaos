'use strict';
// Release transport only. Produces readable source before testing; never used by the app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),cp=require('node:child_process');
const root=path.resolve(process.argv[2]||'.'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=zlib.brotliDecompressSync(Buffer.from(fs.readFileSync(path.join(__dirname,'source.b64'),'utf8').trim(),'base64'));
if(hash(raw)!=='ec3df94f79bf2cf3b7e501b0c83467eb7f641f8ee3d95bbc0005d0c808e00c9a')throw Error('Release transport checksum mismatch');
const bundle=JSON.parse(raw);
if(bundle.version!=='0.3.12'||!Array.isArray(bundle.files)||bundle.files.length!==18)throw Error('Unexpected release manifest');
const names=new Set(bundle.files.map(f=>f.path));
if(names.size!==18)throw Error('Duplicate manifest path');
function current(file){
 if(!/^SOFIA_APP\/[\w./-]+$/.test(file)||file.split('/').includes('..'))throw Error('Path outside Android release');
 let p=root;for(const part of file.split('/')){p=path.join(p,part);if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Symlink in release path');}
 return fs.existsSync(p)?hash(fs.readFileSync(p)):null;
}
for(const line of bundle.patch.split('\n').filter(line=>line.startsWith('+++ '))){if(!line.startsWith('+++ b/')||!names.has(line.slice(6)))throw Error('Patch manifest mismatch');}
if(bundle.files.every(f=>current(f.path)===f.after)){console.log('Exact 0.3.12 source already applied');process.exit(0);}
for(const f of bundle.files)if(current(f.path)!==f.before)throw Error('Concurrent source change: '+f.path+'; refusing overwrite');
for(const check of [true,false]){const r=cp.spawnSync('git',['apply','--unidiff-zero',...(check?['--check']:[]),'-'],{cwd:root,input:bundle.patch,encoding:'utf8'});if(r.error||r.status!==0)throw Error(String(r.error||r.stderr));}
for(const f of bundle.files)if(current(f.path)!==f.after)throw Error('Post-apply mismatch: '+f.path);
console.log('Applied and SHA-256 verified all 18 readable Android files.');
