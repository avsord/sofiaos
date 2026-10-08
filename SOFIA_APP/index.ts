import {registerRootComponent} from 'expo';
import {AUTH_STORAGE_KEY,PREFS_STORAGE_KEY,primeStartupReads} from './src/lib/startup-read-ahead';
// Start native I/O before evaluating App, its screens and providers. Do not await
// here: React and disk work can proceed together under the original native S.
primeStartupReads(
 ()=>require('expo-secure-store').getItemAsync(AUTH_STORAGE_KEY),
 ()=>require('@react-native-async-storage/async-storage').default.getItem(PREFS_STORAGE_KEY)
);
const App=require('./App').default;
registerRootComponent(App);
