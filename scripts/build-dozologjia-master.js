'use strict';
const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
const bundle=path.join(root,'dozologjia-v2.js');const shell=fs.readFileSync(bundle,'utf8');const end=shell.indexOf('})();')+5;
if(end<5)throw Error('Missing shared shell');
fs.writeFileSync(bundle,shell.slice(0,end)+'\n\n'+fs.readFileSync(path.join(root,'dozologjia-master-client.js'),'utf8'));
