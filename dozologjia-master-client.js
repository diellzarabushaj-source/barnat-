/* Master v2.7: all clinical calculations remain on the authenticated server. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
  let rows=[],drugId='',selected=null,revision=0,pending;
  function invalidate(){revision++;pending?.abort();$('masterResult').hidden=true;$('masterResult').replaceChildren();$('masterErrors').replaceChildren();}
  function option(select,value,label){const o=el('option',label);o.value=value;select.append(o);}
  function field(label,node){const l=el('label',label);l.append(node);$('masterFields').append(l);return node;}
  function number(id,label){const n=el('input');n.id=id;n.type='number';n.min='0';n.step='any';n.required=true;return field(label,n);}
  function select(id,label){const n=el('select');n.id=id;return field(label,n);}
  function checkbox(id,label){const n=el('input');n.id=id;n.type='checkbox';n.required=true;const l=field(label,n);l.parentElement.className='master-check';return n;}
  function pickRegimen(){
    invalidate();selected=rows.find(r=>r.id===$('masterRegimens').value);$('masterPatient').hidden=!selected;$('masterFields').replaceChildren();if(!selected)return;
    const r=selected;$('masterFields').append(el('p',`${r.population} · ${r.route} · ${r.frequency||'Sipas hapit'}`));
    if(r.needs.age){number('masterAge','Mosha');const u=select('masterAgeUnit','Njësia e moshës');option(u,'year','Vjet');option(u,'month','Muaj');}
    if(r.needs.weight)number('masterWeight','Pesha (kg)');
    if(r.needs.daily)number('masterDaily',`Sasia e dhënë në 24 orët e fundit (${r.unit}); shëno 0 nëse asnjë`);
    if(r.needs.total)number('masterTotal',`Sasia e dhënë në këtë episod (${r.unit}); shëno 0 nëse asnjë`);
    if(r.steps.length){const s=select('masterStep','Hapi i trajtimit');s.required=true;option(s,'','Zgjidh hapin');r.steps.forEach(x=>option(s,x.id,`${x.order}. ${x.label}`));}
    if(r.products.length){const p=select('masterProduct','Formulimi konkret');p.required=r.needs.product;option(p,'',r.needs.product?'Zgjidh produktin':'Vetëm doza');r.products.forEach(x=>option(p,x.id,`${x.name} · ${x.strength}`));}
    checkbox('masterScope',`Pacienti përputhet me grupin dhe kushtet e skemës: ${r.population}.`);
    r.gates.forEach(g=>checkbox(g.Gate_ID,g.Rule_Text));
    if(r.safety){const d=el('details');d.append(el('summary','Kushtet e përdorimit'),el('p',r.safety));$('masterFields').append(d);}
  }
  function pickIndication(){invalidate();const s=$('masterRegimens');s.replaceChildren();rows.filter(r=>r.drugId===drugId&&r.indicationId===$('masterIndication').value).forEach(r=>option(s,r.id,`${r.route} · ${r.population} · ${r.frequency||'Skemë me hapa'} · ${r.id}`));pickRegimen();}
  function pickDrug(id){drugId=id;invalidate();$('masterChoice').hidden=false;const s=$('masterIndication');s.replaceChildren();const seen=new Set();rows.filter(r=>r.drugId===id).forEach(r=>{if(!seen.has(r.indicationId)){option(s,r.indicationId,r.indication);seen.add(r.indicationId);}});renderDrugs();pickIndication();}
  function renderDrugs(){const q=$('dosageSearch').value.toLowerCase();$('masterDrugs').replaceChildren();const seen=new Set();rows.forEach(r=>{if(seen.has(r.drugId)||!r.drug.toLowerCase().includes(q))return;seen.add(r.drugId);const b=el('button',r.drug);b.type='button';b.setAttribute('aria-pressed',String(drugId===r.drugId));b.addEventListener('click',()=>pickDrug(r.drugId));$('masterDrugs').append(b);});if(!seen.size)$('masterDrugs').append(el('p','Nuk u gjet bar aktiv.'));}
  const amount=d=>`${new Intl.NumberFormat('sq',{maximumFractionDigits:4}).format(d.min)}${d.min===d.max?'':'–'+new Intl.NumberFormat('sq',{maximumFractionDigits:4}).format(d.max)} ${d.unit}`;
  function render(result){
    const box=$('masterResult');box.replaceChildren();box.append(el('h2',`${result.drug} · ${result.route}`),el('p',result.indication));
    const value=el('p',result.dose?`${amount(result.dose)} / ${result.dose.period==='day'?'ditë':'dozë'}`:result.instruction||'Sipas përgjigjes klinike');value.className='master-dose';box.append(value);
    if(result.conversion){const c=el('p',amount(result.conversion));c.className='master-volume';box.append(c,el('p',`${result.conversion.product} · ${result.conversion.strength}`));}
    if(result.step){const s=result.step;box.append(el('p',`Hapi: ${s.Trigger}`));if(s.Start_Day)box.append(el('p',`Ditët: ${s.Start_Day}–${s.End_Day}`));if(s.Delay_Min)box.append(el('p',`Intervali i hapit: ${s.Delay_Min}–${s.Delay_Max} ${s.Delay_Unit}`));if(s.Notes)box.append(el('p',s.Notes));}
    // Keep the exact stored instructions; never infer a schedule from free text.
    for(const t of [result.frequencyNote,result.durationNote,result.safety,...result.notices])if(t)box.append(el('p',t));
    result.maxima.forEach(m=>box.append(el('p',`Kufiri: ${m.Display_Max||`${m.Max_Min} ${m.Max_Unit}`}`)));
    if(result.preparation){const p=result.preparation;box.append(el('h3','Përgatitja'),el('p',p.instruction));if(p.timeMin)box.append(el('p',`${p.timeMin}–${p.timeMax} ${p.timeUnit}`));if(p.minimumMinutesAtMaxDose)box.append(el('p',`Koha minimale në dozën maksimale: ${Math.ceil(p.minimumMinutesAtMaxDose)} minuta`));if(p.notes)box.append(el('p',p.notes));}
    const sources=el('details');sources.append(el('summary','Burimet · SOURCE_AUDITED_ONLY'));result.sources.forEach(s=>{const p=el('p',`${s.Source_ID} · ${s.Title||s.Source_Title||s.Source_Name||''}`);const url=Object.values(s).find(v=>typeof v==='string'&&/^https:\/\//.test(v));if(url){const a=el('a','Hap burimin');a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(' ',a);}sources.append(p);});box.append(sources);box.hidden=false;
  }
  async function submit(event){event.preventDefault();invalidate();if(!selected||!$('masterForm').reportValidity())return;const r=selected,token=revision;pending=new AbortController();const input={regimenId:r.id,drugId:r.drugId,indicationId:r.indicationId,scope:$('masterScope').checked,gates:{}};
    for(const [id,key] of [['masterAge','age'],['masterWeight','weight'],['masterDaily','given24h'],['masterTotal','givenTotal']])if($(id))input[key]=Number($(id).value);
    if($('masterAgeUnit'))input.ageUnit=$('masterAgeUnit').value;
    if($('masterProduct')?.value)input.productId=$('masterProduct').value;if($('masterStep'))input.stepId=$('masterStep').value;
    r.gates.forEach(g=>{if($(g.Gate_ID).checked)input.gates[g.Gate_ID]='PASS';});
    try{const response=await fetch('/api/dosage?view=master-calculate',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:pending.signal});const result=await response.json();if(token!==revision)return;if(!response.ok||result.outcome==='BLOCKED')throw Error((result.errors||[result.error||'Llogaritja dështoi.']).join('\n'));render(result);}catch(e){if(token===revision&&e.name!=='AbortError')$('masterErrors').textContent=e.message;}
  }
  async function boot(){try{await window.DRxDosageShell.ensureAuth();const response=await fetch('/api/dosage?view=master-catalog',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('Master-i nuk mund të ngarkohet.');const data=await response.json();rows=data.regimens;renderDrugs();$('masterStatus').textContent=`${rows.length} skema aktive · Master v2.7`;}catch(e){$('masterStatus').textContent=e.message;}}
  $('dosageSearch').addEventListener('input',()=>{invalidate();renderDrugs();});$('masterIndication').addEventListener('change',pickIndication);$('masterRegimens').addEventListener('change',pickRegimen);$('masterForm').addEventListener('input',invalidate);$('masterForm').addEventListener('change',invalidate);$('masterForm').addEventListener('submit',submit);void boot();
})();
