'use strict';
// Repository-owned clinical corrections. Original Sanity text/status stays intact.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {sourceFingerprint}=require('../lib/prescription-clinical-plan');
const input=process.argv[2];
if(!input)throw Error('Supply the audited published chapters 6–10 snapshot.');
const source=JSON.parse(fs.readFileSync(input,'utf8'));
const byKey=new Map(source.map(g=>[g.chapterNumber+'.'+g.orderInChapter,g]));
if(source.length!==136)throw Error('Expected all 136 source guides');
const result={version:'clinical-6-10-20261020-v1',checkedAt:'2026-10-20',sourceSnapshotSha256:createHash('sha256').update(fs.readFileSync(input)).digest('hex'),guides:{}};
const R={
 cough:'https://www.nice.org.uk/guidance/ng120/chapter/Recommendations',
 cap:'https://www.nice.org.uk/guidance/ng250/resources/pneumonia-diagnosis-and-management-pdf-66144010347205',
 ats:'https://www.idsociety.org/practice-guideline/community-acquired-pneumonia-cap-in-adults',
 hap:'https://www.idsociety.org/practice-guideline/hap_vap/',
 vanco:'https://www.idsociety.org/practice-guideline/vancomycin/',
 enox:'https://www.medicines.org.uk/emc/product/4499/smpc',
 fonda:'https://www.medicines.org.uk/emc/product/3335/smpc',
 gina:'https://ginasthma.org/wp-content/uploads/2026/05/GINA-2026-Strategy-Report-WMS.pdf',
 gold:'https://goldcopd.org/2026-gold-report-and-pocket-guide/',
 htn:'https://www.nice.org.uk/guidance/ng136/chapter/recommendations',
 hf:'https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2024/03/06/19/22/2024-acc-expert-consensus-hfref',
 iva:'https://www.medicines.org.uk/emc/product/101787/smpc',
 tiro:'https://www.medicines.org.uk/emc/product/8842/smpc',
 ie:'https://cpr.heart.org/-/media/Files/Health-Topics/Infective-Endocarditis/Infective-Endocarditis-Wallet-Card.pdf',
 peri:'https://www.escardio.org/static-file/Escardio/Guidelines/Products/Slide%20sets/2025/2025%20official%20slides_MyoPeri.pdf',
 metro:'https://www.gov.uk/drug-safety-update/metoclopramide-risk-of-neurological-adverse-effects',
 dom:'https://www.gov.uk/drug-safety-update/domperidone-for-nausea-and-vomiting-lack-of-efficacy-in-children-reminder-of-contraindications-in-adults-and-adolescents',
 hp:'https://webfiles.gi.org/links/journals/ACG-Hpylori-Guidelines-Highlights-2024-FINAL.pdf',
 talicia:'https://www.accessdata.fda.gov/drugsatfda_docs/label/2022/213004s007lbl.pdf',
 cdi:'https://www.idsociety.org/globalassets/idsa/practice-guidelines/clinical-practice-guidelines-for-clostridium-difficile.pdf',
 asuc:'https://gastro.org/clinical-guidance/management-of-moderate-to-severe-ulcerative-colitis/',
 hav:'https://www.cdc.gov/std/treatment-guidelines/hav.htm',
 hcv:'https://www.hcvguidelines.org/guidance/simplified-hcv-treatment-for-treatment-naive-adults-without-cirrhosis/',
 gt3:'https://www.hcvguidelines.org/guidance/treatment-naive-genotype-3-with-compensated-cirrhosis/',
 pbc:'https://www.aasld.org/sites/default/files/2022-04/PracticeGuidelines-PBC-November2018_1.pdf',
 oca:'https://www.ema.europa.eu/en/medicines/human/referrals/ocaliva',
 nash:'https://pmc.ncbi.nlm.nih.gov/articles/PMC10735173/',
 amoeba:'https://medicalguidelines.msf.org/en/viewport/EssDr/english/metronidazole-oral-16684146.html',
 lactulose:'https://www.medicines.org.uk/emc/product/2796/smpc',
 dka:'https://link.springer.com/article/10.1007/s00125-024-06183-8',
 ckd:'https://kdigo.org/wp-content/uploads/2023/12/KDIGO-2022-Diabetes-Guideline.pdf',
 thyroxine:'https://www.medicines.org.uk/emc/product/12779/smpc',
 adrenal:'https://www.endocrine.org/clinical-practice-guidelines/primary-adrenal-insufficiency',
 keto:'https://www.ema.europa.eu/en/documents/product-information/ketoconazole-esteve-epar-product-information_en.pdf',
};
const clone=x=>JSON.parse(JSON.stringify(x));
const drug=(name,dose,frequency,duration,route='Nga goja',sig='',extra={})=>({kind:'active-substance',title:name,genericName:name,dose,frequency,duration,route,sig,...extra});
const care=(title,sig)=>({kind:'supportive-care',title,sig});
const opt=(label,...items)=>({label,items});
const group=(label,options,condition='')=>({label,options,condition});
const one=(label,item,condition='')=>group(label,[opt('',item)],condition);
const long='Afatgjatë; rivlerësim dhe titrim';
function save(key,groups,notes,refs,explanation,extra={}){
 const g=byKey.get(key);if(!g||result.guides[g._id])throw Error('Missing/duplicate '+key);
 result.guides[g._id]={key,sourceFingerprint:sourceFingerprint(g),status:'ready',groups,notes,
 changes:[{id:'C'+key,title:'Sqarimi i skemës',explanation}],references:[...new Set(refs)].map(k=>({key:k,url:R[k]||k})),
 reviewState:'evidence-reconciled',...extra};
}
function reference(key,notes,refs,explanation,groups=[]){save(key,groups,notes,refs,explanation,{status:'reference'});}
const paracetamol=()=>drug('Paracetamol','500–1000 mg','Çdo 6–8 orë sipas nevojës','Sa më shkurt; rivlerëso','Nga goja','Te i rrituri ≥50 kg pa faktorë rreziku: maksimumi 4 g/24 orë. Kufiri ulet në sëmundje hepatike, peshë të ulët ose faktorë të tjerë rreziku.');
const doxy=(dose='100 mg',frequency='Çdo 12 orë',duration='5 ditë; rivlerëso stabilitetin')=>drug('Doxycycline',dose,frequency,duration,'Nga goja','Jo në shtatzëni; vlerëso kundërindikacionet dhe ndërveprimet.');
const azith=()=>drug('Azithromycin','500 mg ditën 1; pastaj 250 mg','1 herë në ditë','5 ditë gjithsej','Nga goja','Kontrollo QT, elektrolitet dhe ndërveprimet.');
const clarith=()=>drug('Clarithromycin','500 mg','Çdo 12 orë','5 ditë; rivlerëso','Nga goja','Formë me çlirim të menjëhershëm. Kontrollo QT dhe ndërveprimet; përshtat për funksionin renal.');
const coamox=()=>drug('Amoxicillin + Clavulanic acid','875 mg + 125 mg','Çdo 12 orë','5 ditë; rivlerëso','Nga goja','Doza e secilit përbërës shprehet veçmas; përshtat sipas funksionit renal.');
const vanco=()=>drug('Vancomycin','Fillimisht zakonisht 15–20 mg/kg për dozë','Çdo 8–12 orë; përshtat sipas AUC dhe veshkave','Sipas infeksionit dhe përgjigjes','IV me infuzion','Peshë reale dhe funksion renal. Për MRSA të rëndë: objektiv AUC24/MIC 400–600 mg·orë/L kur MIC=1 mg/L, me monitorim të hershëm; jo dozë fikse 500 mg për çdo pacient.');
const linezolid=()=>drug('Linezolid','600 mg','Çdo 12 orë','7 ditë në HAP/VAP; rivlerëso','IV ose nga goja','Kontrollo hemogramën, ndërveprimet serotoninergjike dhe kundërindikacionet.');
const prophylaxis=()=>group('Profilaksia e trombozës',[
 opt('Enoxaparin',drug('Enoxaparin sodium','40 mg = 4000 IU anti-Xa','1 herë në ditë','Zakonisht 6–14 ditë; rivlerëso','Nënlëkurë','CrCl 15–30 mL/min: 20 mg/ditë; në CrCl <15 kërko alternativë. Përshtat për peshë dhe gjakderdhje.')),
 opt('Fondaparinux',drug('Fondaparinux','2,5 mg','1 herë në ditë','Zakonisht 6–14 ditë; rivlerëso','Nënlëkurë','CrCl 20–50 mL/min: 1,5 mg/ditë; mos përdor në CrCl <20. Kujdes në peshë <50 kg.')),
],'Rrezik VTE dhe pa kundërindikacion për profilaksi');
for(const key of ['6.1','6.2'])save(key,[
 one('Kujdesi fillestar',care('Vlerëso shkakun e kollës','Përjashto pneumoninë, sepsisin, përkeqësimin e astmës/COPD dhe shenjat alarmuese. Hidratim dhe pushim. Antibiotikët nuk jepen rutinë për kollë akute virale ose bronkit të pakomplikuar.')),
 one('Ethe / dhimbje',paracetamol(),'Nëse nevojitet'),
 group('Një antibiotik kur ka indikacion',[
 opt('Doxycycline',doxy('200 mg ditën 1; pastaj 100 mg','1 herë në ditë','5 ditë gjithsej')),
 opt('Amoxicillin',drug('Amoxicillin','500 mg','3 herë në ditë','5 ditë')),
 opt('Clarithromycin',drug('Clarithromycin','250–500 mg','2 herë në ditë','5 ditë','Nga goja','Kontrollo QT dhe ndërveprimet.')),
 ],'Gjendje e përgjithshme shumë e rënduar ose rrezik i lartë komplikimesh, pas vlerësimit klinik; jo vetëm sputum me ngjyrë'),
],['I rritur. Në pneumoni përdor skemën e CAP sipas ashpërsisë. Mos cakto mL shurupi pa produktin dhe përqendrimin e saktë.'],['cough'],'Heq antibiotikët e gjerë, antihistaminikët dhe shurupet me përqendrim të panjohur si kombinim automatik.');
save('6.3',[group('CAP e lehtë · zgjidh një',[
 opt('Amoxicillin',drug('Amoxicillin','500 mg','3 herë në ditë','5 ditë; zgjate vetëm nëse jo klinikisht stabil')),
 opt('Në alergji / amoxicillin i papërshtatshëm',doxy('200 mg ditën 1; pastaj 100 mg','1 herë në ditë','5 ditë gjithsej')),
 opt('Clarithromycin',clarith()),
])],['I rritur me ashpërsi të ulët. CURB-65 ndihmon vlerësimin; nuk zëvendëson gjykimin klinik. CURB-65 ≥2, hipoksemia ose paqëndrueshmëria kërkojnë vlerësim spitalor.'],['cap'],'Korrigjon doxycycline 200 mg BD; ndan CAP të lehtë nga rastet që kërkojnë spital.');
save('6.4',[group('Një antibiotik oral',[
 opt('Amoxicillin',drug('Amoxicillin','1 g','Çdo 8 orë','Të paktën 5 ditë dhe deri në stabilitet klinik')),
 opt('Doxycycline',doxy()),
 opt('Azithromycin · vetëm kur rezistenca lokale e pneumokokut është <25%',azith()),
 opt('Clarithromycin · vetëm kur rezistenca lokale e pneumokokut është <25%',clarith()),
])],['I rritur pa komorbiditete dhe pa rrezik MRSA/Pseudomonas. Nuk kombinohen alternativat; rivlerëso në përkeqësim ose mungesë përmirësimi.'],['ats'],'Përcakton dozat, kufizon monoterapinë me makrolid dhe shton kohëzgjatjen/stabilitetin.');
const beta=[coamox(),drug('Cefuroxime axetil','500 mg','Çdo 12 orë','5 ditë; rivlerëso'),drug('Cefpodoxime','200 mg','Çdo 12 orë','5 ditë; rivlerëso')];
const partners=[doxy(),azith(),clarith()];
save('6.5',[group('Një regjim i plotë',[
 ...beta.flatMap(b=>partners.map(p=>opt(b.genericName+' EDHE '+p.genericName,clone(b),clone(p)))),
 opt('Levofloxacin · kur alternativat janë të papërshtatshme',drug('Levofloxacin','750 mg','1 herë në ditë','5 ditë; rivlerëso','Nga goja','Përshtat sipas CrCl. Vlerëso dëmtimin e tendinave/nervave, QT dhe kundërindikacionet.')),
 opt('Moxifloxacin · kur alternativat janë të papërshtatshme',drug('Moxifloxacin','400 mg','1 herë në ditë','Të paktën 5 ditë dhe deri në stabilitet','Nga goja','Kontrollo QT dhe kundërindikacionet e fluorokinoloneve.')),
])],['I rritur me komorbiditete, pa tregues të veçantë për MRSA/Pseudomonas. Beta-laktami EDHE një partner janë një regjim; fluorokinoloni përdoret si alternativë e veçantë. Jo të dyja rrugët bashkë.'],['ats'],'Korrigjon cefuroxime 250/500 mg dhe pengon shtimin e makrolidit/doxycycline mbi monoterapinë fluorokinolon.');
save('6.6',[
 group('Një kombinim për CAP të shtruar',[
 opt('Ceftriaxone EDHE Azithromycin',drug('Ceftriaxone','1–2 g','Çdo 24 orë','Të paktën 5 ditë; deri në stabilitet','IV'),drug('Azithromycin','500 mg','Çdo 24 orë','Sipas përgjigjes dhe kohëzgjatjes totale','IV ose nga goja')),
 opt('Ampicillin/sulbactam EDHE Azithromycin',drug('Ampicillin + Sulbactam','1,5–3 g gjithsej','Çdo 6 orë','Të paktën 5 ditë; deri në stabilitet','IV'),drug('Azithromycin','500 mg','Çdo 24 orë','Sipas përgjigjes dhe kohëzgjatjes totale','IV ose nga goja')),
 ]),
 prophylaxis(),
 one('Monitorim dhe mbështetje',care('Oksigjen, lëngje dhe rivlerësim','Titro oksigjenin sipas hipoksemisë dhe rrezikut të hiperkapnisë. Lëngjet sipas perfuzionit dhe mbingarkesës. Rivlerëso antibiotikun IV pas 48 orësh dhe kalo në oral kur mundet.')),
],['Kërkon monitorim spitalor dhe përshtatje renale. Në rrezik MRSA/Pseudomonas zgjidh mbulim të posaçëm me mikrobiologjinë; mos shto një beta-laktam të dytë automatikisht. Kortikosteroidi nuk është shtesë universale; vlerëso veçmas CAP të rëndë.'],['ats','cap','enox','fonda'],'Kombinime të plota, profilaksi e ndarë nga trajtimi VTE; heq omeprazole/steroid/shurupe si shtesa universale.');
for(const key of ['6.7','6.8'])save(key,[
 group('Një antibiotik bazë sipas antibiogramit lokal',[
 opt('Piperacillin/tazobactam',drug('Piperacillin + Tazobactam','4 g + 0,5 g','Çdo 6 orë','Zakonisht 7 ditë; rivlerëso','IV','Përshtat për veshkat dhe protokollin e infuzionit.')),
 opt('Cefepime',drug('Cefepime','2 g','Çdo 8 orë','Zakonisht 7 ditë; rivlerëso','IV','Përshtat për funksionin renal; rrezik neurotoksiciteti.')),
 opt('Meropenem',drug('Meropenem','1 g','Çdo 8 orë','Zakonisht 7 ditë; rivlerëso','IV','Përdor sipas rrezikut të rezistencës dhe kulturave; përshtat për veshkat.')),
 ]),
 group('Shto një agjent kundër MRSA',[opt('Linezolid',linezolid()),opt('Vancomycin',vanco())],'Rrezik MRSA, prevalencë lokale e lartë/e panjohur ose rrezik i lartë vdekshmërie'),
 prophylaxis(),
],['I rritur; menaxhim spitalor. Kulturat dhe antibiogrami lokal drejtojnë zgjedhjen dhe de-eskalimin. Në shok/rrezik të lartë rezistence mund të duhet agjent i dytë antipseudomonal nga klasë tjetër; ky rast kërkon plan specialistik, jo kopjim të kësaj monoterapie.'],['hap','vanco','enox','fonda'],'Korrigjon njësitë e vancomycin, kohëzgjatjen dhe profilaksinë VTE. MRSA është shtesë me indikacion.');
save('6.13',[group('Trajtimi fillestar · zgjidh një',[
 opt('Co-amoxiclav',drug('Amoxicillin + Clavulanic acid','1 g + 200 mg','Çdo 8 orë','Zakonisht 4–6 javë gjithsej; rivlerëso sipas përgjigjes','IV fillimisht','Përshtat për veshkat. Kalo në oral kur pacienti është stabil, sipas kulturave dhe specialistit.')),
]),group('Mbulim MRSA',[opt('Linezolid',drug('Linezolid','600 mg','Çdo 12 orë','Sipas përgjigjes dhe specialistit','IV ose nga goja')),opt('Vancomycin',vanco())],'Dyshim ose konfirmim MRSA')],['Kultura, përshtatje renale dhe vlerësim për drenazh kur abscesi është i komplikuar ose nuk përgjigjet. Kohëzgjatja nuk është automatikisht 3 javë për të gjithë.'],['https://www.northernlincolnshireapc.nhs.uk/wp-content/uploads/2022/06/Antibiotic-Formulary-Prescribing-Advice-Adult-V9.1.pdf','vanco'],'Heq metronidazole si shtesë të detyrueshme mbi beta-laktam me mbulim anaerob dhe dozën fikse të vancomycin.');
// AIR/MART options are mutually exclusive treatment levels, not cumulative steps.
save('6.16',[group('Zgjidh nivelin aktual të kontrollit',[
 opt('Hapi 1–2 · vetëm sipas nevojës',drug('Budesonide + Formoterol','1 inhalim: 200/6 mikrogram dozë e matur (160/4,5 e dhënë)','Sipas nevojës','Afatgjatë; rivlerëso','Inhalacion','Maksimumi 12 inhalime gjithsej/24 orë; në nevojë për më shumë kërko ndihmë mjekësore po atë ditë.')),
 opt('Hapi 3 · mirëmbajtje EDHE lehtësim',drug('Budesonide + Formoterol','1 inhalim: 200/6 mikrogram dozë e matur (160/4,5 e dhënë)','2 herë në ditë EDHE 1 inhalim sipas nevojës','Afatgjatë; rivlerëso','Inhalacion','Maksimumi 12 inhalime gjithsej/24 orë, përfshirë mirëmbajtjen.')),
 opt('Hapi 4 · mirëmbajtje EDHE lehtësim',drug('Budesonide + Formoterol','2 inhalime nga 200/6 mikrogram dozë e matur','2 herë në ditë EDHE 1 inhalim të të njëjtës fortësi sipas nevojës','Afatgjatë; rivlerëso','Inhalacion','Maksimumi 12 inhalime gjithsej/24 orë. Fortësia 400/12 nuk përdoret si inhalator lehtësues.')),
])],['Për moshë ≥12 vjeç dhe pajisjen përkatëse. Kontrollo teknikën, aderencën dhe diagnozën para eskalimit. Astma e rëndë kërkon fenotipizim; biologjikët dhe kortikosteroidet orale nuk shtohen të gjitha bashkë.'],['gina'],'Korrigjon emrin e kombinimit, ndan nivelet si OSE, ruan mirëmbajtje EDHE reliever dhe pengon 400/12 si reliever.');
for(const key of ['6.17','6.18','6.19'])reference(key,[
 'Përcakto nëse ka përkeqësim akut apo mungesë kontrolli afatgjatë. Për kontroll përdor planin me kortikosteroid inhalator; salbutamol vetëm nuk është trajtim i mjaftueshëm afatgjatë.',
 'Në përkeqësim të rëndë kërko vlerësim urgjent. Mos nebulizo kombinim me përqendrim të paidentifikuar dhe mos shto antibiotik ose shurup me theophylline vetëm për kollë.',
],['gina'],'Skema përzien nivele trajtimi dhe produkte pa përqendrim. Nuk është regjim i vetëm i sigurt për kopjim.');
for(const key of ['6.20','6.21'])reference(key,[
 'Zgjedhja e mirëmbajtjes bazohet te simptomat dhe përkeqësimet; LABA/LAMA dhe shtimi i ICS varen nga indikacioni, eozinofilet dhe bashkëshoqërimi me astmë.',
 'Për nebulizim përdor vetëm formulim të destinuar për inhalacion. Qesja orale e acetylcysteine nuk përgatitet për nebulizator.',
 'Oksigjeni afatgjatë kërkon konfirmim të hipoksemisë në gjendje stabile. Vaksinimi individualizohet sipas moshës, historisë dhe disponueshmërisë lokale.',
],['gold'],'Heq klasifikimin e vjetër A–D si algoritëm aktual dhe ndalon nebulizimin e qeseve orale.');

save('6.9',[one('Trajtimi i zgjedhur',doxy('100 mg','Çdo 12 orë','Vazhdo të paktën 10–14 ditë pas zhdukjes së etheve'))],['I rritur me psittacosis. Në sëmundje të rëndë ose kundërindikacion kërko specialist; makrolidet nuk janë alternativa automatikisht ekuivalente.'],['https://www.cdc.gov/psittacosis/hcp/clinical-overview/','https://www.cdc.gov/mmwr/preview/mmwrhtml/rr4908a1.htm'],'Parapëlqen doxycycline dhe sqaron pikën nga e cila numërohet kohëzgjatja.');
save('6.10',[group('Një antibiotik për Mycoplasma',[
 opt('Doxycycline',doxy('100 mg','Çdo 12 orë','Të paktën 5 ditë; sipas stabilitetit dhe përgjigjes')),
 opt('Azithromycin',azith()),
])],['I rritur. Përshtat sipas përgjigjes, rezistencës dhe ashpërsisë; në përkeqësim kërko rivlerësim. Beta-laktamët nuk veprojnë ndaj Mycoplasma.'],['ats','https://www.cdc.gov/mycoplasma/hcp/clinical-care/index.html'],'Përcakton regjimin e azithromycin dhe ndan alternativat nga kujdesi simptomatik.');
reference('6.11',['Legionella kërkon antibiotik aktiv sipas ashpërsisë, imunitetit dhe përgjigjes. Mos shto rifampicin automatikisht në dështim trajtimi; rivlerëso diagnozën, komplikimet dhe ndërveprimet.'],['https://www.cdc.gov/legionella/hcp/clinical-guidance/index.html','ats'],'Kohëzgjatja dhe kombinimet nuk janë të njëjta për të gjithë pacientët.');
reference('6.12',['Konfirmo MSSA ose MRSA dhe përdor skemë të synuar. Zgjedhja, rruga dhe kohëzgjatja varen nga bakteremia, nekroza, empiema dhe përgjigjja; nuk ka dozë të plotë në këtë udhëzim.'],['ats','vanco'],'Referimi te CAP/HAP nuk është regjim i plotë stafilokoksik.');
for(const key of ['6.14','6.15'])reference(key,['Trajtimi i tuberkulozit aktiv kërkon konfirmim të ndjeshmërisë, peshë aktuale dhe programin e TB. Faza intensive dhe ajo e vazhdimit janë faza në rend, jo barna që shtohen pa ndërprerje.','Kombinimi fiks dozohet sipas brezit të peshës dhe fortësisë së produktit; “3–4 tableta” nuk është dozë universale.'],['https://www.who.int/publications/i/item/9789240107243'],'Përjashton kopjimin e një numri fiks tabletash pa peshë/ndjeshmëri.');
reference('6.22',['Përcakto shkakun e efuzionit. Empiema kërkon antibiotikë DHE vlerësim për drenazh; diuretiku nuk zëvendëson drenazhin e infeksionit pleural.','Mbulimi i fituar në komunitet dhe ai spitalor janë alternativa sipas origjinës, jo dy skema për t’u marrë bashkë.'],['https://www.brit-thoracic.org.uk/clinical-resources/guidelines/pleural-disease/'],'Ndan diagnozat dhe kombinimet; nuk zgjedh dozë fikse vancomycin ose kurs universal pa kontekst.');
reference('6.23',['Jo çdo sarcoidozë kërkon trajtim. Vendimi varet nga organi i rrezikuar dhe ndikimi funksional; kontrollo diagnozën dhe infeksionet para imunosupresionit.','Methotrexate merret vetëm një herë në JAVË; kërkon hemogramë, funksion hepatik/renal dhe plan monitorimi. Nuk është dozë ditore.'],['https://publications.ersnet.org/lookup/doi/10.1183/13993003.04079-2020'],'Përjashton një regjim imunosupresiv universal dhe thekson javore kundrejt ditore.');
save('6.24',[group('Një antibiotik oral, sipas kulturës',[
 opt('Amoxicillin',drug('Amoxicillin','500 mg','3 herë në ditë','7–14 ditë; sipas ashpërsisë dhe përgjigjes')),
 opt('Doxycycline',doxy('200 mg ditën 1; pastaj 100 mg','1 herë në ditë','7–14 ditë gjithsej')),
 opt('Clarithromycin',drug('Clarithromycin','500 mg','2 herë në ditë','7–14 ditë')),
])],['I rritur. Merr kulturë sputumi dhe përdor ndjeshmërinë e mëparshme kur është e mundur. Pseudomonas, sëmundja e rëndë ose dështimi i trajtimit kërkojnë regjim tjetër specialistik.'],['https://www.nice.org.uk/guidance/ng117/chapter/Recommendations'],'Nuk përdor fluorokinolon si zgjedhje të përgjithshme pa kulturë; përcakton kursin.');
reference('6.25',['Pastrimi i rrugëve të frymëmarrjes dhe trajtimi mukoaktiv individualizohen. Antibiotik afatgjatë vetëm pas vlerësimit respirator, kulturave përfshirë NTM, QT, dëgjimit dhe ndërveprimeve.','Mos përdor macrolide si monoterapi kur dyshohet NTM. Tobramycin/gentamicin inhalatorë kërkojnë formulimin dhe planin specialistik; nuk zëvendësohen me ampulë të zakonshme.'],['https://www.brit-thoracic.org.uk/document-library/guidelines/bronchiectasis/bts-guideline-for-bronchiectasis-in-adults/'],'Heq zgjedhjen e lirë ndërmjet trajtimit të NTM dhe profilaksisë afatgjatë.');

const htnNotes=['Konfirmo tensionin me matje jashtë klinikës dhe vlerëso rrezikun, moshën, diabetin, origjinën etnike, shtatzëninë dhe frailty. ACEI dhe ARB nuk merren bashkë. Kontrollo kreatininën dhe K⁺ para/pas fillimit ose rritjes.'];
save('7.1',[group('Një ACEI ose ARB sipas përshtatshmërisë',[
 opt('Lisinopril',drug('Lisinopril','Fillimisht 10 mg','1 herë në ditë',long,'Nga goja','Dozë më e ulët në hipovolemi ose dëmtim renal; titro sipas tensionit.')),
 opt('Enalapril',drug('Enalapril','Fillimisht 5 mg','1 herë në ditë',long)),
 opt('Losartan · në intolerancë ndaj ACEI',drug('Losartan','Fillimisht 50 mg','1 herë në ditë',long)),
])],[...htnNotes,'Pragu i NICE është <55 vjeç, jo ≤55. Në moshën 55 vjeç pa diabet tip 2 zakonisht zgjidhet CCB. ACEI/ARB kundërindikohen në shtatzëni.'],['htn','https://www.medicines.org.uk/emc/product/10809/smpc','https://www.medicines.org.uk/emc/product/15635/smpc'],'Korrigjon pragun e moshës, dozën fillestare dhe heq captopril 450 mg/ditë si maksimum të përgjithshëm.');
save('7.2',[one('CCB kur është i përshtatshëm',drug('Amlodipine','Fillimisht 5 mg','1 herë në ditë',long,'Nga goja','Titro deri 10 mg/ditë sipas tensionit/tolerancës; ulje individuale e fillimit në pacient të brishtë.'))],[...htnNotes,'Moshë ≥55 vjeç pa diabet tip 2, ose indikacion tjetër për CCB. Në intolerancë mund të zgjidhet diuretik i tipit thiazide me monitorim.'],['htn','https://www.medicines.org.uk/emc/product/4718/smpc'],'Përcakton pragun ≥55 dhe shmang grumbullimin automatik të linjave të trajtimit.');
reference('7.3',['Në moskontroll me një bar, kontrollo aderencën dhe shto klasë tjetër: ACEI OSE ARB, EDHE CCB ose diuretik i tipit thiazide.','Kombinimi fiks zëvendëson komponentët ekuivalentë; nuk shtohet mbi të njëjtat substanca ekzistuese. Doza përcaktohet nga dozat aktuale dhe funksioni renal.'],['htn'],'Nuk nis kombinime fikse me doza të rastësishme; korrigjon emrat e përbërësve të cunguar dhe rendin e perindopril/amlodipine.');
reference('7.4',['Trajtimi me tre klasa është ACEI OSE ARB, EDHE CCB, EDHE diuretik i tipit thiazide.','Perindopril/indapamide/amlodipine nuk ka dozë 20/5/12,5 mg. Fortësia dhe doza e kombinimit duhet të përputhen me komponentët aktualë; titrimi bëhet individualisht.'],['htn','https://www.hpra.ie/img/uploaded/swedocuments/Public_AR_PA1347-112-001_10052024151316.pdf'],'Korrigjon dozat e kopjuara nga olmesartan në kombinimin me perindopril; nuk shpik ekuivalencë kripërash.');
reference('7.5',['Konfirmo hipertension rezistent me matje jashtë klinikës, aderencë dhe doza të toleruara të tre klasave, përfshirë diuretik.','Në K⁺ ≤4,5 mmol/L mund të konsiderohet spironolactone me dozë të ulët dhe monitorim renal/elektrolitik; për K⁺ më të lartë ose CKD kërko alternativë specialistike.'],['htn'],'Rikthen rolin e spironolactone dhe monitorimit në hapin 4; nuk zgjedh shtesë vetëm nga lista e klasave.');
reference('7.6',['Trajto komorbiditetin me udhëzimin përkatës. Stroke akut, hemorragji intracerebrale, CKD dhe insuficiencë kardiake kanë objektiva dhe kundërindikacione të ndryshme.','Në HFrEF përdor vetëm NJË nga ARNI, ACEI ose ARB; beta-bllokuesi, MRA dhe SGLT2 janë klasa të tjera. Mos bashko ACEI me ARNI/ARB.'],['htn','hf','ckd'],'Tabela e komorbiditeteve nuk duhet të kthehet në një recetë të vetme me të gjitha klasat.');
reference('7.7',['Plani pas infarktit kërkon aspirinën dhe NJË P2Y12 kur indikohet, statinë me intensitet të lartë dhe barna të tjera sipas LVEF, tensionit e tolerancës.','Kohëzgjatja e DAPT përshtatet për gjakderdhjen dhe rrezikun ishemik; nuk është “të paktën 12 muaj” për të gjithë. Prasugrel kërkon strategji PCI dhe është i kundërindikuar pas stroke/TIA.','Dozat ngarkuese të fazës akute nuk përsëriten në çdo recetë mirëmbajtëse. Valsartan 160 mg BD është dozë objektiv, jo dozë fillimi universale.'],['https://doi.org/10.1016/j.jacc.2024.11.009'],'Ndan fazën akute nga mirëmbajtja, eliminon ngarkesën dhe kohëzgjatjen universale.');
for(const key of ['7.8','7.9'])reference(key,['Zgjidh një strategji antianginoze sipas pulsit, tensionit, ritmit dhe funksionit ventrikular. Verapamil/diltiazem nuk kombinohen rutinë me beta-bllokues; ivabradine nuk kombinohet me verapamil/diltiazem.','Nitrati për krizën dhe trajtimi i mirëmbajtjes janë të ndryshëm. Nitrati kundërindikohet me inhibitor PDE5 dhe hipotension. Dhimbja e re/persistente kërkon rrugën urgjente të ACS.','Ranolazine ka doza maksimale të ndryshme sipas produktit/juridiksionit; përdor SmPC të produktit konkret.'],['https://www.nice.org.uk/guidance/cg126/chapter/Recommendations','iva'],'Përjashton kombinime të papërshtatshme dhe maksimumin universal 1000 mg BD të ranolazine.');
reference('7.10',['ACS kërkon shërbim urgjent dhe plan antitrombotik sipas strategjisë invazive e rrezikut të gjakderdhjes. Prasugrel nuk jepet automatikisht para njohjes së anatomisë koronare.','Tirofiban nuk është shtesë rutinë për çdo NSTEMI. Për regjimin PCI të SmPC: bolus 25 mikrogram/kg gjatë 3 minutave, pastaj 0,15 mikrogram/kg/min; CrCl <30 mL/min kërkon ulje 50% sipas këtij produkti. Zgjedhja/durimi i infuzionit bëhen nga ekipi PCI.','Enoxaparin në trajtimin e NSTEMI: 1 mg/kg SC çdo 12 orë; CrCl 15–30 mL/min: çdo 24 orë. Kjo nuk është dozë profilaksie.'],['tiro','enox','https://doi.org/10.1016/j.jacc.2024.11.009'],'Korrigjon gabimin 100-fish të bolusit dhe dallon antikoagulimin terapeutik nga profilaksia; kërkohet plan akut individual.');
const hfBeta=()=>group('Një beta-bllokues, pasi pacienti është stabil',[
 opt('Bisoprolol',drug('Bisoprolol','Fillimisht 1,25 mg','1 herë në ditë',long,'Nga goja','Titro gradualisht drejt 10 mg/ditë sipas pulsit, tensionit dhe tolerancës.')),
 opt('Carvedilol',drug('Carvedilol','Fillimisht 3,125 mg','2 herë në ditë',long,'Nga goja','Titro gradualisht zakonisht drejt 25 mg BD; përshtat për peshë/tolerancë.')),
 opt('Metoprolol succinate me çlirim të zgjatur',drug('Metoprolol succinate','Fillimisht 12,5–25 mg','1 herë në ditë',long,'Nga goja','Titro gradualisht drejt 200 mg/ditë; jo zëvendësim automatik me tartrate.')),
]);
save('7.12',[
 group('NJË trajtim i sistemit reninë–angiotensinë',[
 opt('Sacubitril/valsartan',drug('Sacubitril + Valsartan','Fillimisht 24/26 mg ose 49/51 mg, sipas profilit','2 herë në ditë',long,'Nga goja','Titro drejt 97/103 mg BD. Mos merr ACEI për 36 orë para/pas ARNI; jo bashkë me ARB tjetër, në shtatzëni ose histori të përshtatshme angioedeme.')),
 opt('Enalapril · kur ARNI nuk është i përshtatshëm',drug('Enalapril','Fillimisht 2,5 mg','2 herë në ditë',long,'Nga goja','Titro drejt 10–20 mg BD sipas tolerancës; kontrollo K⁺ dhe veshkat.')),
 opt('Candesartan · kur ARNI/ACEI nuk janë të përshtatshëm',drug('Candesartan','Fillimisht 4–8 mg','1 herë në ditë',long,'Nga goja','Titro drejt 32 mg/ditë.')),
 ]),
 hfBeta(),
 one('MRA',drug('Spironolactone','Fillimisht 12,5–25 mg','1 herë në ditë',long,'Nga goja','Për fillim zakonisht eGFR >30 dhe K⁺ <5,0 mmol/L; monitoro pas fillimit/rritjes dhe titro sipas tolerancës.')),
 group('NJË SGLT2',[
 opt('Dapagliflozin',drug('Dapagliflozin','10 mg','1 herë në ditë',long,'Nga goja','Kontrollo funksionin renal, gjendjen volemike dhe rrezikun e ketoacidozës; ndalo përkohësisht në sëmundje akute/agjërim sipas protokollit.')),
 opt('Empagliflozin',drug('Empagliflozin','10 mg','1 herë në ditë',long,'Nga goja','Kontrollo funksionin renal, gjendjen volemike dhe rrezikun e ketoacidozës.')),
 ]),
 one('Ivabradine',drug('Ivabradine','Fillimisht 5 mg','2 herë në ditë me ushqim',long,'Nga goja','Moshë ≥75 vjeç: konsidero 2,5 mg BD. Pas 2 javësh titro sipas pulsit; maksimumi 7,5 mg BD. Në puls persistent <50/min ose simptoma redukto/ndalo. Jo me verapamil/diltiazem.'),'HFrEF stabil simptomatik, ritëm sinus, HR ≥75/min sipas SmPC; beta-bllokues në dozën maksimale të toleruar ose kundërindikuar'),
],['HFrEF kronik stabil te i rrituri. Katër klasat bazë individualizohen sipas kundërindikacioneve; ky nuk është regjim për shok ose dekompensim akut. Diuretiku për kongjestion titrohet veçmas sipas gjendjes volemike.'],['hf','iva'],'Ndan katër shtyllat e trajtimit, përjashton ACEI/ARB/ARNI të dyfishtë dhe korrigjon ivabradine OD në BD.');
reference('7.13',['HFpEF nuk trajtohet automatikisht me të gjithë beta-bllokuesit e HFrEF. SGLT2 dhe diuretikët për kongjestion zgjidhen sipas përshtatshmërisë; trajto komorbiditetet.','Oksigjeni jepet për hipoksemi; “100% oksigjen” nuk është udhëzim i përgjithshëm për çdo pacient.'],['https://doi.org/10.1016/j.jacc.2026.06.018','hf'],'Ndan HFpEF nga HFrEF dhe shmang doza të larta IV/oksigjen universal.');
reference('7.15',['Hipoperfuzioni/shoku kërkon ICU, monitorim hemodinamik dhe titrim me pompë. Nuk kombinohen të gjitha inotropet; dobutamine si shtesë nuk dyfishohet në dy hapa.','Trajtimi i endokarditit dhe profilaksia dentare janë indikacione të tjera; nuk shtohen në skemën e shokut kardiak. Clindamycin nuk rekomandohet më për profilaksi dentare.','Kur profilaksia dentare indikohet te pacienti kardiak me rrezik të lartë: amoxicillin 2 g nga goja, një dozë 30–60 minuta para procedurës. Në alergji zgjidh alternativë sipas tipit të reaksionit; mos përdor cefalosporinë pas anafilaksisë/angioedemës/urtikaries nga penicilina.'],['ie','hf'],'Ndan tre rrugë klinike të importuara në një udhëzim; nuk lejon recetë që bashkon shokun, endokarditin dhe profilaksinë.');
save('7.17',[group('NJË anti-inflamator',[
 opt('Ibuprofen',drug('Ibuprofen','600–800 mg','3 herë në ditë','Zakonisht 1–2 javë; pastaj ulje sipas simptomave/CRP')),
 opt('Aspirin · veçanërisht pas infarktit',drug('Aspirin','750–1000 mg','3 herë në ditë','Zakonisht 1–2 javë; pastaj ulje sipas simptomave/CRP')),
]),one('Colchicine EDHE anti-inflamatori',drug('Colchicine','0,5 mg për dozë','1 herë në ditë në peshë <70 kg; 2 herë në ditë në ≥70 kg','3 muaj për episodin e parë','Nga goja','Ul/përshtat sipas funksionit renal/hepatik dhe ndërveprimeve; shmang kombinimet me inhibitorë të fuqishëm CYP3A4/P-gp kur kundërindikohen.')),one('Gastroproteksion',drug('Pantoprazole','40 mg','1 herë në ditë','Gjatë kursit me aspirin/NSAID'))],['Për perikardit akut të pakomplikuar te i rrituri, pas përjashtimit të shkaqeve specifike. Tamponada, ethet e larta, imunosupresioni ose mioperikarditi kërkojnë vlerësim specialistik.'],['peri'],'Heq indomethacin 100 mg TDS; përcakton anti-inflamator OSE alternativë dhe colchicine EDHE me dozë sipas peshës.');


require('./prescription-clinical-revisions-6-10-gastro')({save,reference,drug,care,opt,group,one,R});
require('./prescription-clinical-revisions-6-10-hep-endo')({save,reference,drug,care,opt,group,one,R,clone,long});

require('./prescription-clinical-revisions-6-10-additional')({save,reference,drug,care,opt,group,one,long});
const titles={
 '6.16':'Astmë bronkiale · kontrolli me Budesonide/Formoterol',
 '7.1':'Hipertension · pacientë <55 vjeç',
 '7.2':'Hipertension · pacientë ≥55 vjeç',
 '9.5':'Hepatit C · trajtim i thjeshtuar pa cirrozë',
 '9.6':'Hepatit C · regjime pangenotipike pa cirrozë',
 '9.14':'PBC · pruritus kolestatik',
 '10.32':'Pas Cushing · zëvendësimi oral i kortizolit',
};
for(const revision of Object.values(result.guides)){
 if(titles[revision.key])revision.title=titles[revision.key];
 revision.groups.forEach((g,gi)=>{
  g.id='g'+(gi+1);
  if(!g.options.length)throw Error('Empty group '+revision.key);
  g.options.forEach((o,oi)=>{
   o.id='o'+(oi+1);if(!o.items.length)throw Error('Empty option '+revision.key);
   o.items.forEach((item,ii)=>{
    item.id='i'+(ii+1);
    if(revision.status==='ready'&&item.kind==='active-substance'){
     for(const field of ['genericName','dose','frequency','duration','route'])if(!item[field])throw Error(revision.key+' missing '+field);
    }
   });
  });
 });
 if(!revision.references.length)throw Error('Missing references '+revision.key);
}
result.coverage=source.map(g=>({key:g.chapterNumber+'.'+g.orderInChapter,id:g._id,sourceFingerprint:sourceFingerprint(g),
 disposition:result.guides[g._id]?.status||'original-retained',sourceRevision:g._rev}));
fs.writeFileSync(path.resolve(__dirname,'../data/recetat-clinical-revisions-6-10.json'),JSON.stringify(result,null,2)+'\n');
const counts=Object.values(result.guides).reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});
console.log(JSON.stringify({reviewedSourceGuides:source.length,revisions:Object.keys(result.guides).length,...counts,originalRetained:136-Object.keys(result.guides).length}));
