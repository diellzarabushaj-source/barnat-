'use strict';

const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const ROOT=path.resolve(__dirname,'..');
const RUNTIME_ROOTS=['api','lib'];
const LEGACY_TOKENS=[
  'dose_products_v2',
  'dose_rules_v2',
  'dose_rule_products_v2',
  'dose_indications_v2',
  'dose_sources_v2',
];
const EXTENSIONS=new Set(['.js','.mjs','.cjs']);

function walk(dir){
  if(!fs.existsSync(dir)) return [];
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...walk(full));
    else if(EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const consumers=[];
for(const rootName of RUNTIME_ROOTS){
  for(const file of walk(path.join(ROOT,rootName))){
    const source=fs.readFileSync(file,'utf8');
    const tokens=LEGACY_TOKENS.filter(token=>source.includes(token));
    if(tokens.length){
      consumers.push({
        path:path.relative(ROOT,file).replaceAll(path.sep,'/'),
        legacyRelations:tokens,
      });
    }
  }
}
consumers.sort((a,b)=>a.path.localeCompare(b.path,'en'));

const flow=JSON.parse(fs.readFileSync(path.join(ROOT,'data/drx-frontend-flow-contract-v1.json'),'utf8'));
assert.equal(flow.runtime?.v2FallbackActive,true);
assert.equal(flow.runtime?.v3StrictCutover,false);

const evidence={
  evidenceVersion:'drx-phase10-legacy-consumer-audit-v1',
  generatedAt:new Date().toISOString(),
  runtimeRoots:RUNTIME_ROOTS,
  legacyRelations:LEGACY_TOKENS,
  consumerCount:consumers.length,
  consumers,
  strictCutoverPermitted:consumers.length===0,
  note:consumers.length
    ? 'Legacy runtime consumers remain; strict cutover and destructive cleanup stay blocked.'
    : 'No runtime source references to the audited V2 dose relations were found.',
};
fs.writeFileSync(path.join(ROOT,'drx-phase10-consumer-audit.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
