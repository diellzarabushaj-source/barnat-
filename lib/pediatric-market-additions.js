'use strict';
const base=require('../data/pediatric-market-additions-v1.json');
const cough=require('../data/pediatric-cough-reference-v1.json');
const data={...base,schemaVersion:base.schemaVersion+'|'+cough.schemaVersion,drugs:[...base.drugs,...cough.drugs],productEvidence:[...base.productEvidence,...cough.productEvidence],componentProducts:[...base.componentProducts,...cough.componentProducts]};
const names=new Set(data.drugs.map(d=>d.name));
const coughNames=new Set(cough.drugs.map(d=>d.name));
const scopes=Object.fromEntries(data.drugs.map(d=>[d.name,d.atcCodes]));

function matchesDrug(drug,row){
  return drug.atcCodes.includes(row.atc_code)&&(!drug.registryActivePattern||new RegExp(drug.registryActivePattern,'i').test(row.active_substance||''));
}

function extend(reference,rows){
  const available=data.drugs.filter(drug=>rows.some(row=>matchesDrug(drug,row)));
  const audits=Object.fromEntries(Object.entries(reference.clinicalAudit.drugs).filter(([name])=>!names.has(name)));
  const sections=[...reference.sections,...[...new Set(available.map(d=>d.section))].filter(title=>!reference.sections.some(s=>s.title===title)).map(title=>({title,roman:'',drugs:[]}))].map(section=>({...section,drugs:[...section.drugs.filter(d=>!names.has(d.name)),...available.filter(d=>d.section===section.title).map(d=>({
    name:d.name,no:0,dose:[d.summarySq],formulations:[...new Set(rows.filter(row=>matchesDrug(d,row)).map(row=>row.pharmaceutical_form+' · '+row.strength))],calc:[],searchTerms:d.searchTerms,marketAdditionVersion:data.schemaVersion,
  }))]}));
  for(const drug of available)audits[drug.name]={
    auditedAt:drug.auditedAt||(coughNames.has(drug.name)?cough.auditedAt:base.auditedAt),
    status:drug.options.length?'verified-corrected':'limited',badgeSq:drug.options.length?'BURIM I KONTROLLUAR':'REFERENCË · PA AUTOMATIZIM',
    summarySq:drug.summarySq,warningsSq:drug.warningsSq||[],sources:drug.sources,workflowSourceVerified:true,
    calculator:{replace:true,disabled:!drug.options.length,reasonSq:drug.options.length?'':drug.summarySq,options:drug.options.map(option=>({...option,marketRouteVersion:data.schemaVersion}))},
  };
  return {...reference,sections,marketAdditionVersion:data.schemaVersion,clinicalAudit:{...reference.clinicalAudit,drugs:audits}};
}
module.exports={data,scopes,extend,matchesDrug};
