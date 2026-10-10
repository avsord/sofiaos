'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const {DatabaseSync}=require('node:sqlite');
function verify(root){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));if(manifest.format!=='sofia-full-files-v1')throw Error('Unexpected backup format');
 for(const file of manifest.files){const target=path.resolve(root,file.path);if(!target.startsWith(path.resolve(root)+path.sep))throw Error('Unsafe backup path');const bytes=fs.readFileSync(target);if(bytes.length!==file.size||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Backup file mismatch: '+file.path);}
 for(const entry of manifest.databases){const db=new DatabaseSync(path.join(root,entry.file),{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').all().some(r=>Object.values(r)[0]!=='ok'))throw Error('Database integrity failed');for(const [table,count] of Object.entries(entry.tables)){const restored=db.prepare('SELECT count(*) AS n FROM "'+table.replace(/"/g,'""')+'"').get().n;if(restored!==count)throw Error('Restored table count mismatch');}}finally{db.close();}}
 return {verified:true,files:manifest.files.length,databases:manifest.databases.length};
}
if(require.main===module)console.log(JSON.stringify(verify(process.argv[2])));module.exports={verify};
