(() => {
  'use strict';

  window.DRX_ANTIBIOTIC_GUIDE = Object.freeze({
    version:'2026-09-12-v2',
    sources:[
      {
        id:'carpa',
        short:'CARPA STM / WBM',
        title:'CARPA STM and WBM Antibiotic Doses Table (1)',
        note:'Tabela përdor pesha referuese sipas moshës dhe kërkon përdorim bashkë me protokollet CARPA STM/WBM; nuk përmban të gjithë informacionin e nevojshëm për trajtim.'
      },
      {
        id:'cps2022',
        short:'CPS 2022',
        title:'Recommended antibiotic doses and durations for common paediatric infections',
        note:'Canadian Paediatric Society, December 2022; tabelë e publikuar në kontekstin e menaxhimit të mungesave kritike të barnave.'
      }
    ],
    ageBands:[
      { id:'newborn', label:'I porsalindur', months:0, referenceWeightKg:3.3 },
      { id:'3m', label:'3 muaj', months:3, referenceWeightKg:6.2 },
      { id:'6m', label:'6 muaj', months:6, referenceWeightKg:7.6 },
      { id:'1y', label:'1 vjeç', months:12, referenceWeightKg:9 },
      { id:'2y', label:'2 vjeç', months:24, referenceWeightKg:12 },
      { id:'4y', label:'4 vjeç', months:48, referenceWeightKg:16 },
      { id:'6y', label:'6 vjeç', months:72, referenceWeightKg:20 },
      { id:'8y', label:'8 vjeç', months:96, referenceWeightKg:25 },
      { id:'10y', label:'10 vjeç', months:120, referenceWeightKg:32 },
      { id:'12y', label:'12 vjeç e lart', months:144, referenceWeightKg:40 }
    ],
    indications:[
      {
        id:'pneumonia',
        label:'Pneumoni komunitare pa komplikime',
        short:'Pneumoni',
        source:'cps2022',
        note:'Skemat e tabelës janë për pneumoni komunitare pa komplikime te fëmijët dhe të rinjtë.',
        options:[
          { id:'amoxicillin-pna', tier:'first', allergy:['none'], drug:'Amoxicillin', route:'PO', frequency:'3 herë/ditë', dose:{type:'range',min:20,max:30,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'fixed',text:'5 ditë'} },
          { id:'amoxclav-pna', tier:'second', allergy:['none'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'3 herë/ditë', dose:{type:'range',min:20,max:30,unit:'mg/kg/dozë',maxDose:500,component:'amoxicillin'}, duration:{type:'fixed',text:'5 ditë'}, note:'Doza bazohet në komponentin amoxicillin.' },
          { id:'cef-pna', tier:'allergy-nonsevere', allergy:['nonsevere'], drug:'Cefprozil ose cefuroxime', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:15,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'fixed',text:'5 ditë'} },
          { id:'clarithro-pna', tier:'allergy-severe', allergy:['severe'], atypical:true, drug:'Clarithromycin', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:7.5,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'fixed',text:'5 ditë'} },
          { id:'azithro-pna', tier:'allergy-severe', allergy:['severe'], atypical:true, drug:'Azithromycin', route:'PO', frequency:'1 herë/ditë', dose:{type:'sequence',steps:[{label:'Dita 1',value:10,maxDose:500},{label:'Ditët 2-5',value:5,maxDose:250}],unit:'mg/kg/ditë'}, duration:{type:'fixed',text:'5 ditë'} }
        ]
      },
      {
        id:'aom',
        label:'Otitis media akute (AOM)',
        short:'Otitis media',
        source:'cps2022',
        minAgeMonths:6,
        note:'Referenca e cituar nga tabela është për fëmijë 6 muaj e lart.',
        options:[
          { id:'amoxicillin-aom', tier:'first', allergy:['none'], drug:'Amoxicillin', route:'PO', frequency:'2 herë/ditë', dose:{type:'range',min:37.5,max:45,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'age',underMonths:24,underText:'10 ditë',otherText:'5 ditë'} },
          { id:'amoxclav-aom', tier:'second', allergy:['none'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'2 herë/ditë', dose:{type:'range',min:37.5,max:45,unit:'mg/kg/dozë',maxDose:875,component:'amoxicillin'}, duration:{type:'age',underMonths:24,underText:'10 ditë',otherText:'5 ditë'}, note:'Doza bazohet në komponentin amoxicillin.' },
          { id:'cef-aom', tier:'allergy-nonsevere', allergy:['nonsevere'], drug:'Cefprozil ose cefuroxime', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:15,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'age',underMonths:24,underText:'10 ditë',otherText:'5 ditë'} },
          { id:'clarithro-aom', tier:'allergy-severe', allergy:['severe'], drug:'Clarithromycin', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:7.5,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'age',underMonths:24,underText:'10 ditë',otherText:'5 ditë'} },
          { id:'azithro-aom', tier:'allergy-severe', allergy:['severe'], drug:'Azithromycin', route:'PO', frequency:'1 herë/ditë', dose:{type:'sequence',steps:[{label:'Dita 1',value:10,maxDose:500},{label:'Ditët 2-5',value:5,maxDose:250}],unit:'mg/kg/ditë'}, duration:{type:'fixed',text:'5 ditë'} }
        ]
      },
      {
        id:'gas',
        label:'Faringjit streptokoksik i grupit A (GAS)',
        short:'Faringjit GAS',
        source:'cps2022',
        options:[
          { id:'penicillin-gas', tier:'first', allergy:['none'], drug:'Penicillin VK', route:'PO', frequency:'2 ose 3 herë/ditë', dose:{type:'weight-threshold',thresholdKg:27,below:'300 mg/dozë',atOrAbove:'600 mg/dozë'}, duration:{type:'fixed',text:'10 ditë'} },
          { id:'amoxicillin-gas', tier:'first', allergy:['none'], drug:'Amoxicillin', route:'PO', frequency:'1 herë/ditë (mund të ndahet në 2 doza)', dose:{type:'single',value:50,unit:'mg/kg/dozë',maxDose:1000,maxLabel:'1000 mg/ditë'}, duration:{type:'source-unspecified'} },
          { id:'cephalexin-gas', tier:'allergy-nonsevere', allergy:['nonsevere'], drug:'Cephalexin', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:20,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'source-unspecified'} },
          { id:'clarithro-gas', tier:'allergy-severe', allergy:['severe'], drug:'Clarithromycin', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:7.5,unit:'mg/kg/dozë',maxDose:250}, duration:{type:'source-unspecified'} },
          { id:'azithro-gas', tier:'allergy-severe', allergy:['severe'], drug:'Azithromycin', route:'PO', frequency:'1 herë/ditë', dose:{type:'single',value:12,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'fixed',text:'5 ditë'} }
        ]
      },
      {
        id:'uti',
        label:'Infeksion urinar (UTI) - terapi empirike',
        short:'UTI',
        source:'cps2022',
        minAgeMonths:3,
        note:'Tabela e specifikon për moshë ≥3 muaj, si terapi empirike duke pritur rezultatin e urinokulturës.',
        options:[
          { id:'cephalexin-uti', tier:'option', allergy:['any'], drug:'Cephalexin', route:'PO', frequency:'3 herë/ditë', dose:{type:'range',min:15,max:20,unit:'mg/kg/dozë',maxDose:500}, duration:{type:'fixed',text:'7 ditë'} },
          { id:'cotrim-uti', tier:'option', allergy:['any'], drug:'Co-trimoxazole (trimethoprim / sulfamethoxazole)', route:'PO', frequency:'2 herë/ditë', dose:{type:'range',min:4,max:6,unit:'mg/kg/dozë',maxDose:160,maxLabel:'160 mg trimethoprim/dozë',component:'trimethoprim'}, duration:{type:'uti'} , note:'Doza bazohet në komponentin trimethoprim.'},
          { id:'cefixime-uti', tier:'option', allergy:['any'], drug:'Cefixime', route:'PO', frequency:'1 herë/ditë', dose:{type:'single',value:8,unit:'mg/kg/dozë',maxDose:400}, duration:{type:'uti'} },
          { id:'amoxclav-uti', tier:'option', allergy:['any'], drug:'Amoxicillin / clavulanate', route:'PO', frequency:'sipas peshës', dose:{type:'amoxclav-uti'}, duration:{type:'uti'}, note:'Doza bazohet në komponentin amoxicillin.' },
          { id:'cipro-uti', tier:'option', allergy:['any'], drug:'Ciprofloxacin', route:'PO', frequency:'2 herë/ditë', dose:{type:'single',value:15,unit:'mg/kg/dozë',maxDose:750}, duration:{type:'uti'} }
        ]
      }
    ]
  });
})();
