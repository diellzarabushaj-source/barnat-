(function(root){
 'use strict';
 // Choice references contain no doses and do not approve a local product or calculator.
 const source=(code,title)=>({id:'CHOICE-'+code,type:'NICE '+code+' · renditja',url:'https://www.nice.org.uk/guidance/'+code.toLowerCase()+'/chapter/Recommendations',scope:title,readDate:'2026-11-02',note:'Renditje burimore; mungon miratimi klinik lokal. Dozimi Mayo ruhet veçmas.'});
 const drugs={amoxicillin:'ABX-631701ffbd23',coamoxiclav:'ABX-44714d68344a',penicillin:'ABX-3673e68de5e7',clarithromycin:'ABX-a92902b63e9f',doxycycline:'ABX-6ba3b90f3334',erythromycin:'ABX-339dc2bc5e63'};
 const row=(tier,drug,note='')=>({tier,substanceId:drugs[drug],route:'PO',form:'formë e zakonshme orale',note});
 const allergy=row('alternative','clarithromycin','Alergji/intolerancë ndaj penicilinës; jo në shtatzëni.');
 const pregnancy=row('alternative','erythromycin','Në shtatzëni me alergji ndaj penicilinës; vlerësim përfitim/rrezik.');
 const failure=row('second','coamoxiclav','Përkeqësim pas të paktën 2–3 ditësh me zgjedhjen e parë.');
 const common={route:'PO',calculatorApproved:false,localApproval:null,auditStatus:'REFERENCË — PA MIRATIM LOKAL'};
 const profile=(id,conditionIds,sourceId,population,label,rows,note,secondNote='')=>({...common,id,conditionIds,sourceId,population,label,rows,note,secondNote});
 const sinusRows=[row('first','penicillin'),row('first','coamoxiclav','Vetëm gjendje sistemike shumë e rënduar ose rrezik i lartë komplikimesh.'),failure,allergy,row('alternative','doxycycline','Alergji/intolerancë ndaj penicilinës; jo në shtatzëni.'),pregnancy];
 const throatRows=[row('first','penicillin'),allergy,pregnancy];
 const capRows=[row('first','amoxicillin'),row('alternative','clarithromycin','Alergji ndaj penicilinës ose amoxicillin i papërshtatshëm, përfshirë dyshim për patogjenë atipikë.'),row('alternative','doxycycline','Alergji ndaj penicilinës ose amoxicillin i papërshtatshëm; jo në shtatzëni.'),row('alternative','erythromycin','Alternativë në shtatzëni, sipas vlerësimit klinik.')];
 const profiles=[
  profile('aom-child',['COND-b79e6949387c'],'CHOICE-NG91','Fëmijë / adoleshentë','1 muaj–17 vjeç · otit media akut',[row('first','amoxicillin'),failure,allergy,{...pregnancy,note:'8–17 vjeç, në shtatzëni me alergji ndaj penicilinës.'}],'Jo çdo otit kërkon antibiotik. Për alergji dhe zgjedhje të dytë: konsultë me mikrobiologun.'),
  profile('sinus-adult',['COND-09ff5a5ec8e3'],'CHOICE-NG79','Të rritur','≥18 vjeç · sinusit akut',sinusRows,'Nëse co-amoxiclav është përdorur i pari, ose ka alergji me nevojë për linjë të dytë: konsultë me mikrobiologun.'),
  profile('sinus-child',['COND-09ff5a5ec8e3'],'CHOICE-NG79','Fëmijë / adoleshentë','1 muaj–17 vjeç · sinusit akut',sinusRows.map(r=>r.substanceId===drugs.doxycycline?{...r,note:'Vetëm 12–17 vjeç; alergji/intolerancë ndaj penicilinës; jo në shtatzëni.'}:r.substanceId===drugs.erythromycin?{...r,note:'Vetëm 8–17 vjeç, në shtatzëni me alergji ndaj penicilinës.'}:r),'Për dështim pas co-amoxiclav ose alergji me nevojë për linjë të dytë: mikrobiologu.'),
  profile('throat-adult',['COND-8c37c186481b','COND-272a5b4200f4'],'CHOICE-NG84','Të rritur','≥18 vjeç · faringjit/tonsilit streptokoksik',throatRows,'Vetëm kur antibiotiku indikohet pas vlerësimit klinik.','Burimi nuk cakton antibiotik të dytë rutinë; kërkohet rivlerësim.'),
  profile('throat-child',['COND-8c37c186481b','COND-272a5b4200f4'],'CHOICE-NG84','Fëmijë / adoleshentë','1 muaj–17 vjeç · faringjit/tonsilit streptokoksik',throatRows.map(r=>r.substanceId===drugs.erythromycin?{...r,note:'8–17 vjeç, në shtatzëni me alergji ndaj penicilinës.'}:r),'Vetëm kur antibiotiku indikohet pas vlerësimit klinik.','Burimi nuk cakton antibiotik të dytë rutinë; kërkohet rivlerësim.'),
  profile('cap-adult-low',['COND-63dfd289a42f'],'CHOICE-NG250','Të rritur','≥18 vjeç · pneumoni komunitare me rëndesë të ulët',capRows,'Nuk zbatohet te pneumonia mesatare, e rëndë ose spitalore. Rëndesa dhe rezistenca lokale vlerësohen veçmas.','Burimi nuk jep kalim automatik te një antibiotik i dytë.'),
  profile('cap-child-nonsevere',['COND-63dfd289a42f'],'CHOICE-NG250','Fëmijë / adoleshentë','1 muaj–17 vjeç · pneumoni komunitare jo e rëndë',capRows.map(r=>r.substanceId===drugs.doxycycline?{...r,note:'Vetëm 12–17 vjeç në këtë përmbledhje; vlerësim i veçantë për moshat më të vogla.'}:r.substanceId===drugs.erythromycin?{...r,note:'8–17 vjeç, në shtatzëni, sipas vlerësimit klinik.'}:r),'Nuk zbatohet te pneumonia e rëndë ose spitalore; rëndesa vlerësohet nga klinicisti.','Burimi nuk jep kalim automatik te një antibiotik i dytë.')
 ];
 root.DRX_ANTIBIOTIC_CHOICES={version:'2026-11-02.1',sources:[source('NG91','Otit media akut'),source('NG79','Sinusit akut'),source('NG84','Dhimbje akute fyti'),source('NG250','Pneumoni e fituar në komunitet')],profiles};
})(typeof window==='object'?window:globalThis);
