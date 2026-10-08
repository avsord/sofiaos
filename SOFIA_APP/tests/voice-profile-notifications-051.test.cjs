'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),file=p=>fs.readFileSync(path.join(root,p),'utf8');
test('voice recording has WhatsApp-style slide-left cancellation and no five-minute UI stop',()=>{
 const composer=file('src/components/Composer.tsx');
 for(const token of ['PanResponder.create','g.dx<-7','x<=-88','Solte para cancelar','stopRef.current(true,false)'])assert.ok(composer.includes(token),token);
 assert.ok(!composer.includes('durationMillis>=300000'));assert.ok(!composer.includes('Math.min(300000'));assert.ok(!composer.includes('maxLength={maxChars}'));
});
test('profile photo uses native crop/zoom editor and durable per-account storage',()=>{
 const editor=file('src/components/ProfilePhotoEditor.tsx'),storage=file('src/lib/profile-photo.ts'),profile=file('src/screens/Profile.tsx');
 assert.ok(editor.includes('allowsEditing:true'));assert.ok(editor.includes('aspect:[1,1]'));assert.ok(editor.includes("text:'Tirar foto'"));assert.ok(editor.includes("text:'Remover foto'"));
 assert.ok(storage.includes('Paths.document'));assert.ok(storage.includes("sofia.native.profile-photo.v1:"));assert.ok(profile.includes('<ProfilePhotoEditor'));
});
test('agenda and capsule schedules request permission and use high-priority phone channels',()=>{
 const agenda=file('src/lib/agenda-notifications.ts'),capsules=file('src/lib/capsule-notifications.ts'),permission=file('src/lib/system-notification-permission.ts');
 for(const source of [agenda,capsules]){assert.ok(source.includes('ensureSystemNotificationPermission'));assert.ok(source.includes('AndroidImportance.HIGH'));assert.ok(source.includes('AndroidNotificationPriority.HIGH'));assert.ok(source.includes("sound:'default'"));}
 assert.ok(permission.includes('requestPermissionsAsync'));assert.ok(permission.includes('permissionFlight'));
});
test('backend advertises expanded chat transport and accepts long text/audio duration',()=>{
 const backend=file('../src/channels/mobile.js');
 assert.ok(backend.includes('MAX_TEXT = 1000000'));assert.ok(backend.includes('MAX_AUDIO_DURATION = 6 * 60 * 60 * 1000'));assert.ok(backend.includes('MAX_AUDIO = 64 * 1024 * 1024'));
 assert.ok(backend.includes("bodyJson(req, 2 * 1024 * 1024)"));assert.ok(!backend.includes("duration > 300000"));
});
