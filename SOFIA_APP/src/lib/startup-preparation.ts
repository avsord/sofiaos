import type {SofiaApi} from './api';
/** Local data only. BackgroundServices owns the independent network lane after
 * the real first Home frame. Offline snapshots must never wait for a server. */
export async function prepareInitialData(api:Pick<SofiaApi,'hydrate'>,_agenda:()=>Promise<unknown>){
 await api.hydrate();
}
