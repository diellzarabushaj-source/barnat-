/* DRx Antibiotics · lightweight enhancements informed by Uiverse, shadcn, Flowbite,
   daisyUI, Magic UI, Aceternity and HeroUI patterns. No React/Tailwind runtime. */
(()=>{
'use strict';
const boot=()=>{
  const root=document.getElementById('antibioticsCatalog');
  const data=window.DRX_ANTIBIOTIC_CATALOG;
  const core=window.DRX_ANTIBIOTIC_CATALOG_CORE;
  const smart=window.DRX_ANTIBIOTIC_SMART_SEARCH;
  if(!root||!data||!core||!smart||root.dataset.microReady)return;
  const route=document.getElementById('abxCatalogRoute');
  const resultCount=document.getElementById('abxCatalogCount');
  const toolbar=root.querySelector('.abx-catalog-toolbar');
  const scopes=root.querySelector('#abxSmartScopes');
  const rows=document.getElementById('abxCatalogRows');
  if(!route||!resultCount||!toolbar||!scopes||!rows)return;
  root.dataset.microReady='true';
  const choices=window.DRX_ANTIBIOTIC_CHOICES||{sources:[],profiles:[]};
  const all=core.withChoiceReferences(data.antibiotics,choices,data.conditions);
  const fieldKeys={group:'abxCatalogGroup',subgroup:'abxCatalogSubgroup',indication:'abxCatalogIndication',route:'abxCatalogRoute',form:'abxCatalogForm',population:'abxCatalogPopulation'};
  const get=id=>document.getElementById(id);
  const search=get('abxCatalogSearch');
  const readFilters=()=>{
    const filters=Object.fromEntries(Object.entries(fieldKeys).map(([key,id])=>[key,get(id)?.value||'']));
    filters.search=search?.value||'';
    filters.scope=root.dataset.searchScope||'all';
    return filters;
  };
  const nav=document.createElement('div');
  nav.className='abx-shortcuts';
  nav.setAttribute('aria-label','Filtrimi i shpejtë sipas rrugës');
  const label=document.createElement('span');
  label.className='abx-shortcuts-label';
  label.textContent='Rruga:';
  const pills=document.createElement('div');
  pills.className='abx-shortcut-pills';
  pills.setAttribute('role','group');
  pills.setAttribute('aria-label','Rruga e administrimit');
  nav.append(label,pills);
  scopes.insertAdjacentElement('afterend',nav);
  const routeLabels={PO:'Orale · PO',IV:'Intravenoze · IV',IM:'Intramuskulare · IM',TOP:'Lokale',INH:'Inhalatore'};
  const routeValues=[...route.options].filter(option=>option.value).map(option=>option.value).filter((value,index,array)=>array.indexOf(value)===index);
  const ordered=['PO','IV','IM'].filter(value=>routeValues.includes(value));
  const other=routeValues.filter(value=>!ordered.includes(value)).slice(0,2);
  const shown=['',...ordered,...other];
  const buttons=new Map();
  for(const value of shown){
    const button=document.createElement('button');
    button.type='button';button.dataset.shortcutRoute=value;
    const text=document.createElement('span');text.textContent=value?(routeLabels[value]||value):'Të gjitha';
    const total=document.createElement('small');total.setAttribute('aria-hidden','true');total.className='abx-shortcut-count';
    button.append(text,total);
    pills.append(button);
    buttons.set(value,{button,total});
  }
  const storageKey='drx.antibiotics.display-density.v1';
  let density='comfortable';
  try{if(localStorage.getItem(storageKey)==='compact')density='compact';}catch{}
  root.dataset.density=density;
  const densityButton=document.createElement('button');
  densityButton.type='button';densityButton.className='abx-density-button';
  densityButton.setAttribute('aria-label','Ndrysho dendësinë e kartelave');
  densityButton.setAttribute('aria-pressed',String(density==='compact'));
  function renderDensity(){
    densityButton.setAttribute('aria-pressed',String(density==='compact'));
    densityButton.innerHTML=density==='compact'
      ?'<span aria-hidden="true">☷</span> Pamje e gjerë'
      :'<span aria-hidden="true">☷</span> Pamje kompakte';
    root.dataset.density=density;
  }
  renderDensity();
  toolbar.appendChild(densityButton);
  densityButton.addEventListener('click',()=>{
    density=density==='compact'?'comfortable':'compact';
    renderDensity();
    try{localStorage.setItem(storageKey,density);}catch{}
  });
  const selected=get('abxCatalogOnlySelected');
  function renderShortcuts(){
    const selectedOnly=!!selected?.checked;
    const filters=readFilters();
    const options=smart.optionCounts(all,{...filters,selectedOnly:false},[],core,'route',shown.filter(Boolean));
    const counts=new Map(options.map(({value,count})=>[value,count]));
    const unfiltered=smart.filterAntibiotics(all,{...filters,route:'',selectedOnly:false},[],core).length;
    for(const [value,{button,total}] of buttons){
      const count=value?(counts.get(value)||0):unfiltered;
      const active=route.value===value;
      button.setAttribute('aria-pressed',String(active));
      button.disabled=!selectedOnly&&count===0&&!active;
      // Personal selection belongs to authenticated catalog; avoid inaccurate counts.
      total.textContent=selectedOnly?'':String(count);
      button.title=selectedOnly?'Rruga në Listën time':count+' substanca sipas filtrave aktivë';
    }
  }
  pills.addEventListener('click',event=>{
    const button=event.target.closest('button[data-shortcut-route]');
    if(!button||button.disabled)return;
    route.value=button.dataset.shortcutRoute||'';
    route.dispatchEvent(new Event('change',{bubbles:true}));
    renderShortcuts();
  });
  pills.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const available=[...pills.querySelectorAll('button:not(:disabled)')];
    if(!available.length)return;
    const i=available.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?available.length-1:
      Math.max(0,Math.min(available.length-1,i+(event.key==='ArrowLeft'?-1:1)));
    event.preventDefault();available[next].focus();
  });
  scopes.addEventListener('keydown',event=>{
    const button=event.target.closest('button[data-abx-scope-tab]');
    if(!button||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const available=[...scopes.querySelectorAll('button[data-abx-scope-tab]')];
    const i=available.indexOf(button);
    const next=event.key==='Home'?0:event.key==='End'?available.length-1:
      (i+(event.key==='ArrowLeft'?-1:1)+available.length)%available.length;
    event.preventDefault();available[next].focus();available[next].click();
  });
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine=window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if(!reduced&&fine){
    let scheduled=false,lastCard=null,clientX=0,clientY=0;
    rows.addEventListener('pointermove',event=>{
      const card=event.target.closest('.abx-catalog-item');
      if(!card)return;
      lastCard=card;clientX=event.clientX;clientY=event.clientY;
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{
        scheduled=false;
        if(!lastCard||!lastCard.isConnected)return;
        const rect=lastCard.getBoundingClientRect();
        lastCard.style.setProperty('--abx-glow-x',(clientX-rect.left)+'px');
        lastCard.style.setProperty('--abx-glow-y',(clientY-rect.top)+'px');
      });
    },{passive:true});
  }
  const render=()=>renderShortcuts();
  const observer=new MutationObserver(render);
  observer.observe(resultCount,{subtree:true,characterData:true,childList:true});
  for(const id of Object.values(fieldKeys))get(id)?.addEventListener('change',render);
  search?.addEventListener('input',render);
  selected?.addEventListener('change',render);
  get('abxCatalogReset')?.addEventListener('click',render);
  renderShortcuts();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();