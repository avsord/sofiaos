'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
function calendar(){
 const locks=[],months=[],cleanup=[];let gestures;
 const React={useRef:x=>({current:x}),useMemo:fn=>fn(),useEffect:fn=>cleanup.push(fn())};React.default=React;
 const {MonthSwipe}=load('src/components/MonthSwipe.tsx',{
  react:React,'react/jsx-runtime':{jsx:(type,props)=>({type,props})},
  'react-native':{Platform:{OS:'ios'},View:'View',PanResponder:{create:handlers=>{gestures=handlers;return{panHandlers:handlers};}}}
 });
 const view=MonthSwipe({children:'calendar',onMonth:x=>months.push(x),onLock:x=>locks.push(x)}).props;
 return{view,gestures,locks,months,unmount:()=>cleanup.forEach(fn=>fn?.())};
}
const end=touches=>({nativeEvent:{touches:Array(touches).fill({})}});
test('calendar reserves menu before a move without stealing a day tap',()=>{
 const c=calendar();assert.equal(c.gestures.onStartShouldSetPanResponderCapture(),false);c.view.onTouchStart();
 assert.deepEqual(c.locks,[true]);assert.equal(c.gestures.onMoveShouldSetPanResponder(null,{dx:3,dy:1}),false);
 c.view.onTouchEnd(end(0));assert.deepEqual(c.locks,[true,false]);assert.deepEqual(c.months,[]);
});
test('horizontal month drag keeps the menu locked through child cancellation and changes one month',()=>{
 const c=calendar();c.view.onTouchStart();assert.equal(c.gestures.onMoveShouldSetPanResponder(null,{dx:-45,dy:3}),true);
 c.gestures.onPanResponderGrant();c.view.onTouchCancel();c.view.onTouchEnd(end(0));assert.deepEqual(c.locks,[true]);
 c.gestures.onPanResponderRelease(null,{dx:-45,dy:3});assert.deepEqual(c.months,[1]);assert.deepEqual(c.locks,[true,false]);
});
test('vertical scrolling is not claimed and interrupted touches always release menu lock',()=>{
 const c=calendar();c.view.onTouchStart();assert.equal(c.gestures.onMoveShouldSetPanResponderCapture(null,{dx:15,dy:50}),false);
 c.view.onTouchCancel();assert.deepEqual(c.locks,[true,false]);c.view.onTouchStart();c.gestures.onPanResponderGrant();c.gestures.onPanResponderTerminate();assert.deepEqual(c.locks,[true,false,true,false]);assert.deepEqual(c.months,[]);
});
test('lifting one finger does not release another finger still on the calendar; unmount releases',()=>{
 const c=calendar();c.view.onTouchStart();c.view.onTouchEnd(end(1));assert.deepEqual(c.locks,[true]);c.unmount();assert.deepEqual(c.locks,[true,false]);
});
