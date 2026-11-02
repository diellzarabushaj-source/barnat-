(function(root){
 'use strict';
 function create({core,all,choices,conditions,esc,link}){
  const drafts=new Map(),profiles=new Map(),byId=new Map(all.map(a=>[a.id,a])),sources=new Map(choices.sources.map(s=>[s.id,s]));
  const tierNames={first:'Zgjedhja e parë',second:'Zgjedhja e dytë',alternative:'Alternativa'};
  function renderChoices(filters){
   if(!filters.indication)return '';
   const pp=core.choiceProfiles(choices,filters.indication,filters.population),title=conditions.get(filters.indication)||'';
   const heading='<div class="abx-choice-heading"><div><span class="abx-catalog-eyebrow">RENDITJA SIPAS INDIKACIONIT</span><h2>'+esc(title)+'</h2></div><span class="abx-catalog-pill">Referencë · pa miratim lokal</span></div>';
   if(!pp.length)return '<section class="abx-choice-panel" aria-label="Renditja sipas indikacionit">'+heading+'<p class="abx-section-note">Mungon renditje burimore për këtë indikacion dhe popullatë. Lista më poshtë nuk nënkupton zgjedhje të parë, të dytë ose alternativë.</p></section>';
   const current=profiles.get(filters.indication),profile=pp.find(p=>p.id===current)||(pp.length===1?pp[0]:null);
   const picker='<label class="abx-choice-population">Konteksti i udhëzimit<select data-choice-profile="'+esc(filters.indication)+'"><option value="">Zgjidh popullatën dhe kontekstin</option>'+pp.map(p=>'<option value="'+esc(p.id)+'" '+(p===profile?'selected':'')+'>'+esc(p.label)+'</option>').join('')+'</select></label>';
   if(!profile)return '<section class="abx-choice-panel" aria-label="Renditja sipas indikacionit">'+heading+picker+'<p class="abx-section-note">Renditja ndryshon sipas popullatës dhe rëndesës; zgjidh kontekstin para se të shohësh zgjedhjet.</p></section>';
   const source=sources.get(profile.sourceId),visible=new Set(core.filterAntibiotics(all,filters).map(a=>a.id));
   const groups=Object.entries(tierNames).map(([tier,label])=>{
    const rows=profile.rows.filter(r=>r.tier===tier);
    const cards=rows.map(row=>{const item=byId.get(row.substanceId),compatible=item?.products.some(p=>core.referenceMatchesProduct(row,p));if(!compatible)return '<li><b>Pa produkt të përputhshëm në katalogun AKPPM</b><p>Nuk zëvendësohet automatikisht me një antibiotik tjetër.</p></li>';
     const shown=visible.has(item.id);return '<li><b>'+esc(item.name)+'</b><span class="abx-choice-route">'+esc(row.route)+' · formë e zakonshme</span>'+(row.note?'<p>'+esc(row.note)+'</p>':'')+(shown?'<button type="button" data-choice-open="'+esc(item.id)+'">Shiko antibiotikun <span aria-hidden="true">↗</span></button>':'<p class="abx-choice-filtered">Nuk përputhet me filtrat aktualë.</p>')+'</li>';}).join('');
    return '<section class="abx-choice-tier is-'+tier+'"><h3><span aria-hidden="true">'+(tier==='first'?'01':tier==='second'?'02':'03')+'</span>'+label+'</h3><ul>'+(cards||'<li class="abx-choice-empty">'+esc(tier==='second'?profile.secondNote||'Burimi nuk specifikon zgjedhje të dytë.':'Burimi nuk specifikon alternativë për këtë kontekst.')+'</li>')+'</ul></section>';
   }).join('');
   return '<section class="abx-choice-panel" aria-label="Renditja sipas indikacionit">'+heading+picker+'<div class="abx-choice-grid">'+groups+'</div><p class="abx-choice-context">'+esc(profile.note)+'</p><div class="abx-choice-source">'+link(source.url,source.type)+'<span>Burimi lexuar më '+esc(source.readDate)+' · nuk përbën përzgjedhje automatike për pacientin</span></div></section>';
  }
  function draftFor(item,conditionId){let draft=drafts.get(item.id);if(!draft){draft={conditionId:'',productId:'',regimenId:'',age:'',weight:''};drafts.set(item.id,draft);}if(draft.conditionId!==conditionId){draft.conditionId=conditionId;draft.regimenId='';}return draft;}
  function renderCalculator(item,conditionId){
   const d=draftFor(item,conditionId),state=core.calculatorState(item,d),product=state.product;
   const regimens=conditionId?item.regimens.filter(r=>r.conditionIds.includes(conditionId)&&product&&core.referenceMatchesProduct(r,product)&&r.route===product.route):[];
   const products=item.products.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===d.productId?'selected':'')+'>'+esc(p.brand+' · '+p.form+' · '+p.strength+' · '+p.route+' · '+p.registration)+'</option>').join('');
   const label='Kalkulatori për '+item.name;
   return '<section class="abx-detail-section abx-personal-calculator" aria-label="'+esc(label)+'" data-calculator="'+esc(item.id)+'"><h3><span>04</span> '+esc(label)+' <small>Në përgatitje</small></h3><p class="abx-section-note">Indikacioni: <b>'+esc(conditions.get(conditionId)||'Zgjidhe më sipër')+'</b>. I veçantë për këtë substancë, produkt dhe skemë. Të dhënat e futura mbahen vetëm në këtë faqe gjatë sesionit.</p><div class="abx-calculator-grid"><label class="abx-calc-wide">Produkti, forma dhe fortësia<select data-calc-field="productId"><option value="">Zgjidh produktin konkret</option>'+products+'</select></label><label class="abx-calc-wide">Skema Mayo për këtë produkt<select data-calc-field="regimenId" '+(!regimens.length?'disabled':'')+'><option value="">'+(regimens.length?'Zgjidh skemën referencë':'Mungon skemë Mayo e përputhshme')+'</option>'+regimens.map(r=>'<option value="'+esc(r.id)+'" '+(r.id===d.regimenId?'selected':'')+'>'+esc(r.id+' · '+r.originalIndication+' · '+r.population+' · '+r.formulation+' · '+r.qaStatus)+'</option>').join('')+'</select></label><label>Mosha (vite)<input type="number" inputmode="decimal" min="0" max="120" step="any" autocomplete="off" data-calc-field="age" value="'+esc(d.age)+'" placeholder="P.sh. 8"></label><label>Pesha (kg)<input type="number" inputmode="decimal" min="0.1" max="350" step="any" autocomplete="off" data-calc-field="weight" value="'+esc(d.weight)+'" placeholder="P.sh. 25"></label></div>'+(product?'<p class="abx-calc-product">'+esc(product.form)+' · '+esc(product.strength)+' · '+esc(product.route)+'. '+esc(product.clinicalStatus)+'</p>':'')+'<div class="abx-calculator-status" role="status"><strong>Llogaritja është e bllokuar</strong><ul>'+state.reasons.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul></div><button class="abx-calculate-button" type="button" disabled>Llogarit dozën</button><p class="abx-section-note">Nuk jepet rezultat numerik pa miratim të skemës, rrugës, formës, përqendrimit dhe produktit. Renditja në udhëzim dhe Lista ime nuk japin këtë miratim.</p></section>';
  }
  function handleInput(event){
   const field=event.target?.dataset?.calcField,container=event.target?.closest('[data-calculator]');if(!container||!['age','weight'].includes(field))return false;
   const d=drafts.get(container.dataset.calculator);if(!d)return false;d[field]=event.target.value;return true;
  }
  function handleChange(event){
   const conditionId=event.target?.dataset?.choiceProfile;if(conditionId){const value=event.target.value;if(!value)profiles.delete(conditionId);else if(core.choiceProfiles(choices,conditionId).some(p=>p.id===value))profiles.set(conditionId,value);return true;}
   const field=event.target?.dataset?.calcField,container=event.target?.closest('[data-calculator]');if(!container||!['productId','regimenId'].includes(field))return false;
   const item=byId.get(container.dataset.calculator),d=drafts.get(item?.id);if(!d)return false;
   if(field==='productId'){if(event.target.value&&!item.products.some(p=>p.id===event.target.value))return false;d.productId=event.target.value;d.regimenId='';}
   else {const product=item.products.find(p=>p.id===d.productId);if(event.target.value&&!item.regimens.some(r=>r.id===event.target.value&&r.conditionIds.includes(d.conditionId)&&product&&core.referenceMatchesProduct(r,product)&&r.route===product.route))return false;d.regimenId=event.target.value;}
   return true;
  }
  return {renderChoices,renderCalculator,handleInput,handleChange,clearDrafts(){drafts.clear();}};
 }
 root.DRX_ANTIBIOTIC_CLINICAL_TOOLS={create};
})(typeof window==='object'?window:globalThis);
