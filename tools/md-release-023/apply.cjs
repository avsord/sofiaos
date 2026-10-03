'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),cp=require('node:child_process');
const expected=['4230e984313036295a8cbc245f16acd7b1d5275def2ebca41f27affc16ed06c0','cc9e0d1c701724dae0c6690665fe2beef740400e859fb39cc9dfbc68d31f1052','bf13fabb409f715edb98b4bed57f0877028bd9102ffb6135baab1470b22304c7','59d72e84efc06876a1355313ee158abf68cf04b0c0aa702cfbf51c3119d96458'];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const parts=expected.map((sha,i)=>{let text=fs.readFileSync(path.join(__dirname,(10+i)+'.b64'),'utf8').trim();
 if(i===1)text=text.replace('C8nlCPaWaW0k0','C8nlCPaWa0k0').replace('JH9gfsi5Q7WC9WC2','JH9gfsi5Q7k9WC2').replace('EGqs/QC0A0+l0','EGqs/QC0A+/l0');
 console.log('Part',i,'length',text.length,'SHA256',hash(text));if(hash(text)!==sha)throw Error('Transport checksum mismatch: part '+i);return text;});
const packed=Buffer.from(parts.join(''),'base64');if(hash(packed)!=='b88cf503b750922c2ec9c83c1f66a9ab195672956aec3e439a8d09dc3dcaa753')throw Error('Combined checksum mismatch');
const file='/tmp/sofia-023-source-plan.json';fs.writeFileSync(file,zlib.brotliDecompressSync(packed));
const python=String.raw`import json,hashlib,pathlib
root=pathlib.Path.cwd(); plan=json.load(open('/tmp/sofia-023-source-plan.json')); pending=[]
if len(plan)!=32: raise ValueError('Source count mismatch')
for name,item in plan.items():
    rel=pathlib.PurePosixPath(name)
    if not name.startswith('SOFIA_APP/') or '..' in rel.parts: raise ValueError('Unsafe path')
    p=root/name; old=p.read_text() if p.exists() else ''
    digest=lambda text:hashlib.sha256(text.encode()).hexdigest()
    if digest(old)==item['after']: continue
    if digest(old)!=item['before']: raise ValueError('Concurrent source changes: '+name)
    text=old
    for a,b,value in reversed(item['ops']): text=text[:a]+value+text[b:]
    if digest(text)!=item['after']: raise ValueError('Output checksum mismatch: '+name)
    pending.append((p,text))
for p,text in pending:
    p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
print('Applied',len(pending),'checksum-verified source files. No server data touched.')
`;
cp.execFileSync('python3',['-c',python],{stdio:'inherit'});
