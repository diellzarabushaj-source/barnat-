(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.DRX_PENICILLIN_PROTOCOLS = api;
    if (root.DRX_ANTIBIOTIC_GUIDE) root.DRX_ANTIBIOTIC_GUIDE = api.attach(root.DRX_ANTIBIOTIC_GUIDE);
  }
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';

  // Each indication owns its dose, interval, duration and product ratio. Never
  // extend a pediatric coefficient into adults or round it to a tablet strength.
  const version = '2026-10-29-penicillins-v1';
  const sources = [
    ['nice-ng91','NICE NG91 · <18','Otitis media akute','https://www.nice.org.uk/guidance/ng91/chapter/Recommendations'],
    ['nhs-fife-aom','NHS Fife · 18+','Otitis media te të rriturit','https://www.rightdecisions.scot.nhs.uk/nhs-fife/hospital-guidance/ear-nose-and-throat/'],
    ['nice-ng84','NICE NG84','Faringjit akut','https://www.nice.org.uk/guidance/ng84/chapter/Recommendations'],
    ['nice-ng79','NICE NG79','Sinusit akut','https://www.nice.org.uk/guidance/ng79/chapter/Recommendations'],
    ['nice-ng250','NICE NG250 · 2025','Pneumoni komunitare','https://www.nice.org.uk/guidance/ng250/chapter/Recommendations'],
    ['nice-ng109','NICE NG109','UTI e poshtme','https://www.nice.org.uk/guidance/ng109/chapter/Recommendations'],
    ['nice-ng111','NICE NG111','Pielonefrit akut','https://www.nice.org.uk/guidance/ng111/chapter/Recommendations'],
    ['nice-ng141','NICE NG141','Cellulitis / erizipelë','https://www.nice.org.uk/guidance/ng141/chapter/Recommendations'],
    ['nice-ng153','NICE NG153','Impetigo','https://www.nice.org.uk/guidance/ng153/chapter/Recommendations'],
    ['emc-coamox-500-125','SmPC · Co-amoxiclav 500/125','Co-amoxiclav 4:1 · kufijtë sipas peshës','https://www.medicines.org.uk/emc/product/101680/smpc'],
    ['nice-ng184','NICE NG184','Kafshime nga njerëzit dhe kafshët','https://www.nice.org.uk/guidance/ng184/chapter/Recommendations'],
  ].map(([id,short,title,url]) => ({id,short,title,url,date:'verified 2026-10-29',note:'Skemë sipas indikacionit dhe moshës. Grupmoshat pediatrike supozojnë madhësi mesatare; përmasat atipike, funksioni renal dhe shtatzënia kërkojnë vlerësim klinik.'}));
  const penicillin = drug => /^(?:Amoxicillin(?: \/ clavulanate)?|Penicillin [VG]|Benzathine penicillin G|Ampicillin(?:\s*\/\s*sulbactam)?|Flucloxacillin|Cloxacillin|Piperacillin \+ Tazobactam|Pivmecillinam)$/i.test(drug || '');
  const permitted = ['none','a0','a4'];
  const fixed = (value, second) => ({type:'fixed',value,text:`${value}${second === undefined ? '' : '/'+second} mg/dozë`,...(second === undefined ? {} : {component:'amoxicillin',secondComponent:second})});
  const regimen = (id,drug,dose,times,days,source,extra={}) => ({id,drug,dose,route:'PO',frequency:`${times} herë/ditë`,duration:{type:'fixed',text:typeof days === 'number' ? `${days} ditë` : days,defaultDays:typeof days==='number'?days:days==='5–7 ditë'?5:days==='5–10 ditë'?10:days==='7–10 ditë'?7:null},source,tier:'first',allergy:permitted,protocolVersion:version,...extra});
  const amoxMg = months => months < 12 ? 125 : months < 60 ? 250 : 500;
  const penvMg = months => months < 12 ? 62.5 : months < 72 ? 125 : months < 144 ? 250 : 500;

  function coamox(id, months, days, source, extra={}) {
    // Choose the published fixed age-band option where NICE offers an OR.
    // Infants require actual weight; the 125/31 shorthand means 125/31.25.
    let dose = months < 12
      ? {type:'single',value:6.25,unit:'mg/kg/dozë',component:'amoxicillin',ratio:4}
      : fixed(months < 72 ? 125 : months < 144 ? 250 : 500, months < 72 ? 31.25 : months < 144 ? 62.5 : 125);
    return regimen(id,'Amoxicillin / clavulanate',dose,3,days,source,{
      productRule:{ratio:4},requiresRealWeight:months < 12 || months >= 144,minRegimenWeightKg:months>=144?25:null,
      note:'Doza bazohet në amoxicillin; të dy komponentët kontrollohen. Merret me vakt. Formulimet me raport tjetër kanë skemë tjetër.',...extra,
    });
  }

  function clarithro(id, months, kg, days, source, adultMg=500) {
    let dose;
    if (months >= 144) dose = fixed(months >= 216 ? adultMg : 250);
    else if (!(kg > 0) || kg < 8) dose = {type:'single',value:7.5,unit:'mg/kg/dozë',maxDose:250};
    else if (kg < 12) dose = fixed(62.5);
    else if (kg < 20) dose = fixed(125);
    else if (kg < 30) dose = fixed(187.5);
    else if (kg <= 40) dose = fixed(250);
    else return null; // No published under-12 weight band above 40 kg.
    return regimen(id,'Clarithromycin',dose,2,days,source,{
      allergy:['a1','a2','a3'],tier:'allergy-severe',requiresRealWeight:months < 144,
      note:'Për pacientë jo shtatzënë. Kontrollo QT, ndërveprimet dhe rezistencën lokale. Doza 250 mg në 12–17 vjeç është opsioni i poshtëm i publikuar; mos rrit automatikisht.',
    });
  }

  function attach(guide) {
    const original = new Map(guide.ageBands.map(b => [b.id,b]));
    const ageBands = [{...original.get('newborn'),id:'newborn',label:'<1 muaj',months:0}];
    for (let m=1;m<12;m++) ageBands.push({...original.get(`${m}m`),id:`${m}m`,label:`${m} muaj`,months:m});
    for (let y=1;y<18;y++) ageBands.push({...original.get(`${y}y`),id:`${y}y`,label:`${y} vjeç`,months:y*12});
    ageBands.push({id:'adult',label:'Të rritur ≥18 vjeç',months:216});
    return Object.freeze({...guide,version,ageBands,sources:[...guide.sources,...sources]});
  }

  function resolve(indication, context) {
    const months = context.ageMonths;
    if (!context.ageConfirmed || !Number.isFinite(months)) return {...indication,options:[],contextMessage:'Konfirmo ose zgjidh moshën reale të pacientit. Mosha e sugjeruar nga pesha është vetëm orientuese.'};
    const adult = months >= 216;
    const kg = context.weightKg;
    const id = indication.id;
    let options = [];
    let source = indication.source;
    let message = '';
    const add = option => { if (option) options.push(option); };
    const allergyAlternative = (days,s,mg) => {
      if (!context.pregnant) add(clarithro(`clarithro-${id}-nice`,months,kg,days,s,mg));
      else if(months>=96)add(regimen(`erythro-${id}-pregnancy`,'Erythromycin',fixed(adult?500:250),4,days,s,{allergy:['a1','a2','a3'],tier:'allergy-severe',note:'Në shtatzëni, kur makrolidi indikohet; kontrollo ndërveprimet dhe QT.'}));
    };
    switch (id) {
      case 'aom':
        source = adult ? 'nhs-fife-aom' : 'nice-ng91';
        add(regimen('amox-aom','Amoxicillin',fixed(amoxMg(months)),3,adult ? 5 : '5–7 ditë',source));
        add(coamox('amoxclav-aom',months,adult ? 5 : '5–7 ditë',source,{tier:'second',conditional:'Vetëm pas rivlerësimit: përkeqësim gjatë 2–3 ditëve të trajtimit fillestar.'}));
        // NHS Fife uses doxycycline in adult penicillin allergy. Do not label
        // a different adult alternative as this source's recommendation.
        if (!adult) allergyAlternative('5–7 ditë',source);
        if (adult && !context.pregnant) add(regimen('doxy-aom-adult','Doxycycline',fixed(100),2,5,source,{allergy:['a1','a2','a3'],tier:'allergy-severe',note:'Alternativa për alergji sipas NHS Fife. Jo në shtatzëni.'}));
        if (adult && context.pregnant) add(regimen('erythro-aom-pregnancy','Erythromycin',fixed(adult ? 500 : 250),4,adult ? 5 : '5–7 ditë',source,{allergy:['a1','a2','a3'],tier:'allergy-severe',note:'Alternativë makrolide në shtatzëni kur përfitimi e justifikon trajtimin.'}));
        message = 'Konfirmo AOM me otoskopi. Analgjezi për të gjithë; vëzhgim/recetë rezervë kur përshtatet. Shenjat e mastoiditit, meningjitit ose sëmundjes sistemike kërkojnë referim urgjent. Rivlerëso në 48–72 orë.';
        break;
      case 'gas':
        source = 'nice-ng84';
        add(regimen('penicillin-gas','Penicillin V',fixed(penvMg(months)),4,'5–10 ditë',source,{note:'5 ditë mund të mjaftojnë për simptomat; 10 ditë rrisin mundësinë e eradikimit mikrobiologjik. Mos trajto faringjitin viral.'}));
        // Retain the separately sourced CDC alternative for confirmed GAS.
        add(regimen('amoxicillin-gas','Amoxicillin',adult || kg >= 40 ? fixed(1000) : {type:'single',value:50,unit:'mg/kg/dozë',maxDose:1000},1,10,'cdc-gas',{tier:'option',conditional:'Alternativë CDC për GAS të konfirmuar; skemë e veçantë nga NICE.',requiresRealWeight:!adult && !(kg >= 40)}));
        allergyAlternative(5,source,250);
        break;
      case 'pneumonia': {
        source = 'nice-ng250';
        const days = adult || months >= 144 ? 5 : 3;
        add(regimen('amox-pna','Amoxicillin',fixed(amoxMg(months)),3,days,source,{conditional:'Pneumoni komunitare jo e rëndë, pa komplikime; 3 ditë te 3 muaj–11 vjeç kur përmbushen kushtet e udhëzimit.'}));
        allergyAlternative(days,source);
        if (context.atypical && !context.pregnant) {
          const extra = clarithro('clarithro-pna-atypical',months,kg,days,source);
          if (extra) add({...extra,allergy:permitted,tier:'atypical',atypical:true,note:'Kur indikohet mbulim shtesë për atipikë, jepet bashkë me trajtimin bazë sipas vlerësimit klinik.'});
        }
        break;
      }
      case 'sinusitis':
        source = 'nice-ng79';
        add(regimen('penicillin-sinusitis','Penicillin V',fixed(penvMg(months)),4,5,source));
        add(coamox('amoxclav-sinusitis',months,5,source,{tier:'second',conditional:'Përkeqësim pas 2–3 ditësh të zgjedhjes së parë, ose rrezik i lartë sipas vlerësimit klinik. Në komplikime → referim.'}));
        allergyAlternative(5,source);
        break;
      case 'uti-cystitis':
        // NICE switches UTI age tables at 16, independently of the UI's 18+.
        source = 'nice-ng109';
        if (months < 192 || context.pregnant) add(regimen('amox-cystitis-nice','Amoxicillin',fixed(amoxMg(months)),3,context.pregnant ? 7 : 3,source,{tier:'second',requiresCulture:true,conditional:'Vetëm urinokulturë me ndjeshmëri të konfirmuar. Në ≥16 vjeç kjo kartë mbulon vetëm shtatzëninë sipas tabelës përkatëse.'}));
        else message = 'Për cistit në ≥16 vjeç, penicilina nuk jepet si zgjedhje empirike rutinë nga ky modul. Zgjedhja varet nga gjinia, shtatzënia, funksioni renal dhe urinokultura; përdor udhëzimin NICE NG109.';
        // Keep other pediatric agents explicitly attributed to their own source.
        if (months < 192) options.push(...indication.options.filter(o => !penicillin(o.drug)).map(o=>({...o,doseReviewAboveKg:40})));
        break;
      case 'uti-pyelo':
        source = 'nice-ng111';
        add(coamox('amoxclav-pyelo',months,'7–10 ditë',source,{requiresCulture:true,conditional:'Vetëm nëse urinokultura konfirmon ndjeshmërinë; jo zgjedhje empirike automatike.',requiresNotPregnant:months >= 144}));
        if (months < 192) options.push(...indication.options.filter(o => !penicillin(o.drug)).map(o=>({...o,doseReviewAboveKg:40})));
        break;
      case 'cellulitis':
      case 'impetigo': {
        source = id === 'cellulitis' ? 'nice-ng141' : 'nice-ng153';
        const mg = months < 24 ? 125 : months < 120 ? 250 : 500;
        const days = id === 'cellulitis' ? '5–7 ditë' : 5;
        add(regimen(`fluclox-${id}`,'Flucloxacillin',fixed(mg),4,days,source,{note:'Dozë brenda grupmoshës së NICE. Produkti duhet të ekzistojë në regjistër; mos e zëvendëso automatikisht me cloxacillin.'}));
        if (id === 'cellulitis' && !adult) add(coamox('amoxclav-cellulitis',months,'5–7 ditë',source,{tier:'option',conditional:'Kur flucloxacillin është i papërshtatshëm, pa alergji ndaj penicilinës.'}));
        allergyAlternative(days,source,id === 'impetigo' ? 250 : 500);
        if (id === 'impetigo') options.push(...indication.options.filter(o => o.route === 'topike'));
        break;
      }
      case 'preseptal':
        source = 'nice-ng141';
        add(coamox('amoxclav-preseptal',months,7,source,{conditional:'Vetëm infeksion i lehtë pranë syrit/hundës, pas vlerësimit dhe kur nuk ka shenja orbitale. Konsidero këshillim specialistik.'}));
        message = 'Proptoza, ulja e shikimit, dhimbja/kufizimi i lëvizjeve okulare ose ekzaminimi i pamjaftueshëm → referim urgjent. Alergjia ndaj penicilinës kërkon skemë specialistike për këtë lokalizim.';
        break;
      case 'bite':
        source = 'nice-ng184';
        add(coamox('amoxclav-bite-proph',months,3,source,{conditional:'Profilaksi vetëm nëse plotësohen kriteret e plagës me rrezik.'}));
        add(coamox('amoxclav-bite-treat',months,5,source,{conditional:'Kafshim i infektuar. Zgjatja në 7 ditë kërkon rivlerësim; përfshirja e kockës/nyjes/tendinit kërkon specialist.'}));
        message = 'Irrigim/debridim dhe vlerësim për tetanus/rabies. Alergjia ndaj penicilinës kërkon alternativë sipas moshës dhe shtatzënisë në NICE NG184; mos përdor automatikisht kombinimin pediatrik te të rriturit.';
        break;
      default:
        // Existing source-bound pediatric lymphadenitis and the >=40kg wound
        // regimen remain separate; unsupported adult rows are never inferred.
        options = adult ? indication.options.filter(o => o.id === 'amoxclav-wound-cut-ge40' || o.kind === 'procedure') : indication.options;
        options = options.map(o => penicillin(o.drug) && o.drug === 'Amoxicillin / clavulanate' ? {...o,dose:o.dose.type==='fixed'?fixed(875,125):o.dose,productRule:{ratio:7},requiresProductWeight:o.dose.type === 'fixed'} : o);
        if (adult && id === 'lymphadenitis') message = 'Skema e limfadenitit në burimin aktual është pediatrike. Në 18+ kërkohet vlerësim i etiologjisë dhe skemë e veçantë; nuk zgjatet doza sipas kg.';
    }
    // SmPC uses the adult 4:1 presentation at >=40kg regardless of chronological
    // age. Preserve the indication's duration source and label this dose source.
    options = options.map(o=>o.drug==='Amoxicillin / clavulanate'&&o.productRule?.ratio===4&&kg>=40&&months>=12&&months<144
      ? {...o,dose:fixed(500,125),source:'emc-coamox-500-125',durationSource:o.source,requiresRealWeight:true,note:o.note+' Pesha ≥40 kg: 500/125 mg çdo 8 orë sipas SmPC; grupi mbetet pediatrik.'}
      : o);
    options = options.map(o => ({...o,requiresCulture:o.requiresCulture === true,productRule:o.productRule || (o.drug === 'Amoxicillin / clavulanate' ? {ratio:7} : null)}));
    if (context.pregnant) options = options.filter(o => !o.requiresNotPregnant && o.drug !== 'Clarithromycin');
    return {...indication,source,options,contextMessage:message,protocolVersion:version,
      ...(id.startsWith('uti-') ? {doseReviewAboveKg:undefined} : {}),
      ...(id === 'aom' ? {minAgeMonths:3} : {}),
    };
  }

  function gate(option, context) {
    if (!context.ageConfirmed) return 'Zgjidh moshën reale të pacientit.';
    if (option.requiresCulture && !context.cultureSusceptible) return 'Konfirmo urinokulturën dhe ndjeshmërinë para përdorimit të kësaj peniciline.';
    if (option.requiresNotPregnant && context.pregnant) return 'Shtatzënia kërkon skemë tjetër sipas udhëzimit.';
    if(option.minRegimenWeightKg && context.weightKg>0 && context.weightKg<option.minRegimenWeightKg)return `Kjo dozë 500/125 mg kërkon të paktën ${option.minRegimenWeightKg} kg sipas kufirit të SmPC. Zgjidh skemë individuale sipas peshës dhe produktit.`;
    if (option.requiresRealWeight && !(context.weightKg > 0)) return 'Shkruaj peshën reale për këtë dozë.';
    if (option.requiresProductWeight && !(context.weightKg >= 40)) return 'Kjo skemë me tabletë për të rritur kërkon peshë reale ≥40 kg; verifiko skemën individuale dhe produktin për peshë më të ulët.';
    return '';
  }

  function productReason({drug,rule,months,confirmed,form,concentration:c,product}) {
    if (!product) return 'Zgjidh produktin.';
    if (product.population === 'Adult only' && !(confirmed && months >= 216)) return 'Ky produkt lejohet vetëm pasi të konfirmohet mosha ≥18 vjeç.';
    if (drug !== 'Amoxicillin / clavulanate') return '';
    const ratio = Number(String(c?.basis || '').split('|ratio:')[1]?.replace(',','.'));
    // Fail closed when the rule or product components are unknown.
    if (!(rule?.ratio > 0) || !(ratio > 0)) return 'Mungon raporti i verifikuar i amoxicillin/clavulanate për skemën ose produktin.';
    if (Math.abs(ratio - rule.ratio) > 0.05) return `Kjo skemë kërkon raport ${rule.ratio}:1; produkti me raport ${ratio}:1 kërkon skemë tjetër.`;
    if (form?.measure === 'whole' && rule.ratio === 7 && Math.abs(c.value - 875) > 0.1) return 'Skema 7:1 kërkon tabletën 875/125 mg; mos shumëzo automatikisht tabletat e kombinimit.';
    return '';
  }

  function resolveHospital(regimen, months) {
    if (!(months >= 216)) return regimen;
    if (regimen.drug === 'Benzathine penicillin G') return regimen;
    if (regimen.drug === 'Ampicillin') return {...regimen,dose:{type:'fixed',value:2000,component:'ampicillin'},frequency:'q4h',source:'ucsfAmpAdult',renal:'Skema standarde vetëm për CrCl >50 mL/min. Intervali ndryshon në dëmtim renal; verifiko para administrimit.',safety:'Doza standarde e të rriturit për infeksione të tjera sipas UCSF; zgjedhja për CAP kërkon pathway spitalor dhe vlerësim të patogjenit. Nuk është doza pediatrike × pesha.'};
    if (regimen.drug === 'Ampicillin/sulbactam') return {...regimen,dose:{type:'fixed',value:2000,secondComponent:1000,component:'ampicillin'},frequency:'q6h',source:'ucsfUnasynAdult',renal:'Skema standarde vetëm për CrCl >30 mL/min. Në CrCl 15–30: q12h; <15: q24h; dializa ka skemë tjetër.',safety:'2000 mg ampicillin + 1000 mg sulbactam = 3 g gjithsej për marrje. Përgatitja varet nga produkti real; mos e trajto totalin 3 g si 3 g ampicillin.'};
    // All other hospital rows are pediatric sources. An adult selection must
    // never silently reuse their mg/kg coefficients.
    return null;
  }

  return Object.freeze({version,sources,attach,resolve,gate,productReason,resolveHospital,isPenicillin:penicillin});
});
