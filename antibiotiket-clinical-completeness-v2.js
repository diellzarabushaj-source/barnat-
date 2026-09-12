(() => {
  'use strict';

  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  const liquids = window.DRX_ANTIBIOTIC_FORMULATIONS;
  const solids = window.DRX_ANTIBIOTIC_SOLIDS;
  const hospital = window.DRX_ANTIBIOTIC_HOSPITAL;
  if (!guide) return;

  const dx = id => (guide.indications || []).find(item => item.id === id) || null;
  const opt = (dxId, optionId) => dx(dxId)?.options?.find(item => item.id === optionId) || null;
  const addOptionBefore = (indication, beforeId, candidate) => {
    if (!indication || indication.options.some(item => item.id === candidate.id)) return;
    const index = indication.options.findIndex(item => item.id === beforeId);
    indication.options.splice(index < 0 ? indication.options.length : index, 0, candidate);
  };

  // --- AOM: current Children’s Mercy 2025/2026 pathway --------------------
  const aom = dx('aom');
  addOptionBefore(aom, 'clinda-aom', {
    id:'cefuroxime-aom', tier:'allergy-low', allergy:['a1','a2'], drug:'Cefuroxime', route:'PO',
    frequency:'2 herë/ditë', dose:{ type:'fixed', text:'250 mg/dozë' },
    duration:{ type:'age-bands', bands:[{maxMonths:24,text:'10 ditë'},{maxMonths:72,text:'7 ditë'}], defaultText:'5–7 ditë', severeText:'Sëmundje e rëndë: 10 ditë' },
    source:'cm2026', conditional:'Vetëm për fëmijë që mund të gëlltisin tabletën; alternativë e listuar në pathway për alergji ndaj penicilinës.'
  });

  // --- CAP: complete current oral allergy options + clindamycin range -----
  const cap = dx('pneumonia');
  const capClinda = opt('pneumonia', 'clinda-pna');
  if (capClinda) {
    capClinda.dose = { type:'range', min:10, max:13, unit:'mg/kg/dozë', maxDose:600 };
    capClinda.note = 'Children’s Mercy CAP: 10–13 mg/kg/dozë PO q8h (maks. 600 mg/dozë) për high-risk severe delayed beta-lactam reaction.';
  }
  addOptionBefore(cap, 'clinda-pna', {
    id:'cefuroxime-pna', tier:'allergy-low', allergy:['a1','a2'], drug:'Cefuroxime', route:'PO',
    frequency:'2 herë/ditë', dose:{ type:'fixed', text:'250–500 mg/dozë' },
    duration:{ type:'fixed', text:'3–5 ditë' }, source:'cm2026',
    conditional:'Tabletë; zgjidh 250–500 mg q12h sipas pathway dhe pacientit. Nuk rrumbullakohet automatikisht.'
  });

  // --- GAS: CDC cefadroxil alternative ------------------------------------
  const gas = dx('gas');
  addOptionBefore(gas, 'clinda-gas', {
    id:'cefadroxil-gas', tier:'allergy-low', allergy:['a1'], drug:'Cefadroxil', route:'PO',
    frequency:'1 herë/ditë', dose:{ type:'single', value:30, unit:'mg/kg/dozë', maxDose:1000 },
    duration:{ type:'fixed', text:'10 ditë' }, source:'cdc-gas',
    note:'CDC: shmang cefadroxil në immediate-type penicillin hypersensitivity.'
  });

  // --- Exact oral product strengths used by the added pathways ------------
  if (liquids?.drugs && !liquids.drugs.Cefadroxil) {
    liquids.drugs.Cefadroxil = {
      basis:'cefadroxil',
      forms:[
        { id:'cefadroxil-250-5', label:'250 mg / 5 mL', mgPer5mL:250, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=27009a05-4d2b-4618-be76-39f348240eda&type=display' },
        { id:'cefadroxil-500-5', label:'500 mg / 5 mL', mgPer5mL:500, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=27009a05-4d2b-4618-be76-39f348240eda&type=display' },
      ]
    };
  }

  if (solids?.drugs) {
    const cefuroxime = solids.drugs.Cefuroxime || { forms:[] };
    if (!cefuroxime.forms.some(item => item.id === 'cefuroxime-tab-250')) {
      cefuroxime.forms.push({
        id:'cefuroxime-tab-250', label:'Tabletë 250 mg', form:'tabletë', componentMg:250,
        sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=bb7955fe-5111-1662-e053-2a95a90a85a1',
        caution:'Gëlltitet e plotë; pacientët që nuk mund ta gëlltisin tabletën duhet të përdorin formulim të përshtatshëm sipas etiketës/pathway.'
      });
    }
    if (!cefuroxime.forms.some(item => item.id === 'cefuroxime-tab-500')) {
      cefuroxime.forms.push({
        id:'cefuroxime-tab-500', label:'Tabletë 500 mg', form:'tabletë', componentMg:500,
        sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=bb7955fe-5111-1662-e053-2a95a90a85a1',
        caution:'Gëlltitet e plotë; mos u ndaj automatikisht.'
      });
    }
    solids.drugs.Cefuroxime = cefuroxime;

    if (!solids.drugs.Cefadroxil) {
      solids.drugs.Cefadroxil = {
        forms:[{
          id:'cefadroxil-cap-500', label:'Kapsulë 500 mg', form:'kapsulë', componentMg:500,
          sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=57eebea5-28b6-44a3-888b-76950f6038f4'
        }]
      };
    }
  }

  // --- AOM parenteral pathway: x1 initial option vs x3 treatment failure --
  if (hospital?.sources && !hospital.sources.cmAom) {
    hospital.sources.cmAom = {
      short:'Children’s Mercy AOM 2025',
      url:'https://www.childrensmercy.org/siteassets/media-documents-for-depts-section/documents-for-health-care-providers/block-clinical-practice-guidelines/mobileview/aom-synopsis.pdf'
    };
  }

  if (hospital?.regimens && hospital?.linkedByIndication?.aom) {
    const h001 = hospital.regimens.find(item => item.id === 'H001');
    if (h001) {
      h001.source = 'cmAom';
      h001.scenario = 'AOM – ceftriaxone parenteral x1 kur indikohet';
      h001.transition = '1 dozë; failure pas antibiotikëve të tjerë përdor pathway x3 ditë.';
      h001.useWhen = 'Alternativë parenterale e mbikëqyrur x1 në pathway, jo treatment-failure course.';
    }

    const addHospital = regimen => {
      if (!hospital.regimens.some(item => item.id === regimen.id)) hospital.regimens.push(regimen);
      if (!hospital.linkedByIndication.aom.includes(regimen.id)) hospital.linkedByIndication.aom.push(regimen.id);
    };

    addHospital({
      id:'H017', indication:'aom', scenario:'AOM – ceftriaxone IV x1 kur indikohet', drug:'Ceftriaxone', route:'IV',
      dose:{type:'single',value:50,unit:'mg/kg/dozë',maxDose:1000}, frequency:'q24h', transition:'1 dozë', minAgeMonths:6,
      useWhen:'Alternativë parenterale e mbikëqyrur x1 në pathway.', blockedAllergy:['a3','a4'], allergyNote:'Alergji ndaj cefalosporinës → mos përdor.',
      renal:'Kufizimet neonatale vlejnë; jo modul neonatal.', safety:'Mos e jep simultan me solucione IV me calcium; preparation është product-specific.', source:'cmAom', prepIds:['IV001']
    });

    addHospital({
      id:'H018', indication:'aom', scenario:'AOM – treatment failure pas 48–72 h · ceftriaxone IM x3 ditë', drug:'Ceftriaxone', route:'IM',
      dose:{type:'single',value:50,unit:'mg/kg/dozë',maxDose:1000}, frequency:'q24h', transition:'3 ditë', minAgeMonths:6,
      useWhen:'Treatment failure sipas pathway pas 48–72 orësh; jo si x1 initial course.', blockedAllergy:['a3','a4'], allergyNote:'Alergji ndaj cefalosporinës → mos përdor.',
      renal:'Kufizimet neonatale vlejnë; jo modul neonatal.', safety:'50 mg/kg/dozë q24h ×3 ditë, maks. 1 g/dozë; përdor preparation IM të verifikuar.', source:'cmAom', prepIds:['IV002']
    });

    addHospital({
      id:'H019', indication:'aom', scenario:'AOM – treatment failure pas 48–72 h · ceftriaxone IV x3 ditë', drug:'Ceftriaxone', route:'IV',
      dose:{type:'single',value:50,unit:'mg/kg/dozë',maxDose:1000}, frequency:'q24h', transition:'3 ditë', minAgeMonths:6,
      useWhen:'Treatment failure sipas pathway pas 48–72 orësh; jo si x1 initial course.', blockedAllergy:['a3','a4'], allergyNote:'Alergji ndaj cefalosporinës → mos përdor.',
      renal:'Kufizimet neonatale vlejnë; jo modul neonatal.', safety:'50 mg/kg/dozë q24h ×3 ditë, maks. 1 g/dozë; IV preparation product-specific.', source:'cmAom', prepIds:['IV001']
    });
  }

  // CPS 2026 prefers an aminoglycoside in suitable parenteral UTI scenarios,
  // but this general calculator intentionally does not auto-publish it until
  // a separate renal/TDM + exact-product preparation workflow exists.
  const h008 = hospital?.regimens?.find(item => item.id === 'H008');
  if (h008 && !/aminoglycoside/i.test(h008.safety || '')) {
    h008.safety = `${h008.safety || ''} CPS 2026: aminoglycoside is often preferred when meningitis/sepsis is not a concern; DRx does not auto-dose it here without the dedicated renal/TDM/product workflow.`.trim();
  }

  window.DRX_ANTIBIOTIC_COMPLETENESS_V2 = Object.freeze({
    version:'2026-09-12-v2',
    additions:['cefuroxime AOM','cefuroxime CAP','cefadroxil GAS','AOM ceftriaxone x1/x3 route-specific'],
    deferred:['aminoglycoside UTI renal/TDM/product workflow','neonatal dosing','vancomycin final TDM dosing']
  });
})();