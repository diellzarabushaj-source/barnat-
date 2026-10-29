'use strict';
const crypto=require('node:crypto');
const market=require('./pediatric-market-catalog.js');
const scopes={
  Amoxicillin:['J01CA04'],'Amoxicillin / clavulanate':['J01CR02'],Ampicillin:['J01CA01'],
  'Ampicillin / sulbactam':['J01CR01'],'Penicillin V':['J01CE02'],'Penicillin G':['J01CE01'],
  'Benzathine penicillin G':['J01CE08'],Flucloxacillin:['J01CF05'],Cloxacillin:['J01CF02'],'Piperacillin + Tazobactam':['J01CR05'],
  Meropenem:['J01DH02'],Cephalexin:['J01DB01'],Cefazolin:['J01DB04'],Cefuroxime:['J01DC02'],Cefprozil:['J01DC10'],
  Cefotaxime:['J01DD01'],Ceftazidime:['J01DD02'],Ceftriaxone:['J01DD04'],Cefixime:['J01DD08'],
  Cefpodoxime:['J01DD13'],Cefdinir:['J01DD15'],Azithromycin:['J01FA10'],Clarithromycin:['J01FA09'],
  Clindamycin:['J01FF01'],'Trimethoprim / sulfamethoxazole':['J01EE01'],Amikacin:['J01GB06'],
  Gentamicin:['J01GB03'],Ciprofloxacin:['J01MA02'],Levofloxacin:['J01MA12'],Nitrofurantoin:['J01XE01'],
  Vancomycin:['J01XA01'],Colistin:['J01XB01'],Doxycycline:['J01AA02'],Linezolid:['J01XX08'],
  Erythromycin:['J01FA01'],Metronidazole:['J01XD01'],Mupirocin:['D06AX09'],
};
const aliases={'Amoxicillin / clavulanate':'Amoxicillin + Clavulanic','Trimethoprim / sulfamethoxazole':'Cotrimoxazole (TMP + SMZ)'};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function buildCatalog(rows){
  const drugs=Object.entries(scopes).map(([name,codes])=>{
    const forms=new Map();
    for(const row of rows.filter(row=>codes.includes(row.atc_code))){
      const form=market.classifyForm(row.pharmaceutical_form,row),canonical=aliases[name]||name;
      const parsed=market.parseStrength(row,canonical,form);
      const special=name==='Ampicillin / sulbactam'||name==='Benzathine penicillin G'||name==='Penicillin V';
      const matches=special?(name==='Ampicillin / sulbactam'?/ampicillin/i.test(row.active_substance)&&/sulbactam/i.test(row.active_substance):name==='Penicillin V'?/phenoxymethylpenicillin|penicillin\s*v/i.test(row.active_substance):/benzathine/i.test(row.active_substance)):market.compatibleComponents(canonical,row,parsed,form);
      if(!matches)continue;
      if(!forms.has(form.key))forms.set(form.key,{...form,variants:[]});
      const concentrationKey=parsed.reason?parsed.raw:[parsed.unit,parsed.perML?parsed.value/parsed.perML:parsed.value,parsed.basis,form.measure==='powder'?parsed.raw:''];
      const group=forms.get(form.key),id=hash([form.key,concentrationKey]).slice(0,20);
      let variant=group.variants.find(v=>v.id===id);
      if(!variant){variant={id,label:parsed.raw,concentration:parsed,products:[]};group.variants.push(variant);}
      // A registry entry is not evidence of a pediatric indication or an
      // interchangeable brand-specific reconstitution procedure.
      variant.products.push({id:row.id,name:row.trade_name,registryNumber:row.registry_number,activeSubstance:row.active_substance,form:row.pharmaceutical_form,strength:row.strength,packaging:row.packaging,population:row.approved_population||''});
    }
    const result=[...forms.values()];
    for(const form of result)form.variants.sort((a,b)=>a.label.localeCompare(b.label,'sq',{numeric:true}));
    return {name,forms:result,productCount:result.reduce((n,f)=>n+f.variants.reduce((m,v)=>m+v.products.length,0),0)};
  });
  return {version:'antibiotic-market-20261027',source:'AKKPM · regjistri i publikuar',revision:hash(drugs),drugs,productCount:drugs.reduce((n,d)=>n+d.productCount,0)};
}
let cached=null,until=0,inFlight=null;
async function loadCatalog(){
  if(cached&&Date.now()<until)return cached;
  if(!inFlight)inFlight=market.loadProducts(scopes).then(rows=>{cached=buildCatalog(rows);until=Date.now()+60000;return cached;}).finally(()=>{inFlight=null;});
  return inFlight;
}
async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');
  const auth=await import('./auth.mjs');
  if(!await auth.verifySessionToken(auth.sessionFromRequest(req)))return res.status(401).json({error:'Sesioni nuk është aktiv.'});
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Metodë e palejuar.'});}
  try{return res.status(200).json(await loadCatalog());}catch{return res.status(503).json({error:'Produktet AKKPM nuk u ngarkuan. Provo përsëri.'});}
}
module.exports={handler,buildCatalog,loadCatalog,scopes};
