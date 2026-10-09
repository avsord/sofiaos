'use strict';
const fs=require('node:fs');
function migrate47(db,filename,version){
 if(version>=4)return;
 if(version===3&&filename!==':memory:'&&fs.existsSync(filename)){
   const dest=filename+'.before-v47';
   if(!fs.existsSync(dest)){db.exec('PRAGMA wal_checkpoint(FULL);');fs.copyFileSync(filename,dest,fs.constants.COPYFILE_EXCL);try{fs.chmodSync(dest,0o600);}catch{}}
 }
 db.exec('BEGIN IMMEDIATE');
 try{db.exec('PRAGMA user_version=4; COMMIT;');}catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={migrate47};
