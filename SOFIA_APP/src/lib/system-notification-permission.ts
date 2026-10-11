import * as Notifications from 'expo-notifications';

let permissionFlight:Promise<boolean>|null=null;
/** One shared Android/iOS permission request for Agenda and Cápsulas.
 * Both schedulers call this only after they have at least one real reminder.
 */
export async function ensureSystemNotificationPermission(){
 if(permissionFlight)return permissionFlight;
 permissionFlight=(async()=>{let permission=await Notifications.getPermissionsAsync();if(!permission.granted&&permission.canAskAgain)permission=await Notifications.requestPermissionsAsync();return permission.granted;})().finally(()=>{permissionFlight=null;});
 return permissionFlight;
}
