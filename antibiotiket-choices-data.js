(function(root){
 'use strict';
 // Choice references contain no doses and do not approve a local product or calculator.
 const source=(code,title)=>({id:'CHOICE-'+code,type:'NICE '+code+' · renditja',url:'https://www.nice.org.uk/guidance/'+code.toLowerCase()+'/chapter/Recommendations',scope:title,readDate:'2026-11-02',note:'Renditje burimore; mungon miratimi klinik lokal. Dozimi Mayo ruhet veçmas.'});
 const drugs={amoxicillin:'ABX-631701ffbd23',coamoxiclav:'ABX-44714d68344a',penicillin:'ABX-3673e68de5e7',clarithromycin:'ABX-a92902b63e9f',doxycycline:'ABX-6ba3b90f3334',erythromycin:'ABX-339dc2bc5e63',nitrofurantoin:'ABX-b53e37fb2262',fosfomycin:'ABX-55f693743948',cefalexin:'ABX-346ae7a7e243',ciprofloxacin:'ABX-7d622091477f',flucloxacillin:'ABX-8b99285c246f',fusidic:'ABX-e209e94fc581',mupirocin:'ABX-d7685aa3e0f9'};
 const row=(tier,drug,note='')=>({tier,substanceId:drugs[drug],route:'PO',form:'formë e zakonshme orale',note});
 const allergy=row('alternative','clarithromycin','Alergji/intolerancë ndaj penicilinës; jo në shtatzëni.');
 const pregnancy=row('alternative','erythromycin','Në shtatzëni me alergji ndaj penicilinës; vlerësim përfitim/rrezik.');
 const failure=row('second','coamoxiclav','Përkeqësim pas të paktën 2–3 ditësh me zgjedhjen e parë.');
 const common={route:'PO',calculatorApproved:false,localApproval:null,auditStatus:'REFERENCË — PA MIRATIM LOKAL'};
 const profile=(id,conditionIds,sourceId,population,label,rows,note,secondNote='')=>({...common,id,conditionIds,sourceId,population,label,rows,note,secondNote});
 const sinusRows=[row('first','penicillin'),row('first','coamoxiclav','Vetëm gjendje sistemike shumë e rënduar ose rrezik i lartë komplikimesh.'),failure,allergy,row('alternative','doxycycline','Alergji/intolerancë ndaj penicilinës; jo në shtatzëni.'),pregnancy];
 const throatRows=[row('first','penicillin'),allergy,pregnancy];
 const capRows=[row('first','amoxicillin'),row('alternative','clarithromycin','Alergji ndaj penicilinës ose amoxicillin i papërshtatshëm, përfshirë dyshim për patogjenë atipikë.'),row('alternative','doxycycline','Alergji ndaj penicilinës ose amoxicillin i papërshtatshëm; jo në shtatzëni.'),row('alternative','erythromycin','Alternativë në shtatzëni, sipas vlerësimit klinik.')];
 const absent=(tier,name,note)=>({tier,substanceId:null,sourceSubstance:name,route:'PO',form:'formë e zakonshme orale',note});
 const nitro=tier=>({...row(tier,'nitrofurantoin','Vetëm eGFR ≥45 ml/min në këtë profil; monitorim i efekteve pulmonare/hepatike.'),form:'Kapsulë MR 100 mg ose kapsulë e zakonshme 50 mg',presentations:[{form:'kapsulë me çlirim të zgjatur',strengthExact:'100 mg'},{form:'kapsulë e zakonshme',strengthExact:'50 mg'}]});
 const adultAndTeen={populations:['Të rritur','Fëmijë / adoleshentë']};
 const topical=(tier,key,note)=>({...row(tier,key,note),route:'TOP',form:'Preparat dermal 2% sipas burimit',presentations:[{form:'krem',strengthPrefix:'2%'},{form:'pomadë',strengthPrefix:'2%'}]});
 const profiles=[
  profile('aom-child',['COND-b79e6949387c'],'CHOICE-NG91','Fëmijë / adoleshentë','1 muaj–17 vjeç · otit media akut',[row('first','amoxicillin'),failure,allergy,{...pregnancy,note:'8–17 vjeç, në shtatzëni me alergji ndaj penicilinës.'}],'Jo çdo otit kërkon antibiotik. Për alergji dhe zgjedhje të dytë: konsultë me mikrobiologun.'),
  profile('sinus-adult',['COND-09ff5a5ec8e3'],'CHOICE-NG79','Të rritur','≥18 vjeç · sinusit akut',sinusRows,'Nëse co-amoxiclav është përdorur i pari, ose ka alergji me nevojë për linjë të dytë: konsultë me mikrobiologun.'),
  profile('sinus-child',['COND-09ff5a5ec8e3'],'CHOICE-NG79','Fëmijë / adoleshentë','1 muaj–17 vjeç · sinusit akut',sinusRows.map(r=>r.substanceId===drugs.doxycycline?{...r,note:'Vetëm 12–17 vjeç; alergji/intolerancë ndaj penicilinës; jo në shtatzëni.'}:r.substanceId===drugs.erythromycin?{...r,note:'Vetëm 8–17 vjeç, në shtatzëni me alergji ndaj penicilinës.'}:r),'Për dështim pas co-amoxiclav ose alergji me nevojë për linjë të dytë: mikrobiologu.'),
  profile('throat-adult',['COND-8c37c186481b','COND-272a5b4200f4'],'CHOICE-NG84','Të rritur','≥18 vjeç · faringjit/tonsilit streptokoksik',throatRows,'Vetëm kur antibiotiku indikohet pas vlerësimit klinik.','Burimi nuk cakton antibiotik të dytë rutinë; kërkohet rivlerësim.'),
  profile('throat-child',['COND-8c37c186481b','COND-272a5b4200f4'],'CHOICE-NG84','Fëmijë / adoleshentë','1 muaj–17 vjeç · faringjit/tonsilit streptokoksik',throatRows.map(r=>r.substanceId===drugs.erythromycin?{...r,note:'8–17 vjeç, në shtatzëni me alergji ndaj penicilinës.'}:r),'Vetëm kur antibiotiku indikohet pas vlerësimit klinik.','Burimi nuk cakton antibiotik të dytë rutinë; kërkohet rivlerësim.'),
  profile('cap-adult-low',['COND-63dfd289a42f'],'CHOICE-NG250','Të rritur','≥18 vjeç · pneumoni komunitare me rëndesë të ulët',capRows,'Nuk zbatohet te pneumonia mesatare, e rëndë ose spitalore. Rëndesa dhe rezistenca lokale vlerësohen veçmas.','Burimi nuk jep kalim automatik te një antibiotik i dytë.'),
  profile('cap-child-nonsevere',['COND-63dfd289a42f'],'CHOICE-NG250','Fëmijë / adoleshentë','1 muaj–17 vjeç · pneumoni komunitare jo e rëndë',capRows.map(r=>r.substanceId===drugs.doxycycline?{...r,note:'12–17 vjeç; alergji ndaj penicilinës ose amoxicillin i papërshtatshëm; jo në shtatzëni. Për moshat më të vogla kërkohet vlerësim i veçantë.'}:r.substanceId===drugs.erythromycin?{...r,note:'8–17 vjeç, në shtatzëni, sipas vlerësimit klinik.'}:r),'Nuk zbatohet te pneumonia e rëndë ose spitalore; rëndesa vlerësohet nga klinicisti.','Burimi nuk jep kalim automatik te një antibiotik i dytë.')
 ];
 profiles.push(
  {...profile('cystitis-women-nonpregnant',['COND-f5f958e42eeb','COND-47f8c083c9d8'],'CHOICE-NG109','Të rritur','Gra ≥16 vjeç · cistit i poshtëm i pakomplikuar · jo shtatzënë',[
   nitro('first'),absent('first','Trimethoprim','Vetëm rrezik i ulët rezistence; monoterapi, jo co-trimoxazole.'),
   {...nitro('second'),note:'Vetëm nëse nuk u përdor i pari dhe eGFR ≥45; pa përmirësim pas ≥48 orësh ose zgjedhja e parë e papërshtatshme.'},
   absent('second','Pivmecillinam','Pas ≥48 orësh pa përmirësim ose zgjedhja e parë e papërshtatshme.'),
   {...row('second','fosfomycin','Pas ≥48 orësh pa përmirësim ose zgjedhja e parë e papërshtatshme.'),form:'Granula orale 3 g',presentations:[{form:'granula',strengthExact:'3 g'}]}
  ],'Përjashton shtatzëninë, ethet/pielonefritin dhe UTI të komplikuar. Merr parasysh urinokulturën dhe rezistencën lokale.'),...adultAndTeen},
  {...profile('pyelonephritis-oral-nonpregnant',['COND-11cde143207a'],'CHOICE-NG111','Të rritur','Gra jo shtatzëna dhe burra ≥16 vjeç · pielonefrit akut · PO',[
   row('first','cefalexin'),row('first','coamoxiclav','Vetëm me rezultat kulture dhe ndjeshmëri të konfirmuar.'),absent('first','Trimethoprim','Vetëm me kulturë dhe ndjeshmëri të konfirmuar; nuk zëvendësohet me co-trimoxazole.'),row('first','ciprofloxacin','Vetëm kur antibiotikët e tjerë të rekomanduar janë të papërshtatshëm; kufizimet e sigurisë për fluorokinolonet zbatohen.')
  ],'Vetëm kur pacienti mund të marrë terapi orale dhe rëndesa nuk kërkon IV. Kulturat dhe rezistenca lokale udhëheqin zgjedhjen.','Burimi nuk cakton një kalim të dytë oral rutinë; rivlerësim/mikrobiolog.'),...adultAndTeen},
  profile('cellulitis-adult-oral',['COND-b015f7e5d777'],'CHOICE-NG141','Të rritur','≥18 vjeç · celulit · PO · jo pranë syrit/hundës',[
   row('first','flucloxacillin'),row('alternative','clarithromycin','Alergji ndaj penicilinës ose flucloxacillin i papërshtatshëm; jo në shtatzëni.'),row('alternative','doxycycline','Alergji ndaj penicilinës ose flucloxacillin i papërshtatshëm; jo në shtatzëni.'),row('alternative','erythromycin','Në shtatzëni, kur alternativa ndaj flucloxacillin nevojitet.')
  ],'Përjashton infeksionin pranë syrit/hundës, infeksionin e rëndë dhe degët për MRSA. Injektabili nuk zëvendëson formën orale.','Nuk emërtohet zgjedhje e dytë rutinë për këtë kontekst; rivlerësim klinik.'),
  {...profile('impetigo-adult-local',['COND-67fc8d258802'],'CHOICE-NG153','Të rritur','≥18 vjeç · impetigo jobuloze e lokalizuar · TOP',[
   topical('first','fusidic','Kur peroksidi i hidrogjenit 1% është i papërshtatshëm ose joefektiv.'),topical('alternative','mupirocin','Vetëm kur dyshohet ose konfirmohet rezistencë ndaj acidit fusidik.')
  ],'Jo gjendje sistemike e rënduar/rrezik i lartë. Mos kombino antibiotik topik me oral për impetigo; shmang përdorimin e zgjatur/përsëritur.','Burimi jep alternativë sipas rezistencës, jo zgjedhje të dytë rutinë.'),route:'TOP'},
  profile('impetigo-adult-oral',['COND-67fc8d258802'],'CHOICE-NG153','Të rritur','≥18 vjeç · impetigo · kur indikohet terapi orale',[
   row('first','flucloxacillin'),row('alternative','clarithromycin','Alergji ndaj penicilinës ose flucloxacillin i papërshtatshëm; jo në shtatzëni.'),row('alternative','erythromycin','Në shtatzëni me alergji ndaj penicilinës.')
  ],'Për impetigo buloze ose gjendje sistemike/rrezik komplikimesh; në jobulozen e përhapur vlerësohet TOP ose PO. Jo kombinim i të dyjave. Për MRSA: mikrobiologu.','Burimi nuk emërton zgjedhje të dytë orale rutinë.')
 );
 root.DRX_ANTIBIOTIC_CHOICES={version:'2026-11-02.2',sources:[source('NG91','Otit media akut'),source('NG79','Sinusit akut'),source('NG84','Dhimbje akute fyti'),source('NG250','Pneumoni e fituar në komunitet'),source('NG109','Infeksion i poshtëm urinar'),source('NG111','Pielonefrit akut'),source('NG141','Celulit dhe erizipelë'),source('NG153','Impetigo')],profiles};
})(typeof window==='object'?window:globalThis);
