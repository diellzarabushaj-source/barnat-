/* Progressive enhancement: the native select remains the selection authority. */
(() => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  };
  function enhance(select) {
    if (!select || select.dataset.searchEnhanced) return;
    const label = select.labels?.[0];
    const title = [...(label?.childNodes || [])].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ').trim() || 'Zgjedhja';
    const host = make('span', 'dz-search-select');
    const input = make('input', 'dz-select-search');
    input.id = select.id + 'Search'; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-label', title);
    input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
    if (select.getAttribute('aria-describedby')) input.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
    const arrow = make('button', 'dz-select-arrow', '⌄'); arrow.type = 'button'; arrow.tabIndex = -1;
    arrow.setAttribute('aria-label', 'Hap zgjedhjet për ' + title);
    const list = make('span', 'dz-select-options'); list.id = select.id + 'Options'; list.hidden = true;
    list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', title);
    input.setAttribute('aria-controls', list.id);
    let open = false, editing = false, matches = [], active = -1, lastValue = select.value;
    const selectedText = () => select.selectedOptions[0]?.textContent || '';
    function close(committed = false) {
      const cancelled = editing && !committed; editing = false;
      open = false; list.hidden = true; input.value = selectedText();
      input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
      if (cancelled) host.dispatchEvent(new CustomEvent('pediatric:choice-cancel', {bubbles:true}));
    }
    function position() {
      const rect = host.getBoundingClientRect(), viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0, bottom = top + (viewport?.height || innerHeight);
      const below = bottom - rect.bottom - 12, above = rect.top - top - 12;
      const upward = below < 180 && above > below;
      list.classList.toggle('is-above', upward);
      list.style.maxHeight = Math.max(100, Math.min(320, upward ? above : below)) + 'px';
    }
    function highlight(index) {
      active = index;
      [...list.querySelectorAll('[role="option"]')].forEach((option, i) => {
        option.classList.toggle('is-active', i === active);
        if (i === active) { input.setAttribute('aria-activedescendant', option.id); option.scrollIntoView({block:'nearest'}); }
      });
      if (active < 0) input.removeAttribute('aria-activedescendant');
    }
    function choose(option) {
      if (!option || option.disabled || select.disabled) return;
      select.value = option.value; lastValue = select.value; close(true);
      select.dispatchEvent(new Event('change', {bubbles:true}));
      input.focus({preventScroll:true});
    }
    function render(query = '') {
      const terms = normalize(query).split(' ').filter(Boolean);
      matches = [...select.options].filter(option => !option.disabled && terms.every(term => normalize(option.textContent + ' ' + (option.parentElement?.label || '')).includes(term)));
      list.replaceChildren(); active = -1; input.removeAttribute('aria-activedescendant');
      let previousGroup = '';
      matches.forEach((option, index) => {
        const group = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : '';
        if (group && group !== previousGroup) { const heading = make('span', 'dz-select-group', group); heading.setAttribute('role', 'presentation'); list.append(heading); }
        previousGroup = group;
        const row = make('span', 'dz-select-option', option.textContent);
        row.id = select.id + 'Option' + index; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.value === select.value));
        row.addEventListener('pointerdown', event => event.preventDefault());
        row.addEventListener('click', () => choose(option));
        list.append(row);
      });
      if (!matches.length) { const empty = make('span', 'dz-select-empty', 'Nuk u gjet asnjë rezultat.'); empty.setAttribute('role', 'status'); list.append(empty); }
      position();
    }
    function show(query = '') {
      if (select.disabled) return;
      open = true; list.hidden = false; input.setAttribute('aria-expanded', 'true'); render(query);
    }
    function sync() {
      input.disabled = select.disabled; arrow.disabled = select.disabled;
      if (!open || lastValue !== select.value || select.disabled) close(true);
      else render(input.value);
      lastValue = select.value;
    }
    input.addEventListener('click', () => { if (!open) { show(); input.select(); } });
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => { editing = true; host.dispatchEvent(new CustomEvent('pediatric:choice-editing', {bubbles:true})); show(input.value); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab') close();
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (!open) show();
        if (matches.length) highlight(active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
      } else if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0) choose(matches[active]); }
    });
    arrow.addEventListener('click', () => { if (open) close(); else { show(); input.focus({preventScroll:true}); input.select(); } });
    host.addEventListener('focusout', () => setTimeout(() => { if (!host.contains(document.activeElement)) close(); }, 0));
    document.addEventListener('pointerdown', event => { if (open && !host.contains(event.target)) close(); });
    window.addEventListener('resize', () => { if (open) position(); });
    window.visualViewport?.addEventListener('resize', () => { if (open) position(); });
    select.addEventListener('change', () => { close(true); sync(); });
    select.before(host); host.append(select, input, arrow, list);
    if (label) label.htmlFor = input.id;
    select.tabIndex = -1; select.setAttribute('aria-hidden', 'true'); select.dataset.searchEnhanced = 'true';
    select.classList.add('dz-select-native');
    new MutationObserver(sync).observe(select, {childList:true, subtree:true, attributes:true, attributeFilter:['disabled','selected']});
    sync();
  }
  const boot = () => ['pediatricDrug','pediatricForm','pediatricStrength','pediatricScheme'].forEach(id => enhance(document.getElementById(id)));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
