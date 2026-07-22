(async () => {
const encoded = window.DRUG_DATA_PARTS.join('');
const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
const RAW = JSON.parse(await new Response(stream).text());

const COLUMNS = [
  { key:'Nr rendor', label:'Nr', type:'num', cls:'code', visible:true },
  { key:'Emri tregtar', label:'Emri Tregtar', type:'str', cls:'name', visible:true },
  { key:'Substanca aktive', label:'Substanca Aktive', type:'str', cls:'', visible:true },
  { key:'ATC Code', label:'ATC', type:'str', cls:'code', visible:true },
  { key:'Klasa / Çka është', label:'Klasa / Çka është', type:'str', cls:'wrap', visible:true },
  { key:'Përdorimi (fjalë kyçe)', label:'Përdorimi / fjalë kyçe', type:'str', cls:'wrap', visible:true },
  { key:'PDID', label:'PDID', type:'str', cls:'code', visible:true },
  { key:'ProtocolNo', label:'Protokolli', type:'str', cls:'code', visible:false },
  { key:'Fortësia', label:'Fort&euml;sia', type:'str', cls:'', visible:true },
  { key:'Forma farmaceutike', label:'Forma', type:'str', cls:'wrap', visible:true },
  { key:'Madhësia e paketimit', label:'Paketimi', type:'str', cls:'wrap', visible:true },
  { key:'Bartësi i Autorizim Marketingut', label:'Barta&euml;si i Autorizimit', type:'str', cls:'wrap', visible:false },
  { key:'Prodhuesi', label:'Prodhuesi', type:'str', cls:'wrap', visible:false },
  { key:'MA certifikata', label:'Certifikata MA', type:'str', cls:'code', visible:false },
  { key:'Statusi', label:'Statusi', type:'str', cls:'', visible:true },
  { key:'Çmimi me shumicë', label:'&Ccedil;m. Shumic&euml;', type:'num', cls:'price', visible:false },
  { key:'Çmimi me marzhë', label:'&Ccedil;m. Marzh&euml;', type:'num', cls:'price', visible:false },
  { key:'TVSH', label:'TVSH', type:'str', cls:'', visible:false },
  { key:'Çmimi me pakicë', label:'&Ccedil;m. Pakic&euml;', type:'num', cls:'price', visible:true },
  { key:'Afati i vlefshmërisë', label:'Afati', type:'str', cls:'wrap', visible:false },
];

let state = {
  search: '',
  status: '',
  formType: null,
  formValue: null,
  sortKey: 'Nr rendor',
  sortDir: 1,
  page: 1,
  pageSize: 50,
};

function visibleColumns(){ return COLUMNS.filter(c => c.visible); }

function buildHeader(){
  const row = document.getElementById('headerRow');
  row.innerHTML = '';
  visibleColumns().forEach(col => {
    const th = document.createElement('th');
    th.innerHTML = col.label + '<span class="arrow">' + (state.sortKey===col.key ? (state.sortDir===1?'▲':'▼') : '↕') + '</span>';
    if(state.sortKey===col.key) th.classList.add('sorted');
    th.addEventListener('click', () => {
      if(state.sortKey === col.key){ state.sortDir *= -1; }
      else { state.sortKey = col.key; state.sortDir = 1; }
      state.page = 1;
      render();
    });
    row.appendChild(th);
  });
}

const SEARCH_FIELDS = ['Emri tregtar','Substanca aktive','ATC Code','Klasa / Çka është','Përdorimi (fjalë kyçe)','PDID','ProtocolNo','Prodhuesi','Bartësi i Autorizim Marketingut','Forma farmaceutike','Madhësia e paketimit'];

const FORM_ALIASES = {
  'kapsul': ['capsule'], 'tablet': ['tablet'], 'tabletë': ['tablet'], 'shurup': ['syrup'],
  'sirup': ['syrup'], 'injeksion': ['injection'], 'infuzion': ['infusion'], 'kremë': ['cream'],
  'kreme': ['cream'], 'pika': ['drops'], 'pikë': ['drops'], 'supozitor': ['suppository'],
  'pomad': ['ointment'], 'pomadë': ['ointment'], 'xhel': ['gel'], 'zhel': ['gel'],
  'pluhur': ['powder'], 'granula': ['granules'], 'granulë': ['granules'], 'inhalim': ['inhalation'],
  'inhalator': ['inhalation'], 'spraj': ['spray'], 'sprej': ['spray'], 'losion': ['lotion'],
  'shampo': ['shampoo'], 'fliter': ['patch'], 'leng': ['solution','liquid'], 'lëng': ['solution','liquid'],
  'tretësirë': ['solution'], 'tretesire': ['solution'], 'suspension': ['suspension'],
  'suspensioni': ['suspension'], 'shpujzë': ['effervescent'], 'efervishente': ['effervescent'],
  'efervishent': ['effervescent'], 'pilul': ['tablet','pill'], 'implant': ['implant'],
  'ampul': ['ampoule'], 'ampulë': ['ampoule'],
};

const FORM_CATEGORIES = {
  'Tableta & pilula': ['Chewable tablet','Coated tablet','Compressed lozenge','Dispersible tablet','Effervescent tablet','Film coated tablet','Gastro-resistant coated tablet','Gastro-resistant tablet','Lozenge','Modified-release film-coated tablet','Modified-release tablet','Orodispersible tablet','Pastille','Prolonged-release tablet','Soluble tablet','Sublingual tablet','Tablet'],
  'Kapsula': ['Capsule','Capsule, hard','Capsule, soft','Gastro-resistant capsule','Gastro-resistant capsule, hard','Inhalation powder, hard capsule','Modified release capsule, hard','Prolonged release capsule, hard','Prolonged-release capsule','Vaginal capsule','Vaginal capsule, soft'],
  'Shurupe & solucione orale': ['Granules for oral solution','Granules for oral suspension','Granules for syrup','Oral drops','Oral drops, solution','Oral drops, suspension','Oral emulsion','Oral gel','Oral jelly','Oral lyophilisate','Oral powder','Oral solution','Oral suspension','Powder for oral solution','Powder for oral suspension','Syrup'],
  'Injeksione & Infuzione': ['Ampoule','Concentrate for solution for infusion','Concentrate for solution for injection','Concentrate for solution for injection/infusion','Emulsion for infusion','Emulsion for injection/infusion','Injection','Lyophilisate for solution for infusion','Lyophilisate for solution for injection','Lyophilisate for suspension for injection','Powder and solvent for solution for infusion','Powder and solvent for solution for injection','Powder and solvent for solution for injection/infusion','Powder and solvent for suspension for injection','Powder for concentrate for solution for infusion','Powder for injection','Powder for solution for infusion','Powder for solution for injection','Powder for solution for injection or infusion','Powder for suspension for injection','Solution for infusion','Solution for infusion and oral solution','Solution for injection','Solution for injection/infusion','Suspension for injection'],
  'Kremra, xhel & pomada': ['Cream','Cutaneous emulsion','Cutaneous liquid','Cutaneous paste','Cutaneous powder','Cutaneous solution','Gel','Nasal ointment','Ointment'],
  'Pika (sy, veshë, hundë)': ['Ear drops, emulsion','Ear drops, solution','Ear/eye drops, solution','Eye drops','Eye drops, solution','Eye drops, suspension','Eye gel','Eye ointment','Nasal drops, solution'],
  'Sprej & Inhalim': ['Cutaneous spray','Cutaneous spray, solution','Inhalation powder','Inhalation vapour, liquid','Inhalation vapour, solution','Medicinal gas, compressed','Medicinal gas, liquefied','Nasal spray','Nasal spray, solution','Nasal spray, suspension','Nebuliser solution','Nebuliser suspension','Oral solution/concentrate for nebuliser solution','Oromucosal spray','Powder for nebuliser solution','Pressurised inhalation, solution','Pressurised inhalation, suspension','Sublingual spray'],
  'Pluhur & granula': ['Effervescent granules','Effervescent powder','Granules','Oromucosal gel','Oromucosal solution'],
  'Supozitorë & forma vaginale': ['Endocervical gel','Pessary','Rectal cream','Rectal ointment','Rectal solution','Rectal suspension','Suppository','Vaginal cream','Vaginal gel','Vaginal solution','Vaginal tablet'],
  'Forma të tjera speciale': ['Applicator','Bladder irrigation','Dental solution','Gargle','Gargle/mouth wash','Implant','Impregnated dressing','Intraarticular use','Medicated chewing-gum','Medicated nail laquer','Mouth wash','Shampoo','Solution for peritonel dialysis','Solvent for parenteral use','Transdermal patch'],
};

const CATEGORY_ORDER = Object.keys(FORM_CATEGORIES);
const CATEGORY_COLORS = {
  'Tableta & pilula': '#2f7d5c', 'Kapsula': '#b1502f', 'Shurupe & solucione orale': '#2f6f9e',
  'Injeksione & Infuzione': '#8a3e6b', 'Kremra, xhel & pomada': '#b98a1e',
  'Pika (sy, veshë, hundë)': '#3f9a8f', 'Sprej & Inhalim': '#6d5aa6',
  'Pluhur & granula': '#9c6b3f', 'Supozitorë & forma vaginale': '#c2547e',
  'Forma të tjera speciale': '#6b6f76',
};

const FORM_TO_CATEGORY = {};
CATEGORY_ORDER.forEach(cat => FORM_CATEGORIES[cat].forEach(f => { FORM_TO_CATEGORY[f] = cat; }));
function categoryOf(forma){ return FORM_TO_CATEGORY[String(forma).trim()] || null; }

function fieldMatchesTerm(fieldLower, term){
  if(fieldLower.includes(term)) return true;
  const aliasTargets = FORM_ALIASES[term];
  return aliasTargets ? aliasTargets.some(t => fieldLower.includes(t)) : false;
}
function rowMatchesSearch(r, terms){
  return terms.every(term => SEARCH_FIELDS.some(f => fieldMatchesTerm(String(r[f]).toLowerCase(), term)));
}

function getFiltered(){
  let rows = RAW;
  const q = state.search.trim().toLowerCase();
  if(q){
    const terms = q.split(/\s+/).filter(Boolean);
    rows = rows.filter(r => rowMatchesSearch(r, terms));
  }
  if(state.status) rows = rows.filter(r => String(r['Statusi']).trim() === state.status);
  if(state.formType === 'form') rows = rows.filter(r => String(r['Forma farmaceutike']).trim() === state.formValue);
  else if(state.formType === 'category') rows = rows.filter(r => categoryOf(r['Forma farmaceutike']) === state.formValue);
  return rows;
}

function sortRows(rows){
  const col = COLUMNS.find(c => c.key === state.sortKey);
  const dir = state.sortDir;
  return [...rows].sort((a,b) => {
    let av = a[state.sortKey], bv = b[state.sortKey];
    if(col.type === 'num') return ((Number(av)||0) - (Number(bv)||0)) * dir;
    return String(av).toLowerCase().localeCompare(String(bv).toLowerCase(), 'sq') * dir;
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function render(){
  buildHeader();
  const filtered = sortRows(getFiltered());
  const total = filtered.length;
  document.getElementById('countBadge').textContent = total + ' / ' + RAW.length + ' barna';
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  if(state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * state.pageSize;
  const pageRows = filtered.slice(start, start + state.pageSize);
  const cols = visibleColumns();
  const tbody = document.getElementById('tbody');
  if(pageRows.length === 0){
    tbody.innerHTML = '<tr><td colspan="' + Math.max(cols.length,1) + '"><div class="empty-state">Asnj&euml; barn&euml; nuk u gjet p&euml;r k&euml;t&euml; k&euml;rkim.</div></td></tr>';
  } else {
    tbody.innerHTML = pageRows.map(r => '<tr>' + cols.map(col => {
      let val = r[col.key];
      if(col.key === 'Statusi'){
        const s = String(val).trim();
        const cls = s === 'Gjenerik' ? 'gjenerik' : (s === 'Origjinator' ? 'origjinator' : '');
        return '<td class="' + col.cls + '">' + (s ? '<span class="badge ' + cls + '">' + escapeHtml(s) + '</span>' : '') + '</td>';
      }
      if(col.key === 'Forma farmaceutike'){
        const cat = categoryOf(val); const color = cat ? CATEGORY_COLORS[cat] : '#999';
        return '<td class="' + col.cls + '" title="' + escapeHtml(cat || '') + '"><span class="cat-dot" style="background:' + color + '"></span>' + escapeHtml(val) + '</td>';
      }
      if(col.type === 'num' && col.cls === 'price') val = Number(val).toLocaleString('de-DE', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' &euro;';
      else val = escapeHtml(val);
      return '<td class="' + col.cls + '" title="' + escapeHtml(r[col.key]) + '">' + val + '</td>';
    }).join('') + '</tr>').join('');
  }
  renderPagination(totalPages);
}

function renderPagination(totalPages){
  const pag = document.getElementById('pagination'); pag.innerHTML = '';
  if(state.pageSize >= 4006){ pag.innerHTML = '<span style="color:#777;font-size:.82rem;">Duke shfaqur t&euml; gjitha rreshtat</span>'; return; }
  const mkBtn = (label, page, disabled, active) => {
    const b = document.createElement('button'); b.textContent = label;
    if(disabled) b.disabled = true; if(active) b.classList.add('active');
    b.addEventListener('click', () => { state.page = page; render(); }); return b;
  };
  pag.appendChild(mkBtn('« Para', state.page - 1, state.page === 1, false));
  const cur = state.page; let pages = [];
  for(let p=1;p<=totalPages;p++) if(p===1 || p===totalPages || Math.abs(p-cur)<=2) pages.push(p);
  let last = 0;
  pages.forEach(p => {
    if(last && p-last>1){ const dots=document.createElement('span'); dots.textContent='…'; dots.style.padding='0 4px'; dots.style.color='#999'; pag.appendChild(dots); }
    pag.appendChild(mkBtn(String(p), p, false, p===cur)); last=p;
  });
  pag.appendChild(mkBtn('Pas »', state.page+1, state.page===totalPages, false));
}

function buildColPanel(){
  const panel = document.getElementById('colPanel'); panel.innerHTML = '';
  const actions = document.createElement('div'); actions.className = 'col-panel-actions';
  const btnAll = document.createElement('button'); btnAll.type='button'; btnAll.textContent='Shfaqi të gjitha';
  btnAll.addEventListener('click', () => { COLUMNS.forEach(c => c.visible=true); buildColPanel(); render(); });
  const btnNone = document.createElement('button'); btnNone.type='button'; btnNone.textContent='Fshihi të gjitha';
  btnNone.addEventListener('click', () => { COLUMNS.forEach((c,i) => c.visible=i===0); buildColPanel(); render(); });
  actions.append(btnAll, btnNone); panel.appendChild(actions);
  COLUMNS.forEach(col => {
    const label=document.createElement('label'); const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=col.visible;
    cb.addEventListener('change', () => { col.visible=cb.checked; render(); }); label.appendChild(cb);
    const span=document.createElement('span'); span.innerHTML=col.label; label.appendChild(span); panel.appendChild(label);
  });
}

const colPanel = document.getElementById('colPanel');
const colPickerBtn = document.getElementById('colPickerBtn');
colPickerBtn.addEventListener('click', e => { e.stopPropagation(); colPanel.classList.toggle('open'); });
document.addEventListener('click', e => { if(!colPanel.contains(e.target) && e.target !== colPickerBtn) colPanel.classList.remove('open'); });

function textMatches(text, q){
  const tl = text.toLowerCase();
  if(tl.includes(q)) return true;
  return Object.keys(FORM_ALIASES).some(k => q.includes(k) && FORM_ALIASES[k].some(t => tl.includes(t)));
}

function buildFormPanel(filterText){
  const list=document.getElementById('formList'); list.innerHTML=''; const q=(filterText||'').trim().toLowerCase();
  const allItem=document.createElement('div'); allItem.className='form-item form-item-all'+(state.formType===null?' active':''); allItem.textContent='Të gjitha format';
  allItem.addEventListener('click', () => selectForm(null,null)); list.appendChild(allItem);
  let anyRendered=false;
  CATEGORY_ORDER.forEach(cat => {
    const forms=FORM_CATEGORIES[cat]; const catMatches=!q||textMatches(cat,q); const matchingForms=forms.filter(f => !q||catMatches||textMatches(f,q));
    if(q&&!catMatches&&matchingForms.length===0) return; anyRendered=true; const color=CATEGORY_COLORS[cat];
    const header=document.createElement('div'); header.className='form-cat-header'+(state.formType==='category'&&state.formValue===cat?' active':'');
    header.innerHTML='<span class="cat-dot" style="background:'+color+'"></span>'+escapeHtml(cat)+' <span class="cat-count">('+forms.length+')</span>';
    header.addEventListener('click', () => selectForm('category',cat)); list.appendChild(header);
    (q&&!catMatches?matchingForms:forms).forEach(f => {
      const item=document.createElement('div'); item.className='form-item form-item-sub'+(state.formType==='form'&&state.formValue===f?' active':'');
      item.innerHTML='<span class="cat-dot" style="background:'+color+'"></span>'+escapeHtml(f); item.addEventListener('click', () => selectForm('form',f)); list.appendChild(item);
    });
  });
  if(q&&!anyRendered){ const empty=document.createElement('div'); empty.className='form-empty'; empty.textContent='Asnjë formë nuk u gjet'; list.appendChild(empty); }
}

function selectForm(type,value){
  state.formType=type; state.formValue=value; state.page=1; const btn=document.getElementById('formPickerBtn');
  if(type===null) btn.textContent='Forma: Të gjitha ▾';
  else if(type==='category') btn.innerHTML='<span class="cat-dot" style="background:'+CATEGORY_COLORS[value]+'"></span>'+escapeHtml(value)+' ▾';
  else btn.innerHTML='<span class="cat-dot" style="background:'+CATEGORY_COLORS[categoryOf(value)]+'"></span>'+escapeHtml(value)+' ▾';
  document.getElementById('formPanel').classList.remove('open'); render();
}

function initFormPicker(){
  buildFormPanel(''); const btn=document.getElementById('formPickerBtn'); const panel=document.getElementById('formPanel'); const searchInput=document.getElementById('formSearch');
  btn.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open'); if(panel.classList.contains('open')) searchInput.focus(); });
  searchInput.addEventListener('input', e => buildFormPanel(e.target.value)); panel.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', e => { if(!panel.contains(e.target)&&e.target!==btn) panel.classList.remove('open'); });
}

document.getElementById('search').addEventListener('input', e => { state.search=e.target.value; state.page=1; render(); });
document.getElementById('statusFilter').addEventListener('change', e => { state.status=e.target.value; state.page=1; render(); });
document.getElementById('pageSize').addEventListener('change', e => { state.pageSize=Number(e.target.value); state.page=1; render(); });

initFormPicker(); buildColPanel(); render();
})().catch(error => {
  console.error(error);
  document.getElementById('tbody').innerHTML = '<tr><td colspan="20" class="empty-state">Gabim gjatë ngarkimit të të dhënave.</td></tr>';
});
