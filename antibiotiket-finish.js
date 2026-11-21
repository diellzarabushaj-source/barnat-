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
 const kicker=heading.querySelector('.abx-catalog-eyebrow');
 if(kicker)kicker.textContent='DRx / BIBLIOTEKA KLINIKE / AKPPM';
 const desc=heading.querySelector('h1 + p');
 if(desc)desc.textContent='Substancat, markat dhe indikacionet në një kërkim të vetëm. Filtra të qartë dhe burime të dokumentuara.';
 search.placeholder='Substanca, marka, ATC ose indikacioni…';
 const counter=heading.querySelector('.abx-heading-meta span');
 if(counter)counter.textContent='substanca dhe kombinime me produkte aktive në eksport';
 root.dataset.finishReady='true';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();