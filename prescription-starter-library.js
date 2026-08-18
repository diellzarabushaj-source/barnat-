(() => {
  'use strict';

  const STORAGE_KEY = 'regjistriBarnave_protokollet_v1';
  const SEED_KEY = 'medindex_prescription_starter_seed_v1';
  const TEMPLATE_ID = 'starter_rx_herpes_zoster_adult_v1';
  const STAMP = '2026-08-18T07:20:00.000Z';

  const herpesZosterTemplate = Object.freeze({
    id:TEMPLATE_ID,
    name:'Herpes zoster (Shingles) — i rritur',
    indication:'Herpes zoster akut — i rritur, rast i pakomplikuar',
    allergies:'',
    population:'adult',
    patientName:'',
    birthDate:'',
    patientId:'',
    patientType:'adult',
    notes:[
      'Draft klinik për mjek: verifiko kohën nga fillimi i rash-it, funksionin renal, shtatzëninë, imunokomprometimin dhe përfshirjen okulare/otike para përshkrimit.',
      'Calamine lotion nuk u gjet në regjistrin MedIndex më 18.08.2026. Cetirizina është përfshirë vetëm si alternativë simptomatike për pruritus; nuk është ekuivalent topik i calamine lotion.',
      'Aciclovir 800 mg: skema e këtij drafti është 5 herë/ditë për 7 ditë. Në insuficiencë renale kërkohet përshtatje e intervalit.',
    ],
    missing:[],
    sections:[{
      title:'Barna orale PO',
      type:'oral',
      route:'PO',
      sharedSignature:'',
      sharedSignatureGenerated:false,
      medications:[
        {
          form:'Tableta',
          name:'Aciclovir',
          dose:'800 mg',
          quantity:'',
          dispenseQuantity:'35 tableta',
          other:'Cicloviral 800 mg në regjistrin MedIndex është paketë me 25 tableta; verifiko mënyrën lokale të dispensimit për sasinë totale.',
          individualSignature:'Merr 1 tabletë 800 mg nga goja 5 herë në ditë, afërsisht çdo 4 orë gjatë kohës së zgjimit, për 7 ditë.',
          signatureGenerated:false,
        },
        {
          form:'Tableta',
          name:'Paracetamol',
          dose:'500 mg',
          quantity:'',
          dispenseQuantity:'20 tableta',
          other:'Për dhimbje ose temperaturë; llogarit totalin ditor të paracetamolit nga të gjitha produktet.',
          individualSignature:'Merr 1 tabletë 500 mg çdo 8 orë sipas nevojës për dhimbje ose temperaturë.',
          signatureGenerated:false,
        },
        {
          form:'Tableta',
          name:'Cetirizine hydrochloride',
          dose:'10 mg',
          quantity:'',
          dispenseQuantity:'7 tableta',
          other:'Opsionale vetëm nëse ka pruritus; mund të shkaktojë përgjumje dhe kërkon vlerësim të dozës në sëmundje renale/hepatike.',
          individualSignature:'Nëse ka pruritus: merr 1 tabletë 10 mg një herë në ditë sipas nevojës; maksimumi 10 mg/24 orë.',
          signatureGenerated:false,
        },
      ],
    }],
    sourceText:[
      'Rp:',
      'Tab. Aciclovir 800 mg',
      'Sasia: 35 tableta',
      'S (Signatura): Merr 1 tabletë 800 mg nga goja 5 herë në ditë, afërsisht çdo 4 orë gjatë kohës së zgjimit, për 7 ditë.',
      '',
      'Tab. Paracetamol 500 mg',
      'Sasia: 20 tableta',
      'S (Signatura): Merr 1 tabletë 500 mg çdo 8 orë sipas nevojës për dhimbje ose temperaturë.',
      '',
      'Tab. Cetirizine hydrochloride 10 mg',
      'Sasia: 7 tableta',
      'S (Signatura): Nëse ka pruritus: merr 1 tabletë 10 mg një herë në ditë sipas nevojës; maksimumi 10 mg/24 orë.',
    ].join('\n'),
    selectedDrugs:[
      {
        key:'3990|PD3243/111225|Cicloviral|800 mg',
        tradeName:'Cicloviral',
        substance:'Aciclovir',
        strength:'800 mg',
        form:'Tablet',
        atc:'J05AB01',
        pdid:'3990',
        regimenId:'ACY-TAB-ZOSTER-AD-001',
        dosageStatus:'requires-review',
        dosagePopulation:'adult',
        indication:'Herpes zoster akut te të rriturit',
        route:'PO',
        frequency:'5 herë në ditë, afërsisht çdo 4 orë gjatë kohës së zgjimit',
        duration:'7 ditë',
        dispense:'35 tableta',
        signatura:'Merr 1 tabletë 800 mg nga goja 5 herë në ditë, afërsisht çdo 4 orë gjatë kohës së zgjimit, për 7 ditë.',
        warnings:'Kërkon përshtatje të intervalit në insuficiencë renale; kontrollo hidratimin dhe komplikimet e zosterit.',
        sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=eb863c4f-4e39-4d97-8b7e-30a76fe2119d',
        verificationStatus:'source-verified',
      },
      {
        key:'131|PD0045/271125|BEN-U-RON|500 mg',
        tradeName:'BEN-U-RON',
        substance:'Paracetamol',
        strength:'500 mg',
        form:'Tablet',
        atc:'N02BE01',
        pdid:'131',
        dosageStatus:'requires-review',
        dosagePopulation:'adult',
        indication:'Dhimbje ose temperaturë',
        route:'PO',
        frequency:'çdo 8 orë sipas nevojës',
        duration:'sipas nevojës',
        dispense:'20 tableta',
        signatura:'Merr 1 tabletë 500 mg çdo 8 orë sipas nevojës për dhimbje ose temperaturë.',
        warnings:'Llogarit dozën totale ditore të paracetamolit nga të gjitha produktet dhe vlerëso faktorët hepatikë.',
        sourceUrl:'https://www.nhs.uk/medicines/paracetamol-for-adults/',
        verificationStatus:'source-verified',
      },
      {
        key:'3707|PD2173/061225|ALCET|10 mg',
        tradeName:'ALCET',
        substance:'cetirizine hydrochloride',
        strength:'10 mg',
        form:'Film coated tablet',
        atc:'R06AE07',
        pdid:'3707',
        dosageStatus:'requires-review',
        dosagePopulation:'adult',
        indication:'Pruritus simptomatik',
        route:'PO',
        frequency:'1 herë në ditë sipas nevojës',
        duration:'sipas simptomave',
        dispense:'7 tableta',
        signatura:'Nëse ka pruritus: merr 1 tabletë 10 mg një herë në ditë sipas nevojës; maksimumi 10 mg/24 orë.',
        warnings:'Mund të shkaktojë përgjumje; vlerëso sëmundjen renale/hepatike dhe barnat sedative.',
        sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5481ccb3-b311-4b25-b923-4fe8522ea92b',
        verificationStatus:'source-verified',
      },
    ],
    formatVersion:3,
    aiStructured:false,
    generatedSignatureReviewed:false,
    dosageReviewed:false,
    clinicalReview:false,
    reviewedAt:'',
    starterTemplate:true,
    templateVersion:1,
    createdAt:STAMP,
    updatedAt:STAMP,
    items:[],
  });

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function refreshUi() {
    const search = document.getElementById('rxSavedSearch');
    if (search) search.dispatchEvent(new Event('input', { bubbles:true }));
    window.dispatchEvent(new CustomEvent('medindex:starter-prescriptions-seeded', {
      detail:{ ids:[TEMPLATE_ID], version:1 },
    }));
  }

  function seed() {
    try {
      if (localStorage.getItem(SEED_KEY) === '1') return;
      const saved = readSaved();
      if (!saved.some(item => String(item?.id) === TEMPLATE_ID)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([herpesZosterTemplate, ...saved]));
      }
      localStorage.setItem(SEED_KEY, '1');
      refreshUi();
    } catch {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(seed, 0), { once:true });
  else setTimeout(seed, 0);
})();
