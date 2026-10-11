'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('086 native entrance is smooth, monotonic and shares its system clock at handoff',()=>{
 const app=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-motion-'));
 try {
  cp.execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',tmp,path.join(app,'plugins/native/SofiaLaunchMotion.java'),path.join(__dirname,'native/SofiaLaunchMotionTest.java')],{stdio:'pipe'});
  assert.match(cp.execFileSync('java',['-cp',tmp,'com.avsord.sofiaapp.SofiaLaunchMotionTest'],{encoding:'utf8'}),/native motion passed/);
 } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
