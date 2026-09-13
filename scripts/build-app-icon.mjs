import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync} from 'node:fs';
import {resolve, join} from 'node:path';

// Packaging conversion only: the reviewed master image remains unchanged.
const master=resolve('assets/app/icon.png');
mkdirSync('.tmp',{recursive:true});
const work=mkdtempSync(resolve('.tmp/app-icon-'));
const iconset=join(work,'FormaBot.iconset');mkdirSync(iconset);
for(const size of [16,32,128,256,512]){
  for(const scale of [1,2]){
    execFileSync('sips',['-z',String(size*scale),String(size*scale),master,'--out',join(iconset,`icon_${size}x${size}${scale===2?'@2x':''}.png`)],{stdio:'ignore'});
  }
}
execFileSync('iconutil',['-c','icns',iconset,'-o',resolve('assets/app/icon.icns')],{stdio:'inherit'});
console.log('Generated assets/app/icon.icns from reviewed master.');
