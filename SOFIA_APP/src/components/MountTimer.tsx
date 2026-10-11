import React,{useLayoutEffect,useRef} from 'react';
import {perfMount,perfNow} from '../lib/fluency-metrics';
/** Reports wall time from first render attempt to first layout commit, not CPU. */
export function MountTimer({tab,children}:{tab:string;children:React.ReactNode}){
 const started=useRef(perfNow()),reported=useRef(false);
 useLayoutEffect(()=>{if(!reported.current){reported.current=true;perfMount(tab,started.current);}},[tab]);
 return <>{children}</>;
}
