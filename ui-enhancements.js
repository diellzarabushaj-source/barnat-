(() => {
  const CHECK = '<span aria-hidden="true"><svg viewBox="0 0 12 10" height="10" width="12"><polyline points="1.5 6 4.5 9 10.5 1"></polyline></svg></span>';
  const TRASH = '<svg viewBox="0 0 448 512" class="deleteIcon" aria-hidden="true"><path d="M135.2 17.7 128 32H32C14.3 32 0 46.3 0 64s14.3 32 32 32h384c17.7 0 32-14.3 32-32s-14.3-32-32-32h-96l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7ZM416 128H32l21.2 339c1.6 25.3 22.6 45 47.9 45h245.8c25.3 0 46.3-19.7 47.9-45L416 128Z"></path></svg>';
  const ARROW = '<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path fill="#fff" d="M13.47 17.97a.75.75 0 0 0 1.06 1.06l5.79-5.79a1.75 1.75 0 0 0 0-2.48l-5.79-5.79a.75.75 0 0 0-1.06 1.06l5.22 5.22H4a.75.75 0 0 0 0 1.5h14.69l-5.22 5.22Z"></path></svg>';
  let checkboxId = 0;
  let scheduled = false;

  function addStyles() {
    if (document.getElementById('protocolDashboardStyles')) return;
    const style = document.createElement('style');
    style.id = 'protocolDashboardStyles';
    style.textContent = `
      body.has-app-nav{padding-left:92px}
      .app-menu{position:fixed;inset:0 auto 0 0;z-index:45;width:92px;padding:18px 12px;display:flex;flex-direction:column;gap:10px;background:var(--teal-dark,#0d3d40);border-right:4px solid var(--amber,#c77d1f);box-shadow:10px 0 30px rgba(0,0,0,.08)}
      .app-menu-link{min-width:0;padding:10px 6px;border:0;border-radius:12px;background:transparent;color:#dfe9e6;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;transition:.2s ease}
      .app-menu-link:hover,.app-menu-link.active{color:#fff;background:rgba(255,255,255,.12);transform:translateY(-1px)}
      .app-menu-link.is-future{opacity:.68}.app-menu-icon{width:34px;height:34px;display:grid;place-items:center}.app-menu-icon svg{width:26px;height:26px}.app-menu-title{font-size:.7rem;line-height:1.15;font-weight:750;text-align:center}
      .saved-dashboard-head{display:flex;align-items:end;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:18px}.saved-dashboard-copy h3{margin:0 0 4px;font-family:var(--serif,Georgia,serif);color:var(--teal-dark,#0d3d40);font-size:1.3rem}.saved-dashboard-copy p{margin:0;color:#6b777b;font-size:.8rem}.saved-dashboard-tools{display:flex;gap:10px;flex:1 1 320px;justify-content:flex-end}.saved-dashboard-search{width:min(360px,100%);border:1.5px solid var(--line,#d7dcd6);border-radius:12px;padding:10px 12px;background:#fff;color:var(--ink,#12222a);outline:none}.saved-dashboard-search:focus{border-color:var(--teal,#155e63);box-shadow:0 0 0 3px rgba(21,94,99,.12)}
      .protocol-gradient-btn{background-image:linear-gradient(144deg,var(--amber,#c77d1f),var(--teal,#155e63) 52%,#1fa2a9);border:0;border-radius:9px;box-shadow:rgba(21,94,99,.18) 0 12px 24px -8px;color:#fff;display:flex;justify-content:center;min-width:142px;padding:3px;cursor:pointer;transition:.25s}.protocol-gradient-btn>span{width:100%;padding:10px 14px;border-radius:7px;background:var(--teal-dark,#0d3d40);color:#fff;font-weight:750;transition:.25s}.protocol-gradient-btn:hover>span{background:transparent}.protocol-gradient-btn:active{transform:scale(.96)}
      #savedProtocolsList.protocol-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}#savedProtocolsList.protocol-card-grid>.protocol-empty{grid-column:1/-1}
      .saved-protocol.protocol-dashboard-card{--border-radius:.85rem;min-height:228px;margin:0;padding:1rem 1rem 4.4rem;cursor:pointer;border-radius:var(--border-radius);border:1px solid var(--line,#d7dcd6);background:#fff;box-shadow:0 10px 24px rgba(13,61,64,.08);position:relative;overflow:hidden;transition:.2s ease}
      .protocol-dashboard-card:hover,.protocol-dashboard-card:focus-visible{transform:translateY(-3px);border-color:rgba(21,94,99,.45);box-shadow:0 18px 38px rgba(13,61,64,.14);outline:none}
      .protocol-card-tag{display:inline-flex;max-width:100%;padding:4px 9px;border-radius:999px;background:var(--amber-soft,#f4e3cb);color:#75460f;font-size:.7rem;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .protocol-dashboard-card h3.protocol-card-title{margin:14px 0 0;padding:0;color:var(--teal-dark,#0d3d40);font-family:var(--serif,Georgia,serif);font-size:1.22rem;line-height:1.22;transition:.2s}.protocol-dashboard-card:hover h3.protocol-card-title{color:var(--teal,#155e63);text-decoration:underline}
      .protocol-card-content{margin:13px 0 0;color:#3c4a4e;font-size:.83rem;line-height:1.48;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.protocol-card-date{margin-top:13px;color:#6e777b;font-size:.74rem}
      .protocol-card-arrow{position:absolute;right:0;bottom:0;width:42px;height:42px;padding:.65rem;border-top-left-radius:var(--border-radius);background:var(--teal,#155e63);display:flex;align-items:center;justify-content:center;transition:.2s}.protocol-card-arrow svg{width:17px;height:17px;transition:.2s}.protocol-dashboard-card:hover .protocol-card-arrow{background:#111}.protocol-dashboard-card:hover .protocol-card-arrow svg{transform:translateX(3px)}
      .protocol-dashboard-card .saved-meta{display:none}.protocol-dashboard-card .saved-actions.card-quick-actions{position:absolute;left:1rem;right:50px;bottom:12px;display:flex;flex-wrap:nowrap;gap:5px;overflow-x:auto;scrollbar-width:none}.protocol-dashboard-card .saved-actions.card-quick-actions::-webkit-scrollbar{display:none}.protocol-dashboard-card .saved-actions.card-quick-actions button{flex:0 0 auto;min-width:0;padding:6px 8px;font-size:.7rem}.protocol-dashboard-card [data-load-protocol]{display:none}.protocol-dashboard-card .card-quick-actions .deleteButton{width:30px;height:30px;flex-basis:30px}.protocol-dashboard-card .card-quick-actions .deleteButton:hover{width:86px}
      @media(max-width:720px){body.has-app-nav{padding-left:0;padding-bottom:76px}.app-menu{inset:auto 0 0 0;width:auto;height:76px;padding:8px 10px;flex-direction:row;justify-content:space-around;border-right:0;border-top:3px solid var(--amber,#c77d1f)}.app-menu-link{flex:1;padding:5px 3px}.app-menu-icon{width:28px;height:28px}.app-menu-icon svg{width:22px;height:22px}.saved-dashboard-tools{justify-content:stretch}.saved-dashboard-search{width:100%}#savedProtocolsList.protocol-card-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function activeNav(name) {
    document.querySelectorAll('.app-menu-link').forEach(x => x.classList.toggle('active', x.dataset.nav === name));
  }

  function closeProtocols() {
    const overlay = document.getElementById('protocolOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function openSavedProtocols() {
    document.getElementById('protocolsBtn')?.click();
    setTimeout(() => document.querySelector('.protocol-tab[data-tab="saved"]')?.click(), 0);
    activeNav('protocols');
  }

  function futureMessage() {
    const toast = document.getElementById('protocolToast');
    if (!toast) return;
    toast.textContent = 'Favoritet do të shtohen në hapin e ardhshëm.';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function addMenu() {
    if (document.getElementById('appMenu')) return;
    const menu = document.createElement('nav');
    menu.id = 'appMenu';
    menu.className = 'app-menu';
    menu.setAttribute('aria-label', 'Navigimi kryesor');
    menu.innerHTML = `
      <button class="app-menu-link active" type="button" data-nav="home"><span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><path d="M213 110 133 37a8 8 0 0 0-11 0l-79 73a8 8 0 0 0-3 6v92a8 8 0 0 0 8 8h160a8 8 0 0 0 8-8v-92a8 8 0 0 0-3-6Z" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="app-menu-title">Barnat</span></button>
      <button class="app-menu-link" type="button" data-nav="protocols"><span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><path d="M64 40h128a16 16 0 0 1 16 16v160H48V56a16 16 0 0 1 16-16Z" stroke="currentColor" stroke-width="16"/><path d="M80 88h96M80 128h96M80 168h64" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg></span><span class="app-menu-title">Protokollet</span></button>
      <button class="app-menu-link is-future" type="button" data-nav="favorites"><span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><path d="m128 24 31 63 69 10-50 49 12 69-62-33-62 33 12-69-50-49 69-10 31-63Z" stroke="currentColor" stroke-width="16" stroke-linejoin="round"/></svg></span><span class="app-menu-title">Favoritet</span></button>
      <button class="app-menu-link" type="button" data-nav="search"><span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><circle cx="116" cy="116" r="76" stroke="currentColor" stroke-width="16"/><path d="m171 171 53 53" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg></span><span class="app-menu-title">Kërko</span></button>`;
    menu.addEventListener('click', e => {
      const item = e.target.closest('.app-menu-link');
      if (!item) return;
      if (item.dataset.nav === 'home') { closeProtocols(); activeNav('home'); scrollTo({top:0,behavior:'smooth'}); }
      if (item.dataset.nav === 'protocols') openSavedProtocols();
      if (item.dataset.nav === 'favorites') futureMessage();
      if (item.dataset.nav === 'search') {
        closeProtocols(); activeNav('search');
        const search = document.getElementById('search');
        search?.scrollIntoView({behavior:'smooth',block:'center'});
        setTimeout(() => search?.focus(), 250);
      }
    });
    document.body.prepend(menu);
    document.body.classList.add('has-app-nav');
  }

  function makeCheckboxLabel(input, html = '') {
    if (!input.id) input.id = 'styled-cbx-' + (++checkboxId);
    input.classList.add('inp-cbx');
    const label = document.createElement('label');
    label.className = 'cbx'; label.htmlFor = input.id;
    label.innerHTML = CHECK + (html ? '<span class="cbx-text">' + html + '</span>' : '');
    return label;
  }

  function decorateCheckboxes() {
    document.querySelectorAll('th.select-col input[type="checkbox"],td.select-col input[type="checkbox"]').forEach(input => {
      if (input.closest('.checkbox-wrapper-46')) return;
      const wrap = document.createElement('div'); wrap.className = 'checkbox-wrapper-46';
      input.parentElement?.insertBefore(wrap, input); wrap.append(input, makeCheckboxLabel(input));
    });
    document.querySelectorAll('#colPanel>label>input[type="checkbox"]').forEach(input => {
      if (input.closest('.checkbox-wrapper-46')) return;
      const old = input.parentElement; if (!old) return;
      const text = old.querySelector('span')?.innerHTML || old.textContent.trim();
      const wrap = document.createElement('div'); wrap.className = 'checkbox-wrapper-46';
      old.replaceWith(wrap); wrap.append(input, makeCheckboxLabel(input, text));
    });
  }

  function decorateFields() {
    document.querySelectorAll('.protocol-drug-fields .protocol-field').forEach(field => {
      if (field.classList.contains('floating-field')) return;
      const control = field.querySelector('input,textarea'); const label = field.querySelector('label');
      if (!control || !label) return;
      const hintText = control.getAttribute('placeholder') || '';
      control.placeholder = ' '; field.classList.add('floating-field'); control.after(label);
      if (hintText.trim()) { const hint = document.createElement('span'); hint.className = 'floating-hint'; hint.textContent = hintText; field.appendChild(hint); }
    });
  }

  function decorateDeletes() {
    document.querySelectorAll('[data-remove-index],[data-delete-protocol]').forEach(button => {
      if (button.classList.contains('deleteButton')) return;
      const label = button.hasAttribute('data-remove-index') ? 'Hiqe' : 'Fshije';
      button.classList.remove('btn-danger','protocol-remove'); button.classList.add('deleteButton');
      button.dataset.label = label; button.setAttribute('aria-label', label); button.innerHTML = TRASH;
    });
  }

  function protocols() {
    try { const x = JSON.parse(localStorage.getItem('regjistriBarnave_protokollet_v1') || '[]'); return Array.isArray(x) ? x : []; }
    catch { return []; }
  }

  function dateText(value) {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 'Pa datë' : date.toLocaleDateString('sq-AL',{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  function addSavedHeader() {
    const pane = document.getElementById('protocolPaneSaved'); const list = document.getElementById('savedProtocolsList');
    if (!pane || !list || pane.querySelector('.saved-dashboard-head')) return;
    const header = document.createElement('div'); header.className = 'saved-dashboard-head';
    header.innerHTML = '<div class="saved-dashboard-copy"><h3>Protokollet e ruajtura</h3><p><span id="savedDashboardCount">0 protokolle</span> · Kliko kartelën për ta hapur të plotë.</p></div><div class="saved-dashboard-tools"><input id="savedProtocolSearch" class="saved-dashboard-search" type="search" placeholder="Kërko protokollin, diagnozën ose barin..." aria-label="Kërko protokollet"><button class="protocol-gradient-btn" id="savedNewProtocol" type="button"><span>+ Protokoll i ri</span></button></div>';
    pane.insertBefore(header, list);
    header.querySelector('#savedProtocolSearch').addEventListener('input', e => filterCards(e.target.value));
    header.querySelector('#savedNewProtocol').addEventListener('click', () => {
      document.querySelector('.protocol-tab[data-tab="builder"]')?.click(); document.getElementById('newProtocolBtn')?.click(); setTimeout(() => document.getElementById('protocolName')?.focus(), 50);
    });
  }

  function filterCards(query) {
    const q = String(query || '').trim().toLocaleLowerCase('sq');
    const cards = [...document.querySelectorAll('#savedProtocolsList .protocol-dashboard-card')];
    let shown = 0;
    cards.forEach(card => { const ok = !q || (card.dataset.searchText || '').includes(q); card.style.display = ok ? '' : 'none'; if (ok) shown++; });
    const count = document.getElementById('savedDashboardCount');
    const label = shown + (shown === 1 ? ' protokoll' : ' protokolle');
    if (count && count.textContent !== label) count.textContent = label;
    let empty = document.getElementById('savedSearchEmpty');
    if (!shown && cards.length) {
      if (!empty) { empty = document.createElement('div'); empty.id = 'savedSearchEmpty'; empty.className = 'protocol-empty'; empty.textContent = 'Nuk u gjet asnjë protokoll për këtë kërkim.'; document.getElementById('savedProtocolsList')?.appendChild(empty); }
      empty.hidden = false;
    } else if (empty) empty.hidden = true;
  }

  function decorateSaved() {
    const list = document.getElementById('savedProtocolsList'); if (!list) return;
    list.classList.add('protocol-card-grid'); addSavedHeader();
    const all = protocols(); const byId = new Map(all.map(p => [String(p.id),p]));
    list.querySelectorAll('.saved-protocol').forEach(card => {
      const open = card.querySelector('[data-load-protocol]'); if (!open) return;
      const id = String(open.dataset.loadProtocol || ''); const p = byId.get(id) || {};
      if (!card.dataset.dashboardReady) {
        card.dataset.dashboardReady = '1'; card.dataset.protocolId = id; card.classList.add('protocol-dashboard-card'); card.tabIndex = 0; card.setAttribute('role','button');
        const title = card.querySelector('h3'); title?.classList.add('protocol-card-title');
        const tag = document.createElement('span'); tag.className = 'protocol-card-tag'; tag.textContent = p.indication || 'Protokoll personal'; card.insertBefore(tag,title || card.firstChild);
        const content = document.createElement('p'); content.className = 'protocol-card-content'; const n = Array.isArray(p.items) ? p.items.length : 0; content.textContent = p.population || p.notes || `${n} ${n === 1 ? 'bar i përfshirë.' : 'barna të përfshira.'}`; title?.after(content);
        const date = document.createElement('div'); date.className = 'protocol-card-date'; date.textContent = 'Përditësuar: ' + dateText(p.updatedAt); content.after(date);
        const arrow = document.createElement('div'); arrow.className = 'protocol-card-arrow'; arrow.innerHTML = ARROW; card.appendChild(arrow);
        card.querySelector('.saved-actions')?.classList.add('card-quick-actions');
        const openCard = e => { if (e.target.closest('button')) return; open.click(); activeNav('protocols'); };
        card.addEventListener('click', openCard);
        card.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) { e.preventDefault(); open.click(); activeNav('protocols'); } });
      }
      const itemText = Array.isArray(p.items) ? p.items.map(i => [i.tradeName,i.substance,i.strength,i.form].filter(Boolean).join(' ')).join(' ') : '';
      card.dataset.searchText = [p.name,p.indication,p.population,p.notes,itemText].filter(Boolean).join(' ').toLocaleLowerCase('sq');
    });
    const order = new Map([...all].sort((a,b) => new Date(b.updatedAt || 0)-new Date(a.updatedAt || 0)).map((p,i) => [String(p.id),i]));
    const cards = [...list.querySelectorAll('.protocol-dashboard-card')]; const sorted = [...cards].sort((a,b) => (order.get(a.dataset.protocolId) ?? 999999)-(order.get(b.dataset.protocolId) ?? 999999));
    if (cards.map(x=>x.dataset.protocolId).join('|') !== sorted.map(x=>x.dataset.protocolId).join('|')) sorted.forEach(x => list.appendChild(x));
    filterCards(document.getElementById('savedProtocolSearch')?.value || '');
  }

  function decorate() {
    scheduled = false;
    observer.disconnect();
    try { addStyles(); addMenu(); decorateCheckboxes(); decorateFields(); decorateDeletes(); decorateSaved(); }
    finally { observer.observe(document.documentElement,{childList:true,subtree:true}); }
  }

  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(decorate); } }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',decorate,{once:true}); else decorate();
})();