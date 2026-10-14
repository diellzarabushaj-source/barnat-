'use strict';
const crypto=require('node:crypto');
const policy=require('../data/pediatric-workflow-v1.json');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function workflowAudit(reference){
 if(reference.workflowVersion===policy.schemaVersion)return reference;
 const drugs={};
 for(const [name,audit] of Object.entries(reference.clinicalAudit.drugs)){
  const rules=policy.drugs[name];const source=audit.calculator?.options||[];
  if(!rules || fingerprint(source)!==rules.sourceOptionsSha256){drugs[name]={...audit,calculator:{replace:true,disabled:true,options:[],reasonSq:'Burimi klinik ka ndryshuar. Skemat duhet të kontrollohen para llogaritjes.'}};continue;}
  if(audit.calculator?.disabled){drugs[name]={...audit,workflowSourceVerified:true};continue;}
  const options=rules.groups.map(group=>{
   const members=group.sourceIndexes.map(index=>source[index]);const first=members[0];
   if(!first || members.some(option=>!option||option.mode!=='clinicalRules'||option.route!==first.route||option.componentBasis!==first.componentBasis))throw new Error('Incompatible pediatric workflow grouping');
   return {...first,label:group.label,displayLabel:group.label,rules:members.flatMap(option=>option.rules),sourceOptionIndexes:group.sourceIndexes};
  });
  drugs[name]={...audit,workflowSourceVerified:true,calculator:{...audit.calculator,options}};
 }
 return {...reference,workflowVersion:policy.schemaVersion,clinicalAudit:{...reference.clinicalAudit,drugs}};
}
module.exports={workflowAudit,policy,fingerprint};
