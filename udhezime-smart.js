
/* DRX Udhëzime Smart — local-only clinical drafting assistant.
   Patient form values never leave browser memory. ICD GET is a fixed same-origin static JSON request. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const keys = ['institution','department','destination','specialty','patientName','age','date','priority','reason','onset','duration','associated','sbp','dbp','pulse','temp','spo2','rr','weight','history','allergies','exam','investigations','medications','diagnosis','icdCode','question','physician','license'];
  const fields = () => Object.fromEntries(keys.map(k => [k, $(k)?.value?.trim() || '']));
  const clean = x => String(x == null ? '' : x).replace(/\r/g,'').split('\n').map(s => s.replace(/[ \t]+/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
  const norm = s => clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9.]+/g,' ').replace(/\s+/g,' ').trim();
  const normalizeDisplayDate = x => x ? x.split('-').reverse().join('.') : '';
  const catalogSource = '/data/icd-qkmf-hot-search-v1.json';
  let catalog = [];
  let priorHistory = null;
  let noticeTimer;
  const rules = [
    {terms:['dhimbje gjoksi','shtrengim gjoksi','dhimbje retrosternale'],section:'Dhimbje torakale',danger:true,ask:[['Fillimi, kohëzgjatja, karakteri dhe intensiteti i dhimbjes','onset'],['Përhapja e dhimbjes dhe faktorët provokues','associated'],['Dispne, sinkopë ose simptoma të tjera shoqëruese','associated'],['TA, pulsi dhe EKG-ja, nëse janë kryer','sbp']]},
    {terms:['palpitacione','rrahje te shpejta','takikardi'],section:'Palpitacione',ask:[['Kur kanë filluar dhe sa shpesh paraqiten episodet?','onset'],['Sa zgjasin episodet?','duration'],['Sinkopë, marramendje, dispne ose dhimbje gjoksi?','associated'],['Pulsi, TA dhe EKG-ja, nëse janë dokumentuar','pulse']]},
    {terms:['marramendje','vertigo','trullim'],section:'Marramendje',ask:[['Fillimi, kohëzgjatja dhe lidhja me pozicionin','onset'],['Sinkopë, çrregullime të të folurit ose dëgjimit','associated'],['Parametrat vitalë dhe ekzaminimi, nëse janë kryer','exam']]},
    {terms:['kolle','kollë','dispne','bronkit','veshtiresi ne frymemarrje'],section:'Simptoma respiratore',ask:[['Kohëzgjatja e kollës dhe ndryshimet e simptomave','duration'],['Sputum, hemoptizi ose dispne shoqëruese','associated'],['FR, SpO₂ dhe temperatura, nëse janë matur','spo2'],['Auskultacioni dhe ekzaminimet e kryera','exam']]},
    {terms:['temperaturë','temperature','ethe','febril'],section:'Temperaturë',ask:[['Sa ditë zgjasin simptomat?','duration'],['Temperatura e MATUR, nëse dihet','temp'],['Simptomat shoqëruese dhe hidratimi i vlerësuar','associated']]},
    {terms:['dhimbje barku','abdomen akut','kolike renale','kolikë renale'],section:'Dhimbje abdominale',ask:[['Lokalizimi, fillimi dhe karakteri i dhimbjes','onset'],['Vjellje, jashtëqitja, urinimi dhe temperaturë','associated'],['Ekzaminimi i abdomenit dhe shenjat peritoneale, nëse janë vlerësuar','exam'],['Analizat ose imazheria nëse janë kryer','investigations']]},
    {terms:['mpirje','hemiparez','pares','dobesi e krahut','crregullim i te folurit','stroke','insult'],section:'Simptoma neurologjike',danger:true,ask:[['Koha e fillimit dhe hera e fundit pa simptoma, nëse dihet','onset'],['Deficitet neurologjike të vlerësuara','exam'],['TA, glikemia dhe ekzaminimet në dispozicion','investigations'],['Barnat antikoaguluese, nëse përdoren','medications']]},
    {terms:['dhimbje koke','migrene','migrenë'],section:'Cefale',ask:[['Fillimi, intensiteti, shpeshtësia dhe karakteri','onset'],['Simptoma shoqëruese dhe ndryshim nga episodet e mëparshme','associated'],['Statusi neurologjik, nëse është ekzaminuar','exam']]},
    {terms:['veshi','otit','dhimbje veshi','fyt','otalgia'],section:'ORL',ask:[['Kohëzgjatja dhe anësia e simptomave','duration'],['Sekrecione, temperaturë apo ndryshim dëgjimi','associated'],['Otoskopia dhe/ose orofaringu nëse janë ekzaminuar','exam']]},
    {terms:['diarre','vjellje','nauze','gastroenterit'],section:'Simptoma gastrointestinale',ask:[['Kohëzgjatja dhe frekuenca e simptomave','duration'],['Hidratimi, diureza dhe toleranca orale, nëse janë vlerësuar','exam'],['Temperaturë, gjak në jashtëqitje ose dhimbje','associated']]},
    {terms:['hipertension','tension i larte'],section:'Hipertension',ask:[['TA e matur dhe matjet e përsëritura, nëse ka','sbp'],['Simptoma të dëmtimit akut të organeve, nëse janë vlerësuar','associated'],['Terapia antihipertensive e raportuar','medications']]}
  ];
  function notify(msg) {
    const el = $('status'); el.textContent = msg; el.classList.add('visible');
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => el.classList.remove('visible'), 3600);
  }
  function guidance(q, specialty) {
    const n = norm(q), result=[], seen = new Set(); let danger = false;
    rules.forEach(rule => {
      if (!rule.terms.some(t => (' ' + n + ' ').includes(' ' + norm(t) + ' '))) return;
      if (rule.danger) danger = true;
      rule.ask.forEach(([title,target]) => {
        if (seen.has(title)) return;
        seen.add(title);
        result.push({section:rule.section,title,target});
      });
    });
    if (norm(specialty).includes('pediatr')) {
      result.push({section:'Pediatri',title:'Mosha dhe pesha e matur kur relevante',target:'weight'});
      result.push({section:'Pediatri',title:'Statusi i hidratimit dhe gjetjet në ekzaminim, kur janë vlerësuar',target:'exam'});
    }
    if (!result.length && specialty) {
      result.push({section:specialty,title:'Historia klinike dhe koha e fillimit të simptomave',target:'history'});
      result.push({section:specialty,title:'Ekzaminimi objektiv i dokumentuar',target:'exam'});
      result.push({section:specialty,title:'Pyetja e saktë për specialistin',target:'question'});
    }
    return {danger,items:result.slice(0,9)};
  }
  function contextUpdate(f) {
    const ctx = guidance([f.reason,f.associated,f.history].filter(Boolean).join(' '), f.specialty);
    $('danger').hidden = !ctx.danger;
    const root = $('suggestions'); root.replaceChildren();
    if (!ctx.items.length) {
      const d = document.createElement('div'); d.className='assistant-empty';
      const heading=document.createElement('strong'); heading.textContent='Asistenti është gati';
      const text=document.createElement('p');text.textContent='Shkruaj arsyen e konsultës ose zgjidh specialitetin. Pyetjet orientuese do të shfaqen këtu.';
      d.append(heading,text);root.append(d);return;
    }
    ctx.items.forEach(item => {
      const d=document.createElement('div');d.className='suggestion';
      const title=document.createElement('small');title.textContent=item.section;
      const body=document.createElement('span');body.textContent=item.title;
      const button=document.createElement('button');button.type='button';button.textContent='Plotëso fushën ↗';
      button.addEventListener('click',() => {
        const field=$(item.target);if(!field)return;
        document.querySelector('.shell')?.classList.remove('preview-mode');
        document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='edit'));
        field.focus({preventScroll:true});field.scrollIntoView({behavior:'smooth',block:'center'});
        notify('Pyetje orientuese: '+item.title+'. Shkruaj vetëm të dhëna të verifikuara.');
      });
      d.append(title,body,button);root.append(d);
    });
  }
  function createDraft(f) {
    const parts = [];
    const add = (label,value) => {if(clean(value))parts.push(label + ': ' + clean(value).replace(/[.\s]+$/,'') + '.');};
    add('Ankesa kryesore e raportuar',f.reason);
    add('Fillimi i simptomave',f.onset);
    add('Kohëzgjatja / shpeshtësia',f.duration);
    add('Simptoma shoqëruese të raportuara',f.associated);
    const measured = [];
    if (f.sbp && f.dbp) measured.push('TA '+f.sbp+'/'+f.dbp+' mmHg');
    if (f.pulse) measured.push('Pulsi '+f.pulse+'/min');
    if (f.temp) measured.push('Temperatura '+f.temp+' °C');
    if (f.spo2) measured.push('SpO₂ '+f.spo2+'%');
    if (f.rr) measured.push('FR '+f.rr+'/min');
    if (f.weight) measured.push('Pesha '+f.weight+' kg');
    if (measured.length) parts.push('Parametrat e matur: '+measured.join('; ')+'.');
    return parts.join('\n');
  }
  function warnNumbers(f) {
    const constraints=[['sbp','TA sistolike',40,300],['dbp','TA diastolike',20,200],['pulse','Pulsi',20,250],['temp','Temperatura',25,45],['spo2','SpO₂',1,100],['rr','FR',1,90],['weight','Pesha',0.1,400]];
    const out=constraints.filter(([id,,lo,hi])=>f[id]&&(!Number.isFinite(Number(f[id]))||Number(f[id])<lo||Number(f[id])>hi)).map(([,label])=>'Kontrollo vlerën e futur: '+label+'.');
    if(f.sbp && f.dbp && Number(f.sbp)<Number(f.dbp))out.push('Kontrollo raportin e TA sistolike/diastolike.');
    return out;
  }
  function completeness(f) {
    const required=[['destination','Institucioni pritës'],['patientName','Pacienti'],['reason','Arsyeja e konsultës'],['question','Pyetja për specialistin'],['physician','Mjeku dërgues']];
    const missing=required.filter(([id])=>!f[id]);const root=$('checklist');root.replaceChildren();
    if(!missing.length){const d=document.createElement('div');d.className='check-item check-ok';d.textContent='✓ Pesë rubrikat kryesore janë plotësuar. Verifiko përmbajtjen klinike para lëshimit.';root.append(d);}
    missing.forEach(([id,title])=>{
      const d=document.createElement('div');d.className='check-item';
      const text=document.createElement('span');text.textContent='○ '+title;
      const btn=document.createElement('button');btn.type='button';btn.textContent='Plotëso →';btn.addEventListener('click',()=>$(id).focus());
      d.append(text,btn);root.append(d);
    });
    const extras=['exam','investigations','medications','allergies'].filter(k=>!f[k]).length;
    const note=document.createElement('div');note.className='check-note';note.textContent=extras+' rubrika klinike shtesë ende pa të dhëna. Mungesa e dokumentimit nuk nënkupton gjetje normale.';root.append(note);
    $('numericWarnings').textContent=warnNumbers(f).join(' ');
  }
  function searchICD(rows,q){
    const n=norm(q);if(n.length<2)return[];
    return rows.map(r=>{
      const terms=[r.code,r.label_sq,...(r.aliases||[])].map(norm);
      const score=norm(r.code)===n?0:norm(r.label_sq)===n?1:terms.some(t=>t.startsWith(n))?2:terms.some(t=>t.includes(n))?3:99;
      return Object.assign({},r,{score});
    }).filter(r=>r.score<99).sort((a,b)=>a.score-b.score || a.label_sq.localeCompare(b.label_sq,'sq')).slice(0,8);
  }
  function icdUpdate() {
    const q=$('icdSearch').value, results=$('icdResults');results.replaceChildren();
    const found=searchICD(catalog,q);$('icdSearch').setAttribute('aria-expanded',String(found.length>0));
    if(norm(q).length<2)return;
    if(!found.length){
      const p=document.createElement('div');p.className='provenance';p.textContent='Nuk u gjet përputhje në këtë katalog orientues. Mund ta shkruash kodin manualisht.';results.append(p);return;
    }
    found.forEach(item=>{
      const b=document.createElement('button');b.type='button';b.className='icd-result';b.setAttribute('role','option');
      const left=document.createElement('span');const main=document.createElement('strong');main.textContent=item.label_sq;
      const caption=document.createElement('small');caption.textContent='DRX – katalog orientues; kërkohet verifikimi i mjekut';
      const code=document.createElement('code');code.textContent=item.code;left.append(main,caption);b.append(left,code);
      b.addEventListener('click',()=>{
        if(!confirm('Të përdoret kodi '+item.code+' ('+item.label_sq+')? Mjeku duhet të verifikojë përputhjen klinike.'))return;
        if (($('diagnosis').value.trim() && $('diagnosis').value.trim() !== item.label_sq) || ($('icdCode').value.trim() && $('icdCode').value.trim() !== item.code)) {
          if(!confirm('Të zëvendësohet diagnoza/kodi ekzistues?'))return;
        }
        $('diagnosis').value=item.label_sq;$('icdCode').value=item.code;$('icdSearch').value='';
        results.replaceChildren();$('icdSearch').setAttribute('aria-expanded','false');updateAll();
        notify('Kodi u shtua me konfirmimin tënd. Verifiko diagnozën.');
      });
      results.append(b);
    });
  }
  function plain(f) {
    const lines=['UDHËZIM PËR KONSULTIM','Model DRX – jo formular zyrtar',''];
    const put=(key,label)=>{if(f[key])lines.push(label+': '+clean(f[key]));};
    put('date','Data');put('institution','Institucioni dërgues');put('department','Reparti');put('destination','Drejtuar');put('specialty','Specialiteti');put('priority','Prioriteti');
    lines.push('');put('patientName','Pacienti');put('age','Mosha');lines.push('');
    put('reason','ARSYEJA E KONSULTËS');put('history','ANAMNEZA');
    if([f.sbp,f.dbp,f.pulse,f.temp,f.spo2,f.rr,f.weight].some(Boolean)) lines.push('PARAMETRAT E MATUR: '+createDraft(Object.assign({},f,{reason:'',onset:'',duration:'',associated:''})).replace(/^Parametrat e matur: /,''));
    put('allergies','ALERGJITË');put('exam','EKZAMINIMI');put('investigations','ANALIZAT / IMAZHERIA');put('medications','TRAJTIMI AKTUAL');put('diagnosis','DIAGNOZA E PUNËS');put('icdCode','ICD-10');put('question','PYETJA PËR SPECIALISTIN');
    lines.push('');put('physician','Mjeku dërgues');put('license','Licenca');return lines.join('\n').trim();
  }
  function printLine(container,label,value) {
    if(!clean(value))return;
    const block=document.createElement('div');block.className='paper-line';
    const head=document.createElement('strong');head.textContent=label;
    const body=document.createElement('span');body.textContent=clean(value);block.append(head,body);container.append(block);
  }
  function render(f) {
    const text=plain(f);
    $('miniText').textContent=text;
    const meta=$('paperMeta'),details=$('paperDetails');meta.replaceChildren();details.replaceChildren();
    [['Data',normalizeDisplayDate(f.date)],['Institucioni dërgues',f.institution],['Reparti',f.department],['Drejtuar',f.destination],['Specialiteti',f.specialty],['Prioriteti',f.priority],['Pacienti',f.patientName],['Mosha / datëlindja',f.age]].forEach(([label,value])=>printLine(meta,label,value));
    [['ARSYEJA E KONSULTËS',f.reason],['ANAMNEZA',f.history],['ALERGJITË',f.allergies],['EKZAMINIMI OBJEKTIV',f.exam],['ANALIZAT / IMAZHERIA',f.investigations],['TRAJTIMI AKTUAL',f.medications],['DIAGNOZA E PUNËS',f.diagnosis],['KODI ICD-10',f.icdCode],['PYETJA KLINIKE',f.question]].forEach(([label,value])=>printLine(details,label,value));
    $('paperDate').textContent=f.date?'Data: '+normalizeDisplayDate(f.date):'';
    $('paperPhysician').textContent=f.physician+(f.license?' · Licenca: '+f.license:'');
  }
  function updateAll() {const f=fields();contextUpdate(f);completeness(f);render(f);}
  function applyDraft(append) {
    const proposed=$('draftPreview').textContent;
    if(!proposed)return;
    priorHistory=$('history').value;
    $('history').value=(append && priorHistory.trim() ? priorHistory.trim()+'\n\n' : '')+proposed;
    $('draftBox').hidden=true;updateAll();notify('Drafti u vendos në anamnezë. Rishiko saktësinë klinike.');
  }
  async function copy() {
    const value=plain(fields());
    try{await navigator.clipboard.writeText(value);notify('Teksti i udhëzimit u kopjua.');}
    catch{notify('Kopjimi nuk është i disponueshëm në këtë shfletues. Përdor Printo / PDF.');}
  }
  function reset() {
    if(!confirm('Të pastrohen të gjitha të dhënat e këtij formulari?'))return;
    keys.forEach(k=>{if($(k))$(k).value='';});
    $('priority').value='Rutinë';$('date').value=localDate();$('icdSearch').value='';$('icdResults').replaceChildren();
    $('draftBox').hidden=true;priorHistory=null;updateAll();notify('Formulari u pastrua.');
  }
  function localDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
  function mount(){
    const form=$('refForm');if(!form)return;
    form.addEventListener('submit',e=>e.preventDefault());
    $('date').value=localDate();
    keys.forEach(id=>{$(id)?.addEventListener('input',updateAll);$(id)?.addEventListener('change',updateAll);});
    $('icdSearch').addEventListener('input',icdUpdate);
    $('draftButton').addEventListener('click',()=>{
      const draft=createDraft(fields());
      if(!draft){notify('Së pari shkruaj ankesën, kohëzgjatjen ose një parametër të matur.');return;}
      $('draftPreview').textContent=draft;$('draftBox').hidden=false;
      $('draftBox').scrollIntoView({block:'nearest',behavior:'smooth'});
    });
    $('discardDraft').addEventListener('click',()=>$('draftBox').hidden=true);
    $('applyDraft').addEventListener('click',()=>applyDraft(false));
    $('appendDraft').addEventListener('click',()=>applyDraft(true));
    $('undoDraft').addEventListener('click',()=>{
      if(priorHistory===null){notify('Nuk ka ndryshim të mëparshëm për të rikthyer.');return;}
      const current=$('history').value;$('history').value=priorHistory;priorHistory=current;updateAll();notify('Anamneza u rikthye.');
    });
    ['printSide','printTop'].forEach(id=>$(id).addEventListener('click',()=>{render(fields());window.print();}));
    $('copy').addEventListener('click',copy);
    $('reset').addEventListener('click',reset);
    document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{
      const showingPreview=button.dataset.tab==='preview';
      document.querySelector('.shell').classList.toggle('preview-mode',showingPreview);
      document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));
    }));
    updateAll();
    fetch(catalogSource,{credentials:'omit',cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('Katalogu i padisponueshëm');return r.json();})
      .then(d=>{catalog=Array.isArray(d.rows)?d.rows:[];$('catalogStatus').textContent='Burimi: DRX / katalogu lokal QKMF · '+catalog.length+' terma orientues. Kodet duhen verifikuar nga mjeku.';icdUpdate();})
      .catch(()=>{$('catalogStatus').textContent='Katalogu orientues ICD-10 nuk u ngarkua. Shkruaj kodin manualisht.';});
  }
  if(typeof module==='object' && module.exports)module.exports={norm,guidance,createDraft,searchICD,warnNumbers,plain};
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',mount);
})();
