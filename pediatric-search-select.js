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
    input.enterKeyHint = 'search'; input.autocapitalize = 'none';
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-label', title);
    input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
    if (select.getAttribute('aria-describedby')) input.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
    const arrow = make('button', 'dz-select-arrow', '⌄'); arrow.type = 'button'; arrow.tabIndex = -1;
    arrow.setAttribute('aria-label', 'Hap zgjedhjet për ' + title);
    const clear = make('button', 'dz-select-clear', '×'); clear.type = 'button'; clear.hidden = true;
    clear.setAttribute('aria-label', 'Pastro kërkimin për ' + title);
    const status = make('span', 'sr-only'); status.id = select.id + 'SearchStatus';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), status.id].filter(Boolean).join(' '));
    const list = make('span', 'dz-select-options'); list.id = select.id + 'Options'; list.hidden = true;
    list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', title);
    input.setAttribute('aria-controls', list.id);
    let open = false, editing = false, matches = [], active = -1, lastValue = select.value;
    const selectedText = () => select.selectedOptions[0]?.textContent || '';
    function close(committed = false) {
      const cancelled = editing && !committed; editing = false;
      open = false; list.hidden = true; input.value = selectedText();
      clear.hidden = true; host.classList.remove('is-editing'); status.textContent = '';
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
      const unchanged = option.value === select.value, wasEditing = editing;
      select.value = option.value; lastValue = select.value; close(true);
      // A search for the already-selected value must not reset patient confirmations.
      if (!unchanged) select.dispatchEvent(new Event('change', {bubbles:true}));
      else if (wasEditing) host.dispatchEvent(new CustomEvent('pediatric:choice-cancel', {bubbles:true}));
      input.focus({preventScroll:true});
    }
    function render(query = '') {
      const terms = normalize(query).split(' ').filter(Boolean);
      clear.hidden = !terms.length; host.classList.toggle('is-editing', Boolean(terms.length));
      matches = [...select.options].filter(option => !option.disabled && terms.every(term => normalize(option.textContent + ' ' + (option.parentElement?.label || '')+' '+(option.dataset.searchTerms||'')).includes(term)));
      list.replaceChildren(); active = -1; input.removeAttribute('aria-activedescendant');
      let previousGroup = '', groupHost = list;
      matches.forEach((option, index) => {
        const group = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : '';
        if (group !== previousGroup || index === 0) {
          groupHost = list;
          if (group) {
            groupHost = make('span', 'dz-select-section'); groupHost.setAttribute('role', 'group');
            const heading = make('span', 'dz-select-group', group); heading.id = select.id + 'Group' + index;
            heading.setAttribute('role', 'presentation'); groupHost.setAttribute('aria-labelledby', heading.id);
            groupHost.append(heading); list.append(groupHost);
          }
        }
        previousGroup = group;
        const row = make('span', 'dz-select-option');
        row.id = select.id + 'Option' + index; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.value === select.value));
        row.setAttribute('aria-label', option.textContent);
        const text = make('span', 'dz-select-option-text'); text.append(make('span', 'dz-select-option-name', option.textContent)); row.append(text);
        const descriptions = [];
        let brands = [];
        try { const value = JSON.parse(option.dataset.brands || '[]'); if (Array.isArray(value)) brands = value.filter(value => typeof value === 'string'); } catch {}
        const brandMatches = terms.length && !terms.every(term => normalize(option.textContent).includes(term))
          ? brands.filter(brand => terms.every(term => normalize(brand).includes(term))) : [];
        const brandNotes = brandMatches.length ? brandMatches : option.dataset.referenceOnly === 'true' ? brands : [];
        if (brandNotes.length) {
          const note = make('span', 'dz-select-brand', brandNotes.slice(0, 2).join(' · ') + (brandNotes.length > 2 ? ' +' + (brandNotes.length - 2) : ''));
          note.id = row.id + 'Brand'; text.append(note); descriptions.push(note.id);
        }
        if (option.dataset.referenceOnly === 'true') {
          const badge = make('span', 'dz-select-reference', option.dataset.referenceLabel || 'Pa llogaritje'); badge.id = row.id + 'Status';
          row.append(badge); descriptions.push(badge.id);
        }
        if (descriptions.length) row.setAttribute('aria-describedby', descriptions.join(' '));
        row.addEventListener('pointerdown', event => event.preventDefault());
        // Cancel the enclosing label's synthetic input click after a choice.
        row.addEventListener('click', event => {event.preventDefault();event.stopPropagation();choose(option);});
        groupHost.append(row);
      });
      if (!matches.length) { const empty = make('span', 'dz-select-empty', 'Nuk u gjet asnjë rezultat.'); empty.setAttribute('role', 'status'); list.append(empty); }
      const count = matches.filter(option => option.value).length;
      status.textContent = count === 1 ? '1 rezultat. Shtyp Enter për ta zgjedhur.' : `${count} rezultate. Përdor shigjetat për të zgjedhur.`;
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
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab') close();
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (!open) show();
        if (matches.length) highlight(active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
      } else if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0) choose(matches[active]); else if (matches.length === 1) choose(matches[0]); }
    });
    // Keep text focus while tapping controls, including on narrow WebKit viewports.
    [arrow,clear].forEach(button=>button.addEventListener('pointerdown',event=>event.preventDefault()));
    arrow.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (open) close(); else { show(); input.focus({preventScroll:true}); input.select(); } });
    clear.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); input.value = ''; editing = true;
      host.dispatchEvent(new CustomEvent('pediatric:choice-editing', {bubbles:true}));
      show(); input.focus({preventScroll:true});
    });
    host.addEventListener('focusout', () => setTimeout(() => { if (!host.contains(document.activeElement)) close(); }, 0));
    document.addEventListener('pointerdown', event => { if (open && !host.contains(event.target)) close(); });
    window.addEventListener('resize', () => { if (open) position(); });
    window.visualViewport?.addEventListener('resize', () => { if (open) position(); });
    select.addEventListener('change', () => { close(true); sync(); });
    select.before(host); host.append(select, input, clear, arrow, list, status);
    if (label) label.htmlFor = input.id;
    select.tabIndex = -1; select.setAttribute('aria-hidden', 'true'); select.dataset.searchEnhanced = 'true';
    select.classList.add('dz-select-native');
    new MutationObserver(sync).observe(select, {childList:true, subtree:true, attributes:true, attributeFilter:['disabled','selected']});
    sync();
  }
  const boot = () => ['pediatricDrug','pediatricForm','pediatricStrength','pediatricScheme'].forEach(id => enhance(document.getElementById(id)));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
