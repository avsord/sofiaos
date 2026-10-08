import type {SofiaApi} from './api';
/** Only encrypted local disk hydration gates the initial usable frame.
 * Start full priority read-ahead immediately and let screens refresh in-place.
 * Network, Google Calendar and remote integrations must never block opening. */
export async function prepareInitialData(api:Pick<SofiaApi,'hydrate'|'preload'>,agenda:()=>Promise<unknown>){
 await api.hydrate();
 void api.preload(agenda).catch(()=>{});
}
