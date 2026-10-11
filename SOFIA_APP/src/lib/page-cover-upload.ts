export type CoverMime='image/jpeg'|'image/png'|'image/webp'|'image/gif';
const ALLOWED=new Set<CoverMime>(['image/jpeg','image/png','image/webp','image/gif']);

export function coverMime(base64:string,reported?:string|null):CoverMime {
 const clean=String(base64||'').replace(/^data:[^,]+,/, '');
 if(clean.startsWith('/9j/'))return 'image/jpeg';
 if(clean.startsWith('iVBORw0KGgo'))return 'image/png';
 if(clean.startsWith('R0lGOD'))return 'image/gif';
 if(clean.startsWith('UklGR'))return 'image/webp';
 const normalized=String(reported||'').toLowerCase() as CoverMime;
 if(ALLOWED.has(normalized))return normalized;
 throw new Error('Esta imagem usa um formato que a capa ainda não consegue enviar. Escolha JPEG, PNG ou WebP.');
}
export function coverName(mime:CoverMime){
 return mime==='image/png'?'capa.png':mime==='image/webp'?'capa.webp':mime==='image/gif'?'capa.gif':'capa.jpg';
}
