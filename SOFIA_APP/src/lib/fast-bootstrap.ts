import type {Auth,Bootstrap} from './types';

const fallback=(auth:Auth):Bootstrap=>({
 version:'startup',profile:auth.profile,expires_at:auth.expires_at,
 ai:{ready:true,reason:null},
 limits:{audio_bytes:64*1024*1024,audio_seconds:0,text_chars:0},
 capabilities:{text:true,voice_notes:true,notifications_push:false,multi_user:false,e2ee:false,workspace:true}
});
export function fastBootstrap(auth:Auth):Bootstrap{
 const saved=auth.startup;
 if(!saved||saved.profile?.email?.toLowerCase()!==auth.profile.email.toLowerCase())return fallback(auth);
 if(!saved.limits||!saved.capabilities||!saved.ai)return fallback(auth);
 return {...saved,profile:auth.profile,expires_at:auth.expires_at};
}
export function authWithBootstrap(auth:Auth,bootstrap:Bootstrap):Auth{
 return {...auth,startup:{...bootstrap,profile:auth.profile,expires_at:auth.expires_at}};
}
