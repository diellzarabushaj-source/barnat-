(() => {
  'use strict';

  window.DRX_ANTIBIOTIC_GUIDE = Object.freeze({
    version:'2026-09-19-v7-phase2-regimen-engine',
    scope:'paediatric-outpatient',
    sources:[
      {
        id:'cm2026',
        short:'Children’s Mercy 2026',
        title:'Outpatient Antimicrobial Handbook v9.3',
        date:'2026-05',
        url:'https://www.childrensmercy.org/siteassets/media-documents-for-depts-section/documents-for-health-care-providers/evidence-based-practice/clinical-practice-guidelines--care-process-models/outpatient-antibiotic-handbook.pdf',
        note:'Burim operacional pediatrik ambulant. Doza, maksimumi dhe kohëzgjatja ruhen sipas skemës së cituar; alternativa me cefalosporina varen nga profili i alergjisë dhe nga diagnoza.'
      },
      {
        id:'cdc-gas',
        short:'CDC GAS',
        title:'Clinical Guidance for Group A Streptococcal Pharyngitis',
        date:'current',
        url:'https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html',
        note:'Burimi primar për faringjitin GAS në DRx. Në alergji të menjëhershme ndaj penicilinës shmangen cephalexin/cefadroxil; rezistenca ndaj makrolideve dhe clindamycin ndryshon sipas zonës.'
      },
      {
        id:'cps-uti-2026',
        short:'CPS UTI 2026',
        title:'Optimizing management of urinary tract infections in children: A need for improved stewardship',
        date:'2026-08-25',
        url:'https://cps.ca/en/documents/position/management-urinary-tract-infections',
        note:'Burimi primar për UTI. Urinokultura merret para antibiotikut kur është e mundur; zgjedhja empirike duhet të marrë parasysh kulturat paraprake dhe rezistencën lokale. DRx nuk shpik maksimum kur CPS nuk e jep.'
      },
      {
        id:'cps-ssti-2026',
        short:'CPS SSTI 2026',
        title:'Skin and soft tissue infections in children and youth',
        date:'2026-05-26',
        url:'https://cps.ca/en/documents/position/skin-and-soft-tissue-infections',
        note:'Përdoret për stewardship, source control dhe kontekst MRSA te infeksionet e lëkurës; zgjedhja duhet përshtatur me antibiogramën pediatrike lokale.'
      },
      {
        id:'cps-preseptal-2026',
        short:'CPS Preseptal 2026',
        title:'Preseptal and orbital cellulitis',
        date:'2026-03-03',
        url:'https://cps.ca/en/documents/position/preseptal-orbital-cellulitis',
        note:'Burim për kufirin ambulant dhe red flags. Dyshimi për përfshirje orbitale nuk trajtohet si kalkulator i thjeshtë ambulant.'
      },
      {
        id:'chop-allergy-2025',
        short:'CHOP Allergy 2025',
        title:'Penicillin Drug Allergy Clinical Pathway',
        date:'2025-11',
        url:'https://www.chop.edu/clinical-pathway/penicillin-drug-allergy-clinical-pathway',
        note:'Përdoret për klasifikimin e rrezikut të alergjisë. Reaksionet e rënda të vonshme/SCAR trajtohen si safety stop për beta-laktamet.'
      },
      {
        id:'carpa',
        short:'CARPA STM / WBM',
        title:'CARPA STM and WBM Antibiotic Doses Table (1)',
        date:'reference',
        note:'Peshat sipas moshës janë vetëm referuese. Pesha reale ka përparësi për llogaritjen e dozës.'
      }
    ],
    allergyBuckets:[
      { id:'none', short:'Pa alergji', label:'Pa alergji ndaj beta-laktameve', note:'Përdor skemën e parë kur nuk ka kundërindikacion tjetër.' },
      { id:'a0', short:'Jo alergji e vërtetë', label:'A0 · Histori jo konsistente me alergji', note:'P.sh. histori familjare, intolerancë gastrointestinale ose simptomë jo-imune. Skema e parë mund të mbetet e përshtatshme; konsidero de-labeling kur është e sigurt.' },
      { id:'a1', short:'Rash i vonshëm', label:'A1 · Reaksion i vonshëm me rrezik të ulët', note:'Rash beninj/urtikarie e vonshme pa shenja të SCAR. Cefalosporinat e përshtatshme mund të përdoren sipas diagnozës.' },
      { id:'a2', short:'IgE / anafilaksi', label:'A2 · Reaksion i menjëhershëm / IgE me rrezik të lartë', note:'Anafilaksi, angioedemë, urtikarie e shpejtë ose nevojë për epinefrinë. Zgjidh vetëm alternativën e verifikuar për diagnozën; te GAS mos përdor cephalexin/cefadroxil.' },
      { id:'a3', short:'SCAR / sistemik', label:'A3 · Reaksion i rëndë i vonshëm / SCAR', note:'SJS/TEN, DRESS, flluska, përfshirje mukozale ose dëmtim organi. Shmang beta-laktamet dhe përdor vetëm alternativë jo-beta-laktam të verifikuar / specialist.' },
      { id:'a4', short:'Alergji cefalosporinë', label:'A4 · Alergji ndaj cefalosporinës', note:'Vlerëso veçmas nga alergjia ndaj penicilinës. Penicilina mund të jetë e përdorshme kur nuk ka alergji ndaj saj dhe nuk ka problem side-chain.' },
      { id:'a5', short:'Alergji të shumëfishta', label:'A5 · Alergji ndaj alternativës / alergji të shumëfishta', note:'Mos bëj zëvendësim automatik. Duhet ditur klasa konkrete (clindamycin, macrolide, TMP-SMX etj.) dhe të zgjidhet vetëm regjim i verifikuar për të njëjtën diagnozë.' }
    ],
    ageBands:[
      { id:'newborn', label:'I porsalindur', months:0, referenceWeightKg:3.3, referenceWeightLabel:'3,3 kg' },
      { id:'3m', label:'3 muaj', months:3, referenceWeightKg:6.2, referenceWeightLabel:'6,2 kg' },
      { id:'6m', label:'6 muaj', months:6, referenceWeightKg:7.6, referenceWeightLabel:'7,6 kg' },
      { id:'1y', label:'1 vjeç', months:12, referenceWeightKg:9, referenceWeightLabel:'9 kg' },
      { id:'2y', label:'2 vjeç', months:24, referenceWeightKg:12, referenceWeightLabel:'12 kg' },
      { id:'4y', label:'4 vjeç', months:48, referenceWeightKg:16, referenceWeightLabel:'16 kg' },
      { id:'6y', label:'6 vjeç', months:72, referenceWeightKg:20, referenceWeightLabel:'20 kg' },
      { id:'8y', label:'8 vjeç', months:96, referenceWeightKg:25, referenceWeightLabel:'25 kg' },
      { id:'10y', label:'10 vjeç', months:120, referenceWeightKg:32, referenceWeightLabel:'32 kg' },
      { id:'12y', label:'12 vjeç e lart', months:144, referenceWeightKg:40, referenceWeightLabel:'40 kg+' }
    ],
    indications:[
      {
        id:'aom', label:'Otitis media akute (AOM)', short:'Otitis media', source:'cm2026', usesAllergy:true, minAgeMonths:6,
        warning:'Rivlerëso nëse përkeqësohet ose nuk përmirësohet brenda 48–72 orëve. Watchful waiting/SNAP mund të jetë i përshtatshëm vetëm në rastet që plotësojnë kriteret klinike.',
        options:[
          { id:'amox-aom', tier:'first', allergy:['none','a0','a4'], drug:'Amoxicillin', route:'PO', frequency:'2 herë/ditë', dose:{type:'range',min:40,max:50,unit:'mg/kg/dozë',maxDose:2000}, duration:{type:'age-bands',bands:[{maxMonths:24,text:'10 ditë'},{maxMonths:72,text:'7 ditë'}],defaultText:'5–7 ditë',severeText:'Sëmundje e rëndë: 10 ditë'}, source:'cm2026' },
          { id:'amoxclav-aom', tier:'second', allergy:['none','a0','a4'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'2 herë/ditë', dose:{type:'range',min:40,max:50,unit:'mg/kg/dozë',maxDose:2000,component:'amoxicillin'}, duration:{type:'age-bands',bands:[{maxMonths:24,text:'10 ditë'},{maxMonths:72,text:'7 ditë'}],defaultText:'5–7 ditë',severeText:'Sëmundje e rëndë: 10 ditë'}, source:'cm2026', conditional:'Prefero nëse ka marrë amoxicillin në 30 ditët e fundit ose ka konjuktivit purulent.', note:'Doza bazohet në komponentin amoxicillin.' },
          { id:'cefpodoxime-aom', tier:'allergy-low', allergy:['a1','a2'], drug:'Cefpodoxime', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:5,unit:'mg/kg/dozë',maxDose:200}, duration:{type:'age-bands',bands:[{maxMonths:24,text:'10 ditë'},{maxMonths:72,text:'7 ditë'}],defaultText:'5–7 ditë',severeText:'Sëmundje e rëndë: 10 ditë'}, source:'cm2026', note:'Alternativë e zgjedhur nga burimi për alergji ndaj penicilinës pa reaksion të rëndë të vonshëm.' },
          { id:'cefdinir-aom', tier:'allergy-low', allergy:['a1','a2'], drug:'Cefdinir', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:7,unit:'mg/kg/dozë',maxDose:300}, duration:{type:'age-bands',bands:[{maxMonths:24,text:'10 ditë'},{maxMonths:72,text:'7 ditë'}],defaultText:'5–7 ditë',severeText:'Sëmundje e rëndë: 10 ditë'}, source:'cm2026' },
          { id:'clinda-aom', tier:'allergy-severe', allergy:['a3'], drug:'Clindamycin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:10,unit:'mg/kg/dozë',maxDose:600}, duration:{type:'age-bands',bands:[{maxMonths:24,text:'10 ditë'},{maxMonths:72,text:'7 ditë'}],defaultText:'5–7 ditë',severeText:'Sëmundje e rëndë: 10 ditë'}, source:'cm2026', note:'Për reaksion të rëndë të vonshëm ndaj beta-laktameve.' }
        ]
      },
      {
        id:'gas', label:'Faringjit streptokoksik i grupit A (GAS)', short:'Faringjit GAS', source:'cdc-gas', usesAllergy:true,
        warning:'Mos trajto faringjitin viral. Te fëmijët simptomatikë ≥3 vjeç, një RADT negativ duhet konfirmuar me kulturë sipas CDC.',
        options:[
          { id:'penicillin-gas', tier:'first', allergy:['none','a0','a4'], drug:'Penicillin V', route:'PO', frequency:'2 ose 3 herë/ditë', dose:{type:'fixed',value:250,text:'250 mg/dozë'}, duration:{type:'fixed',text:'10 ditë'}, source:'cdc-gas' },
          { id:'amoxicillin-gas', tier:'first', allergy:['none','a0','a4'], drug:'Amoxicillin', route:'PO', frequency:'1 herë/ditë', dose:{type:'single',value:50,unit:'mg/kg/dozë',maxDose:1000,maxLabel:'maks. 1000 mg/ditë'}, duration:{type:'fixed',text:'10 ditë'}, source:'cdc-gas', note:'Alternativë CDC: 25 mg/kg/dozë 2 herë/ditë, maks. 500 mg/dozë.' },
          { id:'cephalexin-gas', tier:'allergy-low', allergy:['a1'], drug:'Cephalexin', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:20,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'fixed',text:'10 ditë'}, source:'cdc-gas', note:'Mos e përdor në reaksion të menjëhershëm/high-risk IgE ndaj penicilinës.' },
          { id:'clinda-gas', tier:'allergy-severe', allergy:['a2','a3'], drug:'Clindamycin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:7,unit:'mg/kg/dozë',maxDose:300}, duration:{type:'fixed',text:'10 ditë'}, source:'cdc-gas', stewardship:'Rezistenca ndaj clindamycin ndryshon gjeografikisht.' },
          { id:'azithro-gas', tier:'allergy-severe', allergy:['a2','a3'], drug:'Azithromycin', route:'PO', frequency:'1 herë/ditë', dose:{type:'sequence',steps:[{label:'Dita 1',value:12,maxDose:500},{label:'Ditët 2–5',value:6,maxDose:250}],unit:'mg/kg/ditë'}, duration:{type:'fixed',text:'5 ditë'}, source:'cdc-gas', stewardship:'Rezistenca ndaj azithromycin ndryshon gjeografikisht.' },
          { id:'clarithro-gas', tier:'allergy-severe', allergy:['a2','a3'], drug:'Clarithromycin', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:7.5,unit:'mg/kg/dozë',maxDose:250}, duration:{type:'fixed',text:'10 ditë'}, source:'cdc-gas', stewardship:'Rezistenca ndaj makrolideve ndryshon gjeografikisht.' }
        ]
      },
      {
        id:'pneumonia', label:'Pneumoni komunitare pa komplikime', short:'Pneumoni', source:'cm2026', usesAllergy:true, minAgeMonths:3,
        warning:'Hipoksemia, distresi respirator, pamja toksike ose dyshimi për komplikim kërkojnë vlerësim urgjent/hospitalor dhe nuk duhet të menaxhohen vetëm nga ky kalkulator.',
        options:[
          { id:'amox-pna', tier:'first', allergy:['none','a0','a4'], drug:'Amoxicillin', route:'PO', frequency:'2 herë/ditë', dose:{type:'range',min:40,max:50,unit:'mg/kg/dozë',maxDose:2000}, duration:{type:'fixed',text:'3–5 ditë'}, source:'cm2026' },
          { id:'cefpodoxime-pna', tier:'allergy-low', allergy:['a1','a2'], drug:'Cefpodoxime', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:5,unit:'mg/kg/dozë',maxDose:200}, duration:{type:'fixed',text:'3–5 ditë'}, source:'cm2026' },
          { id:'clinda-pna', tier:'allergy-severe', allergy:['a3'], drug:'Clindamycin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:10,unit:'mg/kg/dozë',maxDose:600}, duration:{type:'fixed',text:'3–5 ditë'}, source:'cm2026' },
          { id:'azithro-pna-atypical', tier:'atypical', allergy:['none','a0','a1','a2','a3','a4'], atypical:true, drug:'Azithromycin', route:'PO', frequency:'1 herë/ditë', dose:{type:'sequence',steps:[{label:'Dita 1',value:10,maxDose:500},{label:'Ditët 2–5',value:5,maxDose:250}],unit:'mg/kg/ditë'}, duration:{type:'fixed',text:'5 ditë'}, source:'cm2026', note:'Vetëm kur dyshohet patogjen atipik; jo monoterapi rutinë për pneumoni tipike.' }
        ]
      },
      {
        id:'sinusitis', label:'Sinusit bakterial akut', short:'Sinusit bakterial', source:'cm2026', usesAllergy:true,
        warning:'Konsidero bakterial vetëm kur simptomat persistojnë >10 ditë pa përmirësim, përkeqësohen pas përmirësimit fillestar, ose ka fillim të rëndë me temperaturë të lartë dhe sekret purulent.',
        options:[
          { id:'amox-sinusitis', tier:'first', allergy:['none','a0','a4'], drug:'Amoxicillin', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:45,unit:'mg/kg/dozë',maxDose:2000}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026' },
          { id:'amoxclav-sinusitis', tier:'second', allergy:['none','a0','a4'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:45,unit:'mg/kg/dozë',maxDose:2000,component:'amoxicillin'}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026', conditional:'Prefero kur <2 vjeç, daycare, antibiotik në 30 ditët e fundit, hospitalizim të fundit ose simptoma të rënda.', note:'Doza bazohet në komponentin amoxicillin.' },
          { id:'cefpodoxime-sinusitis', tier:'allergy-low', allergy:['a1','a2'], drug:'Cefpodoxime', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:5,unit:'mg/kg/dozë',maxDose:200}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026' },
          { id:'levo-sinusitis', tier:'reserve', allergy:['a3'], drug:'Levofloxacin', route:'PO', frequency:'<5 vjeç: 2 herë/ditë · ≥5 vjeç: 1 herë/ditë', dose:{type:'range',min:8,max:10,unit:'mg/kg/dozë',maxDose:750}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026', frequencyNotComputable:true, note:'Rezervë për alergji të rëndë të vonshme / situata ku alternativat e tjera nuk përdoren; konsidero konsultë me infektologun.' }
        ]
      },
      {
        id:'uti-cystitis', label:'Cistit / UTI afebrile', short:'Cistit / UTI afebrile', source:'cps-uti-2026', usesAllergy:true, minAgeMonths:2,
        warning:'Merr urinokulturë para antibiotikut kur është e mundur. Terapia empirike duhet të përshtatet me kulturat paraprake, ndjeshmërinë dhe rezistencën lokale; DRx nuk supozon antibiogramë të Kosovës.',
        options:[
          { id:'cephalexin-cystitis', tier:'first', allergy:['none','a0','a1'], drug:'Cephalexin', route:'PO', frequency:'4 herë/ditë', dose:{type:'single',value:12.5,unit:'mg/kg/dozë'}, duration:{type:'fixed',text:'3–5 ditë'}, source:'cps-uti-2026', note:'CPS jep 50 mg/kg/ditë në 4 doza; DRx shfaq ekuivalentin 12,5 mg/kg/dozë. Burimi nuk jep maksimum.' },
          { id:'amoxclav-cystitis', tier:'option', allergy:['none','a0','a4'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:40/3,dailyValue:40,dividedDoses:3,unit:'mg/kg/dozë',component:'amoxicillin'}, duration:{type:'fixed',text:'3–5 ditë'}, source:'cps-uti-2026', note:'CPS: 40 mg/kg/ditë amoxicillin, ndarë në 3 doza; formulimi amoxicillin:clavulanate 7:1. Pa maksimum të deklaruar.' },
          { id:'cefixime-cystitis', tier:'reserve', allergy:['a1','a2'], drug:'Cefixime', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:4,unit:'mg/kg/dozë'}, duration:{type:'fixed',text:'3–5 ditë'}, source:'cps-uti-2026', note:'Rezervë kur rezistenca ndaj barnave të linjës së parë është e lartë; pa maksimum të deklaruar nga CPS.' },
          { id:'nitro-cystitis', tier:'option', allergy:['none','a0','a1','a2','a3','a4'], drug:'Nitrofurantoin', route:'PO', frequency:'4 herë/ditë', dose:{type:'range',min:1.25,max:1.75,unit:'mg/kg/dozë'}, duration:{type:'fixed',text:'3–5 ditë'}, source:'cps-uti-2026', note:'Vetëm për cistit; nuk ka penetrim adekuat në indin renal.' },
          { id:'tmpsmx-cystitis', tier:'option', allergy:['none','a0','a1','a2','a3','a4'], drug:'Trimethoprim / sulfamethoxazole', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:4,unit:'mg/kg/dozë',component:'trimethoprim'}, duration:{type:'fixed',text:'3–5 ditë'}, source:'cps-uti-2026', note:'Doza bazohet në komponentin trimethoprim; përdore sipas ndjeshmërisë/rezistencës lokale.' }
        ]
      },
      {
        id:'uti-pyelo', label:'UTI febrile / pielonefrit', short:'UTI febrile / Pielonefrit', source:'cps-uti-2026', usesAllergy:true, minAgeMonths:2,
        warning:'Foshnja <2 muaj, pacienti i sëmurë/toksik, vjelljet, marrja e dobët orale, imunosupresioni, obstruksioni ose UTI e komplikuar kërkojnë eskalim/hospitalizim. Merr kulturë para antibiotikut kur është e mundur.',
        options:[
          { id:'cephalexin-pyelo', tier:'first', allergy:['none','a0','a1'], drug:'Cephalexin', route:'PO', frequency:'4 herë/ditë', dose:{type:'single',value:25,unit:'mg/kg/dozë'}, duration:{type:'fixed',text:'të paktën 7 ditë'}, source:'cps-uti-2026', note:'CPS jep 100 mg/kg/ditë në 4 doza; burimi nuk jep maksimum.' },
          { id:'amoxclav-pyelo', tier:'option', allergy:['none','a0','a4'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:40/3,dailyValue:40,dividedDoses:3,unit:'mg/kg/dozë',component:'amoxicillin'}, duration:{type:'fixed',text:'të paktën 7 ditë'}, source:'cps-uti-2026', note:'40 mg/kg/ditë amoxicillin në 3 doza, formulimi 7:1; vetëm kur është i përshtatshëm sipas kulturës/ndjeshmërisë.' },
          { id:'cefixime-pyelo', tier:'reserve', allergy:['a1','a2'], drug:'Cefixime', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:4,unit:'mg/kg/dozë'}, duration:{type:'fixed',text:'të paktën 7 ditë'}, source:'cps-uti-2026', note:'Rezervë sipas rezistencës lokale; pa maksimum të deklaruar nga CPS.' },
          { id:'tmpsmx-pyelo', tier:'option', allergy:['a2','a3','a4'], drug:'Trimethoprim / sulfamethoxazole', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:4,unit:'mg/kg/dozë',component:'trimethoprim'}, duration:{type:'fixed',text:'të paktën 7 ditë'}, source:'cps-uti-2026', note:'Vetëm kur izolati është i ndjeshëm / rezistenca lokale e lejon.' },
          { id:'cipro-pyelo', tier:'reserve', allergy:['a3','a4'], drug:'Ciprofloxacin', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:15,unit:'mg/kg/dozë'}, duration:{type:'fixed',text:'të paktën 7 ditë'}, source:'cps-uti-2026', note:'Rezervë për patogjenë rezistentë/MDR ose Pseudomonas; rekomandohet konsultë me infektologun.' }
        ]
      },
      {
        id:'impetigo', label:'Impetigo', short:'Impetigo', source:'cm2026', usesAllergy:true,
        warning:'Për lezione të pakta përdorimi topik mund të mjaftojë; terapi sistemike përdoret kur sëmundja është më e gjerë ose sipas kontekstit klinik.',
        options:[
          { id:'mupirocin-impetigo', tier:'first', allergy:['none','a0','a1','a2','a3','a4'], drug:'Mupirocin', route:'topike', frequency:'3 herë/ditë', dose:{type:'fixed',text:'aplikim topik në lezion'}, duration:{type:'fixed',text:'5 ditë'}, source:'cm2026', conditional:'Impetigo i lehtë / numër i vogël lezionesh.' },
          { id:'cephalexin-impetigo', tier:'first', allergy:['none','a0','a1'], drug:'Cephalexin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:17,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'fixed',text:'7 ditë'}, source:'cm2026', conditional:'Lezione të shumta (>5), zonë e madhe ose afër gojës.' },
          { id:'clinda-impetigo', tier:'allergy-severe', allergy:['a2','a3','a4'], drug:'Clindamycin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:10,unit:'mg/kg/dozë',maxDose:450}, duration:{type:'fixed',text:'7 ditë'}, source:'cm2026', note:'Për rrezik MRSA ose alergji të përshtatshme; rezistenca ndaj clindamycin duhet marrë parasysh.' },
          { id:'tmpsmx-impetigo', tier:'option', allergy:['a2','a3','a4'], drug:'Trimethoprim / sulfamethoxazole', route:'PO', frequency:'2 herë/ditë', dose:{type:'range',min:4,max:6,unit:'mg/kg/dozë',maxDose:160,component:'trimethoprim'}, duration:{type:'fixed',text:'7 ditë'}, source:'cm2026', conditional:'Kur MRSA dyshohet / sipas epidemiologjisë lokale.' }
        ]
      },
      {
        id:'cellulitis', label:'Cellulitis / erysipelas jo-purulent', short:'Cellulitis / Erizipelë', source:'cm2026', usesAllergy:true,
        warning:'Përdor spektrin më të ngushtë të përshtatshëm dhe përshtat me antibiogramën lokale. Shenjat sistemike, progresioni i shpejtë ose infeksioni i thellë kërkojnë eskalim.',
        options:[
          { id:'cephalexin-cellulitis', tier:'first', allergy:['none','a0','a1'], drug:'Cephalexin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:17,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'fixed',text:'5 ditë'}, source:'cm2026' },
          { id:'amoxclav-cellulitis', tier:'option', allergy:['none','a0','a4'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:22.5,unit:'mg/kg/dozë',maxDose:875,component:'amoxicillin'}, duration:{type:'fixed',text:'5 ditë'}, source:'cm2026' },
          { id:'clinda-cellulitis', tier:'allergy-severe', allergy:['a2','a3','a4'], drug:'Clindamycin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:10,unit:'mg/kg/dozë',maxDose:450}, duration:{type:'fixed',text:'5 ditë'}, source:'cm2026', note:'Për alergji të përshtatshme ose rrezik MRSA; kontrollo rezistencën lokale ndaj clindamycin.' }
        ]
      },
      {
        id:'abscess', label:'Absces kutan', short:'Absces kutan', source:'cps-ssti-2026', usesAllergy:true,
        warning:'Source control është hapi kryesor. Incisioni/drenazhi dhe kultura duhen konsideruar; abscesi i vogël pas drenazhit shpesh nuk kërkon antibiotik sistemik kur nuk ka cellulitis të rëndësishëm përreth.',
        options:[
          { id:'id-abscess', tier:'procedure', allergy:['any'], kind:'procedure', drug:'Incizion / drenazh + kulturë', route:'procedurë', frequency:'sipas nevojës', dose:{type:'fixed',text:'source control'}, duration:{type:'fixed',text:'—'}, source:'cps-ssti-2026', note:'Antibiotiku nuk është automatik pas drenazhit adekuat.' },
          { id:'tmpsmx-abscess', tier:'option', allergy:['none','a0','a1','a2','a3','a4'], drug:'Trimethoprim / sulfamethoxazole', route:'PO', frequency:'2 herë/ditë', dose:{type:'range',min:4,max:6,unit:'mg/kg/dozë',maxDose:160,component:'trimethoprim'}, duration:{type:'fixed',text:'5 ditë'}, source:'cm2026', conditional:'Vetëm kur ka indikacion për antibiotik sistemik / MRSA dyshohet.' },
          { id:'clinda-abscess', tier:'option', allergy:['none','a0','a1','a2','a3','a4'], drug:'Clindamycin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:10,unit:'mg/kg/dozë',maxDose:450}, duration:{type:'fixed',text:'5 ditë'}, source:'cm2026', conditional:'Vetëm kur ka indikacion për antibiotik sistemik; kontrollo rezistencën lokale.' }
        ]
      },
      {
        id:'preseptal', label:'Cellulitis preseptal / periorbital i lehtë', short:'Cellulitis preseptal', source:'cps-preseptal-2026', usesAllergy:true, minAgeMonths:12,
        warning:'HARD STOP: proptoza, ulja e mprehtësisë vizuale, dhimbja/kufizimi i lëvizjeve okulare, cefalea e rëndë persistente, letargjia, pamundësia për ekzaminim adekuat ose dyshimi për orbital cellulitis kërkojnë vlerësim urgjent/specialist.',
        options:[
          { id:'cephalexin-preseptal', tier:'first', allergy:['none','a0','a1'], drug:'Cephalexin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:17,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026' },
          { id:'amoxclav-preseptal', tier:'first', allergy:['none','a0','a4'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:22.5,unit:'mg/kg/dozë',maxDose:875,component:'amoxicillin'}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026' },
          { id:'cefpodoxime-preseptal', tier:'allergy-low', allergy:['a1','a2'], drug:'Cefpodoxime', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:5,unit:'mg/kg/dozë',maxDose:400}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026' },
          { id:'clinda-preseptal', tier:'allergy-severe', allergy:['a2','a3','a4'], drug:'Clindamycin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:10,unit:'mg/kg/dozë',maxDose:450}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026', conditional:'MRSA i dyshuar ose alergji që përjashton beta-laktamet.' }
        ]
      },
      {
        id:'bite', label:'Kafshim nga gjitarët', short:'Kafshim nga gjitarët', source:'cm2026', usesAllergy:true,
        warning:'Vlerëso gjithmonë nevojën për profilaksi tetanusi dhe rabies. Plagët e thella, të dorës/fytyrës, pranë nyjes, me dëmtim neurovaskular ose infeksion të rëndë kërkojnë specialist/eskalim.',
        options:[
          { id:'amoxclav-bite-proph', tier:'first', allergy:['none','a0','a4'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:22.5,unit:'mg/kg/dozë',maxDose:875,component:'amoxicillin'}, duration:{type:'fixed',text:'3 ditë'}, source:'cm2026', conditional:'Profilaksi vetëm për plagë me rrezik të lartë (p.sh. puncture, crush, edemë, fytyrë, plagë mesatare/rëndë).' },
          { id:'amoxclav-bite-treat', tier:'first', allergy:['none','a0','a4'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:22.5,unit:'mg/kg/dozë',maxDose:875,component:'amoxicillin'}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026', conditional:'Plagë tashmë e infektuar.' },
          { id:'combo-bite-proph', tier:'allergy-severe', allergy:['a1','a2','a3'], drug:'TMP-SMX + Clindamycin', route:'PO', frequency:'kombinim', dose:{type:'combo',parts:[{drug:'Trimethoprim / sulfamethoxazole',frequency:'2 herë/ditë',dose:{type:'single',value:5,unit:'mg/kg/dozë',maxDose:160,component:'trimethoprim'}},{drug:'Clindamycin',frequency:'3 herë/ditë',dose:{type:'single',value:10,unit:'mg/kg/dozë'}}]}, duration:{type:'fixed',text:'3 ditë'}, source:'cm2026', conditional:'Profilaksi me alergji ndaj penicilinës — jepen TË DYJA barnat.' },
          { id:'combo-bite-treat', tier:'allergy-severe', allergy:['a1','a2','a3'], drug:'TMP-SMX + Clindamycin', route:'PO', frequency:'kombinim', dose:{type:'combo',parts:[{drug:'Trimethoprim / sulfamethoxazole',frequency:'2 herë/ditë',dose:{type:'single',value:5,unit:'mg/kg/dozë',maxDose:160,component:'trimethoprim'}},{drug:'Clindamycin',frequency:'3 herë/ditë',dose:{type:'single',value:10,unit:'mg/kg/dozë'}}]}, duration:{type:'fixed',text:'5–7 ditë'}, source:'cm2026', conditional:'Plagë e infektuar me alergji ndaj penicilinës — jepen TË DYJA barnat.' }
        ]
      },
      {
        id:'lymphadenitis', label:'Limfadenit bakterial akut cervikal', short:'Limfadenit cervikal', source:'cm2026', usesAllergy:true,
        warning:'Fluktuacioni, abscesi, shenjat e infeksionit të thellë të qafës ose kompromisi i rrugëve të frymëmarrjes kërkojnë imazheri/source control/eskalim. Bartonella është etiologji tjetër dhe nuk trajtohet si alternativë alergjie.',
        options:[
          { id:'cephalexin-lymph', tier:'first', allergy:['none','a0','a1'], drug:'Cephalexin', route:'PO', frequency:'3 herë/ditë', dose:{type:'range',min:17,max:25,unit:'mg/kg/dozë',maxDose:1000}, duration:{type:'fixed',text:'7–10 ditë'}, source:'cm2026' },
          { id:'amoxclav-lymph', tier:'option', allergy:['none','a0','a4'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:22.5,unit:'mg/kg/dozë',maxDose:875,component:'amoxicillin'}, duration:{type:'fixed',text:'7–10 ditë'}, source:'cm2026', conditional:'Kur dyshohet burim oral / anaerobe (p.sh. higjienë orale e dobët).' },
          { id:'clinda-lymph', tier:'allergy-severe', allergy:['a2','a3','a4'], drug:'Clindamycin', route:'PO', frequency:'3 herë/ditë', dose:{type:'single',value:10,unit:'mg/kg/dozë',maxDose:450}, duration:{type:'fixed',text:'7–10 ditë'}, source:'cm2026', conditional:'MRSA i dyshuar ose alergji që përjashton beta-laktamet.' }
        ]
      }
    ]
  });
})();