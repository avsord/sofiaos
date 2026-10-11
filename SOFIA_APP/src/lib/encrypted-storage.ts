import {NativeModules} from 'react-native';
import type {SnapshotStorage} from './startup-snapshot';
/** Android Keystore AES-GCM + noBackupFilesDir. No unencrypted disk fallback. */
export const encryptedStorage:SnapshotStorage={
 read:async scope=>NativeModules?.SofiaSnapshot?.read?await NativeModules.SofiaSnapshot.read(scope):null,
 write:async(scope,value)=>{if(NativeModules?.SofiaSnapshot?.write)await NativeModules.SofiaSnapshot.write(scope,value);},
 remove:async scope=>{if(NativeModules?.SofiaSnapshot?.remove)await NativeModules.SofiaSnapshot.remove(scope);}
};
