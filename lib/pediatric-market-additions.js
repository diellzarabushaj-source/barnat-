'use strict';
const data=require('../data/pediatric-market-additions-v1.json');
const names=new Set(data.drugs.map(d=>d.name));
const scopes=Object.fromEntries(data.drugs.map(d=>[d.name,d.atcCodes]));

function extend(reference,rows){
  const available=data.drugs.filter(drug=>rows.some(row=>drug.atcCodes.includes(row.atc_code)));
  const audits=Object.fromEntries(Object.entries(reference.clinicalAudit.drugs).filter(([name])=>!names.has(name)));
  const sections=reference.sections.map(section=>({...section,drugs:[...section.drugs.filter(d=>!names.has(d.name)),...available.filter(d=>d.section===section.title).map(d=>({
    name:d.name,no:0,dose:[d.summarySq],formulations:[...new Set(rows.filter(row=>d.atcCodes.includes(row.atc_code)).map(row=>row.pharmaceutical_form+' · '+row.strength))],calc:[],searchTerms:d.searchTerms,marketAdditionVersion:data.schemaVersion,
  }))]}));
  for(const drug of available)audits[drug.name]={
    status:drug.options.length?'verified-corrected':'limited',badgeSq:drug.options.length?'BURIM I KONTROLLUAR':'REFERENCË · PA AUTOMATIZIM',
    summarySq:drug.summarySq,warningsSq:[],sources:drug.sources,workflowSourceVerified:true,
    calculator:{replace:true,disabled:!drug.options.length,reasonSq:drug.options.length?'':drug.summarySq,options:drug.options.map(option=>({...option,marketRouteVersion:data.schemaVersion}))},
  };
  return {...reference,sections,marketAdditionVersion:data.schemaVersion,clinicalAudit:{...reference.clinicalAudit,drugs:audits}};
}
module.exports={data,scopes,extend};
