(() => {
  'use strict';

  /* Shiriti anësor i DRx — një burim i vetëm për të gjitha faqet.
     Deri tani i njëjti menu ishte shkruar me dorë tri herë, në `index.html`,
     `klasifikimi.html` dhe `icd.html`. Tri kopje do të thotë tri gjendje që
     largohen nga njëra-tjetra sa herë preket njëra prej tyre; pikërisht ashtu
     ndodhi me listën ATC. Këtu menuja ndërtohet një herë, nga një përkufizim,
     dhe faqja thotë vetëm se cila është ajo. */

  const ICON = body => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  const ICONS = {
    barnat: ICON('<path d="M7 20V9h3.6a2.9 2.9 0 0 1 0 5.8H7"/><path d="m11.4 14.8 4.1 5.2"/><path d="m15.2 9.4 4.4 4.4M19.6 9.4l-4.4 4.4"/><path d="M4 4h6"/>'),
    atc: ICON('<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>'),
    icd: ICON('<path d="M6 4h9l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M14 4v5h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>'),
    dozologjia: ICON('<path d="M12 4v16"/><path d="M6 8h12"/><path d="M6 8 3 15a3 3 0 0 0 6 0Z"/><path d="M18 8l-3 7a3 3 0 0 0 6 0Z"/>'),
    protokollet: ICON('<path d="M8 4h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M10 3.5h4v2h-4z"/><path d="m9.8 12 1.6 1.6 3-3.2"/><path d="M9.8 17h4.6"/>'),
    urgjencat: ICON('<path d="M12 4.6 2.9 20a1 1 0 0 0 .87 1.5h16.46A1 1 0 0 0 21.1 20L12 4.6Z"/><path d="M12 10v4.4"/><path d="M12 18h.01"/>'),
    recetat: ICON('<path d="M6 3h8l4.5 4.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/><path d="M8.5 12.5h7M8.5 16h4.5"/>'),
    analizat: ICON('<path d="M9.5 3v6.2L4.8 17.6A2.4 2.4 0 0 0 6.9 21h10.2a2.4 2.4 0 0 0 2.1-3.4L14.5 9.2V3"/><path d="M8.5 3h7"/><path d="M7.3 14.5h9.4"/>'),
    hub: ICON('<circle cx="12" cy="12" r="8.4"/><path d="M12 8.4v7.2M8.4 12h7.2"/>'),
    logout: ICON('<path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3"/><path d="M10 16.5 14.5 12 10 7.5"/><path d="M14.5 12h-10"/>'),
    close: ICON('<path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"/>'),
    chevronDown: ICON('<path d="m7 10 5 5 5-5"/>'),
  };

  /* Renditja e menusë. `atc` nuk është një lidhje e vetme por dega me
     katërmbëdhjetë grupet anatomike dhe nënndarjet e tyre. */
  const NAV = [
    { label:'Klinike', items:[
      { id:'barnat', href:'/index.html', text:'Barnat', icon:'barnat' },
      { id:'atc', kind:'atc', text:'Klasifikimi ATC', icon:'atc' },
      { id:'icd', href:'/icd.html', text:'ICD‑10', icon:'icd' },
      { id:'dozologjia', href:'/dozologjia.html', text:'Dozologjia', icon:'dozologjia' },
      { id:'protokollet', href:'/protokollet.html', text:'Protokollet', icon:'protokollet' },
      { id:'urgjencat', href:'/urgjencat.html', text:'Urgjencat', icon:'urgjencat' },
    ] },
    { label:'Puna ime', items:[
      { id:'recetat', href:'/recetat.html', text:'Recetat', icon:'recetat' },
      { id:'analizat', href:'/analizat.html', text:'Analizat', icon:'analizat' },
      { id:'hub', href:'/medical-hub.html', text:'Medical Hub', icon:'hub' },
    ] },
  ];

  const SOURCE = {
    'registry-v2':      'Supabase clinical registry',
    'classification-v2':'ATC clinical catalog',
    'icd-v2':           'ICD-10 clinical source',
  };

  const ACTIVE = {
    'registry-v2':'barnat',
    'classification-v2':'atc',
    'icd-v2':'icd',
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const groups = () => (window.MEDINDEX_ATC_GROUPS && typeof window.MEDINDEX_ATC_GROUPS === 'object') ? window.MEDINDEX_ATC_GROUPS : {};
  const subgroups = () => (window.MEDINDEX_ATC_SUBGROUPS && typeof window.MEDINDEX_ATC_SUBGROUPS === 'object') ? window.MEDINDEX_ATC_SUBGROUPS : {};

  function subgroupsOf(groupCode) {
    return Object.entries(subgroups())
      .filter(([code]) => code.charAt(0) === groupCode && code.length === 3)
      .sort(([a],[b]) => a.localeCompare(b, 'sq'));
  }

  /* Cili grup e cila nënndarje janë aktive lexohet nga adresa, jo nga gjendja e
     faqes: kështu shiriti tregon të njëjtën gjë edhe kur hapet drejtpërdrejt me
     një lidhje si `/klasifikimi.html#M01`. */
  function activeAtc() {
    const raw = decodeURIComponent(location.hash.slice(1) || '')
      || new URLSearchParams(location.search).get('atc') || '';
    const code = raw.trim().toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z]\d{2}/.test(code)) return { group:code.charAt(0), sub:code.slice(0, 3) };
    if (/^[A-Z]$/.test(code)) return { group:code, sub:'' };
    return { group:'', sub:'' };
  }

  function atcMarkup(app) {
    const { group, sub } = activeAtc();
    const entries = Object.entries(groups());
    /* Në faqen e klasifikimit dega rri e hapur; gjetiu hapet vetëm nëse
       adresa tregon një grup. */
    const open = app === 'classification-v2' || Boolean(group);
    const rows = entries.map(([code, name]) => {
      const children = subgroupsOf(code);
      const isCurrent = code === group;
      return `<details class="atc-group"${isCurrent ? ' open' : ''} data-atc-details="${escapeHtml(code)}">
        <summary class="atc-group-link"${isCurrent && !sub ? ' aria-current="true"' : ''} data-atc-group="${escapeHtml(code)}">
          <span class="atc-group-code">${escapeHtml(code)}</span>
          <span class="atc-group-name">${escapeHtml(name)}</span>
          <span class="atc-group-caret" aria-hidden="true">${ICONS.chevronDown}</span>
        </summary>
        <div class="atc-sub-list">
          ${children.map(([subCode, subName]) => `<a class="atc-sub-link" href="/klasifikimi.html#${encodeURIComponent(subCode)}"${subCode === sub ? ' aria-current="true"' : ''} data-atc-sub="${escapeHtml(subCode)}" title="${escapeHtml(subName)}"><span class="atc-sub-code">${escapeHtml(subCode)}</span><span class="atc-sub-name">${escapeHtml(subName)}</span></a>`).join('')}
        </div>
      </details>`;
    }).join('');

    return `<details class="nav-group" id="atcNavGroup"${open ? ' open' : ''}>
      <summary class="nav-item nav-summary">
        <span class="nav-icon" aria-hidden="true">${ICONS.atc}</span>
        <span>Klasifikimi ATC</span>
        <span class="nav-summary-chevron" aria-hidden="true">${ICONS.chevronDown}</span>
      </summary>
      <div class="atc-group-list">
        <a class="atc-group-link is-all" href="/klasifikimi.html"${!group ? ' aria-current="true"' : ''}><span class="atc-group-code">${entries.length}</span><span class="atc-group-name">Të gjitha grupet</span></a>
        ${rows}
      </div>
    </details>`;
  }

  function render(app) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const active = ACTIVE[app] || '';

    const stack = NAV.map((section, index) => {
      const label = `<p class="nav-label${index ? ' nav-label-spaced' : ''}">${escapeHtml(section.label)}</p>`;
      const items = section.items.map(item => {
        if (item.kind === 'atc') return atcMarkup(app);
        const current = item.id === active;
        return `<a class="nav-item${current ? ' is-active' : ''}" href="${item.href}"${current ? ' aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${ICONS[item.icon]}</span><span>${escapeHtml(item.text)}</span></a>`;
      }).join('');
      return label + items;
    }).join('');

    sidebar.innerHTML = `
      <div class="sidebar-head">
        <a class="brand" href="/index.html" aria-label="DRx — Regjistri">
          <img src="/brand/drx-horizontal-white.svg" alt="DRx" width="104" height="32">
        </a>
        <button class="icon-button sidebar-close" id="sidebarClose" type="button" aria-label="Mbyll menynë">${ICONS.close}</button>
      </div>
      <nav class="nav-stack" aria-label="Navigimi kryesor">${stack}</nav>
      <div class="sidebar-foot">
        <div class="source-card">
          <span class="source-dot" aria-hidden="true"></span>
          <div><strong>${escapeHtml(SOURCE[app] || 'DRx clinical source')}</strong><small id="sourceStatus">Duke u lidhur…</small></div>
        </div>
        <button class="nav-item logout-button" id="logoutButton" type="button"><span class="nav-icon" aria-hidden="true">${ICONS.logout}</span><span>Dil</span></button>
      </div>`;

    bindAtc(sidebar);
  }

  /* Një klikim mbi grupin bën të dyja: e zgjedh grupin dhe hap nënndarjet e tij.
     Pa këtë, `<summary>` do të hapej pa zgjedhur asgjë, dhe grupi do të kërkonte
     një klikim të dytë diku tjetër për t'u parë. */
  function bindAtc(sidebar) {
    sidebar.querySelectorAll('[data-atc-group]').forEach(summary => {
      summary.addEventListener('click', event => {
        const details = summary.parentElement;
        const code = summary.dataset.atcGroup;
        const { group } = activeAtc();
        if (details.open && group === code) return;   // mbylle: sjellja e vetë shfletuesit
        event.preventDefault();
        details.open = true;
        navigate(code);
      });
    });
  }

  function navigate(code) {
    const target = `/klasifikimi.html#${encodeURIComponent(code)}`;
    if (location.pathname.endsWith('/klasifikimi.html')) {
      location.hash = encodeURIComponent(code);
      return;
    }
    location.href = target;
  }

  /* Kur faqja e klasifikimit ndryshon zgjedhjen, shiriti e ndjek pa u rindërtuar:
     rindërtimi do të mbyllte degët që përdoruesi i ka hapur vetë. */
  function syncActive() {
    const { group, sub } = activeAtc();
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.querySelectorAll('[data-atc-group]').forEach(node => {
      const current = node.dataset.atcGroup === group && !sub;
      if (current) node.setAttribute('aria-current', 'true');
      else node.removeAttribute('aria-current');
    });
    sidebar.querySelectorAll('[data-atc-sub]').forEach(node => {
      if (node.dataset.atcSub === sub) node.setAttribute('aria-current', 'true');
      else node.removeAttribute('aria-current');
    });
    const all = sidebar.querySelector('.atc-group-link.is-all');
    if (all) { if (group) all.removeAttribute('aria-current'); else all.setAttribute('aria-current', 'true'); }
    /* Vetëm një grup rri i hapur njëherësh — një akordeon, jo një pemë me
       degë të pafundme. Pa këtë, lëvizja brenda faqes së klasifikimit (që nuk
       rindërton shiritin, vetëm ndryshon hash-in) linte çdo grup të kaluar të
       hapur pas vetes. */
    sidebar.querySelectorAll('[data-atc-details]').forEach(details => {
      details.open = details.dataset.atcDetails === group;
    });
  }

  function boot() {
    const app = document.documentElement.dataset.drxApp || '';
    render(app);
    window.addEventListener('hashchange', syncActive);
    window.DRxSidebar = { syncActive, render:() => render(app) };
    document.dispatchEvent(new CustomEvent('drx:sidebar-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
