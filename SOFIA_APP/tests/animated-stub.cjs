'use strict';
// A numerical model for Animated graphs, not a native renderer or FPS benchmark.
module.exports=function animatedStub(){
 const springs=[];const read=v=>typeof v==='number'?v:v.value();
 class Node{constructor(fn){this.fn=fn;}value(){return this.fn();}interpolate(config){const {inputRange:x,outputRange:y,extrapolate='extend'}=config;return new Node(()=>{let n=read(this),i=0;if(extrapolate==='clamp')n=Math.max(x[0],Math.min(x.at(-1),n));while(i<x.length-2&&n>x[i+1])i++;return y[i]+(n-x[i])/(x[i+1]-x[i])*(y[i+1]-y[i]);});}}
 class Value extends Node{constructor(n){let v=n;super(()=>v);this.setValue=n=>{v=n;};}}
 const op=fn=>(a,b)=>new Node(()=>fn(read(a),read(b)));
 const Animated={Value,View:'Animated.View',Text:'Animated.Text',ScrollView:'Animated.ScrollView',add:op((a,b)=>a+b),subtract:op((a,b)=>a-b),multiply:op((a,b)=>a*b),divide:op((a,b)=>a/b),
 event:(mapping,config)=>{const fn=event=>{mapping[0].nativeEvent.contentOffset.x.setValue(event.nativeEvent.contentOffset.x);config.listener?.(event);};fn.nativeDriver=config.useNativeDriver;return fn;},
 spring:(value,config)=>{const spring={value,config,from:read(value),stopped:false,start(){},stop(){this.stopped=true;},advance(t){if(!this.stopped)value.setValue(this.from+(config.toValue-this.from)*t);}};springs.push(spring);return spring;}};
 return {Animated,read,springs,advance:t=>springs.forEach(s=>s.advance(t))};
};
