'use strict';
// 0.3.139: o logo da Sofia passou a ser uma imagem (esfera). Os PNGs do icone
// sao versionados prontos; este passo so confere o que o build vai empacotar,
// em vez de gerar o icone antigo a partir do S vetorial.
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'../assets');
function size(file){const bytes=fs.readFileSync(path.join(dir,file));if(bytes.toString('ascii',1,4)!=='PNG')throw Error(file+' is not a PNG');return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];}
function main(){
 for(const file of ['icon.png','adaptive-foreground.png']){const [w,h]=size(file);if(w!==1024||h!==1024)throw Error('Invalid icon size: '+file);}
 const [lw,lh]=size('sofia-logo-app.png');if(lw!==lh||lw<128)throw Error('Invalid in-app logo size');
 const orb=fs.readFileSync(path.join(dir,'sofia-launch-orb.webp'));if(orb.toString('ascii',0,4)!=='RIFF'||orb.toString('ascii',8,12)!=='WEBP')throw Error('Invalid launch logo');
 console.log('Sofia logo assets: 1024px icons, in-app logo and launch logo verified');
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
