(() => {
  'use strict';
  const list = document.getElementById('recommendationList');
  const atc = window.DRX_ANTIBIOTIC_ATC;
  const holder=document.getElementById('antibioticClassBrowser')||list;
  if (!list || !atc) return;
  let previous = [], pending = false;
  const make = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function refresh() {
    pending = false;
    const cards = [...list.querySelectorAll('.abx-option,.abx-hosp-card')];
    if (cards.length === previous.length && cards.every((card,index) => card === previous[index])) return;
    previous = cards;
    holder.querySelector(':scope > .abx-atc-browser')?.remove();
    const groups = new Map();
    cards.forEach((card,index) => {
      const head = card.querySelector('.abx-option-head,.abx-hosp-card-head');
      const title = head?.querySelector('h3,.abx-hosp-title strong')?.textContent.trim();
      if (!head || !title) return;
      const hospital = window.DRX_ANTIBIOTIC_HOSPITAL?.regimens.find(item => item.id === card.dataset.regimenId);
      const parts = hospital?.dose?.parts || window.DRX_ANTIBIOTIC_FORMULATIONS?.comboAliases?.[title] || [{drug:title}];
      const codes = [...new Map(parts.flatMap(part => atc.forDrug(part.drug)).map(item => [item.code,item])).values()];
      if (!codes.length) return;
      const badges = make('div','abx-atc-badges');
      badges.setAttribute('aria-label','Klasifikimi ATC');
      codes.forEach(item => {
        const badge = make('span','abx-atc-badge',(item.groupCode==='J01C'?item.group:item.subgroup) + ' · ' + item.code);
        badge.title = item.subgroup; badges.append(badge);
        if (!groups.has(item.subgroupCode)) groups.set(item.subgroupCode,{item,cards:[]});
        groups.get(item.subgroupCode).cards.push({card,title,code:item.code});
      });
      head.after(badges);
      card.id = 'abx-atc-regimen-' + index;
      card.dataset.atcCodes = codes.map(item => item.code).join(' ');
    });
    if (!groups.size) return;
    // This is an index, never a therapeutic sort/filter: keep first choices,
    // alternatives, combinations and urgent messages in their clinical order.
    const browser = make('details','abx-atc-browser');
    browser.append(make('summary','','Shfleto sipas klasës ATC'));
    const body = make('div','abx-atc-groups');
    groups.forEach(({item,cards}) => {
      const section = make('section','abx-atc-group');
      section.append(make('h3','',item.subgroup));
      cards.forEach(({card,title,code}) => {
        const link = make('a','',title + ' · ' + code);
        link.href = '#' + card.id;
        link.addEventListener('click',event => {
          event.preventDefault(); card.tabIndex = -1;
          window.dispatchEvent(new CustomEvent('drx:select-antibiotic',{detail:{id:card.dataset.regimenId}}));
          card.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth'});
          card.focus({preventScroll:true});
        });
        section.append(link);
      });
      body.append(section);
    });
    browser.append(body);if(holder===list)list.prepend(browser);else holder.append(browser);
  }
  new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(refresh); } }).observe(list,{childList:true,subtree:true});
  refresh();
})();
