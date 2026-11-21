/* DRx Antibiotics — accessible search and facet discovery enhancement.
   Reuses original clinical state, selectors, events and registration data. */
(function(){
'use strict';
const init=()=>{
 const root=document.querySelector('#antibioticsCatalog');
 const core=window.DRX_ANTIBIOTIC_CATALOG_CORE;
 const smart=window.DRX_ANTIBIOTIC_SMART_SEARCH;
 const data=window.DRX_ANTIBIOTIC_CATALOG;
 if(!root||!core||!smart||!data||root.dataset.smartReady)return;
 root.dataset.smartReady='true';
 const choice=window.DRX_ANTIBIOTIC_CHOICES||{sources:[],profiles:[]};
 const all=core.withChoiceReferences(data.antibiotics,choice,data.conditions);
 const search=root.querySelector('#abxCatalogSearch'),bar=root.querySelector('.abx-catalog-searchbar'),label=root.querySelector('.abx-catalog-search');
 const filter=root.querySelector('#abxFilterPanel'),workspace=root.querySelector('.abx-catalog-workspace'),resultCount=root.querySelector('#abxCatalogCount');
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const $=id=>root.querySelector('#'+id);
 if(!search||!bar||!label||!filter||!resultCount)return;
 const wrap=document.createElement('div');wrap.className='abx-smart-search-wrap';bar.insertBefore(wrap,label);wrap.appendChild(label);
 search.placeholder='Substanca, marka, kodi ATC, infeksioni…';
 search.setAttribute('role','combobox');
 search.setAttribute('aria-autocomplete','list');search.setAttribute('aria-controls','abxSmartSuggestions');search.setAttribute('aria-expanded','false');
 search.setAttribute('aria-describedby','abxSmartHint');
 const key=document.createElement('kbd');key.className='abx-smart-shortcut';key.textContent='⌘ K';label.appendChild(key);
 const clear=document.createElement('button');clear.type='button';clear.id='abxSmartClear';clear.className='abx-smart-clear';clear.textContent='×';clear.title='Pastro kërkimin';clear.setAttribute('aria-label','Pastro kërkimin');clear.hidden=true;wrap.appendChild(clear);
 const suggestions=document.createElement('div');suggestions.id='abxSmartSuggestions';suggestions.className='abx-smart-suggestions';suggestions.setAttribute('role','listbox');suggestions.setAttribute('aria-label','Sugjerime nga katalogu');suggestions.hidden=true;wrap.appendChild(suggestions);
 const quick=document.createElement('div');quick.className='abx-smart-quick';quick.id='abxSmartQuick';quick.innerHTML='<span id="abxSmartHint">Provo:</span><button type="button" data-abx-example="Amoxicillin" data-abx-scope="substance">Amoxicillin</button><button type="button" data-abx-example="Ceftriaxone" data-abx-scope="substance">Ceftriaxone</button><button type="button" data-abx-example="Cistit" data-abx-scope="indication">Cistit</button><span class="abx-smart-disclaimer">Nga të dhënat e katalogut · jo rekomandime terapeutike</span>';
 bar.insertAdjacentElement('afterend',quick);
 const scope=document.createElement('div');scope.className='abx-smart-scopes';scope.id='abxSmartScopes';
 scope.innerHTML='<span>Kërko sipas:</span><div class="abx-smart-scope-switch" role="group" aria-label="Zgjidh fushën e kërkimit"><button type="button" aria-pressed="true" data-abx-scope-tab="all">Gjithçka</button><button type="button" aria-pressed="false" data-abx-scope-tab="substance">Substanca / ATC</button><button type="button" aria-pressed="false" data-abx-scope-tab="product">Produktet</button><button type="button" aria-pressed="false" data-abx-scope-tab="indication">Indikacionet</button></div><span class="abx-smart-scopes-note">Kërkimi nuk përcakton vetë indikacion terapeutik</span>';
 quick.insertAdjacentElement('afterend',scope);
 root.dataset.searchScope='all';
 const chips=document.createElement('div');chips.id='abxActiveFilterChips';chips.className='abx-active-filters';chips.setAttribute('role','group');chips.setAttribute('aria-label','Filtrat aktivë');chips.hidden=true;workspace.insertAdjacentElement('afterend',chips);
 const facetMap={group:['abxCatalogGroup','Grupi'],subgroup:['abxCatalogSubgroup','Nëngrupi'],indication:['abxCatalogIndication','Indikacioni'],route:['abxCatalogRoute','Rruga'],form:['abxCatalogForm','Forma'],population:['abxCatalogPopulation','Popullata']};
 const readState=()=>Object.fromEntries([...Object.entries(facetMap).map(([key,[id]])=>[key,$(id)?.value||'']),['search',search.value],['scope',root.dataset.searchScope||'all'],['selectedOnly',!!$('abxCatalogOnlySelected')?.checked]]);
 const raise=(el,type)=>el?.dispatchEvent(new Event(type,{bubbles:true}));
 let suggestionData=[],lastStamp='',pending=false;
 const close=()=>{suggestionData=[];suggestions.hidden=true;suggestions.replaceChildren();search.setAttribute('aria-expanded','false');};
 function syncScope(){
  const active=root.dataset.searchScope||'all';
  scope.querySelectorAll('[data-abx-scope-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.abxScopeTab===active)));
 }
 function setScope(value,{focus=false}={}){
  const next=['all','substance','product','indication'].includes(value)?value:'all';
  if(root.dataset.searchScope!==next){root.dataset.searchScope=next;lastStamp='';syncScope();raise(search,'input');}
  if(focus)search.focus({preventScroll:true});
 }
 function choose(query){search.value=query;raise(search,'input');search.focus({preventScroll:true});close();}
 function show(){
  if(document.activeElement!==search||smart.fold(search.value).length<2){close();return;}
  const state=readState();state.selectedOnly=false;
  suggestionData=smart.suggestions(all,state,[],core,6);
  if(!suggestionData.length){close();return;}
  suggestions.innerHTML=suggestionData.map((s,i)=>'<button type="button" role="option" aria-selected="false" data-abx-index="'+i+'"><span class="abx-smart-kind">'+escape(s.kind)+'</span><strong>'+escape(s.value)+'</strong><span aria-hidden="true">↗</span></button>').join('');
  suggestions.hidden=false;search.setAttribute('aria-expanded','true');
 }
 function update(){
  const state=readState();clear.hidden=!state.search;
  const used=[];
  if(state.search.trim())used.push({key:'search',label:'Kërkim: '+state.search.trim().slice(0,45)});
  for(const [key,[id,label]] of Object.entries(facetMap)){if(!state[key])continue;const option=[...$(id).options].find(o=>o.value===state[key]);used.push({key,label:label+': '+(option?.textContent||state[key])});}
  if(state.selectedOnly)used.push({key:'selectedOnly',label:'Lista ime'});
  if(state.scope!=='all')used.push({key:'scope',label:'Kërkim: '+({'substance':'Substanca / ATC','product':'Produktet','indication':'Indikacionet'}[state.scope])});
  chips.hidden=!used.length;
  chips.innerHTML=used.map(t=>'<button type="button" data-remove-filter="'+escape(t.key)+'" aria-label="Hiq '+escape(t.label)+'"><span>'+escape(t.label)+'</span><b aria-hidden="true">×</b></button>').join('')+(used.length>1?'<button type="button" class="abx-clear-everything" data-reset-all>Pastro të gjitha</button>':'');
  const stamp=JSON.stringify(state);if(stamp===lastStamp)return;lastStamp=stamp;
  if(state.selectedOnly)return; // selected set belongs to authenticated catalog script
  for(const [key,[id]] of Object.entries(facetMap)){
   const select=$(id);if(!select)continue;
   const values=[...select.options].filter(o=>o.value).map(o=>o.value);
   const counts=new Map(smart.optionCounts(all,state,[],core,key,values).map(o=>[o.value,o.count]));
   for(const opt of select.options){
    if(!opt.value)continue;
    const count=counts.get(opt.value)||0;
    opt.disabled=count===0&&state[key]!==opt.value;
    opt.title=count+' rezultate të mundshme';
   }
  }
 }
 function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;update();});}
 search.addEventListener('input',()=>{schedule();show();});
 search.addEventListener('focus',show);
 search.addEventListener('keydown',event=>{
  if(event.key==='Escape'){close();return;}
  if(event.key==='ArrowDown'&&!suggestions.hidden){event.preventDefault();suggestions.querySelector('button')?.focus();}
  if(event.key==='Enter'&&!suggestions.hidden&&suggestionData[0]){event.preventDefault();choose(suggestionData[0].value);}
 });
 suggestions.addEventListener('click',event=>{const btn=event.target.closest('[data-abx-index]');if(!btn)return;const item=suggestionData[Number(btn.dataset.abxIndex)];if(item)choose(item.value);});
 suggestions.addEventListener('keydown',event=>{
  if(event.key==='Escape'||event.key==='ArrowUp'&&event.target===suggestions.firstElementChild){event.preventDefault();search.focus();if(event.key==='Escape')close();}
  else if(event.key==='ArrowDown'){event.preventDefault();event.target.nextElementSibling?.focus();}
  else if(event.key==='ArrowUp'){event.preventDefault();event.target.previousElementSibling?.focus();}
 });
 clear.addEventListener('click',()=>choose(''));
 quick.addEventListener('click',event=>{const b=event.target.closest('[data-abx-example]');if(!b)return;setScope(b.dataset.abxScope||'all');choose(b.dataset.abxExample);});
 scope.addEventListener('click',event=>{const b=event.target.closest('[data-abx-scope-tab]');if(b)setScope(b.dataset.abxScopeTab,{focus:false});});
 chips.addEventListener('click',event=>{
  if(event.target.closest('[data-reset-all]')){$('abxCatalogReset')?.click();schedule();return;}
  const button=event.target.closest('[data-remove-filter]');if(!button)return;
  const key=button.dataset.removeFilter;
  if(key==='search'){choose('');return;}
  if(key==='scope'){setScope('all');return;}
  if(key==='selectedOnly'){const node=$('abxCatalogOnlySelected');node.checked=false;raise(node,'change');schedule();return;}
  const entry=facetMap[key];if(!entry)return;
  const node=$(entry[0]);node.value='';raise(node,'change');schedule();
 });
 filter.addEventListener('change',schedule);
 $('abxCatalogOnlySelected')?.addEventListener('change',schedule);
 $('abxCatalogReset')?.addEventListener('click',()=>{close();setScope('all');lastStamp='';schedule();});
 root.addEventListener('click',event=>{if(!event.target.closest('.abx-smart-search-wrap'))close();});
 document.addEventListener('pointerdown',event=>{if(!wrap.contains(event.target))close();});
 document.addEventListener('keydown',event=>{
  const tag=document.activeElement?.tagName;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'||event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)){
   event.preventDefault();search.focus();search.select();
  }
 });
 const observer=new MutationObserver(schedule);observer.observe(resultCount,{childList:true,characterData:true,subtree:true});
 syncScope();update();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();