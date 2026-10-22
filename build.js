/* Single canonical release build. Run `node build.js` from project root.
   Regenerates standalone HTML and the SW fingerprint. `node build.js --check` never writes. */
'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const root=__dirname;
const get=f=>fs.readFileSync(path.join(root,f),'utf8');
const files=['index.html','styles.css','data.js','dialog_engine.js','app.js','icon.svg','manifest.webmanifest'];
const release=JSON.parse(get('release.json')).release;
if(!/^v\d+$/.test(release))throw Error('release.json release must be v plus a whole number');
const hash=crypto.createHash('sha256').update(files.map(f=>f+'\n'+get(f)).join('\n')).digest('hex').slice(0,12);
const cacheName=`medpass-lab-${release}-${hash}`;
const sw=get('sw.template.js').replace('__CACHE_NAME__',cacheName);
let html=get('index.html');
html=html.replace(/\s*<link rel="manifest"[^>]*\/>/,'').replace(/\s*<link rel="icon"[^>]*\/>/,'');
html=html.replace(/<link rel="stylesheet" href="styles.css"\s*\/>/,()=>`<style>\n${get('styles.css')}\n</style>`);
for(const file of ['data.js','dialog_engine.js','app.js']){
 const pattern=new RegExp(`<script src="${file.replace('.','\\.')}"\\s*><\\/script>`);
 if(!pattern.test(html))throw Error(`Missing expected script ${file} in index.html`);
 html=html.replace(pattern,()=>`<script>\n${get(file).replace(/<\/script/gi,'<\\/script')}\n</script>`);
}
html=html.replace(/<title>/,`<!-- Generated ${release}, source sha256 ${hash}. Never hand edit. -->\n  <title>`);
const outputs={'sw.js':sw,'N1009_MedPass_Lab.html':html};
const check=process.argv.includes('--check');
for(const [file,contents] of Object.entries(outputs)){
 if(check){if(!fs.existsSync(path.join(root,file))||get(file)!==contents)throw Error(`${file} has drifted. Run node build.js`);}
 else fs.writeFileSync(path.join(root,file),contents);
}
console.log(check?`Build sync verified: ${release} / ${hash}`:`Built ${release} / ${hash}: PWA cache and standalone HTML updated`);
