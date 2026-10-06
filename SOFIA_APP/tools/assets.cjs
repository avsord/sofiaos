'use strict';
const fs=require('node:fs'),path=require('node:path');
async function main(){
const sharp=require('sharp');
for(const [source,target] of [['icon-master.svg','icon.png'],['adaptive-foreground.svg','adaptive-foreground.png']]){
 await sharp(fs.readFileSync(path.join(__dirname,'../assets',source)),{density:384}).resize(1024,1024).png().toFile(path.join(__dirname,'../assets',target));
 const bytes=fs.readFileSync(path.join(__dirname,'../assets',target));
 if(bytes.readUInt32BE(16)!==1024||bytes.readUInt32BE(20)!==1024)throw Error('Invalid icon size');
}
console.log('Sofia vector-derived icon assets: 1024px verified');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
