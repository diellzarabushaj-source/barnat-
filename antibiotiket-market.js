(() => {
  'use strict';
  const list=document.getElementById('recommendationList');if(!list)return;
  let catalog=null,loading=null;
  const selections=new WeakMap();
  const remembered=new Map();
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const clean=x=>String(x??'').trim();
  const fmt=x=>String(Number(Number(x).toFixed(2))).replace('.',',');
  function syncAnswer(card){
    const answers=[...card.querySelectorAll('.abx-market-dose')];
    card.classList.toggle('abx-has-market-answer',answers.length>0&&answers.every(answer=>answer.dataset.ready==='true'));
  }
  function selection(card,drug){return selections.get(card)?.get(drug)||null;}
  function eligible(card,drug,form,variant,product){
    const c=variant?.concentration;
    if(window.DRX_PENICILLIN_PROTOCOLS){
      const reason=window.DRX_PENICILLIN_PROTOCOLS.productReason({drug,rule:JSON.parse(card.dataset.productRule||'null'),months:Number(card.dataset.ageMonths),confirmed:card.dataset.ageConfirmed==='true',form,concentration:c,product});
      if(reason)return reason;
    }else if(!product||product.population==='Adult only')return 'Ky produkt shënohet vetëm për të rritur në regjistër.';
    if(form.route!=='oral')return 'Formë jo orale: mos përdor konvertimin e shurupit ose tabletës. Përgatitja IV/IM kontrollohet sipas produktit.';
    if(form.modified)return 'Çlirimi i modifikuar kërkon skemë specifike për këtë produkt.';
    if(c?.reason||c?.unit!=='mg'||!(c.value>0))return c?.reason||'Përmbajtja për njësi kërkon verifikim.';
    if(form.measure==='liquid'&&!(c.perML>0))return 'Nuk jepet përqendrim i verifikuar për mL.';
    if(!['liquid','whole'].includes(form.measure))return 'Kjo formë nuk ka konvertim automatik.';
    if(drug==='Amoxicillin / clavulanate'&&!window.DRX_PENICILLIN_PROTOCOLS){
      const ratio=Number(clean(c.basis).split('|ratio:')[1]?.replace(',','.'));
      const indication=new URL(location.href).searchParams.get('indication');
      const allowed=['aom','sinusitis'].includes(indication)?[14]:indication==='bite'?[4,7]:[7];
      if(!allowed.some(r=>Math.abs(r-ratio)<0.05))return `Kjo skemë kërkon raport ${allowed[0]}:1 amoxicillin/clavulanate; ky produkt nuk ndërrohet automatikisht.`;
      if(indication==='wound-cut'&&Math.abs(c.value-875)>0.1)return 'Skema fikse 875/125 mg kërkon produkt me të dy komponentët në këtë fortësi.';
    }
    return '';
  }
  function enhance(card){
    if(card.querySelector('.abx-market'))return;
    const title=clean(card.querySelector('.abx-option-head h3,.abx-hosp-title strong')?.textContent);
    const hospital=window.DRX_ANTIBIOTIC_HOSPITAL?.regimens.find(r=>r.id===card.dataset.regimenId);
    const normalize=name=>name==='Ampicillin/sulbactam'?'Ampicillin / sulbactam':name;
    const parts=(hospital?.dose?.parts?.map(p=>({drug:p.drug}))||window.DRX_ANTIBIOTIC_FORMULATIONS?.comboAliases?.[title]||[{drug:title}]).map(p=>({...p,drug:normalize(p.drug)}));
    if(!title||/Incizion|drenazh/i.test(title))return;
    const section=make('section','abx-market');section.append(make('strong','','Forma dhe fortësia'));
    selections.set(card,new Map());
    const update=()=>card.dispatchEvent(new CustomEvent('abx:market-product'));
    if(!catalog){
      section.append(make('p','',loading?'Po ngarkohen produktet…':'Produktet nuk u ngarkuan.'));
      if(!loading){const retry=make('button','','Provo përsëri');retry.type='button';retry.onclick=()=>load();section.append(retry);}
    }else for(const part of parts){
      const entry=catalog.drugs.find(d=>d.name===part.drug);
      const body=make('div','abx-market-component');
      if(parts.length>1)body.append(make('strong','',part.drug));
      if(!entry?.forms.length){body.append(make('p','','Nuk u gjet produkt i publikuar në regjistrin AKKPM për këtë substancë.'));section.append(body);continue;}
      const field=(text)=>{const label=make('label','');label.append(make('span','',text));const select=make('select','');select.setAttribute('aria-label',`${text} · ${part.drug}`);label.append(select);body.append(label);return select;};
      const formSelect=field('Forma'),strengthSelect=field('Fortësia / përqendrimi'),productSelect=field('Produkti');
      const productDetails=make('details','abx-market-product'),productSummary=make('summary','','Produktet AKKPM · opsionale');
      productDetails.append(productSummary,productSelect.parentElement);body.append(productDetails);
      const result=make('div','abx-market-dose');result.setAttribute('aria-live','polite');result.setAttribute('role','group');result.setAttribute('aria-label',`Dozimi · ${part.drug}`);body.append(result);
      const splitLabel=make('label','abx-split-confirm');splitLabel.hidden=true;
      const splitInput=make('input');splitInput.type='checkbox';
      splitLabel.append(splitInput,make('span','','Konfirmoj nga fletudhëzimi i këtij produkti: tableta ndahet në dy doza të barabarta.'));body.append(splitLabel);
      splitInput.onchange=()=>{const picked=selection(card,part.drug);if(picked){picked.equalHalvesConfirmed=splitInput.checked;showDose(picked);syncAnswer(card);update();}};
      const info=make('p','abx-market-info');info.setAttribute('aria-live','polite');body.append(info);
      body.insertBefore(result,productDetails);
      const options=(select,rows,placeholder)=>{select.replaceChildren();select.append(new Option(placeholder,''));rows.forEach(r=>select.append(new Option(r.label||r.name,r.id||r.key)));select.disabled=!rows.length;};
      options(formSelect,entry.forms,'Zgjidh formën…');
      let form=null,variant=null;
      const memoryKey=card.dataset.regimenId+'|'+part.drug;
      const previous=remembered.get(memoryKey);
      let restoring=true;
      const showDose=picked=>{
        result.replaceChildren();
        result.dataset.ready='false';
        if(!picked||picked.reason){result.hidden=true;if(card.dataset.simpleUi==='true')splitLabel.hidden=true;return;}
        result.hidden=false;
        const weight=Number(clean(document.getElementById('weightInput')?.value).replace(',','.'));
        if(card.dataset.weightRequired!=='false'&&!(weight>=1&&weight<=200)){result.append(make('span','','Shkruaj peshën reale për dozën.'));return;}
        if(card.dataset.ageRequired==='true'&&card.dataset.ageConfirmed!=='true'){result.append(make('span','','Konfirmo moshën reale për këtë skemë.'));return;}
        const conversion=window.DRX_ANTIBIOTIC_MARKET_MATH?.convert({doseText:card.dataset.exactDoseText,drug:part.drug,combo:parts.length>1,form:picked.form,concentration:picked.variant.concentration,allowHalf:picked.equalHalvesConfirmed});
        if(!conversion||conversion.error){result.append(make('span','',conversion?.error||'Konvertimi nuk u ngarkua. Rifresko faqen.'));return;}
        if(card.dataset.simpleUi==='true')splitLabel.hidden=!(picked.form.measure==='whole'&&picked.form.unit==='tabletë'&&!picked.form.modified&&conversion.rows.some(row=>row.mgMin!==row.mgMax||!Number.isInteger(row.mgMin/picked.variant.concentration.value)));
        const frequencies=JSON.parse(card.dataset.doseFrequencies||'[]');
        const frequency=frequencies.find(item=>item.drug===part.drug)?.frequency||'';
        const schedules=window.DRX_ANTIBIOTIC_MARKET_MATH.dailyTotals(conversion,frequency);
        result.classList.toggle('abx-market-alternate',schedules.length>1);
        result.dataset.ready=String(schedules.length>0&&conversion.rows.every(row=>row.unit==='mL'||row.units||row.choices.length));
        const ceiling=JSON.parse(card.dataset.doseCeilings||'[]').find(item=>item.drug===part.drug);
        const range=(min,max)=>`${fmt(min)}${min!==max?'–'+fmt(max):''}`;
        const amount=row=>row.unit==='mL'?`${range(row.min,row.max)} mL`:row.units?`${window.DRX_ANTIBIOTIC_MARKET_MATH.formatUnits(row.units)} ${row.unit}`:row.choices.map(c=>`${window.DRX_ANTIBIOTIC_MARKET_MATH.formatUnits(c.units)} ${row.unit} (${fmt(c.mg)} mg)`).join(' ose ');
        const basis=picked.variant.concentration.basis?.split('|')[0];
        const milligrams=row=>{
          const choices=row.unit!=='mL'&&!row.units&&row.choices.length?row.choices:null;
          return `${range(choices?choices[0].mg:row.mgMin,choices?choices.at(-1).mg:row.mgMax)} mg${basis?' · '+basis:''}`;
        };
        conversion.rows.forEach((row,index)=>{
          const phase=make('div','abx-market-dose-phase');result.append(phase);
          if(conversion.rows.length>1)phase.append(make('b','abx-market-phase-label',row.label));
          const single=make('div','abx-market-single');
          single.append(make('span','abx-market-dose-label',`Për një marrje${weight>=1?' · '+fmt(weight)+' kg':''} · nga goja`));
          const representable=row.unit==='mL'||row.units||row.choices.length;
          if(representable)single.append(make('strong','',amount(row)));
          else single.append(make('span','','Doza nuk përputhet me produktin. Zgjidh fortësi tjetër ose konfirmo ndarjen e tabletës sipas fletudhëzimit. Kapsulat nuk ndahen.'));
          single.append(make('span','abx-market-mg',milligrams(row)));phase.append(single);
          if(representable)for(const schedule of schedules){
            const timing=make('div','abx-market-schedule');
            timing.append(make('strong','',`${schedule.times} herë/ditë`),make('span','',`Çdo ${schedule.hours} orë`));
            if(schedules.length>1)timing.prepend(make('span','abx-market-dose-label','Opsion orari'));
            const daily=make('div','abx-market-daily');
            daily.append(make('span','abx-market-dose-label','Gjithsej në 24 orë'),make('strong','',amount(schedule.rows[index])),make('span','abx-market-mg',milligrams(schedule.rows[index])));
            const plan=make('div','abx-market-plan');plan.append(timing,daily);phase.append(plan);
          }
          if(!schedules.length&&representable)phase.append(make('small','','Orari dhe totali ditor kërkojnë zgjedhjen e një skeme të përcaktuar.'));
          if(row.unit==='mL'&&row.mgMin!==row.mgMax)phase.append(make('small','',`Kufiri për ${fmt(weight)} kg në këtë skemë: ${fmt(row.max)} mL për marrje. Zgjidh një dozë brenda intervalit.`));
          if(row.unit!=='mL'&&!row.units&&row.choices.length)phase.append(make('small','','Doza të realizueshme brenda intervalit. Konfirmo një dozë te receta.'));
          const limit=ceiling?.rows[index],maximum=make('div','abx-market-maximum');
          maximum.append(make('span','abx-market-dose-label',ceiling?.fixed?'Doza e kësaj skeme':`Kufiri i llogaritur për ${fmt(weight)} kg · kjo skemë`));
          if(Number.isFinite(limit?.mg)&&limit.mg>0){
            const perDose=limit.mg;
            const mg=`${fmt(perDose)} mg${basis?' · '+basis:''} / marrje`;
            if(row.unit==='mL')maximum.append(make('strong','',`${fmt(perDose*picked.variant.concentration.perML/picked.variant.concentration.value)} mL / marrje`));
            maximum.append(make('span','abx-market-maximum-mg',mg));
            for(const schedule of schedules){
              const dailyMg=perDose*schedule.times;
              const volume=row.unit==='mL'?`${fmt(dailyMg*picked.variant.concentration.perML/picked.variant.concentration.value)} mL · `:'';
              maximum.append(make('span','abx-market-maximum-daily',`${schedules.length>1?schedule.times+' herë/ditë: ':''}${volume}${fmt(dailyMg)} mg / 24 orë`));
            }
          }
          if(Number.isFinite(limit?.absoluteMg)){
            const source=make('details','abx-market-ceiling-source');source.append(make('summary','','Kufiri i burimit'));
            source.append(make('span','',`${fmt(limit.absoluteMg)} mg${basis?' · '+basis:''} / marrje`));
            for(const schedule of schedules)source.append(make('span','',`${schedules.length>1?schedule.times+' herë/ditë: ':''}${fmt(limit.absoluteMg*schedule.times)} mg / 24 orë · sipas frekuencës`));
            source.append(make('small','','Për peshën e dhënë zbatohet kufiri më i ulët i shfaqur më sipër.'));maximum.append(source);
          }else maximum.append(make('small','',ceiling?.fixed?'Kjo është doza e zgjedhur e protokollit; nuk është maksimumi universal i barit.':limit?'Burimi nuk përcakton maksimum absolut.':'Kontrollo kufirin te skema më sipër.'));
          if(card.dataset.simpleUi==='true'){const details=make('details','abx-market-limits');details.append(make('summary','','Doza dhe kufijtë'),maximum);phase.append(details);}else phase.append(maximum);
        });
        const course=make('div','abx-market-course');course.append(make('span','','Kohëzgjatja'),make('strong','',clean(card.querySelector('.abx-duration')?.textContent)||'Përcaktohet sipas skemës'));result.append(course);
        if(conversion.rows.some(row=>row.unit==='mL'&&[row.min,row.max].some(value=>Math.abs(value-Number(value.toFixed(2)))>1e-9))){
          result.append(make('small','abx-market-rounding','Vëllimet janë të rrumbullakosura. Totali ditor llogaritet nga mg, pa rrumbullakosje.'));
        }
      };
      const publish=()=>{
        const product=variant?.products.find(p=>String(p.id)===productSelect.value);
        splitInput.checked=false;splitLabel.hidden=!(product&&form?.measure==='whole'&&form.unit==='tabletë'&&!form.modified);
        selections.get(card).delete(part.drug);
        if(!product){if(!restoring)remembered.delete(memoryKey);body.append(info);info.textContent='Zgjidh formën dhe fortësinë.';showDose(null);productSummary.textContent='Produktet AKKPM · opsionale';syncAnswer(card);update();return;}
        const reason=eligible(card,part.drug,form,variant,product);
        info.textContent=reason||`${product.packaging||product.form} · Nr. ${product.registryNumber}`;
        info.dataset.tone=reason?'blocked':'ready';
        if(reason)body.append(info);else productDetails.append(info);
        const picked={form,variant,product,reason,label:`${product.name} · ${product.strength} · ${form.label}`};
        selections.get(card).set(part.drug,picked);showDose(picked);productSummary.textContent=`${product.name} · ndrysho produktin`;syncAnswer(card);update();
        remembered.set(memoryKey,{form:form.key,variant:variant.id,product:String(product.id)});
      };
      formSelect.onchange=()=>{form=entry.forms.find(f=>f.key===formSelect.value);variant=null;options(strengthSelect,form?.variants||[],'Zgjidh fortësinë…');options(productSelect,[],'Zgjidh fortësinë më parë');publish();};
      strengthSelect.onchange=()=>{variant=form?.variants.find(v=>v.id===strengthSelect.value);options(productSelect,variant?.products||[],'Zgjidh produktin…');const preferred=variant?.products.find(p=>!eligible(card,part.drug,form,variant,p))||variant?.products[0];if(preferred)productSelect.value=String(preferred.id);publish();};
      productSelect.onchange=publish;
      options(strengthSelect,[],'Zgjidh formën më parë');options(productSelect,[],'Zgjidh fortësinë më parë');
      if(previous){formSelect.value=previous.form;formSelect.onchange();strengthSelect.value=previous.variant;strengthSelect.onchange();productSelect.value=previous.product;publish();}
      restoring=false;
      if(!previous)showDose(null);
      section.append(body);
    }
    section.append(make('small','','Regjistri tregon produktet e publikuara, jo stokun aktual në barnatore.'));
    card.append(section);
    syncAnswer(card);
  }
  function scan(){document.querySelectorAll('.abx-option,.abx-hosp-card').forEach(enhance);}
  function redraw(){document.querySelectorAll('.abx-market').forEach(n=>n.remove());scan();list.querySelectorAll('.abx-option').forEach(card=>card.dispatchEvent(new CustomEvent('abx:market-product')));}
  async function load(){
    if(loading)return loading;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    loading=fetch('/api/dosage?view=antibiotic-market',{credentials:'same-origin',signal:controller.signal,headers:{Accept:'application/json'}}).then(async r=>{if(!r.ok)throw Error('catalog');const data=await r.json();if(!Array.isArray(data.drugs))throw Error('catalog');catalog=data;}).catch(()=>{catalog=null;}).finally(()=>{clearTimeout(timer);loading=null;redraw();});
    redraw();return loading;
  }
  window.DRX_ANTIBIOTIC_MARKET={selection,eligible,reload:load};
  new MutationObserver(scan).observe(list,{childList:true,subtree:false});scan();void load();
  window.addEventListener('drx:antibiotics-hospital-rendered',scan);
})();
