export const APP_VERSION = '0.3.2';
const RELEASE_PREFIX = 'sofia-android-v';
const RELEASES_API = 'https://api.github.com/repos/avsord/sofiaos/releases?per_page=20';

export type UpdateInfo = {
  version: string;
  url: string;
  name: string;
};

function numbers(version: string): number[] {
  return version.replace(/^v/i,'').split('.').map(v => Number.parseInt(v,10) || 0);
}

export function compareVersions(a: string, b: string): number {
  const aa=numbers(a),bb=numbers(b),n=Math.max(aa.length,bb.length);
  for(let i=0;i<n;i++){const av=aa[i]||0,bv=bb[i]||0;if(av>bv)return 1;if(av<bv)return -1;}
  return 0;
}

export async function checkForUpdate(): Promise<UpdateInfo|null> {
  const response=await fetch(RELEASES_API,{headers:{Accept:'application/vnd.github+json'}});
  if(!response.ok) throw new Error('Não foi possível consultar atualizações.');
  const releases=await response.json() as any[];
  const release=releases.find(r=>!r?.draft&&!r?.prerelease&&typeof r?.tag_name==='string'&&r.tag_name.startsWith(RELEASE_PREFIX));
  if(!release) return null;
  const version=String(release.tag_name).slice(RELEASE_PREFIX.length);
  if(compareVersions(version,APP_VERSION)<=0)return null;
  const asset=(release.assets||[]).find((a:any)=>a?.name==='Sofia-OS.apk'||String(a?.name||'').toLowerCase().endsWith('.apk'));
  const url=String(asset?.browser_download_url||'');
  if(!url.startsWith('https://github.com/avsord/sofiaos/releases/download/')) throw new Error('A atualização não tem um APK válido.');
  return {version,url,name:String(release.name||`Sofia OS ${version}`)};
}
