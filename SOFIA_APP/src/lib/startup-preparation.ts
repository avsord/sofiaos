import type {SofiaApi} from './api';
import {monthKey} from './agenda-cache';
/** Restore account-scoped snapshots before creating any consumer. Start all
 * read-ahead immediately; only first-screen data, not remote integrations,
 * is required before revealing the application. Offline saved data stays usable. */
export async function prepareInitialData(api:Pick<SofiaApi,'hydrate'|'cached'|'preload'|'home'|'tasks'|'ensureChat'>,agenda:()=>Promise<unknown>){
 await api.hydrate();
 const paths=['/home','/tasks','/chat-sync/current','/agenda?month='+monthKey(new Date())];
 const saved=paths.every(path=>api.cached(path)!==undefined);
 // Start optional pages, catalog, widgets and integrations now, not on menu taps.
 void api.preload(agenda).catch(()=>{});
 const primary=Promise.allSettled([api.home(),api.tasks(),api.ensureChat(),agenda()]);
 if(saved)return;
 const results=await primary;
 if(results.every(result=>result.status==='fulfilled')||paths.every(path=>api.cached(path)!==undefined))return;
 const failed=results.find(result=>result.status==='rejected');
 throw failed?.status==='rejected'?failed.reason:new Error('Não foi possível preparar os dados da Sofia. Suas informações salvas foram preservadas. Tente novamente.');
}
