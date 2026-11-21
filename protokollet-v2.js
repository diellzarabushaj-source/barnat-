/* DRx Clinical Library · fully rebuilt directory, 2026-11-21. */
(function(){
'use strict';
var $=function(s){return document.querySelector(s);};
var escapeHtml=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var fold=function(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();};
var domains=['msh.rks-gov.net'];
var OFFICIAL_CATALOG='https://msh.rks-gov.net/udherrefyesit-dhe-protokollet-klinike-upk/';
var library=[],state={system:'all',kind:'all',query:'',favorites:false,sort:'recent',selected:null};
var favorites=new Set();
var systems=[
{id:'all',label:'Të gjitha sistemet',icon:'grid'},
{id:'cardio',label:'Kardiovaskular',icon:'heart'},
{id:'pulmonary',label:'Respirator',icon:'wind'},
{id:'endocrine',label:'Endokrin / Diabet',icon:'activity'},
{id:'infection',label:'Infektologji',icon:'shield'},
{id:'neurology',label:'Neurologji',icon:'brain'},
{id:'mental',label:'Psikiatri',icon:'brain'},
{id:'women',label:'Gjinekologji / Obstetrikë',icon:'users'},
{id:'digestive',label:'Gastroenterologji',icon:'layers'},
{id:'renal',label:'Nefrologji',icon:'droplet'},
{id:'musculo',label:'Muskuloskeletal',icon:'bone'},
{id:'pediatrics',label:'Pediatri / Neonatologji',icon:'baby'},
{id:'toxicology',label:'Toksikologji',icon:'alert'},
{id:'dermatology',label:'Dermatologji',icon:'layers'},
{id:'dental',label:'Stomatologji',icon:'file'},
{id:'administrative',label:'Dokumente administrative',icon:'file'}
];
var paths={
grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
heart:'<path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.3a5.5 5.5 0 0 0 0-7.8z"/><path d="M5 12h4l2-3 2 6 2-3h4"/>',
wind:'<path d="M3 7h11a3 3 0 1 0-3-3"/><path d="M2 12h17a3 3 0 1 1-3 3"/><path d="M4 17h8a3 3 0 1 1-3 3"/>',
activity:'<path d="m2 12 5 0 3-8 4 16 3-8h5"/>',
shield:'<path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10Z"/><path d="M9 12h6M12 9v6"/>',
brain:'<path d="M12 6a4 4 0 0 0-7-2 4 4 0 0 0-2 6 4 4 0 0 0 0 7 4 4 0 0 0 7 3l2-2"/><path d="M12 6a4 4 0 0 1 7-2 4 4 0 0 1 2 6 4 4 0 0 1 0 7 4 4 0 0 1-7 3l-2-2M12 6v12M7 10l2 2M17 10l-2 2"/>',
users:'<circle cx="9" cy="7.5" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3ZM17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5"/>',
layers:'<path d="M12 3 2 9l10 6 10-6-10-6ZM2 14l10 6 10-6"/>',
droplet:'<path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13z"/>',
bone:'<path d="M6 9a3 3 0 1 1 3-3l6 9a3 3 0 1 1 3 3 3 3 0 1 1-3 3L9 15a3 3 0 1 1-3-6Z"/>',
baby:'<circle cx="12" cy="12" r="9"/><path d="M9 15s1 2 3 2 3-2 3-2M9 10h.01M15 10h.01M12 3a3 3 0 0 1 3 3"/>',
alert:'<path d="M12 3 2 21h20L12 3ZM12 9v5M12 18h.01"/>',
file:'<path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h5M8 13h8M8 17h6"/>',
star:'<path d="m12 2 3.1 6.3 7 1-5.1 5 1.2 7L12 18l-6.2 3.3 1.2-7-5.1-5 7-1z"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.file)+'</svg>';}
function groupOf(d){
if(d.system&&systems.some(function(s){return s.id===d.system;}))return d.system;
var n=parseInt(d.id.replace('upk-',''),10);
if(n<=2)return 'musculo';if(n===3)return 'infection';if(n===4)return 'toxicology';if(n<=10)return 'pulmonary';
if(n<=16)return 'endocrine';if(n<=18)return 'cardio';if(n===19)return 'neurology';if(n<=27)return 'infection';
if(n<=29)return 'neurology';if(n<=38)return 'mental';if(n===39)return 'digestive';
if(n<=50)return 'women';if(n===51)return 'pediatrics';if(n===52)return 'renal';return 'pulmonary';
}
var emergencyIds=new Set(['upk-04','upk-10','upk-19','upk-39','upk-45','upk-46','upk-47','upk-53','upk-54','upk-55']);
function docKind(d){if(['protocol','guideline','other'].includes(d.kind))return d.kind;var t=fold(d.title);return t.indexOf('protokoll')!==-1?'protocol':t.indexOf('udherrefyes')!==-1?'guideline':'other';}
function kindLabel(k){return k==='protocol'?'Protokoll klinik':k==='guideline'?'Udhërrëfyes klinik':'Dokument klinik';}
function validOfficial(url){try{var u=new URL(url);return u.protocol==='https:'&&domains.indexOf(u.hostname)!==-1&&((u.pathname==='/Documents/DownloadDocument'&&!!u.searchParams.get('fileName'))||u.pathname==='/udherrefyesit-dhe-protokollet-klinike-upk/'||u.pathname==='/Documents/Index/273'||u.pathname.startsWith('/wp-content/uploads/'))&&!u.username&&!u.password;}catch(e){return false;}}
function safeLoadFavorites(){try{var x=JSON.parse(localStorage.getItem('drx:clinical-library:favorites:v3')||'[]');if(Array.isArray(x))favorites=new Set(x.filter(function(id){return /^(?:upk-\d\d|msh-\d{3})$/.test(id);}));}catch(e){favorites=new Set();}}
function saveFavorites(){try{localStorage.setItem('drx:clinical-library:favorites:v3',JSON.stringify(Array.from(favorites)));}catch(e){}}
function labelSystem(id){var s=systems.find(function(x){return x.id===id;});return s?s.label:'Sistemi klinik';}
function year(d){return Number.isInteger(d.year)?String(d.year):/^\d{4}-/.test(d.publishedAt||'')?d.publishedAt.slice(0,4):'Pa datë';}
function dateLabel(d){return d.year?'Viti '+d.year:/^\d{4}-\d\d-\d\d$/.test(d.publishedAt||'')?d.publishedAt.split('-').reverse().join('.'): 'Datë e papërcaktuar';}
function filterDocs(){
var words=fold(state.query).split(/\s+/).filter(Boolean);
return library.filter(function(d){
if(state.system!=='all'&&d.system!==state.system)return false;
if(state.favorites&&!favorites.has(d.id))return false;
if(state.kind==='historic'&&!d.archived)return false;
if(state.kind==='emergency'&&!emergencyIds.has(d.sourceId||d.id))return false;
if(state.kind==='consultation'&&d.publicationType!=='draft')return false;
if(!['all','historic','emergency','consultation'].includes(state.kind)&&d.kind!==state.kind)return false;
var haystack=fold([d.title,labelSystem(d.system),d.id,year(d),kindLabel(d.kind)].join(' '));
return words.every(function(w){return haystack.indexOf(w)!==-1;});
}).sort(function(a,b){
if(state.sort==='az')return a.title.localeCompare(b.title,'sq');
var da=String(a.year||'')+'-'+(a.publishedAt||'0000'),db=String(b.year||'')+'-'+(b.publishedAt||'0000');
if(state.sort==='oldest')return da.localeCompare(db)||a.title.localeCompare(b.title,'sq');
return db.localeCompare(da)||a.title.localeCompare(b.title,'sq');
});
}
function renderSystems(){
$('#plSystems').innerHTML=systems.map(function(s){
var count=s.id==='all'?library.length:library.filter(function(d){return d.system===s.id;}).length;
return '<button type="button" class="pl-system'+(state.system===s.id?' is-selected':'')+'" data-system="'+s.id+'" aria-pressed="'+(state.system===s.id)+'"><span class="pl-system-icon">'+icon(s.icon)+'</span><span class="pl-system-name">'+escapeHtml(s.label)+'</span><span class="pl-system-count">'+count+'</span></button>';
}).join('');
}
function renderFilters(){$('#plFilters').querySelectorAll('[data-kind]').forEach(function(b){var on=b.dataset.kind===state.kind;b.classList.toggle('is-selected',on);b.setAttribute('aria-pressed',String(on));});}
function docCard(d){
return '<article class="pl-doc" data-id="'+d.id+'"><div class="pl-doc-mark">'+icon('file')+'</div><div class="pl-doc-main"><div class="pl-doc-top"><span class="pl-tag'+(d.kind==='protocol'?' is-protocol':'')+'">'+escapeHtml(kindLabel(d.kind))+'</span>'+(d.archived?'<span class="pl-tag is-history">Historik · COVID-19</span>':'')+'</div><button type="button" class="pl-doc-title" data-open="'+d.id+'">'+escapeHtml(d.title)+'</button><div class="pl-doc-meta"><span>'+escapeHtml(labelSystem(d.system))+'</span><span>•</span><span>'+escapeHtml(dateLabel(d))+'</span><span>•</span><span>'+escapeHtml(d.mirrorUrl?'Lexo në DRx':d.type==='catalog'?'Katalog / MSh':d.type.toUpperCase())+'</span>'+(d.duplicateOf?'<span>• Publikim i përsëritur</span>':'')+(d.publicationType==='draft'?'<span>• Konsultim publik</span>':'')+'</div></div><div class="pl-doc-actions"><button type="button" class="pl-icon-btn'+(favorites.has(d.id)?' is-on':'')+'" data-favorite="'+d.id+'" title="Ruaje dokumentin" aria-label="'+(favorites.has(d.id)?'Hiqe nga të ruajturat':'Ruaje dokumentin')+'" aria-pressed="'+favorites.has(d.id)+'">'+icon('star')+'</button><button type="button" class="pl-open" data-open="'+d.id+'">Shiko <span aria-hidden="true">↗</span></button></div></article>';
}
function renderDirectory(){
var matches=filterDocs();
renderSystems();renderFilters();
$('#plSectionTitle').textContent=state.system==='all'?'Biblioteka e dokumenteve':labelSystem(state.system);
$('#plResultsSummary').textContent=matches.length+' nga '+library.length+' dokumente';
$('#plFavoritesOnly').classList.toggle('is-on',state.favorites);
$('#plFavoritesOnly').setAttribute('aria-pressed',String(state.favorites));
$('#plFavoritesOnly').textContent=state.favorites?'★ Të ruajturat':'☆ Të ruajturat';
$('#plClearSearch').hidden=!state.query;
$('#plLoadStatus').textContent=state.query?'Kërkimi: '+state.query:'Dokumentet janë renditur sipas datës së publikimit të regjistruar.';
$('#protocolList').innerHTML=matches.length?matches.map(docCard).join(''):'<div class="pl-empty"><strong>Nuk u gjet asnjë dokument.</strong><span>Provo një term tjetër ose pastro filtrat.</span><div><button class="pl-link-button" type="button" id="plReset">Pastro filtrat</button></div></div>';
$('#plDirectoryView').hidden=false;$('#protocolReader').hidden=true;
}
function renderReader(d){
var related=library.filter(function(x){return x.id!==d.id&&x.system===d.system&&!x.duplicateOf;}).sort(function(a,b){return (b.publishedAt||'').localeCompare(a.publishedAt||'');}).slice(0,4);
$('#plDirectoryView').hidden=true;$('#protocolReader').hidden=false;
var mainLink=d.mirrorUrl||d.catalogUrl||OFFICIAL_CATALOG;
var actions='<a class="pl-primary" href="'+escapeHtml(mainLink)+'" target="_blank" rel="noopener noreferrer">'+(d.mirrorUrl?'Hap kopjen arkivore në DRx ↗':'Shiko dokumentin në katalogun zyrtar ↗')+'</a>';
/* The historical Documents/DownloadDocument URLs are quarantined: redirects may serve unrelated PDFs. */
actions+='<a class="pl-secondary" href="'+escapeHtml(d.catalogUrl||OFFICIAL_CATALOG)+'" target="_blank" rel="noopener noreferrer external">Katalogu zyrtar ↗</a>';
actions+='<button class="pl-secondary" type="button" data-favorite="'+d.id+'">'+(favorites.has(d.id)?'★ Hiqe nga të ruajturat':'☆ Ruaje për më vonë')+'</button>';
actions+='<button class="pl-secondary" type="button" id="plCopyLink">Kopjo lidhjen</button>';
var relatedMarkup=related.length?'<div class="pl-related"><h3>Dokumente nga i njëjti sistem</h3><div class="pl-related-grid">'+related.map(function(x){return '<button type="button" class="pl-related-item" data-open="'+x.id+'">'+escapeHtml(x.title)+'<small>'+escapeHtml(year(x))+' · '+escapeHtml(kindLabel(x.kind))+'</small></button>';}).join('')+'</div></div>':'';
$('#protocolReader').innerHTML='<button class="pl-back" type="button" id="plBack">← Kthehu te dokumentet</button><article class="pl-reader"><div class="pl-reader-kicker"><span class="pl-tag'+(d.kind==='protocol'?' is-protocol':'')+'">'+escapeHtml(kindLabel(d.kind))+'</span>'+(d.archived?'<span class="pl-tag is-history">Dokument historik</span>':'')+(d.publicationType==='draft'?'<span class="pl-tag is-history">Konsultim publik – jo udhëzim i miratuar</span>':'')+'</div><h2>'+escapeHtml(d.title)+'</h2><div class="pl-reader-info"><div class="pl-info"><span>Sistemi</span><strong>'+escapeHtml(labelSystem(d.system))+'</strong></div><div class="pl-info"><span>Publikimi</span><strong>'+escapeHtml(dateLabel(d))+'</strong></div><div class="pl-info"><span>Qasja</span><strong>'+escapeHtml(d.mirrorUrl?'Kopje e arkivuar në DRx':'Vetëm katalogu zyrtar')+'</strong></div><div class="pl-info"><span>Referenca</span><strong>'+escapeHtml(d.id.toUpperCase())+'</strong></div></div><div class="pl-reader-notice"><strong>Burimi dhe vlefshmëria</strong><p>Lidhjet e vjetra të MSh-së për shkarkim direkt janë pezulluar sepse disa kanë kthyer dokumente të gabuara. Kopja arkivore në DRx është ruajtur nga indeksimi i mëparshëm, por titulli brenda PDF-së nuk është verifikuar veçmas. Nëse nuk ka kopje, hap katalogun zyrtar. Para përdorimit klinik krahaso gjithmonë titullin, versionin dhe miratimin e dokumentit.</p></div><div class="pl-reader-actions">'+actions+'</div>'+relatedMarkup+'</article>';
}
function setSelected(id,scroll){
var doc=library.find(function(d){return d.id===id;});
state.selected=doc?doc.id:null;
if(doc)renderReader(doc);else renderDirectory();
if(scroll)window.scrollTo({top:0,behavior:'smooth'});
}
function openDocument(id){if(!library.some(function(d){return d.id===id;}))return;if(location.hash!=='#protokoll/'+id)location.hash='protokoll/'+id;else setSelected(id,true);}
function backToDirectory(){if(location.hash)history.pushState(null,'',location.pathname+location.search);setSelected(null,true);}
function hashRoute(){var m=location.hash.match(/^#protokoll\/(upk-\d{2})$/);setSelected(m?m[1]:null,false);}
function showToast(t){var el=$('#plToast');if(!el){el=document.createElement('div');el.id='plToast';el.className='pl-toast';el.setAttribute('role','status');document.body.appendChild(el);}el.textContent=t;el.hidden=false;window.setTimeout(function(){el.hidden=true;},2000);}
function bind(){
$('#menuButton').addEventListener('click',function(){$('#sidebar').classList.add('is-open');$('#sidebarBackdrop').hidden=false;});
function closeMenu(){$('#sidebar').classList.remove('is-open');$('#sidebarBackdrop').hidden=true;}
$('#sidebarClose').addEventListener('click',closeMenu);$('#sidebarBackdrop').addEventListener('click',closeMenu);
$('#logoutButton').addEventListener('click',async function(){try{var r=await fetch('/api/auth',{method:'DELETE',credentials:'same-origin'});if(r.ok)location.assign('/landing.html');}catch(e){showToast('Nuk u krye dalja.');}});
$('#protocolSearch').addEventListener('input',function(e){state.query=e.target.value;state.selected=null;renderDirectory();});
$('#plClearSearch').addEventListener('click',function(){$('#protocolSearch').value='';state.query='';renderDirectory();$('#protocolSearch').focus();});
$('#plSort').addEventListener('change',function(e){state.sort=e.target.value;renderDirectory();});
$('#plFavoritesOnly').addEventListener('click',function(){state.favorites=!state.favorites;renderDirectory();});
$('#plSystems').addEventListener('click',function(e){var b=e.target.closest('[data-system]');if(!b)return;state.system=b.dataset.system;backToDirectory();});
$('#plFilters').addEventListener('click',function(e){var b=e.target.closest('[data-kind]');if(!b)return;state.kind=b.dataset.kind;backToDirectory();});
document.addEventListener('click',function(e){
var open=e.target.closest('[data-open]');if(open){openDocument(open.dataset.open);return;}
var fav=e.target.closest('[data-favorite]');if(fav){var id=fav.dataset.favorite;if(favorites.has(id))favorites.delete(id);else favorites.add(id);saveFavorites();if(state.selected)renderReader(library.find(function(d){return d.id===state.selected;}));else renderDirectory();return;}
if(e.target.closest('#plBack')){backToDirectory();return;}
if(e.target.closest('#plRetry')){location.reload();return;}
if(e.target.closest('#plReset')){state.kind='all';state.system='all';state.favorites=false;state.query='';$('#protocolSearch').value='';renderDirectory();return;}
if(e.target.closest('#plCopyLink')){navigator.clipboard.writeText(location.href).then(function(){showToast('Lidhja u kopjua.');},function(){showToast('Lidhja nuk u kopjua.');});}
});
window.addEventListener('hashchange',hashRoute);window.addEventListener('popstate',hashRoute);
window.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();backToDirectory();$('#protocolSearch').focus();}else if(e.key==='Escape'){closeMenu();if(state.selected)backToDirectory();}else if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();backToDirectory();$('#protocolSearch').focus();}});
}
async function load(){
try{
var auth=await fetch('/api/auth',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
var payload=await auth.json().catch(function(){return {};});
if(auth.status===401||auth.status===403||(auth.ok&&payload.authenticated===false)){location.replace('/landing.html?return='+encodeURIComponent(location.pathname+location.search+location.hash));return;}
if(!auth.ok||payload.authenticated!==true)throw Error('Sesioni nuk mund të verifikohet.');
$('#syncText').textContent='Sesioni aktiv';$('#sourceStatus').textContent='Sesioni aktiv';
var profile=document.createElement('script');profile.src='/medindex-brand-runtime.js?v=drx-brand-v8-profileguard1';profile.defer=true;profile.onload=function(){window.MedIndexProfile&&window.MedIndexProfile.adoptAccount&&window.MedIndexProfile.adoptAccount(payload);window.dispatchEvent(new CustomEvent('medindex:auth-ready',{detail:payload}));};document.head.appendChild(profile);
var response=await fetch('/data/protocols.json',{credentials:'same-origin',cache:'no-store'});
if(!response.ok)throw Error('Regjistri bazë nuk u ngarkua.');
var legacy=await response.json();
if(!Array.isArray(legacy.documents))throw Error('Regjistri bazë është i pavlefshëm.');
var expanded=await fetch('/data/clinical-catalog-78.json',{credentials:'same-origin',cache:'no-store'});
if(!expanded.ok)throw Error('Katalogu i plotë nuk u ngarkua.');
var data=await expanded.json();
if(!Array.isArray(data.documents)||data.documents.length<50)throw Error('Katalogu i dokumenteve është i paplotë.');
if(data.schemaVersion<4||data.documents.some(function(d){return !!d.sourceUrl||d.currentOfficialDocumentUrlVerified!==false;}))throw Error('Lidhjet e vjetra nuk janë izoluar në katalog.');
var seen=new Set();
library=data.documents.filter(function(d){if(!d||!/^msh-\d{3}$/.test(d.id)||d.duplicateOf||!d.clinical||seen.has(d.id)||!validOfficial(d.sourceUrl||d.catalogUrl)||!validOfficial(d.catalogUrl))return false;seen.add(d.id);return true;}).map(function(d){return {id:d.id,title:String(d.title||'').slice(0,500),officialUrl:d.sourceUrl||d.catalogUrl,catalogUrl:d.catalogUrl,mirrorUrl:d.documentAccess==='archived_private_mirror'&&/^\/api\/protocol-document\?id=upk-\d{2}$/.test(d.cachedPath||'')?d.cachedPath:null,type:d.sourceUrl?(/\.docx(?:$|\?)/.test(d.sourceUrl)?'docx':'pdf'):'catalog',isDirect:!!d.sourceUrl,sourceId:d.sourceId||null,year:d.year,publishedAt:d.publishedAt||'',archived:d.year<=2021&&fold(d.title).includes('covid'),system:groupOf(d),kind:docKind(d),duplicateOf:d.duplicateOf||null,publicationType:d.publicationType||'standard'};});
if(library.length!==data.documents.length)throw Error('Katalogu nuk u validua plotësisht.');
$('#plTotal').textContent=library.length;$('#plProtocolCount').textContent=library.filter(function(d){return d.kind==='protocol'&&!d.duplicateOf;}).length;$('#plSystemCount').textContent=new Set(library.map(function(d){return d.system;})).size;
$('#syncText').textContent='Burimi MSh';$('#plLoadStatus').textContent='';
renderDirectory();hashRoute();
}catch(e){$('#plLoadStatus').textContent='Biblioteka nuk është e qasshme: '+String(e.message||e);$('#protocolList').innerHTML='<div class="pl-empty"><strong>Nuk mund të shfaqen dokumentet.</strong><span>Verifiko lidhjen ose sesionin dhe rifresko faqen.</span><div><button class="pl-link-button" type="button" id="plRetry">Provo përsëri</button></div></div>';$('#plResultsSummary').textContent='Burimi i papërgatitur';$('#syncText').textContent='Lidhja dështoi';}
finally{$('#appShell').setAttribute('aria-busy','false');}
}
function loadSharedSidebarTaxonomy(){if(document.querySelector('script[data-drx-sidebar-taxonomy]'))return;var script=document.createElement('script');script.src='/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v4';script.defer=true;script.setAttribute('data-drx-sidebar-taxonomy','1');document.head.appendChild(script);}
function boot(){loadSharedSidebarTaxonomy();safeLoadFavorites();bind();renderSystems();$('#plLoadStatus').textContent='Duke lexuar dokumentet…';load();}
window.DRxProtocolShell=Object.freeze({version:'4.1',init:boot,validOfficial:validOfficial});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();