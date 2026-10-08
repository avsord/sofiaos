import {useEffect,useState} from 'react';
/** Let the native first frame be drawn before scheduling the full alarm inventory. */
export function useAfterFirstPaint(enabled:boolean){const [ready,setReady]=useState(false);useEffect(()=>{setReady(false);if(!enabled)return;let next=0;const frame=requestAnimationFrame(()=>{next=requestAnimationFrame(()=>setReady(true));});return()=>{cancelAnimationFrame(frame);if(next)cancelAnimationFrame(next);};},[enabled]);return enabled&&ready;}
