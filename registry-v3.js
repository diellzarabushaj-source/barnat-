(() => {
  'use strict';

  const state = { page:1, pageSize:50, q:'', form:'', status:'', view:'table', data:null, loading:false };
  const el = {};
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money = (v) => v === '' || v == null ? '—' : `${Number(v).toFixed(2)} €`;

  function cacheElements(){
    ['q','form','status','pageSize','tbody','loading','error','summary','pages','tableWrap','list','tableBtn','listBtn'].forEach(id => el[id] = $(id));
  }

  function params(){
    const p = new URLSearchParams({page:String(state.page),pageSize:String(state.pageSize)});
    if(state.q) p.set('q',state.q);
    if(state.form) p.set('form',state.form);
    if(state.status) p.set('status',state.status);
    return p;
  }

  async function load(){
    if(state.loading) return;
    state.loading = true;
    el.loading.hidden = false;
    el.error.hidden = true;
    try{
      const res = await fetch(`/api/registry-v2?${params()}`, {credentials:'same-origin',headers:{Accept:'application/json'}});
      if(res.status === 401){ location.href='/login.html'; return; }
      const json = await res.json();
      if(!res.ok) throw new Error(json.error || 'Regjistri nuk u ngarkua.');
      state.data = json;
      syncFilters(json.filters || {});
      render();
    }catch(error){
      el.error.textContent = error.message || 'Gabim gjatë ngarkimit.';
      el.error.hidden = false;
      el.tbody.innerHTML = '<tr><td colspan="10" class="empty">Regjistri nuk u ngarkua.</td></tr>';
    }finally{
      state.loading = false;
      el.loading.hidden = true;
    }
  }

  function syncFilters(filters){
    if(el.form.options.length <= 1){
      for(const value of filters.forms || []) el.form.add(new Option(value,value));
    }
    if(el.status.options.length <= 1){
      for(const value of filters.statuses || []) el.status.add(new Option(value,value));
    }
  }

  function rowHtml(r){
    return `<tr>
      <td><span class="name">${esc(r.tradeName || 'Pa emër')}</span><span class="sub">${esc(r.registryNumber ? `#${r.registryNumber}` : r.pdid || '')}</span></td>
      <td><span class="clamp">${esc(r.activeSubstance || '—')}</span></td>
      <td>${esc(r.strength || '—')}</td>
      <td>${esc(r.form || '—')}</td>
      <td><span class="atc">${esc(r.atc || '—')}</span></td>
      <td><span class="clamp">${esc(r.drugClass || '—')}</span></td>
      <td><span class="clamp">${esc(r.use || '—')}</span></td>
      <td><span class="pill ${/aktiv|valid|approved|origjinator|gjenerik/i.test(r.status || '') ? 'ok':''}">${esc(r.status || '—')}</span></td>
      <td class="price">${money(r.retailPrice)}</td>
      <td><span class="clamp">${esc(r.manufacturer || '—')}</span></td>
    </tr>`;
  }

  function cardHtml(r){
    return `<article class="list-card"><h3>${esc(r.tradeName || 'Pa emër')}</h3><p>${esc(r.activeSubstance || '—')} · ${esc(r.strength || '—')}</p><p>${esc(r.use || r.drugClass || 'Pa përshkrim')}</p><div class="meta"><span class="atc">${esc(r.atc || '—')}</span><span class="pill">${esc(r.form || '—')}</span><span class="pill">${esc(r.status || '—')}</span></div></article>`;
  }

  function render(){
    const data = state.data || {items:[],pagination:{page:1,total:0,totalPages:1,pageSize:state.pageSize}};
    const items = data.items || [];
    el.tbody.innerHTML = items.length ? items.map(rowHtml).join('') : '<tr><td colspan="10" class="empty">Nuk u gjet asnjë bar me këta filtra.</td></tr>';
    el.list.innerHTML = items.length ? items.map(cardHtml).join('') : '<div class="empty">Nuk u gjet asnjë bar.</div>';
    const p = data.pagination;
    const from = p.total ? (p.page-1)*p.pageSize+1 : 0;
    const to = Math.min(p.total,p.page*p.pageSize);
    el.summary.textContent = `${from}–${to} nga ${p.total.toLocaleString('sq-AL')} barna`;
    renderPages(p);
  }

  function renderPages(p){
    const buttons=[];
    buttons.push(`<button data-page="${Math.max(1,p.page-1)}" ${p.page<=1?'disabled':''} aria-label="Faqja e mëparshme">‹</button>`);
    const start=Math.max(1,p.page-2), end=Math.min(p.totalPages,start+4);
    for(let i=start;i<=end;i++) buttons.push(`<button data-page="${i}" class="${i===p.page?'active':''}">${i}</button>`);
    buttons.push(`<button data-page="${Math.min(p.totalPages,p.page+1)}" ${p.page>=p.totalPages?'disabled':''} aria-label="Faqja tjetër">›</button>`);
    el.pages.innerHTML=buttons.join('');
  }

  function setView(view){
    state.view=view;
    const table=view==='table';
    el.tableWrap.classList.toggle('hidden',!table);
    el.list.classList.toggle('active',!table);
    el.tableBtn.classList.toggle('active',table);
    el.listBtn.classList.toggle('active',!table);
    try{localStorage.setItem('drx-registry-view',view)}catch{}
  }

  function bind(){
    let timer;
    el.q.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.q=el.q.value.trim();state.page=1;load()},180)});
    el.form.addEventListener('change',()=>{state.form=el.form.value;state.page=1;load()});
    el.status.addEventListener('change',()=>{state.status=el.status.value;state.page=1;load()});
    el.pageSize.addEventListener('change',()=>{state.pageSize=Number(el.pageSize.value)||50;state.page=1;load()});
    el.pages.addEventListener('click',(e)=>{const b=e.target.closest('[data-page]');if(!b||b.disabled)return;state.page=Number(b.dataset.page)||1;load();scrollTo({top:0,behavior:'smooth'})});
    el.tableBtn.addEventListener('click',()=>setView('table'));
    el.listBtn.addEventListener('click',()=>setView('list'));
    document.addEventListener('keydown',(e)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();el.q.focus()}});
  }

  document.addEventListener('DOMContentLoaded',()=>{
    cacheElements();
    bind();
    let saved='table';try{saved=localStorage.getItem('drx-registry-view')||'table'}catch{}
    setView(saved === 'list' ? 'list' : 'table');
    load();
  });
})();
