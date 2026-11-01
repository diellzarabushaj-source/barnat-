(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DRX_ANTIBIOTIC_MANUAL=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const question=(key,label,choices)=>({key,label,choices});
 const configurations={
  aom:{title:'Për otitin',questions:[]},
  gas:{title:'Për faringjitin',questions:[]},
  pneumonia:{title:'Për pneumoninë',questions:[]},
  sinusitis:{title:'Për sinusitin',questions:[question('course','Ecuria',[['initial','Trajtim fillestar'],['failure','Përkeqësim pas ≥2–3 ditësh · i rivlerësuar'],['high','Rrezik i lartë · i vlerësuar']])]},
  'uti-cystitis':{title:'Për cistitin',questions:[]},
  'uti-pyelo':{title:'Për UTI febrile / pielonefrit',questions:[]},
  impetigo:{title:'Për impetigon',questions:[question('extent','Shtrirja',[['local','I lokalizuar, jo-bullos'],['wide','I përhapur / bullos ose me shenja sistemike']])]},
  cellulitis:{title:'Për cellulitis / erizipelë',questions:[question('purulence','Pamja klinike',[['none','Jo-purulent · pa absces'],['pus','Ka qelb / absces']])]},
  'wound-cut':{title:'Për plagën',questions:[question('wound','Indikacioni',[['clean','Prerje e pastër, jo e infektuar'],['infected','Infeksion bakterial / indikacion i qartë']])]},
  abscess:{title:'Për abscesin',questions:[question('systemic','Antibiotik sistemik',[['no','Pa indikacion për antibiotik sistemik'],['yes','Ka indikacion për antibiotik sistemik · i vlerësuar']])]},
  preseptal:{title:'Për cellulitis preseptal',questions:[]},
  bite:{title:'Për kafshimin',questions:[question('purpose','Qëllimi i trajtimit',[['none','Pa indikacion për profilaksi / trajtim'],['proph','Profilaksi · plagë me rrezik të lartë'],['treat','Kafshim tashmë i infektuar']])]},
  lymphadenitis:{title:'Për limfadenitin',questions:[question('origin','Burimi i dyshuar',[['skin','Lëkurë / inde të buta'],['oral','Burim oral / anaerob']])]}
 };
 const alarms={
  pneumonia:'Dispne e rëndë, hipoksemi, dyshim për sepsë ose pamundësi për trajtim oral.',
  sinusitis:'Ënjtje rreth syrit, çrregullim shikimi, shenja neurologjike ose gjendje e rëndë.',
  impetigo:'Gjendje e rëndë, përhapje e shpejtë ose dyshim për infeksion më të thellë.',
  cellulitis:'Gjendje sistemike e rëndë, progresion i shpejtë ose dyshim për infeksion të thellë.',
  'wound-cut':'Dëmtim i thellë, tendin / nyje / kockë, shenja sistemike ose progresion i shpejtë.',
  abscess:'Sepsë, infeksion i thellë ose përhapje e shpejtë.',
  bite:'Dëmtim i thellë / neurovaskular, kockë / nyje / tendin ose infeksion i rëndë.',
  lymphadenitis:'Absces i thellë, kompromis i rrugëve të frymëmarrjes ose gjendje e rëndë.'
 };
 function decide(id,options,context={}){
  const a=context.guideAnswers||{};
  if(context.guideUrgent)return {block:'Shenja alarmi: nevojitet vlerësim urgjent / specialistik. Nuk gjenerohet recetë rutinë ambulatore.'};
  const config=configurations[id];
  if(config?.questions.some(q=>!q.choices.some(([value])=>value===a[q.key])))return {block:'Plotëso pyetjen për këtë infeksion që të përcaktohet trajtimi.'};
  if(id==='cellulitis'&&a.purulence==='pus')return {block:'Kjo skemë është për cellulitis jo-purulent. Vlerëso abscesin / drenazhin dhe zgjidh rrugën për infeksion purulent.'};
  if(id==='wound-cut'&&a.wound==='clean')return {block:'Prerja e pastër, e thjeshtë dhe jo e infektuar nuk kërkon antibiotik sistemik rutinë. Kujdes lokal dhe vlerësim për tetanus.'};
  if(id==='bite'&&a.purpose==='none')return {block:'Nuk u përcaktua indikacion për antibiotik. Pastro plagën dhe vlerëso tetanusin, rabies dhe nevojën për ndjekje.'};
  if(id==='impetigo'&&a.extent==='local')return {block:'Impetigo i lokalizuar, jo-bullos: vlerëso trajtimin lokal sipas udhëzimit. Nuk zgjidhet automatikisht antibiotik oral; përshtatja me produktin lokal kërkon verifikim.'};
  let eligible=options;
  if(id==='bite')eligible=options.filter(o=>o.id.endsWith('-'+a.purpose));
  if(id==='abscess'&&a.systemic==='no')eligible=options.filter(o=>o.kind==='procedure');
  if(id==='sinusitis'){
   if(a.course==='initial')eligible=options.filter(o=>o.tier!=='second');
   else eligible=options.filter(o=>o.tier==='second');
  }
  if(id==='lymphadenitis'&&a.origin==='oral')eligible=options.filter(o=>o.drug==='Amoxicillin / clavulanate');
  const primary=eligible.find(o=>o.kind!=='procedure'&&o.tier==='first')||eligible.find(o=>o.kind!=='procedure')||eligible[0];
  return {options:eligible,primaryId:primary?.id||''};
 }
 Object.values(configurations).forEach(c=>{c.questions.forEach(q=>{q.choices.forEach(Object.freeze);Object.freeze(q.choices);Object.freeze(q);});Object.freeze(c.questions);Object.freeze(c);});
 return Object.freeze({configurations:Object.freeze(configurations),alarms:Object.freeze(alarms),decide});
});
