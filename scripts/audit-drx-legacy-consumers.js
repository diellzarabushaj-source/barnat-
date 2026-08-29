'use strict';

const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const LEGACY=[
  'dose_rules_v2',
  'dose_products_v2',
  'dose_rule_products_v2',
  'dose_indications_v2',
  'dose_sources_v2',
  'dosage_regimens',
];
const EXTENSIONS=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.html']);
const EXCLUDED_DIRS=new Set([
  '.git','node_modules','tests','data','supabase','scripts','.github',
  'dist','build','coverage','.next','.vercel'
]);

function runtimeFiles(root=ROOT){
  const out=[];
  function walk(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(entry.name.startsWith('.') && entry.isDirectory() && entry.name!=='.well-known') continue;
      const full=path.join(dir,entry.name);
      const rel=path.relative(root,full).replace(/\\/g,'/');
      if(entry.isDirectory()){
        if(EXCLUDED_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if(!entry.isFile() || !EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      out.push({full,rel});
    }
  }
  walk(root);
  return out.sort((a,b)=>a.rel.localeCompare(b.rel,'en'));
}

function scanText(text){
  const hits=[];
  const lines=String(text||'').split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    for(const token of LEGACY){
      if(lines[i].includes(token)) hits.push({token,line:i+1,text:lines[i].trim()});
    }
  }
  return hits;
}

function audit({root=ROOT}={}){
  const consumers=[];
  for(const file of runtimeFiles(root)){
    const text=fs.readFileSync(file.full,'utf8');
    const hits=scanText(text);
    if(hits.length) consumers.push({file:file.rel,legacy:[...new Set(hits.map(x=>x.token))],hits});
  }
  const byLegacy=Object.fromEntries(LEGACY.map(token=>[
    token,
    consumers.filter(c=>c.legacy.includes(token)).map(c=>c.file)
  ]));
  return {
    schemaVersion:'drx-legacy-consumer-audit-v1',
    zeroKnownLegacyConsumers:consumers.length===0,
    destructiveCleanupAllowed:consumers.length===0,
    consumerCount:consumers.length,
    consumers,
    byLegacy,
  };
}

if(require.main===module){
  const result=audit();
  console.log(JSON.stringify(result,null,2));
  if(!result.zeroKnownLegacyConsumers) process.exitCode=2;
}

module.exports={audit,runtimeFiles,scanText,LEGACY,EXTENSIONS,EXCLUDED_DIRS};
