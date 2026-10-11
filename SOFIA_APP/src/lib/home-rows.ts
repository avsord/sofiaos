import type {HomeData,Task} from './types';
/** Independent startup results must update independently. A slow home summary
 * cannot keep already-saved tasks behind the native splash. */
export function readHomeRows(
 api:{home:()=>Promise<HomeData>;tasks:()=>Promise<{items:Task[]}>},
 receiveHome:(home:HomeData)=>void,receiveTasks:(tasks:Task[])=>void
){
 return Promise.allSettled([
  api.home().then(receiveHome),
  api.tasks().then(result=>receiveTasks(result.items))
 ]);
}
