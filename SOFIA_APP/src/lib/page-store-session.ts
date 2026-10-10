import type {PageEditorStore} from './page-editor';
/** Activity destroys effects without destroying React state. A stale flush
 * from an earlier hide must never dispose a store that has become visible. */
export function pageStoreSession(store:Pick<PageEditorStore,'resume'|'flushAll'|'dispose'>){
 let generation=0;
 return {enter(){const epoch=++generation;store.resume();return()=>{void store.flushAll().finally(()=>{if(generation===epoch)store.dispose();});};}};
}
