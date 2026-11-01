(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else if(root.DRX_PENICILLIN_PROTOCOLS&&root.DRX_ANTIBIOTIC_MANUAL&&root.DRX_ANTIBIOTIC_GUIDE){
  const active=api.apply(root.DRX_PENICILLIN_PROTOCOLS,root.DRX_ANTIBIOTIC_MANUAL,root.DRX_ANTIBIOTIC_GUIDE);
  root.DRX_NICE_STANDARD=api;root.DRX_PENICILLIN_PROTOCOLS=active.protocols;root.DRX_ANTIBIOTIC_MANUAL=active.manual;root.DRX_ANTIBIOTIC_GUIDE=active.guide;
 }
})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const version='nice-only-20261101';
 const coverage=Object.freeze({aom:'nice-ng91',gas:'nice-ng84',pneumonia:'nice-ng250',sinusitis:'nice-ng79','uti-cystitis':'nice-ng109','uti-pyelo':'nice-ng111',impetigo:'nice-ng153',cellulitis:'nice-ng141',bite:'nice-ng184','wound-cut':null,abscess:null,preseptal:null,lymphadenitis:null});
 const allowed=new Set(Object.values(coverage).filter(Boolean));
 const outside=Object.freeze({
  'wound-cut':'Plagë / prerje: vlerëso pastrimin, trupat e huaj, tetanusin dhe infeksionin e thellë. Një skemë e përgjithshme NICE për çdo plagë nuk është pjesë e këtij manuali. Nuk gjenerohet antibiotik automatik.',
  abscess:'Absces: kërko vlerësim për drenazh dhe nevojën për antibiotik. Ky manual nuk ka skemë të plotë të veçantë NICE për abscesin; nuk huazon dozë nga një organizatë tjetër.',
  preseptal:'Zona rreth syrit: nevojitet vlerësim i veçantë për preseptal / orbital cellulitis. Tabela e përgjithshme e NICE për infeksion pranë syrit nuk zëvendëson një pathway të plotë preseptal. Ulja e shikimit, proptoza, dhimbja në lëvizje ose ekzaminimi i pamjaftueshëm kërkojnë referim urgjent.',
  lymphadenitis:'Limfadenit: përcakto etiologjinë dhe përjashto abscesin ose infeksionin e thellë të qafës. Në këtë manual nuk ka skemë të veçantë NICE të verifikuar për dozimin automatik. Vlerësim i veçantë; jo dozë pediatrike e zgjatur për të rritur.'
 });
 const question=(key,label,choices)=>({key,label,choices});
 const fixedRange=(min,max)=>({type:'fixed',value:min,maxValue:max,text:`${min}–${max} mg/dozë`});
 const blocked=(i,text)=>({...i,source:coverage[i.id]||'nice-scope',options:[],standardBlock:text,contextMessage:text,authority:'NICE'});
 function apply(base,manual,original){
  const sources=original.sources.filter(s=>allowed.has(s.id)&&/^https:\/\/www\.nice\.org\.uk\//.test(s.url||'')).map(s=>({...s,date:'audited 2026-11-01'}));
  sources.push({id:'nice-scope',short:'Vlerësim i veçantë',title:'Kufiri i manualit NICE',url:'https://www.nice.org.uk/guidance',note:'Vetëm skema të verifikuara NICE. Mungesa e një tabele të përshtatshme këtu nuk do të thotë se trajtimi nuk ekziston; kërkon pathway të veçantë.'});
  const guide=Object.freeze({...original,authority:'NICE',standardVersion:version,sources,indications:original.indications.map(i=>({...i,source:coverage[i.id]||'nice-scope'}))});
  function resolve(indication,context){
   const id=indication.id,m=context.ageMonths;
   if(outside[id])return blocked(indication,outside[id]);
   if(!coverage[id])return blocked(indication,'Kjo diagnozë nuk ka skemë NICE të publikuar në këtë manual.');
   if(id==='aom'&&m>=216)return blocked(indication,'NICE NG91 jep tabelën për nën 18 vjeç. AOM te të rriturit kërkon skemë të veçantë; nuk përdoret automatikisht tabela pediatrike ose NHS Fife.');
   if(['a4','a5'].includes(context.allergy))return blocked(indication,'Alergjia ndaj cefalosporinës ose alergjitë e shumëfishta kërkojnë vlerësim të individualizuar. Nuk bëhet kalim automatik në penicilinë nga ky manual.');
   const c={...context,gasPenicillinSource:'nice',sinusPenicillinSource:'nice'};
   let result=base.resolve(indication,c);
   if(!context.ageConfirmed)return {...result,authority:'NICE'};
   let options=result.options.filter(o=>allowed.has(o.source)&&(!o.durationSource||allowed.has(o.durationSource))&&!o.nativeOspen);
   if(id==='gas')options=options.filter(o=>o.id!=='amoxicillin-gas');
   if(id==='pneumonia'){
    // NG250: non-severe atypical coverage is an ALTERNATIVE, not a routine add-on.
    const moderate=m>=216&&context.pneumoniaSeverity==='moderate';
    options=options.filter(o=>!o.atypical);
    options=options.map(o=>o.drug==='Clarithromycin'&&m>=144?{...o,dose:m>=216?o.dose:fixedRange(250,500)}:o.drug==='Erythromycin'&&m<216?{...o,dose:fixedRange(250,500)}:o);
    if(context.atypical){
     const alternative=options.find(o=>o.drug===(context.pregnant?'Erythromycin':'Clarithromycin'));
     if(alternative){
      if(moderate)options.push({...alternative,id:'nice-pna-atypical-addition',atypical:true,tier:'atypical',allergy:['none','a0'],note:'Jepet BASHKË me amoxicillin vetëm për pneumoni të moderuar te të rriturit kur dyshohen atipikë.'});
      else options=[{...alternative,allergy:['none','a0','a1','a2','a3'],tier:'first',note:'Alternativë ndaj amoxicillin për pneumoni jo të rëndë kur dyshohen atipikë. Nuk jepet si shtesë rutinë.'}];
     }else return blocked(indication,'Nuk ka alternativë orale NICE të përshtatshme për atipikë në këtë profil. Kërko vlerësim të veçantë.');
    }
   }
   // Sources specify a routine age-band choice; special size/product limits
   // remain gates. Never relabel an SmPC dose override as a NICE regimen.
   options=options.map(o=>{if(o.drug==='Clarithromycin'&&o.dose.type==='single'){const {maxDose,...dose}=o.dose;o={...o,dose};}return {...o,authority:'NICE',protocolVersion:version};});
   const minAgeMonths=['aom','pneumonia','uti-cystitis','uti-pyelo'].includes(id)?3:1;
   return {...result,source:coverage[id],options,minAgeMonths,warning:'Skemë rutinë NICE pas vlerësimit klinik. Përkeqësimi, mungesa e përmirësimit dhe kundërindikacionet kërkojnë rivlerësim; kursi nuk zgjatet vetë.',authority:'NICE',protocolVersion:version,
    ...(id==='gas'?{contextMessage:'NICE NG84: vlerëso FeverPAIN / Centor dhe nevojën për antibiotik. Amoxicillin dhe skemat Ospen në IU nuk aktivizohen nga burime të tjera.'}:{}),
    ...(id==='pneumonia'?{contextMessage:'NICE NG250: 3 ditë vetëm në 3 muaj–11 vjeç, pa komplikime ose sëmundje bazë dhe klinikisht stabil. Për profile të tjera kërko rivlerësim.'}:{}),
   };
  }
  const configurations={...manual.configurations};
  for(const id of Object.keys(outside))configurations[id]={...configurations[id],questions:[]};
  configurations.aom={...configurations.aom,questions:[]};
  configurations.gas={...configurations.gas,questions:[]};
  configurations.pneumonia={...configurations.pneumonia,questions:[question('severity','Ashpërsia e vlerësuar',[['nonsevere','Jo e rëndë · pa komplikime ose sëmundje bazë'],['moderate','E moderuar · vetëm ≥18 vjeç, e vlerësuar'],['other','E rëndë / komplikime / profil tjetër']])]};
  function decide(id,options,context={}){
   if(context.guideUrgent)return manual.decide(id,options,context);
   const a=context.guideAnswers||{},config=configurations[id];
   if(config?.questions.some(q=>!q.choices.some(([v])=>a[q.key]===v)))return {block:'Plotëso pyetjen e shkurtër për këtë infeksion.'};
   if(outside[id])return {block:outside[id]};
   if(id==='pneumonia'&&(a.severity==='other'||a.severity==='moderate'&&!(context.ageMonths>=216)))return {block:'Ky profil kërkon vlerësim të veçantë. Nuk përdoret automatikisht kursi i shkurtër për pneumoni jo të rëndë.'};
   return manual.decide(id,options,context);
  }
  const protocols=Object.freeze({...base,standard:version,resolve,resolveHospital:()=>null,gate:(o,c)=>!allowed.has(o.source)?'Kjo skemë nuk është pjesë e standardit NICE aktiv.':base.gate(o,c)});
  return {guide,protocols,manual:Object.freeze({...manual,configurations:Object.freeze(configurations),decide})};
 }
 return Object.freeze({version,coverage,outside,apply});
});
