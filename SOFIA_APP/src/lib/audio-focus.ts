const players = new Map<string, () => void>();
export function registerVoice(id: string, pause: () => void) { players.set(id, pause); return () => { players.delete(id); }; }
export function silenceVoices(except?: string) {
  players.forEach((pause,id) => { if(id!==except)try{pause();}catch{} });
  const Speech:typeof import('expo-speech')=require('expo-speech');
  return Speech.stop().catch(() => {});
}
