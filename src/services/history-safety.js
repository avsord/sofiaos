'use strict';
const fs=require('node:fs'),path=require('node:path');
const {openBackup}=require('./backup');
/** Verify a fresh encrypted backup before the production history-read rollout.
 * This never restores, replaces or deletes a message, conversation or page. */
function verifyHistoryBackup(store,backups){
 const marker='historyVisibility056BackupVerified';
 if(!store.db.prepare('SELECT value FROM settings WHERE key=?').get(marker)){
  const before=store.export().tables,backup=backups.create('before-history-visibility-056');
  const reopened=openBackup(fs.readFileSync(path.join(backups.directory,backup.name)),{key:backups.keyStore.get()});
  for(const table of ['conversations','messages','tasks','entities']){
   if(JSON.stringify(before[table])!==JSON.stringify(reopened.tables[table]))throw Error('History backup round-trip verification failed');
  }
  store.db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(marker,JSON.stringify({name:backup.name,verified:true}));
 }
 const rows=store.db.prepare("SELECT c.state,COUNT(DISTINCT c.id) AS conversations,COUNT(m.id) AS messages FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id AND m.owner=c.owner AND m.status<>'deleted' WHERE c.owner=? AND c.channel IN ('web','mobile') AND c.state IN ('active','paused') GROUP BY c.state").all('owner-local');
 return {backup_verified:true,states:rows};
}
module.exports={verifyHistoryBackup};
