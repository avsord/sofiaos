'use strict';
/** This gate validates externally collected evidence. It never manufactures a
 * successful benchmark from a ready marker, fixture or percentile alone. */
const fs=require('node:fs');
function verifyAcceptance(evidence,identity){
 const fail=reason=>{throw Error('Startup/navigation release blocked: '+reason);};
 if(!evidence||evidence.schema!==1)fail('missing acceptance evidence (schema 1)');
 if(evidence.source_sha!==identity.source_sha||evidence.apk_sha256!==identity.apk_sha256)fail('evidence belongs to another source or APK');
 if(evidence.build_type!=='production'||evidence.synthetic_transport!==false)fail('synthetic/QA APK is not production evidence');
 const device=evidence.device;
 if(!device||typeof device.model!=='string'||!device.model.trim()||typeof device.android!=='string'||!device.android.trim()||device.physical!==true)fail('physical-device validation is missing');
 if(evidence.clock_scope!=='launch-request-to-verified-interaction')fail('time must include native startup and a verified interaction');
 if(!Number.isInteger(evidence.local_record_count)||evidence.local_record_count<1)fail('representative saved local records were not exercised');
 const required=['cold-saved-normal','cold-saved-slow','cold-saved-offline','cold-saved-server-error','cold-dark','cold-light','warm','activity-recreated','upgrade'];
 const runs=evidence.startup_runs;
 if(!Array.isArray(runs)||runs.filter(r=>r.scenario==='cold-saved-normal').length<20)fail('at least 20 principal cold starts are required');
 for(const scenario of required)if(!runs.some(r=>r.scenario===scenario))fail('missing scenario '+scenario);
 const ids=new Set();
 for(const r of runs){
  if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id))fail('invalid/duplicate startup run');ids.add(r.id);
  if(!Number.isFinite(r.interactive_ms)||r.interactive_ms<=0||r.interactive_ms>1000)fail('a startup exceeded 1000 ms or has invalid timing');
  if(r.interaction_verified!==true||r.saved_data_visible!==true||r.theme_correct!==true)fail('ready marker alone is not usable local data');
  if(r.white_frames!==0||r.blank_frames!==0||r.secondary_splashes!==0)fail('visual startup continuity is unverified or failed');
 }
 const sequences=evidence.navigation_sequences;
 if(!Array.isArray(sequences)||sequences.length<100)fail('at least 100 navigation sequences are required');
 const sequenceIds=new Set();
 for(const s of sequences){
  if(!s||typeof s.id!=='string'||!s.id||sequenceIds.has(s.id))fail('invalid/duplicate navigation sequence');sequenceIds.add(s.id);
  if(s.involuntary_returns!==0||s.selected_matches_content!==true||s.destination_interaction_verified!==true)fail('navigation consistency failed or is unverified');
  if(!Number.isFinite(s.visual_response_ms)||s.visual_response_ms<0||s.visual_response_ms>100)fail('visual navigation response exceeded 100 ms');
  if(!Number.isFinite(s.destination_usable_ms)||s.destination_usable_ms<0)fail('destination usability was not measured');
 }
 for(const kind of ['first-touch','rapid-taps','tap-during-swipe','tap-during-sync','system-back','nested-scroll'])if(!sequences.some(s=>s.kind===kind))fail('missing navigation scenario '+kind);
 const upgrade=evidence.upgrade;
 if(!upgrade||upgrade.package!=='com.avsord.sofiaapp'||upgrade.same_signature!==true||upgrade.increased_version_code!==true||upgrade.in_place!==true||upgrade.history_display_verified!==true||upgrade.other_local_data_preserved!==true||upgrade.updater_compatible!==true)fail('compatible data-preserving upgrade is unverified');
 const regression=evidence.regression;
 for(const key of ['logout_isolation','pages','tasks','profile_photo','agenda_notifications','capsule_notifications'])if(regression?.[key]!==true)fail('missing regression '+key);
 return {passed:true,startup_runs:runs.length,navigation_sequences:sequences.length,max_startup_ms:Math.max(...runs.map(r=>r.interactive_ms)),device:device.model};
}
function verifyFile(file,identity){
 if(!fs.existsSync(file))throw Error('Startup/navigation release blocked: no physical-device acceptance report; retain the candidate APK, do not publish it as approved.');
 return verifyAcceptance(JSON.parse(fs.readFileSync(file,'utf8')),identity);
}
module.exports={verifyAcceptance,verifyFile};
