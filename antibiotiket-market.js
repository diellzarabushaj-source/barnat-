(() => {
  'use strict';
  const list=document.getElementById('recommendationList');if(!list)return;
  let catalog=null,loading=null;
  const selections=new WeakMap();
  const remembered=new Map();
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const clean=x=>String(x??'').trim();
  const fmt=x=>String(Number(Number(x).toFixed(2))).replace('.',',');
  function selection(card,drug){return selections.get(card)?.get(drug)||null;}
  function eligible(card,drug,form,variant,product){
    const c=variant?.concentration;
    if(!product||product.population==='Adult only')return 'Ky produkt shënohet vetëm për të rritur në regjistër.';
    if(form.route!=='oral')return 'Formë jo orale: mos përdor konvertimin e shurupit ose tabletës. Përgatitja IV/IM kontrollohet sipas produktit.';
    if(form.modified)return 'Çlirimi i modifikuar kërkon skemë specifike për këtë produkt.';
    if(c?.reason||c?.unit!=='mg'||!(c.value>0))return c?.reason||'Përmbajtja për njësi kërkon verifikim.';
    if(form.measure==='liquid'&&!(c.perML>0))return 'Nuk jepet përqendrim i verifikuar për mL.';
    if(!['liquid','whole'].includes(form.measure))return 'Kjo formë nuk ka konvertim automatik.';
    if(drug==='Amoxicillin / clavulanate'){
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
      const result=make('div','abx-market-dose');result.setAttribute('aria-live','polite');body.append(result);
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
        if(!picked||picked.reason){result.hidden=true;return;}
        result.hidden=false;
        const weight=Number(clean(document.getElementById('weightInput')?.value).replace(',','.'));
        if(!(weight>=1&&weight<=200)){result.append(make('span','','Shkruaj peshën reale për dozën.'));return;}
        if(card.dataset.ageRequired==='true'&&card.dataset.ageConfirmed!=='true'){result.append(make('span','','Konfirmo moshën reale për këtë skemë.'));return;}
        const conversion=window.DRX_ANTIBIOTIC_MARKET_MATH?.convert({doseText:card.dataset.exactDoseText,drug:part.drug,combo:parts.length>1,form:picked.form,concentration:picked.variant.concentration});
        if(!conversion||conversion.error){result.append(make('span','',conversion?.error||'Konvertimi nuk u ngarkua. Rifresko faqen.'));return;}
        result.append(make('span','abx-market-dose-label',`Për ${fmt(weight)} kg · doza për një marrje`));
        for(const row of conversion.rows){
          if(conversion.rows.length>1)result.append(make('b','',row.label));
          if(row.unit==='mL')result.append(make('strong','',`${fmt(row.min)}${row.min!==row.max?'–'+fmt(row.max):''} mL`));
          else if(row.units)result.append(make('strong','',`${row.units} ${row.unit}${row.units>1?' ×':''}`));
          else if(row.choices.length){result.append(make('strong','',row.choices.map(c=>`${c.units} ${row.unit} (${fmt(c.mg)} mg)`).join(' ose ')));result.append(make('small','','Njësi të plota brenda intervalit. Konfirmo një dozë te receta.'));}
          else result.append(make('span','','Doza nuk përputhet me njësi të plota. Zgjidh një fortësi ose formë tjetër; tableta nuk ndahet automatikisht.'));
          result.append(make('span','',`${fmt(row.mgMin)}${row.mgMin!==row.mgMax?'–'+fmt(row.mgMax):''} mg${picked.variant.concentration.basis?' · '+picked.variant.concentration.basis.split('|')[0]:''}`));
          if(row.unit==='mL'&&row.mgMin!==row.mgMax)result.append(make('small','',`Kufiri për ${fmt(weight)} kg në këtë skemë: ${fmt(row.max)} mL për marrje. Zgjidh një dozë brenda intervalit.`));
        }
      };
      const publish=()=>{
        const product=variant?.products.find(p=>String(p.id)===productSelect.value);
        selections.get(card).delete(part.drug);
        if(!product){if(!restoring)remembered.delete(memoryKey);info.textContent='Zgjidh formën dhe fortësinë.';showDose(null);productSummary.textContent='Produktet AKKPM · opsionale';update();return;}
        const reason=eligible(card,part.drug,form,variant,product);
        info.textContent=reason||`${product.packaging||product.form} · Nr. ${product.registryNumber}`;
        info.dataset.tone=reason?'blocked':'ready';
        const picked={form,variant,product,reason,label:`${product.name} · ${product.strength} · ${form.label}`};
        selections.get(card).set(part.drug,picked);showDose(picked);productSummary.textContent=`${product.name} · ndrysho produktin`;update();
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
