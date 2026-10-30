(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.DRX_OSPEN=api;api.install(root,root.document);}
})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const source={id:'ospen-smcp-2025',label:'SmPC · Ospen',url:'https://medikamente.basg.gv.at/documents/15535__DOTC_FACH_INFO.pdf',revision:'December 2025',verified:'2026-10-30'};
  // Exact AKKPM identities, read from the live registry on 2026-10-30.
  // Equal halves are verified by this product's SmPC, not inferred from a score.
  const products=[
    {id:'237f3733-de55-486a-9309-a357f87e2daa',registryNumber:'2947',name:'OSPEN 1.0 - Filmtabletten',strength:'1000000 IU',iu:1000000},
    {id:'069016da-1fa5-432b-87c2-ab6a9b558241',registryNumber:'2946',name:'OSPEN 1.5 - Filmtabletten',strength:'1500000 IU',iu:1500000},
  ];
  products.forEach(Object.freeze);Object.freeze(products);Object.freeze(source);
  function identify(product,form,c){
    const match=products.find(row=>['id','registryNumber','name','strength'].every(key=>String(product?.[key]??'')===row[key]));
    return match&&product.activeSubstance==='Phenoxymethylpenicillin Potassium'&&product.form==='Film coated tablet'
      &&product.population==='Pediatric and adult both'&&form?.route==='oral'&&form.measure==='whole'&&form.unit==='tabletë'&&!form.modified
      &&c?.unit==='IU'&&c.value===match.iu&&!c.reason&&!c.perML?match:null;
  }
  function plan({months,weight,times=2}){
    if(!Number.isFinite(months)||months<3)return {error:'Konfirmo moshën reale ≥3 muaj. Foshnjat e vogla kërkojnë vlerësim të veçantë.'};
    if(!Number.isFinite(weight)||weight<1||weight>200)return {error:'Shkruaj peshën reale 1–200 kg.'};
    if(![2,3,4].includes(times))return {error:'Skema Ospen lejon 2, 3 ose 4 marrje në ditë për këtë indikacion.'};
    // Conservative automation boundaries, not additional SmPC dose ceilings.
    if(months<144&&weight>40)return {error:'Fëmijë nën 12 vjeç mbi 40 kg: individualizo skemën; mos zgjat automatikisht intervalin sipas kg.'};
    if(months>=144&&months<216&&weight<=40)return {error:'Adoleshent ≤40 kg: tabela e tabletave jep skemë për >40 kg. Kërko dozë individuale.'};
    if(months>=216&&weight<40)return {error:'I rritur nën 40 kg: individualizo dozën para përdorimit të kësaj skeme automatike.'};
    const dailyMin=months<144?50000*weight:Math.max(3000000,25000*weight);
    const dailyMax=months<144?100000*weight:4500000;
    if(dailyMin>dailyMax)return {error:'Minimumi sipas peshës del mbi skemën standarde 4 500 000 IU/ditë. Kërko skemë individuale; 6 milionë IU nuk përdoren si tavan rutinë.'};
    return {dailyMin,dailyMax,min:dailyMin/times,max:dailyMax/times,times,days:10,weight,months};
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
  const fmt=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  const units=n=>n%1===0.5?`${Math.floor(n)||''}½`:String(n);
  const tablet=n=>n===0.5?'½ tablete':`${units(n)} ${n===1?'tabletë':'tableta'}`;
  function prescription(p,product,choice){
    // Revalidate selection immediately before generating or copying a recipe.
    if(!p||p.error)return null;p=plan(p);if(p.error)return null;
    const valid=choices(p,product).find(c=>c.units===choice?.units&&c.iu===choice?.iu);
    if(!valid)return null;
    const quantity=valid.units*p.times*p.days;
    const line=`${product.name} · ${product.strength} — ${tablet(valid.units)} PO ${p.times} herë/ditë × ${p.days} ditë`;
    return {line,quantity,iu:valid.iu,dailyIU:valid.dailyIU,text:`Penicillin V\nD.S.: ${line}.\n${fmt(valid.iu)} IU/dozë; ${fmt(valid.dailyIU)} IU/ditë.\nSasia matematike e kursit: ${quantity} tableta.\nBurimi: ${source.label} (${source.url}).`};
  }
  function install(win,doc){
    const list=doc?.getElementById('recommendationList');if(!list)return;
    const make=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    function enhance(card){
      if(card.dataset.ospenEnhanced==='true')return;card.dataset.ospenEnhanced='true';
      let times=2,selected=null,selectedProduct='',generation=0;
      const section=make('section','abx-ospen');
      const label=make('label','abx-schedule-field');label.append(make('span','abx-label','Marrjet në ditë · SmPC Ospen'));
      const frequency=make('select');frequency.setAttribute('aria-label','Marrjet në ditë · Ospen');
      [2,3,4].forEach(n=>frequency.append(new win.Option(`${n} herë/ditë · çdo ${24/n} orë`,String(n))));label.append(frequency);section.append(label);
      const answer=make('div','abx-ospen-answer');answer.setAttribute('aria-live','polite');section.append(answer);card.append(section);
      const context=()=>({months:Number(card.dataset.ageMonths),weight:Number(String(doc.getElementById('weightInput')?.value||'').replace(',','.')),times});
      function current(){
        if(!card.isConnected||card.dataset.ageConfirmed!=='true'||list.dataset.gasBlocked==='true'||list.dataset.gasConfirmed!=='true')return null;
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
        const p=plan(context());
        if(p.error){selected=null;answer.append(make('p','abx-rx-blocked',p.error));return;}
        const options=choices(p,product);
        if(selectedProduct!==product.id||!options.some(c=>c.units===selected))selected=options[0]?.units??null;
        selectedProduct=product.id;
        const choice=options.find(c=>c.units===selected);
        const box=make('div','abx-dose-window');
        box.append(make('span','',`Min. i skemës\n${fmt(Math.ceil(p.min))} IU`),make('strong','abx-dose-selected',choice?`${fmt(choice.iu)} IU`:'Pa dozë të përshtatshme'),make('span','',`Maks. i skemës\n${fmt(Math.floor(p.max))} IU`));answer.append(box);
        if(!choice){answer.append(make('p','abx-rx-blocked','Asnjë tabletë ose gjysmëtablete nuk bie brenda intervalit. Zgjidh orar/formë tjetër; mos e rrumbullako jashtë skemës.'));return;}
        const buttons=make('div','abx-practical-choices');
        options.forEach(c=>{const b=make('button','',`${tablet(c.units)} · ${fmt(c.iu)} IU`);b.type='button';b.setAttribute('aria-pressed',String(c.units===selected));b.onclick=()=>{selected=c.units;render();};buttons.append(b);});answer.append(buttons);
        const active=current();if(!active){answer.append(make('p','abx-rx-blocked','Konfirmo moshën, GAS dhe produktin përpara recetës.'));return;}
        const single=make('div','abx-market-single');single.append(make('span','abx-market-dose-label','Për një marrje · nga goja'),make('strong','',tablet(choice.units)),make('span','',`${fmt(choice.iu)} IU · çdo ${24/times} orë`));answer.append(single);
        const daily=make('p','abx-ospen-daily',`Gjithsej: ${fmt(choice.dailyIU)} IU/ditë · ≈${fmt(Math.round(choice.dailyIU/p.weight))} IU/kg/ditë`);answer.append(daily);
        answer.append(make('strong','abx-rx-line',active.rx.line),make('span','abx-rx-quantity',`Sasia matematike e kursit: ${active.rx.quantity} tableta.`));
        const copy=make('button','abx-rx-copy','Kopjo recetën');copy.type='button';
        copy.onclick=async()=>{const now=current();if(!now)return;const token=generation;copy.disabled=true;try{await win.navigator.clipboard.writeText(now.rx.text);if(token===generation)copy.textContent='U kopjua';}catch{if(token===generation)copy.textContent='Kopjimi dështoi · provo përsëri';}finally{if(token===generation)copy.disabled=false;}};answer.append(copy);
        const details=make('details','abx-ospen-source');details.append(make('summary','','Burimi dhe llogaritja'));
        details.append(make('p','',`${fmt(p.dailyMin)}–${fmt(p.dailyMax)} IU/ditë ÷ ${times} marrje. Për GAS: 10 ditë në këtë skemë. Gjysmëtabletat janë verifikuar në SmPC për këto dy produkte. Merret 1 orë para ushqimit. Për foshnjat/fëmijët e vegjël preferohen format e lëngshme; verifiko aftësinë për gëlltitje.`));
        const link=make('a','','SmPC Ospen · dhjetor 2025 ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';details.append(link);answer.append(details);
      }
      frequency.onchange=()=>{times=Number(frequency.value);selected=null;render();};
      card.addEventListener('abx:market-product',render);render();
    }
    const scan=()=>list.querySelectorAll('[data-native-ospen="true"]').forEach(enhance);
    new win.MutationObserver(scan).observe(list,{childList:true});scan();
  }
  return Object.freeze({source,products,identify,plan,choices,prescription,install});
});
