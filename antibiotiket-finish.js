/* DRx Antibiotikët — presentation-only layout orchestration; never computes clinical recommendations. */
(()=>{
'use strict';
function init(){
 const root=document.getElementById('antibioticsCatalog');
 if(!root||root.dataset.finishReady)return;
 const scope=root.querySelector('#abxSmartScopes');
 const route=root.querySelector('.abx-shortcuts');
 const workspace=root.querySelector('.abx-catalog-workspace');
 const filter=root.querySelector('#abxFilterPanel');
 const heading=root.querySelector('.abx-catalog-heading');
 const search=root.querySelector('#abxCatalogSearch');
 if(!scope||!route||!workspace||!filter||!heading||!search)return;
 const rail=document.createElement('div');
 rail.className='abx-discovery-rail';
 rail.setAttribute('role','group');
 rail.setAttribute('aria-label','Filtra të shpejtë për kërkimin klinik');
 scope.before(rail);
 rail.append(scope,route);
 const facetHeading=document.createElement('div');
 facetHeading.className='abx-facet-heading';
 const title=document.createElement('strong');
 title.textContent='Filtra të avancuar';
 const subtitle=document.createElement('span');
 subtitle.textContent='Përputhja e rrugës dhe formës kontrollohet mbi produktin e njëjtë';
 facetHeading.append(title,subtitle);
 filter.prepend(facetHeading);
 // Leave the editorial header and both source-derived metrics untouched.
 search.placeholder='Substanca, marka, ATC ose indikacioni…';
 // Keep sample queries discoverable when browsing, but move them out of the
 // clinician's way once an actual search begins.
 const updateQueryPresentation=()=>{
  root.classList.toggle('abx-has-query',Boolean(search.value.trim()));
 };
 search.addEventListener('input',updateQueryPresentation,{passive:true});
 updateQueryPresentation();
 // Respect the operating system in the existing search shortcut hint.
 const key=root.querySelector('.abx-smart-shortcut');
 if(key)key.textContent=/Mac|iPhone|iPad/.test(navigator.platform||'')?'⌘ K':'Ctrl K';

 // The directory holds 135 substances: offer a nonintrusive return to search
 // only after the clinician has scrolled down, with keyboard and reduced-motion support.
 const back=document.createElement('button');
 back.type='button';
 back.className='abx-back-to-search';
 back.setAttribute('aria-label','Kthehu te kërkimi i antibiotikëve');
 back.innerHTML='<span aria-hidden="true">↑</span><span>Kthehu te kërkimi</span>';
 back.hidden=true;
 root.appendChild(back);
 const motionReduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const onScroll=()=>{
  if(!back.isConnected)return;
  const top=search.getBoundingClientRect().top;
  back.hidden=top>-420;
 };
 back.addEventListener('click',()=>{
  search.scrollIntoView({behavior:motionReduced.matches?'auto':'smooth',block:'center'});
  if(window.matchMedia('(pointer: fine)').matches)search.focus({preventScroll:true});
 });
 window.addEventListener('scroll',onScroll,{passive:true});
 onScroll();
 root.dataset.finishReady='true';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();