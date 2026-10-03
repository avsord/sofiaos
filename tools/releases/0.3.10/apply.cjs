'use strict';
// Deterministic transport of a reviewed release diff. No network calls or secret reads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const cp = require('node:child_process');
const EXPECTED = '91d4fb9ffe441531a140842047041b24bb404ce5152e6f8303068223704b5d5c';
const mode = process.argv[2], root = path.resolve(process.argv[3] || '.');
if (!['app', 'backend'].includes(mode)) throw new Error('Usage: node apply.cjs app|backend REPOSITORY_ROOT');
const raw = zlib.brotliDecompressSync(Buffer.from(Array.from({length:8},(_,i)=>fs.readFileSync(path.join(__dirname,`part-${i}.b64`),'utf8').trim()).join(''),'base64'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (sha(raw) !== EXPECTED) throw new Error('Release archive checksum mismatch; no files changed.');
const bundle = JSON.parse(raw.toString('utf8'));
if (bundle.version !== '0.3.10') throw new Error('Unexpected release.');
const files = bundle[mode], patch = bundle[mode + '_patch'];
const backendAllowed = new Set(['.github/workflows/sofia-main-validation.yml','package.json','package-lock.json','public/app.js','public/index.html','src/channels/mobile.js','src/config/sofia.js','src/core/http-handler.js','src/services/chat-sync.js','tests/auth-online.test.cjs','tests/chat-sync-v141.test.cjs','tests/current-ui.test.cjs']);
function current(file) {
  if (!/^[\w./-]+$/.test(file) || path.isAbsolute(file) || file.split('/').includes('..')) throw new Error('Unsafe patch path.');
  if (mode === 'app' ? !file.startsWith('SOFIA_APP/') : !backendAllowed.has(file)) throw new Error('Path outside release scope: '+file);
  let cursor = root;
  for (const part of file.split('/')) {cursor=path.join(cursor,part);if (fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Symlink in patch path: '+file);}
  return fs.existsSync(cursor) ? sha(fs.readFileSync(cursor)) : null;
}
if (!Array.isArray(files) || files.length !== (mode === 'app' ? 25 : 12)) throw new Error('Unexpected manifest size.');
const paths = new Set(files.map(f=>f.path));
if (paths.size !== files.length) throw new Error('Duplicate manifest entry.');
// The hashed patch itself is trusted; additionally restrict every patch destination.
for (const line of patch.split('\n').filter(s=>s.startsWith('+++ '))) {
  if (!line.startsWith('+++ b/') || !paths.has(line.slice(6))) throw new Error('Patch/manifest path mismatch.');
}
const initial = files.map(f=>current(f.path));
if (files.every((f,i)=>initial[i]===f.after)) {console.log(mode+': exact release source already applied.');process.exit(0);}
for (let i=0;i<files.length;i++) if (initial[i]!==files[i].before) throw new Error('Base changed: '+files[i].path+'; refusing to overwrite newer work.');
for (const check of [true,false]) {
  const args=['apply','--unidiff-zero',...(check?['--check']:[]),'-'];
  const result=cp.spawnSync('git',args,{cwd:root,input:patch,encoding:'utf8',maxBuffer:4*1024*1024});
  if (result.error || result.status!==0) throw new Error('git apply failed: '+(result.error?.message||result.stderr));
}
for (const f of files) if (current(f.path)!==f.after) throw new Error('Post-apply checksum mismatch: '+f.path);
console.log(mode+': applied and SHA-256 verified '+files.length+' release files.');
