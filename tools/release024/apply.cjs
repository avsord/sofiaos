'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const hashes=['3cbb2cae96317dec3249de424ff45a298d3f06bcd368b0eb927b13652d7ded1f','8310e468940c5d95b4b12273907654fa0e6aa964f98545923dbccaa029461dcb','61507ed5e0e511f9951bb10ef18761ae6743fde2266783a31426c37f008a71c0','1630d19f171b65ecc1f259469a28fec53131c65dd0ffe22201e491df4fff99d1'];
const parts=hashes.map((expected,index)=>{const text=fs.readFileSync(path.join(__dirname,String(index).padStart(2,'0')+'.b64'),'utf8').trim();if(hash(text)!==expected)throw Error('Transport checksum mismatch in part '+index);return text;});
const packed=Buffer.from(parts.join(''),'base64');
if(hash(packed)!=='f64094f15863f3db071b495e7464f6afcb471752215fe0d792c8470786ae6f2a')throw Error('Packed source checksum mismatch');
const plan=JSON.parse(zlib.brotliDecompressSync(packed).toString('utf8'));
if(Object.keys(plan).length!==20)throw Error('Incomplete source plan');
const pending=[],audit=[];
for(const [name,item] of Object.entries(plan)){
 if(!(name.startsWith('SOFIA_APP/')||name.startsWith('docs/entregas/0.3.24/'))||name.split('/').includes('..'))throw Error('Invalid source path');
 const file=path.join(root,name),old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
 if(hash(old)===item.after){audit.push({name,sha256:item.after,state:'already-applied'});continue;}
 if(hash(old)!==item.before)throw Error('Baseline checksum mismatch: '+name);
 // Delta offsets are Unicode code points, not JavaScript UTF-16 units.
 let chars=Array.from(old),previous=chars.length+1;
 for(const [start,end,text] of [...item.ops].reverse()){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>chars.length||end>previous)throw Error('Invalid delta: '+name);
  chars.splice(start,end-start,...Array.from(text));previous=start;
 }
 const result=chars.join('');if(hash(result)!==item.after)throw Error('Result checksum mismatch: '+name);
 pending.push([file,result]);audit.push({name,sha256:item.after,state:'applied'});
}
for(const [file,text] of pending){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
fs.writeFileSync(path.join(__dirname,'audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log('Verified 0.3.24 source files:',audit.length,'; applied:',pending.length);
