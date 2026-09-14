/* Master v2.8 UI: source-backed calculations stay server-side; this file only simplifies presentation and input flow. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
  const fmt=value=>new Intl.NumberFormat('sq',{maximumFractionDigits:4}).format(value);
  const ABX_STATE_KEY='drx.antibiotics.context.v2';
  const PATIENT_STATE_KEY='drx.dosage.patient.v1';

  const INDICATION_SQ=Object.freeze({
    IND001:'Arrest kardiak',
    IND002:'Anafilaksi',
    IND003:'Bradikardi simptomatike me shenja të rënda',
    IND006:'VF / takikardi ventrikulare pa puls pas shokut elektrik',
    IND008:'Urgjencë hipertensive',
    IND014:'Dhimbje akute pas operacionit — rruga rektale',
    IND016:'Dhimbje mesatare deri e fortë',
    IND018:'Temperaturë ose dhimbje e lehtë–mesatare',
    IND019:'Temperaturë ose dhimbje',
    IND022:'Nauze ose të vjella',
    IND025:'Spazma akute të barkut, veshkave ose rrugëve biliare',
    IND026:'Nauze/të vjella pas operacionit — parandalim ose trajtim',
    IND027:'Nauze/të vjella pas operacionit — parandalim ose trajtim',
    IND028:'Edemë ose ascit nga sëmundja e zemrës apo mëlçisë',
    IND029:'Edemë pulmonare akute',
    IND031:'Zëvendësim i lëngjeve me IV',
    IND033:'Hipoglikemi e rëndë',
    IND036:'Sinusit bakterial akut',
    IND037:'Otit media akut',
    IND038:'Tonsilit/faringjit GAS, bronkit i përkeqësuar ose pneumoni komunitare',
    IND039:'Infeksione të zakonshme të ndjeshme — dozë standarde për të rritur',
    IND040:'Infeksione që kërkojnë dozë më të lartë (otit, sinusit, respirator ose urinar)',
    IND043:'Infeksione të zgjedhura respiratore, ORL ose të lëkurës',
    IND045:'Infeksion anaerob',
    IND048:'Tonsilit/faringjit ose sinusit bakterial akut',
    IND049:'Otit media akut ose infeksione më të rënda',
    IND050:'Cistit',
    IND051:'Pielonefrit',
    IND053:'Keratit nga herpes simplex',
    IND054:'Infeksion kërpudhor i lëkurës',
    IND055:'Kandidiazë orale',
    IND058:'Konjuktivit bakterial akut',
    IND060:'Skorbut / mungesë e vitaminës C — i rritur',
    IND061:'Mungesë e vitaminës B6',
    IND062:'Neurit periferik nga izoniazidi — trajtim',
  });

  const AGE_BANDS=Object.freeze([
    {id:'newborn',months:0,kg:3.3,label:'i porsalindur'},
    {id:'3m',months:3,kg:6.2,label:'3 muaj'},
    {id:'6m',months:6,kg:7.6,label:'6 muaj'},
    {id:'1y',months:12,kg:9,label:'1 vjeç'},
    {id:'2y',months:24,kg:12,label:'2 vjeç'},
    {id:'4y',months:48,kg:16,label:'4 vjeç'},
    {id:'6y',months:72,kg:20,label:'6 vjeç'},
    {id:'8y',months:96,kg:25,label:'8 vjeç'},
    {id:'10y',months:120,kg:32,label:'10 vjeç'},
    {id:'12y',months:144,kg:40,label:'12 vjeç e lart'},
  ]);

  let rows=[],drugId='',selected=null,revision=0,pending,autoTimer=null,ageWasManual=false;

  function simplifyStaticCopy(){
    document.title='DRx | Dozologjia';
    const header=document.querySelector('.dosage-page>header');
    if(header){
      const h1=header.querySelector('h1');if(h1)h1.textContent='Doza, thjesht.';
      const copy=header.querySelector('p:not(.master-eyebrow)');if(copy)copy.textContent='Zgjidh barin → arsyen → shëno të dhënat e pacientit.';
    }
    const choiceTitle=document.querySelector('#masterChoice h2');if(choiceTitle)choiceTitle.textContent='2. Për çfarë përdoret?';
    const indication=document.querySelector('label[for="masterIndication"]');if(indication)indication.textContent='Për çfarë përdoret?';
    const regimen=document.querySelector('label[for="masterRegimens"]');if(regimen)regimen.textContent='Mënyra e dhënies';
    const patientTitle=document.querySelector('#masterPatient h2');if(patientTitle)patientTitle.textContent='3. Pacienti dhe forma';
    const submit=document.querySelector('.master-submit');if(submit)submit.textContent='Shfaq dozën';
  }

  function indicationLabel(row){return INDICATION_SQ[row.indicationId]||row.indication;}
  function routeLabel(route){
    return ({PO:'Nga goja',IV:'IV · në venë',IM:'IM · në muskul',IV_IO:'IV/IO',SC:'Nën lëkurë',RECTAL:'Rektal',TOPICAL:'Në lëkurë',OPHTHALMIC:'Në sy'})[route]||route;
  }
  function populationLabel(value){
    return String(value||'')
      .replace(/Pediatric/gi,'Fëmijë')
      .replace(/Adult\/adolescent/gi,'I rritur / adoleshent')
      .replace(/Adult/gi,'I rritur')
      .replace(/adolescent/gi,'adoleshent')
      .replace(/>12y/gi,'mbi 12 vjeç')
      .replace(/>12/gi,'mbi 12 vjeç')
      .replace(/>3 mo/gi,'mbi 3 muaj');
  }
  function frequencyLabel(value){
    return String(value||'Sipas skemës')
      .replace(/\bq(\d+)[–-](\d+)h\b/gi,'çdo $1–$2 orë')
      .replace(/\bq(\d+)h\b/gi,'çdo $1 orë')
      .replace(/\bPRN\b/g,'sipas nevojës')
      .replace(/\bTID\b/g,'3 herë/ditë')
      .replace(/\bBID\b/g,'2 herë/ditë')
      .replace(/\bQID\b/g,'4 herë/ditë');
  }
  function gateLabel(text){
    const clean=String(text||'').trim();
    const exact={
      'Renal context must be checked before adjustment/output.':'Kontrollo funksionin e veshkave.',
      'Hepatic context applies.':'Kontrollo funksionin e mëlçisë.',
      'Specialist/protocol context required.':'Kërkohet protokoll ose vlerësim specialisti.',
      'ECG/BP':'Monitoro EKG-në dhe tensionin.',
      'BP/HR monitoring':'Monitoro tensionin dhe pulsin.',
    };
    return exact[clean]||clean;
  }
  function formKind(product,route){
    const text=`${product?.form||''} ${product?.name||''}`.toLowerCase();
    if(/suspension|syrup|oral solution|solution oral|granule/.test(text))return {id:'liquid',label:'Shurup / suspension'};
    if(/tablet|capsule|caplet|chew/.test(text))return {id:'solid',label:'Tableta / kapsula'};
    if(/suppository|rectal/.test(text))return {id:'rectal',label:'Supozitor / rektal'};
    if(/ophthalm|eye|drop/.test(text))return {id:'eye',label:'Pika / preparat për sy'};
    if(/cream|ointment|gel|topical|cutaneous/.test(text))return {id:'topical',label:'Krem / preparat për lëkurë'};
    if(/inject|infusion|ampou|vial|parenteral/.test(text)||['IV','IM','IV_IO','SC'].includes(route))return {id:'injectable',label:'Injeksion / infuzion'};
    return {id:'other',label:'Formulim tjetër'};
  }
  function invalidate(){revision++;pending?.abort();clearTimeout(autoTimer);$('masterResult').hidden=true;$('masterResult').replaceChildren();$('masterErrors').replaceChildren();}
  function option(select,value,label){const o=el('option',label);o.value=value;select.append(o);}
  function field(label,node,className=''){const l=el('label');if(className)l.className=className;l.append(el('span',label),node);$('masterFields').append(l);return node;}
  function number(id,label){const n=el('input');n.id=id;n.type='number';n.min='0';n.step='any';n.required=true;n.inputMode='decimal';return field(label,n,'master-field');}
  function select(id,label){const n=el('select');n.id=id;return field(label,n,'master-field');}
  function checkbox(id,label){const n=el('input');n.id=id;n.type='checkbox';n.required=true;const l=el('label');l.className='master-check';l.append(n,el('span',label));$('masterFields').append(l);return n;}
  function isPediatric(r){return /pediatric|child|fëmij|6–12|3 mo/i.test(String(r.population||''));}
  function nearestAgeBand(weight){
    if(!Number.isFinite(weight))return null;
    return AGE_BANDS.reduce((best,band)=>!best||Math.abs(band.kg-weight)<Math.abs(best.kg-weight)?band:best,null);
  }
  function setAgeFromBand(band){
    const age=$('masterAge'),unit=$('masterAgeUnit');if(!age||!unit||!band||band.months<=0)return false;
    if(band.months<12){age.value=String(band.months);unit.value='month';}
    else {age.value=String(band.months/12);unit.value='year';}
    age.dataset.derived='weight';unit.dataset.derived='weight';ageWasManual=false;
    return true;
  }
  function updateAgeHint(r){
    const hint=$('masterAgeHint');if(!hint)return;
    const age=$('masterAge');
    if(age?.dataset.derived==='weight'){
      hint.textContent='Mosha u vendos afërsisht nga pesha, si te Antibiotikët. Ndryshoje nëse mosha reale është tjetër.';
      hint.dataset.tone='reference';
    }else{
      hint.textContent=r.needs.age?'Shëno moshën reale kur skema ka kufi moshe.':'';
      hint.dataset.tone='idle';
    }
  }
  function applyAgeFromWeight(r){
    if(!r?.needs?.age||!r.needs.weight||!isPediatric(r)||ageWasManual)return;
    const weight=Number($('masterWeight')?.value);
    if(!Number.isFinite(weight)||weight<=0)return;
    const band=nearestAgeBand(weight);
    if(setAgeFromBand(band))updateAgeHint(r);
  }
  function readStoredPatient(){
    const out={weight:'',age:'',ageUnit:'',ageBand:''};
    try{
      const own=JSON.parse(localStorage.getItem(PATIENT_STATE_KEY)||'null');
      if(own&&typeof own==='object'){out.weight=String(own.weight||'');out.age=String(own.age||'');out.ageUnit=String(own.ageUnit||'');}
    }catch{}
    try{
      const abx=JSON.parse(localStorage.getItem(ABX_STATE_KEY)||'null');
      if(abx&&typeof abx==='object'){if(!out.weight)out.weight=String(abx.weight||'');out.ageBand=String(abx.age||'');}
    }catch{}
    return out;
  }
  function persistPatient(){
    try{
      localStorage.setItem(PATIENT_STATE_KEY,JSON.stringify({
        weight:$('masterWeight')?.value||'',
        age:$('masterAge')?.value||'',
        ageUnit:$('masterAgeUnit')?.value||'',
      }));
    }catch{}
  }
  function prefillPatient(r){
    const stored=readStoredPatient();
    const weight=$('masterWeight'),age=$('masterAge'),unit=$('masterAgeUnit');
    if(weight&&stored.weight)weight.value=stored.weight;
    if(age&&unit&&stored.age&&['year','month'].includes(stored.ageUnit)){age.value=stored.age;unit.value=stored.ageUnit;ageWasManual=true;}
    else if(age&&unit&&isPediatric(r)){
      const band=AGE_BANDS.find(item=>item.id===stored.ageBand);
      if(band)setAgeFromBand(band);
      else applyAgeFromWeight(r);
    }
    updateAgeHint(r);
  }
  function renderProducts(r){
    if(!r.products.length){
      const note=el('p','Forma nuk ka konvertim të lidhur në Master — shfaqet vetëm doza e verifikuar.');
      note.className='master-form-note';$('masterFields').append(note);return;
    }
    const kinds=[];const seen=new Set();
    r.products.forEach(product=>{const kind=formKind(product,r.route);if(!seen.has(kind.id)){seen.add(kind.id);kinds.push(kind);}});
    const form=select('masterFormType','Forma');
    kinds.forEach(kind=>option(form,kind.id,kind.label));
    const product=select('masterProduct','Forca / produkti');
    product.required=r.needs.product;
    const populate=()=>{
      const matches=r.products.filter(item=>formKind(item,r.route).id===form.value);
      product.replaceChildren();
      if(!r.needs.product)option(product,'','Vetëm doza');
      else if(matches.length!==1)option(product,'','Zgjidh forcën');
      matches.forEach(item=>option(product,item.id,`${item.name} · ${item.strength}`));
      if(matches.length===1)product.value=matches[0].id;
    };
    form.addEventListener('change',()=>{invalidate();populate();scheduleAuto();});
    product.addEventListener('change',()=>{invalidate();scheduleAuto();});
    populate();
  }
  function pickRegimen(){
    invalidate();selected=rows.find(r=>r.id===$('masterRegimens').value);$('masterPatient').hidden=!selected;$('masterFields').replaceChildren();if(!selected)return;
    ageWasManual=false;
    const r=selected;
    const meta=el('p',`${populationLabel(r.population)} · ${routeLabel(r.route)} · ${frequencyLabel(r.frequency)}`);meta.className='master-regimen-summary';$('masterFields').append(meta);
    if(r.needs.weight)number('masterWeight','Pesha (kg)');
    if(r.needs.age){number('masterAge','Mosha');const u=select('masterAgeUnit','Njësia');option(u,'year','Vjet');option(u,'month','Muaj');const hint=el('p');hint.id='masterAgeHint';hint.className='master-hint';$('masterFields').append(hint);}
    if(r.needs.daily)number('masterDaily',`Sasia e dhënë në 24 orët e fundit (${r.unit}) — 0 nëse asnjë`);
    if(r.needs.total)number('masterTotal',`Sasia e dhënë në këtë episod (${r.unit}) — 0 nëse asnjë`);
    if(r.steps.length){const s=select('masterStep','Hapi i trajtimit');s.required=true;option(s,'','Zgjidh hapin');r.steps.forEach(x=>option(s,x.id,`${x.order}. ${x.label}`));}
    renderProducts(r);
    checkbox('masterScope',`Po — pacienti i përket këtij grupi: ${populationLabel(r.population)}.`);
    r.gates.forEach(g=>checkbox(g.Gate_ID,gateLabel(g.Rule_Text)));
    if(r.safety){const d=el('details');d.className='master-safety';d.append(el('summary','Kujdes / kufizime'),el('p',r.safety));$('masterFields').append(d);}
    prefillPatient(r);
    $('masterWeight')?.addEventListener('input',()=>{applyAgeFromWeight(r);persistPatient();});
    $('masterAge')?.addEventListener('input',()=>{ageWasManual=true;$('masterAge').dataset.derived='';updateAgeHint(r);persistPatient();});
    $('masterAgeUnit')?.addEventListener('change',()=>{ageWasManual=true;$('masterAge')?.setAttribute('data-derived','');updateAgeHint(r);persistPatient();});
    scheduleAuto();
  }
  function pickIndication(){
    invalidate();const s=$('masterRegimens');s.replaceChildren();
    rows.filter(r=>r.drugId===drugId&&r.indicationId===$('masterIndication').value)
      .forEach(r=>option(s,r.id,`${routeLabel(r.route)} · ${populationLabel(r.population)} · ${frequencyLabel(r.frequency)}`));
    pickRegimen();
  }
  function pickDrug(id){
    drugId=id;invalidate();$('masterChoice').hidden=false;
    const s=$('masterIndication');s.replaceChildren();const seen=new Set();
    rows.filter(r=>r.drugId===id).forEach(r=>{if(!seen.has(r.indicationId)){option(s,r.indicationId,indicationLabel(r));seen.add(r.indicationId);}});
    renderDrugs();pickIndication();
  }
  function renderDrugs(){
    const q=$('dosageSearch').value.trim().toLocaleLowerCase('sq');$('masterDrugs').replaceChildren();const seen=new Set();
    rows.forEach(r=>{if(seen.has(r.drugId)||!r.drug.toLocaleLowerCase('sq').includes(q))return;seen.add(r.drugId);const b=el('button',r.drug);b.type='button';b.setAttribute('aria-pressed',String(drugId===r.drugId));b.addEventListener('click',()=>pickDrug(r.drugId));$('masterDrugs').append(b);});
    if(!seen.size)$('masterDrugs').append(el('p','Nuk u gjet bar aktiv.'));
  }
  const amount=d=>`${fmt(d.min)}${d.min===d.max?'':'–'+fmt(d.max)} ${d.unit}`;
  function render(result){
    const box=$('masterResult');box.replaceChildren();
    box.append(el('p','REZULTATI'),el('h2',`${result.drug} · ${routeLabel(result.route)}`),el('p',INDICATION_SQ[selected?.indicationId]||result.indication));
    box.firstElementChild.className='master-result-kicker';
    const value=el('p',result.dose?`${amount(result.dose)} / ${result.dose.period==='day'?'ditë':'dozë'}`:result.instruction||'Sipas përgjigjes klinike');value.className='master-dose';box.append(value);
    if(result.conversion){const c=el('p',amount(result.conversion));c.className='master-volume';box.append(c,el('p',`${result.conversion.product} · ${result.conversion.strength}`));}
    if(result.step){const s=result.step;box.append(el('p',`Hapi: ${s.Trigger}`));if(s.Start_Day)box.append(el('p',`Ditët: ${s.Start_Day}–${s.End_Day}`));if(s.Delay_Min)box.append(el('p',`Intervali: ${s.Delay_Min}–${s.Delay_Max} ${s.Delay_Unit}`));if(s.Notes)box.append(el('p',s.Notes));}
    for(const t of [result.frequencyNote,result.durationNote,result.safety,...result.notices])if(t)box.append(el('p',t));
    result.maxima.forEach(m=>box.append(el('p',`Kufiri: ${m.Display_Max||`${m.Max_Min} ${m.Max_Unit}`}`)));
    if(result.preparation){const p=result.preparation;box.append(el('h3','Përgatitja'),el('p',p.instruction));if(p.timeMin)box.append(el('p',`${p.timeMin}–${p.timeMax} ${p.timeUnit}`));if(p.minimumMinutesAtMaxDose)box.append(el('p',`Koha minimale në dozën maksimale: ${Math.ceil(p.minimumMinutesAtMaxDose)} minuta`));if(p.notes)box.append(el('p',p.notes));}
    const sources=el('details');sources.append(el('summary','Burimet · SOURCE_AUDITED_ONLY'));
    result.sources.forEach(s=>{const p=el('p',`${s.Source_ID} · ${s.Title||s.Source_Title||s.Source_Name||''}`);const url=Object.values(s).find(v=>typeof v==='string'&&/^https:\/\//.test(v));if(url){const a=el('a','Hap burimin');a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(' ',a);}sources.append(p);});
    box.append(sources);box.hidden=false;
  }
  function makeInput(r){
    const input={regimenId:r.id,drugId:r.drugId,indicationId:r.indicationId,scope:$('masterScope').checked,gates:{}};
    for(const [id,key] of [['masterAge','age'],['masterWeight','weight'],['masterDaily','given24h'],['masterTotal','givenTotal']])if($(id))input[key]=Number($(id).value);
    if($('masterAgeUnit'))input.ageUnit=$('masterAgeUnit').value;
    if($('masterProduct')?.value)input.productId=$('masterProduct').value;
    if($('masterStep'))input.stepId=$('masterStep').value;
    r.gates.forEach(g=>{if($(g.Gate_ID)?.checked)input.gates[g.Gate_ID]='PASS';});
    return input;
  }
  function readyForAuto(){
    if(!selected)return false;
    for(const node of $('masterForm').querySelectorAll('[required]')){
      if(node.type==='checkbox'){if(!node.checked)return false;}
      else if(!String(node.value||'').trim())return false;
    }
    return true;
  }
  async function calculate({validate=false}={}){
    invalidate();if(!selected)return;
    if(validate&&!$('masterForm').reportValidity())return;
    if(!validate&&!readyForAuto())return;
    const r=selected,token=revision;pending=new AbortController();$('masterErrors').textContent='';
    try{
      const response=await fetch('/api/dosage?view=master-calculate',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(makeInput(r)),signal:pending.signal});
      const result=await response.json();if(token!==revision)return;
      if(!response.ok||result.outcome==='BLOCKED')throw Error((result.errors||[result.error||'Llogaritja dështoi.']).join('\n'));
      render(result);
    }catch(e){if(token===revision&&e.name!=='AbortError')$('masterErrors').textContent=e.message;}
  }
  function scheduleAuto(){
    clearTimeout(autoTimer);if(!readyForAuto())return;
    autoTimer=setTimeout(()=>void calculate(),250);
  }
  function submit(event){event.preventDefault();void calculate({validate:true});}
  async function boot(){
    try{
      await window.DRxDosageShell.ensureAuth();
      const response=await fetch('/api/dosage?view=master-catalog',{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error('Master-i nuk mund të ngarkohet.');
      const data=await response.json();rows=data.regimens;renderDrugs();$('masterStatus').textContent=`${rows.length} skema aktive · Master v2.7`;
    }catch(e){$('masterStatus').textContent=e.message;}
  }
  $('dosageSearch').addEventListener('input',()=>{invalidate();renderDrugs();});
  $('masterIndication').addEventListener('change',pickIndication);
  $('masterRegimens').addEventListener('change',pickRegimen);
  $('masterForm').addEventListener('input',event=>{if(event.target?.id!=='masterWeight'&&event.target?.id!=='masterAge')invalidate();scheduleAuto();});
  $('masterForm').addEventListener('change',()=>{invalidate();persistPatient();scheduleAuto();});
  $('masterForm').addEventListener('submit',submit);
  simplifyStaticCopy();
  void boot();
})();
