/** Optional work yields two frames and then an idle opportunity. Cancellation
 * fences already queued callbacks, including platforms without idle callbacks. */
export function scheduleIdleTask(run:()=>void){
 let stopped=false,frame=0,idle=0;
 frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
  if(stopped)return;
  const invoke=()=>{if(!stopped)run();};
  if(typeof requestIdleCallback==='function')idle=requestIdleCallback(invoke,{timeout:1500});
  else frame=requestAnimationFrame(invoke);
 });});
 return()=>{stopped=true;cancelAnimationFrame(frame);if(idle&&typeof cancelIdleCallback==='function')cancelIdleCallback(idle);};
}
