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
 root.dataset.finishReady='true';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();