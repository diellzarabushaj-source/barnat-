(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.DRX_OSPEN=api;api.install(root,root.document);}
})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const source={id:'ospen-smcp-2025',label:'SmPC · Ospen',url:'https://medikamente.basg.gv.at/documents/15535__DOTC_FACH_INFO.pdf',revision:'December 2025',verified:'2026-11-01'};
  const sinusitisSource=Object.freeze({id:'dk-sinusitis-iu-2025',label:'DK · sinusit',url:'https://www.sundhed.dk/sundhedsfaglig/laegehaandbogen/oere-naese-hals/tilstande-og-sygdomme/naese-og-bihuler/bihulebetaendelse-akut/',adultUrl:'https://www.sundhed.dk/content/cms/21/103521_20251125-antibiotikavejledning-for-primrsektoren.pdf',verified:'2026-11-01'});
  // Exact AKKPM identities, read from the live registry on 2026-10-30.
  // Equal halves are verified by this product's SmPC, not inferred from a score.
  const products=[
    {id:'237f3733-de55-486a-9309-a357f87e2daa',registryNumber:'2947',name:'OSPEN 1.0 - Filmtabletten',strength:'1000000 IU',iu:1000000,freeMg:590},
    {id:'069016da-1fa5-432b-87c2-ab6a9b558241',registryNumber:'2946',name:'OSPEN 1.5 - Filmtabletten',strength:'1500000 IU',iu:1500000,freeMg:885},
  ];
  products.forEach(Object.freeze);Object.freeze(products);Object.freeze(source);
  function identify(product,form,c){
    const match=products.find(row=>['id','registryNumber','name','strength'].every(key=>String(product?.[key]??'')===row[key]));
    return match&&product.activeSubstance==='Phenoxymethylpenicillin Potassium'&&product.form==='Film coated tablet'
      &&product.population==='Pediatric and adult both'&&form?.route==='oral'&&form.measure==='whole'&&form.unit==='tabletë'&&!form.modified
      &&c?.unit==='IU'&&c.value===match.iu&&!c.reason&&!c.perML?match:null;
  }
  function plan({months,weight,times=2,indication='gas'}){
    if(!['gas','sinusitis'].includes(indication))return {error:'Ky indikacion nuk ka skemë Ospen të aktivizuar.'};
    if(!Number.isFinite(months)||months<3)return {error:'Konfirmo moshën reale ≥3 muaj. Foshnjat e vogla kërkojnë vlerësim të veçantë.'};
    if(!Number.isFinite(weight)||weight<1||weight>200)return {error:'Shkruaj peshën reale 1–200 kg.'};
    if(![2,3,4].includes(times))return {error:'Skema Ospen lejon 2, 3 ose 4 marrje në ditë për këtë indikacion.'};
    // Conservative automation boundaries, not additional SmPC dose ceilings.
    if(months<144&&weight>40)return {error:'Fëmijë nën 12 vjeç mbi 40 kg: individualizo skemën; mos zgjat automatikisht intervalin sipas kg.'};
    if(months>=144&&months<216&&weight<=40)return {error:'Adoleshent ≤40 kg: tabela e tabletave jep skemë për >40 kg. Kërko dozë individuale.'};
    if(months>=216&&weight<40)return {error:'I rritur nën 40 kg: individualizo dozën para përdorimit të kësaj skeme automatike.'};
    let dailyMin=months<144?50000*weight:Math.max(3000000,25000*weight);
    let dailyMax=months<144?100000*weight:4500000;
    if(indication==='sinusitis'){
      if(months>=216){
        if(times!==4)return {error:'Ky protokoll për sinusitin te të rriturit përdor 4 marrje në ditë.'};
        if(4000000<dailyMin||4000000>dailyMax)return {error:'Skema fikse 4 000 000 IU/ditë nuk përputhet me kufijtë e produktit për këtë peshë.'};
        dailyMin=4000000;dailyMax=4000000;
      }else{
        if(![3,4].includes(times))return {error:'Ky protokoll pediatrik për sinusitin përdor 3–4 marrje në ditë.'};
        dailyMin=Math.max(dailyMin,50000*weight);dailyMax=Math.min(dailyMax,100000*weight);
      }
    }
    if(dailyMin>dailyMax)return {error:'Minimumi sipas peshës del mbi skemën standarde 4 500 000 IU/ditë. Kërko skemë individuale; 6 milionë IU nuk përdoren si tavan rutinë.'};
    // Uncomplicated sinusitis: automatic 5-day default within the cited 5–7-day course; GAS retains 10 days.
    const course=indication==='gas'?10:5;
    return {dailyMin,dailyMax,min:dailyMin/times,max:dailyMax/times,times,days:course,indication,weight,months};
  }
  function choices(p,product){
    if(!p||p.error||!products.includes(product))return [];
    p=plan(p);if(p.error)return [];
    const out=[];
    for(let n=1;n<=20;n++){
      const units=n/2,iu=units*product.iu,dailyIU=iu*p.times;
      if(dailyIU>=p.dailyMin&&dailyIU<=p.dailyMax)out.push({units,iu,dailyIU});
    }
    return out;
  }
  const fmt=n=>{const [integer,decimal]=String(n).split('.');return integer.replace(/\B(?=(\d{3})+(?!\d))/g,' ')+(decimal?','+decimal:'');};
  const units=n=>n%1===0.5?`${Math.floor(n)||''}½`:String(n);
  const tablet=n=>n===0.5?'½ tablete':`${units(n)} ${n===1?'tabletë':'tableta'}`;
  function prescription(p,product,choice){
    // Revalidate selection immediately before generating or copying a recipe.
    if(!p||p.error)return null;p=plan(p);if(p.error||!p.days)return null;
    const valid=choices(p,product).find(c=>c.units===choice?.units&&c.iu===choice?.iu);
    if(!valid)return null;
    const quantity=valid.units*p.times*p.days;
    const line=`${product.name} · ${product.strength} — ${tablet(valid.units)} PO ${p.times} herë/ditë × ${p.days} ditë`;
    return {line,quantity,iu:valid.iu,dailyIU:valid.dailyIU,text:`Penicillin V\nD.S.: ${line}.\n${fmt(valid.iu)} IU/dozë; ${fmt(valid.dailyIU)} IU/ditë.\nSasia matematike e kursit: ${fmt(quantity)} tableta.\nBurimi: ${p.indication==='sinusitis'?sinusitisSource.label+' ('+sinusitisSource.url+'); produkti: ':''}${source.label} (${source.url}).`};
  }
  function install(win,doc){
    const list=doc?.getElementById('recommendationList');if(!list)return;
    const make=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    function enhance(card){
      if(card.dataset.ospenEnhanced==='true')return;card.dataset.ospenEnhanced='true';
      const indication=card.dataset.ospenIndication||'gas';
      let times=indication==='sinusitis'?4:2,selected=null,selectedProduct='',generation=0;
      const section=make('section','abx-ospen');
      const label=make('label','abx-schedule-field');label.append(make('span','abx-label','Marrjet në ditë · SmPC Ospen'));
      const frequency=make('select');frequency.setAttribute('aria-label','Marrjet në ditë · Ospen');
      [2,3,4].forEach(n=>frequency.append(new win.Option(`${n} herë/ditë · çdo ${24/n} orë`,String(n))));frequency.value=String(times);label.append(frequency);section.append(label);
      if(indication==='sinusitis'){
        frequency.hidden=true;
        label.firstElementChild.textContent='Orari dhe kohëzgjatja · automatike';
        const schedule=make('strong','abx-ospen-auto');label.append(schedule);
        const back=make('button','abx-ospen-back','Kthehu te skema NICE në mg');back.type='button';back.onclick=()=>win.dispatchEvent(new win.CustomEvent('drx:ospen-nice'));section.append(back);
      }
      const answer=make('div','abx-ospen-answer');answer.setAttribute('aria-live','polite');section.append(answer);card.append(section);
      const context=()=>({months:Number(card.dataset.ageMonths),weight:Number(String(doc.getElementById('weightInput')?.value||'').replace(',','.')),times,indication});
      function current(){
        if(!card.isConnected||card.dataset.ageConfirmed!=='true'||(indication==='gas'&&(list.dataset.gasBlocked==='true'||list.dataset.gasConfirmed!=='true')))return null;
        const picked=win.DRX_ANTIBIOTIC_MARKET?.selection(card,'Penicillin V');
        const product=identify(picked?.product,picked?.form,picked?.variant?.concentration);
        const p=plan(context());if(!product||picked?.reason||p.error)return null;
        const choice=choices(p,product).find(c=>c.units===selected);
        const rx=prescription(p,product,choice);return rx?{p,product,choice,rx}:null;
      }
      function render(){
        generation++;answer.replaceChildren();
        const market=card.querySelector('.abx-market');if(market&&market.nextElementSibling!==section)market.after(section);
        const picked=win.DRX_ANTIBIOTIC_MARKET?.selection(card,'Penicillin V');
        const product=identify(picked?.product,picked?.form,picked?.variant?.concentration);
        if(!product||picked?.reason){selected=null;answer.append(make('p','abx-rx-blocked','Zgjidh Ospen 1.0 ose 1.5 të verifikuar në regjistër. Produktet tjera nuk trashëgojnë skemën.'));return;}
        let p=plan(context());
        if(indication==='sinusitis'){
          const candidates=Number(card.dataset.ageMonths)>=216?[4]:[4,3];
          for(const candidate of candidates){const trial=plan({...context(),times:candidate});if(!trial.error&&choices(trial,product).length){times=candidate;p=trial;break;}}
          const schedule=section.querySelector('.abx-ospen-auto');if(schedule)schedule.textContent=`${times} herë/ditë · çdo ${24/times} orë · 5 ditë`;
        }
        if(indication==='sinusitis'){const duration=card.querySelector('.abx-duration');if(duration)duration.textContent=p.days?`${p.days} ditë`:'5 ditë';}
        if(p.error){selected=null;answer.append(make('p','abx-rx-blocked',p.error));return;}
        const options=choices(p,product);
        if(selectedProduct!==product.id||!options.some(c=>c.units===selected))selected=options[0]?.units??null;
        selectedProduct=product.id;
        const choice=options.find(c=>c.units===selected);
        const box=make('div','abx-dose-window');
        box.append(make('span','',`Min. i skemës\n${fmt(Math.ceil(p.min))} IU`),make('strong','abx-dose-selected',choice?`${fmt(choice.iu)} IU`:'Pa dozë të përshtatshme'),make('span','',`Maks. i skemës\n${fmt(Math.floor(p.max))} IU`));answer.append(box);
        if(!choice){answer.append(make('p','abx-rx-blocked',indication==='sinusitis'&&p.months>=216?'Doza e këtij protokolli është 1 000 000 IU për marrje. Nuk realizohet me këtë fortësi; zgjidh Ospen 1.0.':'Asnjë tabletë ose gjysmëtablete nuk bie brenda intervalit. Zgjidh orar/formë tjetër; mos e rrumbullako jashtë skemës.'));return;}
        const buttons=make('div','abx-practical-choices');
        options.forEach(c=>{const b=make('button','',`${tablet(c.units)} · ${fmt(c.iu)} IU`);b.type='button';b.setAttribute('aria-pressed',String(c.units===selected));b.onclick=()=>{selected=c.units;render();};buttons.append(b);});answer.append(buttons);
        const active=current();if(!active){answer.append(make('p','abx-rx-blocked',indication==='sinusitis'?'Konfirmo pacientin dhe produktin për të hapur recetën.':'Konfirmo moshën, GAS dhe produktin përpara recetës.'));return;}
        const single=make('div','abx-market-single');single.append(make('span','abx-market-dose-label','Për një marrje · nga goja'),make('strong','',tablet(choice.units)),make('span','',`${fmt(choice.iu)} IU · çdo ${24/times} orë`));answer.append(single);
        const daily=make('p','abx-ospen-daily',`Gjithsej: ${fmt(choice.dailyIU)} IU/ditë · ≈${fmt(Math.round(choice.dailyIU/p.weight))} IU/kg/ditë`);answer.append(daily);
        answer.append(make('strong','abx-rx-line',active.rx.line),make('span','abx-rx-quantity',`Sasia matematike e kursit: ${fmt(active.rx.quantity)} tableta.`));
        const copy=make('button','abx-rx-copy','Kopjo recetën');copy.type='button';
        copy.onclick=async()=>{const now=current();if(!now)return;const token=generation;copy.disabled=true;try{await win.navigator.clipboard.writeText(now.rx.text);if(token===generation)copy.textContent='U kopjua';}catch{if(token===generation)copy.textContent='Kopjimi dështoi · provo përsëri';}finally{if(token===generation)copy.disabled=false;}};answer.append(copy);
        const details=make('details','abx-ospen-source');details.append(make('summary','','Burimi dhe llogaritja'));
        details.append(make('p','',`${fmt(p.dailyMin)}–${fmt(p.dailyMax)} IU/ditë ÷ ${times} marrje. ${indication==='gas'?'Për GAS: 10 ditë në këtë skemë.':'Sinusit i pakomplikuar: programi cakton 5 ditë nga intervali 5–7 ditë i udhëzimit DK; për mungesë përmirësimi në 3–5 ditë nevojitet rivlerësim.'} Gjysmëtabletat janë verifikuar në SmPC për këto dy produkte. Merret 1 orë para ushqimit. Për foshnjat/fëmijët e vegjël preferohen format e lëngshme; verifiko aftësinë për gëlltitje.`));
        if(indication==='sinusitis'){const clinical=make('a','','Udhëzimi DK · dozimi në IU ↗');clinical.href=sinusitisSource.url;clinical.target='_blank';clinical.rel='noopener noreferrer';details.append(clinical);}
        details.append(make('p','',`1 tabletë e këtij produkti: ${fmt(product.iu)} IU ≈ ${product.freeMg} mg phenoxymethylpenicillin. Nuk përdoret si konvertim për NICE.`));
        const link=make('a','','SmPC Ospen · dhjetor 2025 ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';details.append(link);answer.append(details);
      }
      frequency.onchange=()=>{times=Number(frequency.value);selected=null;render();};
      card.addEventListener('abx:market-product',render);render();
    }
    const scan=()=>list.querySelectorAll('[data-native-ospen="true"]').forEach(enhance);
    new win.MutationObserver(scan).observe(list,{childList:true});scan();
  }
  return Object.freeze({source,sinusitisSource,products,identify,plan,choices,prescription,install});
});
