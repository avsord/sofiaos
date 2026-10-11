const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const theme=load('src/lib/theme-schedule.ts');
const prefs={appearance:'schedule',enterToSend:false,autoSendVoice:true};
test('scheduled theme switches exactly at 05 and 19 local time, including wraparound custom times',()=>{for(const [h,m,result] of [[4,59,'dark'],[5,0,'light'],[18,59,'light'],[19,0,'dark'],[23,59,'dark']])assert.equal(theme.themeAppearance(prefs,'dark',new Date(2026,9,5,h,m)),result);assert.equal(theme.themeAppearance({...prefs,lightAt:'19:00',darkAt:'05:00'},null,new Date(2026,9,5,20)),'light');assert.equal(theme.themeAppearance({...prefs,lightAt:'19:00',darkAt:'05:00'},null,new Date(2026,9,5,12)),'dark');assert.equal(theme.validThemeTime('24:00'),false);assert.equal(theme.themeAppearance({...prefs,appearance:'light'},'dark'),'light');assert.equal(theme.themeAppearance({...prefs,appearance:'system'},'dark'),'dark');});
const notes=load('src/lib/note-document.ts');
test('note conversion preserves text, metadata, entity ID and rich formatting across save/reopen',()=>{const item={id:'existing',kind:'annotation',title:'Título',content:'Antigo',privacy:'private',area:'Trabalho',tags:['teste'],data:{context:'Conservar'},revision:8};const leaf=notes.noteLeaf(item);const payload=notes.notePayload(item,{...leaf,content:'Novo',blocks:[{id:'b',type:'quote',text:'Novo',marks:[{start:0,end:4,bold:true}]}],properties:[{id:'p',name:'Autor',value:'Eu'}]});assert.equal(payload.id,item.id);assert.equal(payload.data.context,'Conservar');assert.equal(payload.revision,8);assert.equal(notes.noteLeaf(payload).blocks[0].marks[0].bold,true);assert.equal(notes.noteLeaf(payload).properties[0].value,'Eu');assert.throws(()=>notes.noteLeaf({...item,data:{leaf_document:'invalid'}}));});

// Native modal attachment may happen after React's visibility effect.
test('sheet entrance waits for its native window/layout instead of consuming animation before it is shown',()=>{
 const effects=[],requests=[],mounted=[];
 class Value{constructor(v){this.value=v;}stopAnimation(){}setValue(v){this.value=v;}}
 const {useMotionPresence}=load('src/lib/motion.ts',{'react':{useRef:v=>({current:v}),useState:v=>[v,n=>mounted.push(n)],useEffect:f=>effects.push(f)},'react-native':{AccessibilityInfo:{isReduceMotionEnabled:async()=>false,addEventListener:()=>({remove(){}})},Keyboard:{},Easing:{bezier:()=>null},Animated:{Value,timing:(value,options)=>{requests.push(options);return {start(){},stop(){}};}}}});
 useMotionPresence(true,{enterReady:false,enterDuration:220,exitDuration:180});effects.splice(0).forEach(f=>f());assert.equal(requests.length,0);assert.ok(mounted.includes(true));
 useMotionPresence(true,{enterReady:true,enterDuration:220,exitDuration:180});effects.splice(0).forEach(f=>f());assert.equal(requests.at(-1).duration,220);assert.equal(requests.at(-1).useNativeDriver,true);assert.equal(requests.at(-1).isInteraction,false);
});
