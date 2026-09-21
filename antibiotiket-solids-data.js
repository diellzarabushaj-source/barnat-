(() => {
  'use strict';

  window.DRX_ANTIBIOTIC_SOLIDS = Object.freeze({
    version:'2026-09-12-v1-phase4-solids',
    scope:'pediatric-oral-solid-exact-match',
    note:'Formulat solide përdoren vetëm kur doza klinike përputhet saktë me një ose më shumë njësi të plota. Nuk bëhet rrumbullakim klinik dhe nuk ndahet tableta automatikisht. Disponueshmëria lokale duhet verifikuar.',
    drugs:{
      'Penicillin V':{
        forms:[
          { id:'penv-tab-250', label:'Tabletë 250 mg', form:'tabletë', componentMg:250, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=fba1ffe5-809a-495b-bf3e-f2099ac459f6' },
          { id:'penv-tab-500', label:'Tabletë 500 mg', form:'tabletë', componentMg:500, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=fba1ffe5-809a-495b-bf3e-f2099ac459f6', note:'Mos e zëvendëso automatikisht dozën pediatrike fikse 250 mg me 500 mg.' }
        ]
      },
      'Amoxicillin':{
        forms:[
          { id:'amox-cap-250', label:'Kapsulë 250 mg', form:'kapsulë', componentMg:250, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ad804b34-169c-44bf-a469-f1149433d96b' },
          { id:'amox-cap-500', label:'Kapsulë 500 mg', form:'kapsulë', componentMg:500, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ad804b34-169c-44bf-a469-f1149433d96b' },
          { id:'amox-tab-500', label:'Tabletë 500 mg', form:'tabletë', componentMg:500, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ad804b34-169c-44bf-a469-f1149433d96b', note:'Produkti referencë është i pandarë; DRx nuk jep 1/2 tabletë.' },
          { id:'amox-tab-875', label:'Tabletë 875 mg', form:'tabletë', componentMg:875, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ad804b34-169c-44bf-a469-f1149433d96b', note:'Ndarja varet nga produkti i saktë dhe nuk automatizohet në këtë modul.' }
        ]
      },
      'Amoxicillin / clavulanate':{
        combination:true,
        forms:[
          { id:'amoxclav-tab-875-125', label:'Tabletë 875/125 mg', form:'tabletë', componentMg:875, composition:'875 mg amoxicillin + 125 mg clavulanate', singleUnitOnly:true, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0c2d1fbc-f80c-4737-a15e-9cfa6bf99769', note:'Raporti është pjesë e produktit; mos e zëvendëso sipas mg të amoxicillin vetëm.' }
        ],
        caution:'Amoxicillin/clavulanate kërkon përputhje të raportit të produktit; shumëfishimi automatik i tabletave bllokohet.'
      },
      'Cephalexin':{
        forms:[
          { id:'cephalexin-tab-250', label:'Tabletë 250 mg', form:'tabletë', componentMg:250, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=consumer&setid=36882c6d-7b6f-41e3-8c54-e3b0073b8c07' },
          { id:'cephalexin-tab-500', label:'Tabletë 500 mg', form:'tabletë', componentMg:500, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=consumer&setid=36882c6d-7b6f-41e3-8c54-e3b0073b8c07' }
        ]
      },
      'Cefpodoxime':{
        forms:[
          { id:'cefpodoxime-tab-100', label:'Tabletë 100 mg', form:'tabletë', componentMg:100, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4587a7c1-cd6c-4946-a0dd-fcfe0c8504b9', caution:'Forma solide është kryesisht për pacientë më të mëdhenj; verifiko moshën dhe produktin.' },
          { id:'cefpodoxime-tab-200', label:'Tabletë 200 mg', form:'tabletë', componentMg:200, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4587a7c1-cd6c-4946-a0dd-fcfe0c8504b9', caution:'Forma solide është kryesisht për pacientë më të mëdhenj; verifiko moshën dhe produktin.' }
        ]
      },
      'Cefdinir':{
        forms:[
          { id:'cefdinir-cap-300', label:'Kapsulë 300 mg', form:'kapsulë', componentMg:300, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=a8029f7c-6353-46db-8c8c-c86a9485a14f' }
        ]
      },
      'Cefixime':{
        forms:[
          { id:'cefixime-chew-100', label:'Tabletë përtypëse 100 mg', form:'tabletë përtypëse', componentMg:100, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=068e6edd-a5fe-40d8-8dcf-ac82b78dced4' },
          { id:'cefixime-chew-150', label:'Tabletë përtypëse 150 mg', form:'tabletë përtypëse', componentMg:150, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=068e6edd-a5fe-40d8-8dcf-ac82b78dced4' },
          { id:'cefixime-chew-200', label:'Tabletë përtypëse 200 mg', form:'tabletë përtypëse', componentMg:200, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=068e6edd-a5fe-40d8-8dcf-ac82b78dced4' },
          { id:'cefixime-tab-400', label:'Tabletë 400 mg', form:'tabletë', componentMg:400, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=655a59ba-08e9-51d4-e053-2991aa0aef34', note:'Edhe kur produkti është i vijëzuar, DRx nuk e ndan automatikisht.' },
          { id:'cefixime-cap-400', label:'Kapsulë 400 mg', form:'kapsulë', componentMg:400, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=655a59ba-08e9-51d4-e053-2991aa0aef34' }
        ]
      },
      'Azithromycin':{
        forms:[
          { id:'azithro-tab-250', label:'Tabletë 250 mg', form:'tabletë', componentMg:250, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=99ca0089-14a9-446d-8807-253ad5be3efa' },
          { id:'azithro-tab-500', label:'Tabletë 500 mg', form:'tabletë', componentMg:500, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=99ca0089-14a9-446d-8807-253ad5be3efa' }
        ]
      },
      'Clarithromycin':{
        forms:[
          { id:'clarithro-tab-250', label:'Tabletë 250 mg', form:'tabletë', componentMg:250, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fa69ea92-0b41-43fb-918f-ed80e0dedf04', caution:'Kontrollo funksionin renal dhe ndërveprimet kur janë relevante.' },
          { id:'clarithro-tab-500', label:'Tabletë 500 mg', form:'tabletë', componentMg:500, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fa69ea92-0b41-43fb-918f-ed80e0dedf04', caution:'Kontrollo funksionin renal dhe ndërveprimet kur janë relevante.' }
        ]
      },
      'Clindamycin':{
        forms:[
          { id:'clinda-cap-75', label:'Kapsulë 75 mg', form:'kapsulë', componentMg:75, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b2bd8402-c887-5bfd-e053-2a95a90a15d9' },
          { id:'clinda-cap-150', label:'Kapsulë 150 mg', form:'kapsulë', componentMg:150, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b2bd8402-c887-5bfd-e053-2a95a90a15d9' },
          { id:'clinda-cap-300', label:'Kapsulë 300 mg', form:'kapsulë', componentMg:300, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b2bd8402-c887-5bfd-e053-2a95a90a15d9' }
        ]
      },
      'Trimethoprim / sulfamethoxazole':{
        combination:true,
        forms:[
          { id:'tmpsmx-ss', label:'Tabletë TMP 80 mg + SMX 400 mg', form:'tabletë', componentMg:80, composition:'80 mg trimethoprim + 400 mg sulfamethoxazole', sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=08500fcb-dbec-4ac2-91c3-189d27907ec0' },
          { id:'tmpsmx-ds', label:'Tabletë TMP 160 mg + SMX 800 mg', form:'tabletë', componentMg:160, composition:'160 mg trimethoprim + 800 mg sulfamethoxazole', sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=08500fcb-dbec-4ac2-91c3-189d27907ec0' }
        ],
        caution:'Përputhja bëhet me komponentin trimethoprim, jo me shumën totale të dy substancave.'
      },
      'Nitrofurantoin':{
        forms:[
          { id:'nitro-cap-25', label:'Kapsulë macrocrystals 25 mg', form:'kapsulë', componentMg:25, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cfa20cfd-478f-48c6-9b59-3c425abd766a', caution:'Vetëm lower UTI; kontrollo kriteret renale.' },
          { id:'nitro-cap-50', label:'Kapsulë macrocrystals 50 mg', form:'kapsulë', componentMg:50, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cfa20cfd-478f-48c6-9b59-3c425abd766a', caution:'Vetëm lower UTI; kontrollo kriteret renale.' },
          { id:'nitro-cap-100', label:'Kapsulë macrocrystals 100 mg', form:'kapsulë', componentMg:100, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cfa20cfd-478f-48c6-9b59-3c425abd766a', caution:'Vetëm lower UTI; kontrollo kriteret renale.' }
        ]
      },
      'Ciprofloxacin':{
        forms:[
          { id:'cipro-tab-250', label:'Tabletë 250 mg', form:'tabletë', componentMg:250, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4deea61e-f3ca-b35d-e063-6294a90a9d41', caution:'Përdorim pediatrik rezervë; mos e ndaj automatikisht tabletën.' },
          { id:'cipro-tab-500', label:'Tabletë 500 mg', form:'tabletë', componentMg:500, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4deea61e-f3ca-b35d-e063-6294a90a9d41', caution:'Përdorim pediatrik rezervë; mos e ndaj automatikisht tabletën.' },
          { id:'cipro-tab-750', label:'Tabletë 750 mg', form:'tabletë', componentMg:750, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4deea61e-f3ca-b35d-e063-6294a90a9d41', caution:'Përdorim pediatrik rezervë; mos e ndaj automatikisht tabletën.' }
        ]
      },
      'Levofloxacin':{
        forms:[
          { id:'levo-tab-250', label:'Tabletë 250 mg', form:'tabletë', componentMg:250, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=consumer&setid=a23a1cca-bc3e-48c5-abd9-82eddb52e91b', caution:'Përdorim pediatrik rezervë; funksioni renal mund të kërkojë ndryshim intervali.' },
          { id:'levo-tab-500', label:'Tabletë 500 mg', form:'tabletë', componentMg:500, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=consumer&setid=a23a1cca-bc3e-48c5-abd9-82eddb52e91b', caution:'Përdorim pediatrik rezervë; funksioni renal mund të kërkojë ndryshim intervali.' },
          { id:'levo-tab-750', label:'Tabletë 750 mg', form:'tabletë', componentMg:750, sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=consumer&setid=a23a1cca-bc3e-48c5-abd9-82eddb52e91b', caution:'Përdorim pediatrik rezervë; funksioni renal mund të kërkojë ndryshim intervali.' }
        ]
      }
    },
    indicationOverrides:{
      'aom|Amoxicillin / clavulanate':{ disabled:true, note:'Skema high-dose AOM kërkon raport specifik; forma solide nuk sugjerohet automatikisht.' },
      'sinusitis|Amoxicillin / clavulanate':{ disabled:true, note:'Skema high-dose e sinusitit kërkon raport specifik; forma solide nuk sugjerohet automatikisht.' },
      'uti-cystitis|Amoxicillin / clavulanate':{ disabled:true, note:'CPS nuk specifikon produktin/raportin; forma solide mbetet manuale.' },
      'uti-pyelo|Amoxicillin / clavulanate':{ disabled:true, note:'CPS nuk specifikon produktin/raportin; forma solide mbetet manuale.' },
      'cellulitis|Amoxicillin / clavulanate':{ allow:['amoxclav-tab-875-125'] },
      'preseptal|Amoxicillin / clavulanate':{ allow:['amoxclav-tab-875-125'] },
      'bite|Amoxicillin / clavulanate':{ allow:['amoxclav-tab-875-125'] },
      'lymphadenitis|Amoxicillin / clavulanate':{ allow:['amoxclav-tab-875-125'] },
      'wound-cut|Amoxicillin / clavulanate':{ allow:['amoxclav-tab-875-125'] }
    }
  });
})();