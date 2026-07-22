(() => {
  const CHECK = '<span aria-hidden="true"><svg viewBox="0 0 12 10" height="10" width="12"><polyline points="1.5 6 4.5 9 10.5 1"></polyline></svg></span>';
  const TRASH = '<svg viewBox="0 0 448 512" class="deleteIcon" aria-hidden="true"><path d="M135.2 17.7 128 32H32C14.3 32 0 46.3 0 64s14.3 32 32 32h384c17.7 0 32-14.3 32-32s-14.3-32-32-32h-96l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7ZM416 128H32l21.2 339c1.6 25.3 22.6 45 47.9 45h245.8c25.3 0 46.3-19.7 47.9-45L416 128Z"></path></svg>';
  const ARROW = '<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path fill="#fff" d="M13.47 17.97a.75.75 0 0 0 1.06 1.06l5.79-5.79a1.75 1.75 0 0 0 0-2.48l-5.79-5.79a.75.75 0 0 0-1.06 1.06l5.22 5.22H4a.75.75 0 0 0 0 1.5h14.69l-5.22 5.22Z"></path></svg>';
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9L12 2.8Z"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  let checkboxId = 0;
  let scheduled = false;
  let favoriteMode = false;
  let previousPageSize = null;
  let currentDrugRow = null;
  let favorites = loadFavorites();

  function loadFavorites() {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(saved) ? saved.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch {}
    updateFavoriteCount();
  }

  function preferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme, persist = false) {
    document.documentElement.dataset.theme = theme;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch {}
    }
    const input = document.getElementById('themeInput');
    if (input) {
      input.checked = theme === 'dark';
      input.setAttribute('aria-label', theme === 'dark' ? 'Aktivizo light mode' : 'Aktivizo dark mode');
    }
  }

  applyTheme(preferredTheme());

  function addStyles() {
    if (document.getElementById('protocolDashboardStyles')) return;
    const style = document.createElement('style');
    style.id = 'protocolDashboardStyles';
    style.textContent = `
      body.has-app-nav{padding-left:92px}
      .app-menu{position:fixed;inset:0 auto 0 0;z-index:45;width:92px;padding:18px 12px;display:flex;flex-direction:column;gap:10px;background:var(--teal-dark,#0d3d40);border-right:4px solid var(--amber,#c77d1f);box-shadow:10px 0 30px rgba(0,0,0,.08)}
      .app-menu-link{min-width:0;padding:10px 6px;border:0;border-radius:12px;background:transparent;color:#dfe9e6;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;transition:.2s ease;position:relative}
      .app-menu-link:hover,.app-menu-link.active{color:#fff;background:rgba(255,255,255,.12);transform:translateY(-1px)}
      .app-menu-icon{width:34px;height:34px;display:grid;place-items:center}.app-menu-icon svg{width:26px;height:26px}.app-menu-title{font-size:.7rem;line-height:1.15;font-weight:750;text-align:center}
      .nav-mini-count{position:absolute;top:5px;right:7px;min-width:18px;height:18px;padding:0 5px;border-radius:10px;background:var(--amber,#c77d1f);color:#fff;display:grid;place-items:center;font-size:.62rem;font-weight:800}
      .theme-control{margin-top:auto;display:flex;flex-direction:column;align-items:center;gap:7px;color:#dfe9e6}.theme-control-title{font-size:.68rem;font-weight:750}
      .theme-switch{position:relative;display:inline-block;width:60px;height:34px}.theme-switch input{position:absolute;opacity:0;width:1px;height:1px}
      .theme-slider{position:absolute;cursor:pointer;inset:0;background:#2196f3;transition:.4s;overflow:hidden;border-radius:34px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)}
      .theme-sun-moon{position:absolute;width:26px;height:26px;left:4px;bottom:4px;border-radius:50%;background:#ffe04b;transition:.4s;z-index:3;box-shadow:0 0 10px rgba(255,224,75,.65)}
      .theme-switch input:checked+.theme-slider{background:#080c17}.theme-switch input:checked+.theme-slider .theme-sun-moon{transform:translateX(26px) rotate(180deg);background:#f4f5f7;box-shadow:0 0 8px rgba(255,255,255,.5)}
      .moon-dot{position:absolute;border-radius:50%;background:#9aa0a8;opacity:0;transition:.4s}.moon-dot.one{width:6px;height:6px;left:9px;top:3px}.moon-dot.two{width:9px;height:9px;left:3px;top:11px}.moon-dot.three{width:4px;height:4px;left:16px;top:18px}.theme-switch input:checked+.theme-slider .moon-dot{opacity:1}
      .theme-cloud{position:absolute;border-radius:999px;background:#eef5fb;opacity:.88;animation:themeCloudMove 6s ease-in-out infinite}.theme-cloud.one{width:28px;height:9px;left:29px;top:20px}.theme-cloud.two{width:18px;height:7px;left:39px;top:13px;animation-delay:1s}
      .theme-stars{position:absolute;inset:0;opacity:0;transform:translateY(-28px);transition:.4s;color:#fff;font-size:10px}.theme-stars span{position:absolute;animation:themeStar 2s ease-in-out infinite}.theme-stars span:nth-child(1){left:8px;top:4px}.theme-stars span:nth-child(2){left:19px;top:17px;animation-delay:.5s}.theme-stars span:nth-child(3){left:4px;top:22px;animation-delay:1s}.theme-switch input:checked+.theme-slider .theme-stars{opacity:1;transform:none}.theme-switch input:checked+.theme-slider .theme-cloud{opacity:0}
      @keyframes themeCloudMove{0%,100%{transform:translateX(0)}40%{transform:translateX(4px)}80%{transform:translateX(-4px)}}@keyframes themeStar{0%,100%{transform:scale(1)}45%{transform:scale(1.3)}80%{transform:scale(.75)}}
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
      td.name{position:relative}.drug-actions-trigger{margin-left:8px;width:28px;height:28px;border:1px solid var(--line,#d7dcd6);border-radius:8px;background:var(--paper,#f7f8f6);color:var(--teal-dark,#0d3d40);cursor:pointer;font-weight:900;line-height:1;vertical-align:middle;transition:.2s}.drug-actions-trigger:hover,.drug-actions-trigger[aria-expanded="true"]{background:var(--teal,#155e63);border-color:var(--teal,#155e63);color:#fff}.favorite-marker{display:none;margin-right:6px;color:var(--amber,#c77d1f);font-size:1rem}.drug-row.is-favorite .favorite-marker{display:inline}.drug-row.is-favorite td.name{background:linear-gradient(90deg,rgba(199,125,31,.1),transparent)}
      .drug-action-card{position:fixed;z-index:300;width:260px;padding:5px;background:#10292b;border:2px solid #285357;border-radius:12px;box-shadow:0 18px 55px rgba(0,0,0,.32);color:#edf5f2}.drug-action-card[hidden]{display:none}.drug-action-separator{width:100%;border-top:1px solid #3c5d60;margin:5px 0}.drug-action-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}.drug-action-item{width:100%;min-width:0;border:0;background:transparent;color:#e9f1ef;display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-radius:7px;cursor:pointer;position:relative;overflow:hidden;text-align:left;transition:.25s}.drug-action-item:hover{background:#1d4245}.drug-action-item svg{width:20px;height:20px;flex:0 0 20px;fill:none;color:currentColor;transition:.25s}.drug-action-item.favorite svg{fill:transparent;stroke:currentColor;stroke-width:1.5}.drug-action-item .label,.drug-action-item .fav-label{font-weight:500;transition:.25s}.drug-action-item .fav-label{position:absolute;left:10px;transform:translateY(-110%) translateX(-10px) scale(.85);opacity:0}.drug-action-item.favorite input{position:absolute;inset:0;width:100%;height:100%;appearance:none;cursor:pointer;z-index:3}.drug-action-item.favorite input:checked~.fav-label{transform:none;opacity:1}.drug-action-item.favorite input:checked~.label{transform:translateY(110%) translateX(-6px) scale(.85);opacity:0}.drug-action-item.favorite input:checked~svg{fill:#ffd36a;stroke:#ffd36a}.drug-action-title{padding:7px 9px 5px;font-size:.72rem;color:#aac1bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      body.favorites-mode .pagination{display:none!important}
      html[data-theme="dark"]{color-scheme:dark;--ink:#e8f0ee;--paper:#111718;--line:#314043;--teal:#2f8f93;--teal-dark:#092b2d;--amber:#d99538;--amber-soft:#3b2d1d}
      html[data-theme="dark"] body{background:#111718;color:#e8f0ee}
      html[data-theme="dark"] .toolbar,html[data-theme="dark"] .pagination,html[data-theme="dark"] table,html[data-theme="dark"] .col-panel,html[data-theme="dark"] .form-panel,html[data-theme="dark"] .protocol-tabs,html[data-theme="dark"] .protocol-card,html[data-theme="dark"] .protocol-drug,html[data-theme="dark"] .saved-protocol,html[data-theme="dark"] .protocol-empty{background:#182022;color:#e8f0ee;border-color:#314043}
      html[data-theme="dark"] .table-wrap{background:#111718}html[data-theme="dark"] tbody tr:nth-child(even){background:#151d1f}html[data-theme="dark"] tbody tr:hover{background:#263134}html[data-theme="dark"] tbody tr.row-selected{background:#173638!important}
      html[data-theme="dark"] tbody td{border-color:#2d3b3e}html[data-theme="dark"] td.name,html[data-theme="dark"] .protocol-card h3,html[data-theme="dark"] .protocol-drug-title,html[data-theme="dark"] .saved-protocol h3,html[data-theme="dark"] .saved-dashboard-copy h3,html[data-theme="dark"] .protocol-dashboard-card h3.protocol-card-title{color:#dff4ef}
      html[data-theme="dark"] .toolbar input[type="text"],html[data-theme="dark"] .toolbar select,html[data-theme="dark"] .form-panel input,html[data-theme="dark"] .protocol-field input,html[data-theme="dark"] .protocol-field textarea,html[data-theme="dark"] .protocol-field select,html[data-theme="dark"] .saved-dashboard-search{background:#111718;color:#eef5f3;border-color:#405154}
      html[data-theme="dark"] .col-picker button,html[data-theme="dark"] .form-picker>button,html[data-theme="dark"] .pagination button,html[data-theme="dark"] .btn-secondary{background:#182022;color:#e8f0ee;border-color:#405154}
      html[data-theme="dark"] .protocol-drawer,html[data-theme="dark"] .protocol-content{background:#111718}html[data-theme="dark"] .protocol-drug-head{background:#1d282a;border-color:#314043}html[data-theme="dark"] .protocol-info{background:#352b1e;color:#f1d5ad;border-left-color:#d99538}
      html[data-theme="dark"] .protocol-card-content,html[data-theme="dark"] .protocol-card-date,html[data-theme="dark"] .saved-meta,html[data-theme="dark"] .floating-hint,html[data-theme="dark"] .empty-state{color:#aebdba}
      html[data-theme="dark"] .floating-field input:focus~label,html[data-theme="dark"] .floating-field input:not(:placeholder-shown)~label,html[data-theme="dark"] .floating-field textarea:focus~label,html[data-theme="dark"] .floating-field textarea:not(:placeholder-shown)~label{background:#182022;color:#71c8cb}
      html[data-theme="dark"] .protocol-card-tag{background:#3b2d1d;color:#f2c88f}html[data-theme="dark"] .selection-badge{background:#182022;color:#dff4ef;border-color:#405154}html[data-theme="dark"] .count-badge{background:#3b2d1d;color:#f4d6ab}
      html[data-theme="dark"] ::-webkit-scrollbar-thumb{background:#45575a}
      @media(max-width:720px){body.has-app-nav{padding-left:0;padding-bottom:82px}.app-menu{inset:auto 0 0 0;width:auto;height:82px;padding:7px 8px;flex-direction:row;align-items:center;justify-content:space-around;border-right:0;border-top:3px solid var(--amber,#c77d1f)}.app-menu-link{flex:1;padding:4px 2px}.app-menu-icon{width:26px;height:26px}.app-menu-icon svg{width:21px;height:21px}.app-menu-title{font-size:.62rem}.nav-mini-count{top:1px;right:8px}.theme-control{margin:0;gap:3px}.theme-control-title{display:none}.theme-switch{transform:scale(.82)}.saved-dashboard-tools{justify-content:stretch}.saved-dashboard-search{width:100%}#savedProtocolsList.protocol-card-grid{grid-template-columns:1fr}.drug-action-card{width:min(260px,calc(100vw - 20px))}}
    `;
    document.head.appendChild(style);
  }

  function showToast(message) {
    const toast = document.getElementById('protocolToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2300);
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

  function rerenderRegistry() {
    const search = document.getElementById('search');
    search?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function exitFavoriteMode({ restorePageSize = true } = {}) {
    if (!favoriteMode) return;
    favoriteMode = false;
    document.body.classList.remove('favorites-mode');
    document.getElementById('favoritesEmpty')?.remove();
    const pagination = document.getElementById('pagination');
    if (pagination) pagination.hidden = false;
    const pageSize = document.getElementById('pageSize');
    if (restorePageSize && previousPageSize && pageSize && pageSize.value !== previousPageSize) {
      pageSize.value = previousPageSize;
      pageSize.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      rerenderRegistry();
    }
    previousPageSize = null;
  }

  function openSavedProtocols() {
    exitFavoriteMode();
    document.getElementById('protocolsBtn')?.click();
    setTimeout(() => document.querySelector('.protocol-tab[data-tab="saved"]')?.click(), 0);
    activeNav('protocols');
  }

  function enterFavoriteMode() {
    closeProtocols();
    activeNav('favorites');
    favoriteMode = true;
    document.body.classList.add('favorites-mode');
    const pageSize = document.getElementById('pageSize');
    if (pageSize && pageSize.value !== '4006') {
      previousPageSize = pageSize.value;
      pageSize.value = '4006';
      pageSize.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      requestAnimationFrame(applyFavoriteFilter);
    }
  }

  function updateFavoriteCount() {
    const count = document.getElementById('favoriteNavCount');
    if (count) count.textContent = String(favorites.size);
  }

  function addMenu() {
    if (document.getElementById('appMenu')) {
      updateFavoriteCount();
      return;
    }
    const menu = document.createElement('nav');
    menu.id = 'appMenu';
    menu.className = 'app-menu';
    menu.setAttribute('aria-label', 'Navigimi kryesor');
    menu.innerHTML = `
      <button class="app-menu-link active" type="button" data-nav="home"><span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><path d="M213 110 133 37a8 8 0 0 0-11 0l-79 73a8 8 0 0 0-3 6v92a8 8 0 0 0 8 8h160a8 8 0 0 0 8-8v-92a8 8 0 0 0-3-6Z" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="app-menu-title">Barnat</span></button>
      <button class="app-menu-link" type="button" data-nav="protocols"><span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><path d="M64 40h128a16 16 0 0 1 16 16v160H48V56a16 16 0 0 1 16-16Z" stroke="currentColor" stroke-width="16"/><path d="M80 88h96M80 128h96M80 168h64" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg></span><span class="app-menu-title">Protokollet</span></button>
      <button class="app-menu-link" type="button" data-nav="favorites"><span class="nav-mini-count" id="favoriteNavCount">0</span><span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><path d="m128 24 31 63 69 10-50 49 12 69-62-33-62 33 12-69-50-49 69-10 31-63Z" stroke="currentColor" stroke-width="16" stroke-linejoin="round"/></svg></span><span class="app-menu-title">Favoritet</span></button>
      <button class="app-menu-link" type="button" data-nav="search"><span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><circle cx="116" cy="116" r="76" stroke="currentColor" stroke-width="16"/><path d="m171 171 53 53" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg></span><span class="app-menu-title">Kërko</span></button>
      <div class="theme-control"><span class="theme-control-title">Tema</span><label class="theme-switch"><input id="themeInput" type="checkbox" aria-label="Aktivizo dark mode"><span class="theme-slider"><span class="theme-sun-moon"><span class="moon-dot one"></span><span class="moon-dot two"></span><span class="moon-dot three"></span></span><span class="theme-cloud one"></span><span class="theme-cloud two"></span><span class="theme-stars"><span>✦</span><span>✧</span><span>✦</span></span></span></label></div>`;
    menu.addEventListener('click', event => {
      const item = event.target.closest('.app-menu-link');
      if (!item) return;
      if (item.dataset.nav === 'home') {
        exitFavoriteMode();
        closeProtocols();
        activeNav('home');
        scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (item.dataset.nav === 'protocols') openSavedProtocols();
      if (item.dataset.nav === 'favorites') enterFavoriteMode();
      if (item.dataset.nav === 'search') {
        exitFavoriteMode();
        closeProtocols();
        activeNav('search');
        const search = document.getElementById('search');
        search?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => search?.focus(), 250);
      }
    });
    menu.querySelector('#themeInput').addEventListener('change', event => {
      const theme = event.target.checked ? 'dark' : 'light';
      applyTheme(theme, true);
      showToast(theme === 'dark' ? 'Dark mode u aktivizua.' : 'Light mode u aktivizua.');
    });
    document.body.prepend(menu);
    document.body.classList.add('has-app-nav');
    applyTheme(preferredTheme());
    updateFavoriteCount();
  }

  function makeCheckboxLabel(input, html = '') {
    if (!input.id) input.id = 'styled-cbx-' + (++checkboxId);
    input.classList.add('inp-cbx');
    const label = document.createElement('label');
    label.className = 'cbx';
    label.htmlFor = input.id;
    label.innerHTML = CHECK + (html ? '<span class="cbx-text">' + html + '</span>' : '');
    return label;
  }

  function decorateCheckboxes() {
    document.querySelectorAll('th.select-col input[type="checkbox"],td.select-col input[type="checkbox"]').forEach(input => {
      if (input.closest('.checkbox-wrapper-46')) return;
      const wrap = document.createElement('div');
      wrap.className = 'checkbox-wrapper-46';
      input.parentElement?.insertBefore(wrap, input);
      wrap.append(input, makeCheckboxLabel(input));
    });
    document.querySelectorAll('#colPanel>label>input[type="checkbox"]').forEach(input => {
      if (input.closest('.checkbox-wrapper-46')) return;
      const old = input.parentElement;
      if (!old) return;
      const text = old.querySelector('span')?.innerHTML || old.textContent.trim();
      const wrap = document.createElement('div');
      wrap.className = 'checkbox-wrapper-46';
      old.replaceWith(wrap);
      wrap.append(input, makeCheckboxLabel(input, text));
    });
  }

  function decorateFields() {
    document.querySelectorAll('.protocol-drug-fields .protocol-field').forEach(field => {
      if (field.classList.contains('floating-field')) return;
      const control = field.querySelector('input,textarea');
      const label = field.querySelector('label');
      if (!control || !label) return;
      const hintText = control.getAttribute('placeholder') || '';
      control.placeholder = ' ';
      field.classList.add('floating-field');
      control.after(label);
      if (hintText.trim()) {
        const hint = document.createElement('span');
        hint.className = 'floating-hint';
        hint.textContent = hintText;
        field.appendChild(hint);
      }
    });
  }

  function decorateDeletes() {
    document.querySelectorAll('[data-remove-index],[data-delete-protocol]').forEach(button => {
      if (button.classList.contains('deleteButton')) return;
      const label = button.hasAttribute('data-remove-index') ? 'Hiqe' : 'Fshije';
      button.classList.remove('btn-danger', 'protocol-remove');
      button.classList.add('deleteButton');
      button.dataset.label = label;
      button.setAttribute('aria-label', label);
      button.innerHTML = TRASH;
    });
  }

  function protocols() {
    try {
      const saved = JSON.parse(localStorage.getItem('regjistriBarnave_protokollet_v1') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function dateText(value) {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 'Pa datë' : date.toLocaleDateString('sq-AL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function addSavedHeader() {
    const pane = document.getElementById('protocolPaneSaved');
    const list = document.getElementById('savedProtocolsList');
    if (!pane || !list || pane.querySelector('.saved-dashboard-head')) return;
    const header = document.createElement('div');
    header.className = 'saved-dashboard-head';
    header.innerHTML = '<div class="saved-dashboard-copy"><h3>Protokollet e ruajtura</h3><p><span id="savedDashboardCount">0 protokolle</span> · Kliko kartelën për ta hapur të plotë.</p></div><div class="saved-dashboard-tools"><input id="savedProtocolSearch" class="saved-dashboard-search" type="search" placeholder="Kërko protokollin, diagnozën ose barin..." aria-label="Kërko protokollet"><button class="protocol-gradient-btn" id="savedNewProtocol" type="button"><span>+ Protokoll i ri</span></button></div>';
    pane.insertBefore(header, list);
    header.querySelector('#savedProtocolSearch').addEventListener('input', event => filterCards(event.target.value));
    header.querySelector('#savedNewProtocol').addEventListener('click', () => {
      document.querySelector('.protocol-tab[data-tab="builder"]')?.click();
      document.getElementById('newProtocolBtn')?.click();
      setTimeout(() => document.getElementById('protocolName')?.focus(), 50);
    });
  }

  function filterCards(query) {
    const q = String(query || '').trim().toLocaleLowerCase('sq');
    const cards = [...document.querySelectorAll('#savedProtocolsList .protocol-dashboard-card')];
    let shown = 0;
    cards.forEach(card => {
      const visible = !q || (card.dataset.searchText || '').includes(q);
      card.style.display = visible ? '' : 'none';
      if (visible) shown++;
    });
    const count = document.getElementById('savedDashboardCount');
    const label = shown + (shown === 1 ? ' protokoll' : ' protokolle');
    if (count && count.textContent !== label) count.textContent = label;
    let empty = document.getElementById('savedSearchEmpty');
    if (!shown && cards.length) {
      if (!empty) {
        empty = document.createElement('div');
        empty.id = 'savedSearchEmpty';
        empty.className = 'protocol-empty';
        empty.textContent = 'Nuk u gjet asnjë protokoll për këtë kërkim.';
        document.getElementById('savedProtocolsList')?.appendChild(empty);
      }
      empty.hidden = false;
    } else if (empty) {
      empty.hidden = true;
    }
  }

  function decorateSaved() {
    const list = document.getElementById('savedProtocolsList');
    if (!list) return;
    list.classList.add('protocol-card-grid');
    addSavedHeader();
    const all = protocols();
    const byId = new Map(all.map(protocol => [String(protocol.id), protocol]));
    list.querySelectorAll('.saved-protocol').forEach(card => {
      const open = card.querySelector('[data-load-protocol]');
      if (!open) return;
      const id = String(open.dataset.loadProtocol || '');
      const protocol = byId.get(id) || {};
      if (!card.dataset.dashboardReady) {
        card.dataset.dashboardReady = '1';
        card.dataset.protocolId = id;
        card.classList.add('protocol-dashboard-card');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        const title = card.querySelector('h3');
        title?.classList.add('protocol-card-title');
        const tag = document.createElement('span');
        tag.className = 'protocol-card-tag';
        tag.textContent = protocol.indication || 'Protokoll personal';
        card.insertBefore(tag, title || card.firstChild);
        const content = document.createElement('p');
        content.className = 'protocol-card-content';
        const count = Array.isArray(protocol.items) ? protocol.items.length : 0;
        content.textContent = protocol.population || protocol.notes || `${count} ${count === 1 ? 'bar i përfshirë.' : 'barna të përfshira.'}`;
        title?.after(content);
        const date = document.createElement('div');
        date.className = 'protocol-card-date';
        date.textContent = 'Përditësuar: ' + dateText(protocol.updatedAt);
        content.after(date);
        const arrow = document.createElement('div');
        arrow.className = 'protocol-card-arrow';
        arrow.innerHTML = ARROW;
        card.appendChild(arrow);
        card.querySelector('.saved-actions')?.classList.add('card-quick-actions');
        const openCard = event => {
          if (event.target.closest('button')) return;
          open.click();
          activeNav('protocols');
        };
        card.addEventListener('click', openCard);
        card.addEventListener('keydown', event => {
          if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) {
            event.preventDefault();
            open.click();
            activeNav('protocols');
          }
        });
      }
      const itemText = Array.isArray(protocol.items) ? protocol.items.map(item => [item.tradeName, item.substance, item.strength, item.form].filter(Boolean).join(' ')).join(' ') : '';
      card.dataset.searchText = [protocol.name, protocol.indication, protocol.population, protocol.notes, itemText].filter(Boolean).join(' ').toLocaleLowerCase('sq');
    });
    const order = new Map([...all].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).map((protocol, index) => [String(protocol.id), index]));
    const cards = [...list.querySelectorAll('.protocol-dashboard-card')];
    const sorted = [...cards].sort((a, b) => (order.get(a.dataset.protocolId) ?? 999999) - (order.get(b.dataset.protocolId) ?? 999999));
    if (cards.map(card => card.dataset.protocolId).join('|') !== sorted.map(card => card.dataset.protocolId).join('|')) sorted.forEach(card => list.appendChild(card));
    filterCards(document.getElementById('savedProtocolSearch')?.value || '');
  }

  function rowName(row) {
    if (row.dataset.drugName) return row.dataset.drugName;
    const cell = row.querySelector('td.name') || row.cells[1];
    if (!cell) return 'Bari';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.drug-actions-trigger,.favorite-marker').forEach(node => node.remove());
    row.dataset.drugName = clone.textContent.trim() || 'Bari';
    return row.dataset.drugName;
  }

  function applyFavoriteToRow(row) {
    const key = row.dataset.drugKey;
    const isFavorite = Boolean(key && favorites.has(key));
    row.classList.toggle('is-favorite', isFavorite);
    const marker = row.querySelector('.favorite-marker');
    if (marker) marker.hidden = !isFavorite;
  }

  function decorateDrugRows() {
    document.querySelectorAll('#tbody tr').forEach(row => {
      const checkbox = row.querySelector('.drug-select');
      if (!checkbox) return;
      const key = String(checkbox.dataset.drugKey || '');
      row.dataset.drugKey = key;
      row.classList.add('drug-row');
      const nameCell = row.querySelector('td.name') || row.cells[1];
      if (!nameCell) return;
      rowName(row);
      let marker = nameCell.querySelector('.favorite-marker');
      if (!marker) {
        marker = document.createElement('span');
        marker.className = 'favorite-marker';
        marker.textContent = '★';
        marker.title = 'Bar favorit';
        nameCell.prepend(marker);
      }
      let trigger = nameCell.querySelector('.drug-actions-trigger');
      if (!trigger) {
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'drug-actions-trigger';
        trigger.textContent = '⋮';
        trigger.setAttribute('aria-label', 'Veprimet për ' + rowName(row));
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.addEventListener('click', event => {
          event.stopPropagation();
          openDrugMenu(trigger, row);
        });
        nameCell.appendChild(trigger);
      }
      if (!row.dataset.contextReady) {
        row.dataset.contextReady = '1';
        row.addEventListener('contextmenu', event => {
          if (event.target.closest('button,input,label,a')) return;
          event.preventDefault();
          openDrugMenu(trigger, row, { x: event.clientX, y: event.clientY });
        });
      }
      applyFavoriteToRow(row);
    });
  }

  function ensureDrugMenu() {
    if (document.getElementById('drugActionMenu')) return;
    const menu = document.createElement('div');
    menu.id = 'drugActionMenu';
    menu.className = 'drug-action-card';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="drug-action-title" id="drugActionTitle">Veprimet e barit</div><div class="drug-action-separator"></div><div class="drug-action-list"><label class="drug-action-item favorite"><input id="drugFavoriteToggle" type="checkbox"><span class="label">Shto në favorite</span><span class="fav-label">Në favorite</span>${STAR}</label><button class="drug-action-item" type="button" data-drug-action="protocol"><span>Shto në protokoll</span>${PLUS}</button><button class="drug-action-item" type="button" data-drug-action="copy"><span>Kopjo emrin</span>${COPY}</button></div>`;
    menu.querySelector('#drugFavoriteToggle').addEventListener('change', event => {
      if (!currentDrugRow) return;
      const key = currentDrugRow.dataset.drugKey;
      if (!key) return;
      if (event.target.checked) {
        favorites.add(key);
        showToast('Bari u shtua në favorite.');
      } else {
        favorites.delete(key);
        showToast('Bari u hoq nga favoritet.');
      }
      saveFavorites();
      applyFavoriteToRow(currentDrugRow);
      if (favoriteMode) applyFavoriteFilter();
    });
    menu.querySelector('[data-drug-action="protocol"]').addEventListener('click', () => {
      if (!currentDrugRow) return;
      const checkbox = currentDrugRow.querySelector('.drug-select');
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      showToast('Bari u shtua në protokoll.');
      closeDrugMenu();
    });
    menu.querySelector('[data-drug-action="copy"]').addEventListener('click', async () => {
      if (!currentDrugRow) return;
      const text = rowName(currentDrugRow);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      showToast('Emri i barit u kopjua.');
      closeDrugMenu();
    });
    document.body.appendChild(menu);
    document.addEventListener('pointerdown', event => {
      if (menu.hidden) return;
      if (!menu.contains(event.target) && !event.target.closest('.drug-actions-trigger')) closeDrugMenu();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrugMenu(); });
    window.addEventListener('resize', closeDrugMenu);
    document.querySelector('.table-wrap')?.addEventListener('scroll', closeDrugMenu, { passive: true });
  }

  function openDrugMenu(trigger, row, point = null) {
    ensureDrugMenu();
    const menu = document.getElementById('drugActionMenu');
    if (!menu) return;
    document.querySelectorAll('.drug-actions-trigger[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    currentDrugRow = row;
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector('#drugActionTitle').textContent = rowName(row);
    menu.querySelector('#drugFavoriteToggle').checked = favorites.has(row.dataset.drugKey);
    menu.hidden = false;
    const rect = trigger.getBoundingClientRect();
    const desiredX = point?.x ?? rect.right + 8;
    const desiredY = point?.y ?? rect.bottom + 6;
    const width = menu.offsetWidth || 260;
    const height = menu.offsetHeight || 170;
    menu.style.left = Math.max(10, Math.min(desiredX, window.innerWidth - width - 10)) + 'px';
    menu.style.top = Math.max(10, Math.min(desiredY, window.innerHeight - height - 10)) + 'px';
  }

  function closeDrugMenu() {
    const menu = document.getElementById('drugActionMenu');
    if (menu) menu.hidden = true;
    document.querySelectorAll('.drug-actions-trigger[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    currentDrugRow = null;
  }

  function applyFavoriteFilter() {
    if (!favoriteMode) return;
    const rows = [...document.querySelectorAll('#tbody tr')].filter(row => row.querySelector('.drug-select'));
    let shown = 0;
    rows.forEach(row => {
      const visible = favorites.has(String(row.dataset.drugKey || ''));
      row.hidden = !visible;
      if (visible) shown++;
    });
    let empty = document.getElementById('favoritesEmpty');
    if (!shown) {
      if (!empty) {
        empty = document.createElement('tr');
        empty.id = 'favoritesEmpty';
        empty.innerHTML = '<td colspan="30"><div class="empty-state">Ende nuk ke barna favorite. Hape menunë ⋮ te një bar dhe zgjidhe “Shto në favorite”.</div></td>';
        document.getElementById('tbody')?.appendChild(empty);
      }
      empty.hidden = false;
    } else if (empty) {
      empty.hidden = true;
    }
    const count = document.getElementById('countBadge');
    if (count) count.textContent = `${shown} favorite / ${favorites.size} të ruajtura`;
    const pagination = document.getElementById('pagination');
    if (pagination) pagination.hidden = true;
  }

  function decorate() {
    scheduled = false;
    observer.disconnect();
    try {
      addStyles();
      addMenu();
      ensureDrugMenu();
      decorateCheckboxes();
      decorateFields();
      decorateDeletes();
      decorateSaved();
      decorateDrugRows();
      updateFavoriteCount();
      if (favoriteMode) applyFavoriteFilter();
    } finally {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate, { once: true });
  else decorate();
})();