'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const {createPagerSelection,createImmediateMenuPress,TAB_ORDER}=load('src/lib/tab-navigation.ts');
const {verifyAcceptance,verifyFile}=require('../tools/startup-release-gate.cjs');
const identity={source_sha:'a'.repeat(40),apk_sha256:'b'.repeat(64)};
// Synthetic objects below test the gate itself. They are NOT device evidence.
function fixture(){
 const scenarios=['cold-saved-normal','cold-saved-slow','cold-saved-offline','cold-saved-server-error','cold-dark','cold-light','warm','activity-recreated','upgrade'];
 const run=(scenario,i)=>({id:'run-'+i,scenario,interactive_ms:800,interaction_verified:true,saved_data_visible:true,theme_correct:true,white_frames:0,blank_frames:0,secondary_splashes:0});
 const kinds=['first-touch','rapid-taps','tap-during-swipe','tap-during-sync','system-back','nested-scroll'];
 return {schema:1,...identity,build_type:'production',synthetic_transport:false,device:{model:'Unit-test-only',android:'13',physical:true},clock_scope:'launch-request-to-verified-interaction',local_record_count:500,startup_runs:[...Array.from({length:20},(_,i)=>run(scenarios[0],i)),...scenarios.slice(1).map((s,i)=>run(s,i+20))],navigation_sequences:Array.from({length:100},(_,i)=>({id:'nav-'+i,kind:kinds[i%kinds.length],involuntary_returns:0,selected_matches_content:true,destination_interaction_verified:true,visual_response_ms:30,destination_usable_ms:45})),upgrade:{package:'com.avsord.sofiaapp',same_signature:true,increased_version_code:true,in_place:true,history_display_verified:true,other_local_data_preserved:true,updater_compatible:true},regression:{logout_isolation:true,pages:true,tasks:true,profile_photo:true,agenda_notifications:true,capsule_notifications:true}};
}
test('058 100 varied menu sequences keep the latest tap over old release/momentum and layout events',()=>{
 for(let i=0;i<100;i++){
  const p=createPagerSelection('agenda'),latest=TAB_ORDER[i%TAB_ORDER.length];
  p.beginDrag();p.release(20);p.select('apps');p.select(latest);
  assert.equal(p.finishDrag(3*400,400,21),null);assert.equal(p.current(),latest);
  p.beginDrag();assert.equal(p.finishDrag(4*400,400,22),null);p.release(40);
  assert.equal(p.finishDrag(3*400,400,21),null);assert.equal(p.current(),latest);
  p.select(latest);assert.equal(p.isDragging(),false);
 }
});
test('058 touch completion never replays an older selection after a new press',()=>{
 const calls=[],a=createImmediateMenuPress(()=>calls.push('agenda')),b=createImmediateMenuPress(()=>calls.push('apps'));
 for(let i=0;i<100;i++){a.pressIn();b.pressIn();a.press();b.press();assert.deepEqual(calls.slice(-2),['agenda','apps']);}
});
test('058 native input observer cannot alter pager position, alpha, scale or selection',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../plugins/native/SofiaCalendarTouchGuard.kt'),'utf8');
 const method=text.slice(text.indexOf('private fun immediateMenu('),text.indexOf('private fun menuAt('));
 for(const forbidden of ['.scrollTo(','.alpha =','.scaleX =','.scaleY ='])assert.ok(!method.includes(forbidden),forbidden);
 assert.ok(method.includes('observerOnly=true'));
});
test('058 original Android splash waits for local data without blocking Android 12 layout',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../plugins/native/SofiaLaunchOverlay.kt'),'utf8');
 for(const required of ['setOnExitAnimationListener','Build.VERSION.SDK_INT >= 31 || revealed','sofia-home-data-ready','reveal(activity, false)','activity.recreate()'])assert.ok(text.includes(required),required);
 for(const forbidden of ['root.addView','clearApplicationUserData','deleteDatabase','System.exit'])assert.ok(!text.includes(forbidden),forbidden);
 const hide=text.slice(text.indexOf('fun hide(activity:'),text.indexOf('\nclass SofiaLaunchModule'));
 assert.ok(!hide.includes('reveal('));assert.ok(hide.includes('inspect(current)'));
});
test('058 gate accepts complete matching evidence only (unit-test fixture)',()=>assert.equal(verifyAcceptance(fixture(),identity).passed,true));
test('058 gate rejects missing device report instead of publishing on smoke success',()=>assert.throws(()=>verifyFile(path.join(__dirname,'missing-acceptance-058.json'),identity),/no physical-device/));
test('058 one slow run fails even when median and p95 would pass',()=>{const e=fixture();e.startup_runs[0].interactive_ms=1001;assert.throws(()=>verifyAcceptance(e,identity),/1000 ms/);});
test('058 synthetic transport, emulators and a different APK are not phone proof',()=>{
 for(const mutate of [e=>e.synthetic_transport=true,e=>e.device.physical=false,e=>e.apk_sha256='c'.repeat(64),e=>e.source_sha='d'.repeat(40),e=>e.build_type='debug']){const e=fixture();mutate(e);assert.throws(()=>verifyAcceptance(e,identity));}
});
test('058 missing startup scenarios, fewer than 20 cold starts and reused IDs fail',()=>{
 for(const mutate of [e=>e.startup_runs.splice(0,1),e=>e.startup_runs.pop(),e=>e.startup_runs[1].id=e.startup_runs[0].id,e=>e.startup_runs[0].interaction_verified=false,e=>e.startup_runs[0].saved_data_visible=false,e=>e.startup_runs[0].white_frames=1]){const e=fixture();mutate(e);assert.throws(()=>verifyAcceptance(e,identity));}
});
test('058 navigation regressions and missing identity/history checks block publication',()=>{
 for(const mutate of [e=>e.navigation_sequences.pop(),e=>e.navigation_sequences[0].involuntary_returns=1,e=>e.navigation_sequences[0].visual_response_ms=101,e=>e.navigation_sequences[0].selected_matches_content=false,e=>e.upgrade.same_signature=false,e=>e.upgrade.history_display_verified=false,e=>e.regression.logout_isolation=false]){const e=fixture();mutate(e);assert.throws(()=>verifyAcceptance(e,identity));}
});
