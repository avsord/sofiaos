import type {PageEditorStore} from './page-editor';
/** Activity runs effect cleanups on HIDE as well as on unmount, and React gives
 * no way to tell them apart. dispose() clears every listener and timer, so
 * calling it on hide left a store that the visible editor kept using.
 * Policy: leaving only persists drafts; the store lives as long as the screen
 * component's memoized instance. resume() re-arms pending saves on return. */
export function pageStoreSession(store:Pick<PageEditorStore,'resume'|'flushAll'|'dispose'>){
 return {enter(){store.resume();return()=>{void store.flushAll();};}};
}
