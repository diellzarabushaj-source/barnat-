(() => {
  'use strict';
  const root = typeof window === 'undefined' ? globalThis : window;
  const clean = value => String(value ?? '').trim();
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escape = value => clean(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const levels = { 1:'Grupi anatomik', 3:'Grupi terapeutik', 4:'Nënndarja farmakologjike', 5:'Nënndarja kimike', 7:'Substanca · kodi i plotë' };

  function normalizeCode(value) {
    const code = clean(value).toUpperCase().replace(/\s+/g, '');
    return /^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/.test(code) ? code : '';
  }

  function codePath(value) {
    const code = normalizeCode(value);
    return code ? [1, 3, 4, 5, 7].filter(length => length <= code.length).map(length => code.slice(0, length)) : [];
  }

  function buildCatalog(groups, categories, subdivisions) {
    const names = { ...groups, ...categories, ...subdivisions };
    const nodes = new Map();
    Object.entries(names).forEach(([value, name]) => {
      const code = normalizeCode(value);
      if (!code || !clean(name)) return;
      codePath(code).forEach(prefix => {
        if (!nodes.has(prefix)) nodes.set(prefix, { code:prefix, name:clean(names[prefix]) || `Kodi ATC ${prefix}`, children:[] });
      });
    });
    const roots = [];
    [...nodes.values()].sort((a, b) => a.code.localeCompare(b.code)).forEach(node => {
      const ancestors = codePath(node.code);
      const parent = nodes.get(ancestors.at(-2));
      if (parent) parent.children.push(node); else roots.push(node);
    });
    return { nodes, roots };
  }

  function searchCatalog(catalog, query) {
    const needle = fold(query);
    return [...catalog.nodes.values()].filter(node => fold(`${node.code} ${node.name}`).includes(needle));
  }

  function createPicker({ onChange, onOpen }) {
    const container = document.getElementById('atcPicker');
    if (!container) return null;
    const trigger = document.getElementById('atcPickerButton');
    const panel = document.getElementById('atcPickerPanel');
    const search = document.getElementById('atcPickerSearch');
    const list = document.getElementById('atcPickerList');
    const selection = document.getElementById('atcPickerSelection');
    const status = document.getElementById('atcPickerStatus');
    const value = document.getElementById('atcPickerValue');
    const hint = document.getElementById('atcPickerHint');
    const catalog = buildCatalog(root.MEDINDEX_ATC_GROUPS, root.MEDINDEX_ATC_SUBGROUPS, root.MEDINDEX_ATC_SUBDIVISIONS);
    const expanded = new Set();
    let active = '';

    function label(code) { return catalog.nodes.get(code)?.name || `Kodi ATC ${code}`; }
    function option(code, name, context = '') {
      const selected = code === active;
      return `<button class="atc-picker-option${selected ? ' is-selected' : ''}" type="button" data-atc-select="${escape(code)}" aria-pressed="${selected}"><span class="atc-picker-code">${escape(code || 'Të gjitha')}</span><span class="atc-picker-copy"><strong>${escape(name)}</strong>${context ? `<small>${escape(context)}</small>` : ''}</span><span class="atc-picker-check" aria-hidden="true">${selected ? '✓' : ''}</span></button>`;
    }
    function branch(node) {
      const content = option(node.code, node.name, levels[node.code.length]);
      if (!node.children.length) return `<div class="atc-picker-leaf">${content}</div>`;
      return `<details class="atc-picker-branch" data-atc-branch="${escape(node.code)}"${expanded.has(node.code) ? ' open' : ''}><summary><span class="atc-picker-arrow" aria-hidden="true">›</span><span class="atc-picker-code">${escape(node.code)}</span><span class="atc-picker-copy"><strong>${escape(node.name)}</strong><small>${node.children.length} nënndarje</small></span></summary><div class="atc-picker-children">${option(node.code, `Të gjitha barnat: ${node.name}`, levels[node.code.length])}${node.children.map(branch).join('')}</div></details>`;
    }
    function render() {
      const query = clean(search.value);
      let items;
      let count;
      if (query) {
        const matches = searchCatalog(catalog, query);
        items = matches.map(node => option(node.code, node.name, codePath(node.code).slice(0, -1).map(code => `${code} · ${label(code)}`).join(' / '))).join('');
        count = matches.length;
        // A full substance code is usable even when the local name catalog
        // does not contain it. No substance name is inferred from the code.
        const exact = normalizeCode(query);
        if (exact.length === 7 && !catalog.nodes.has(exact)) {
          items = option(exact, `Filtro kodin ${exact}`, levels[7]) + items;
          count += 1;
        }
        if (!count) items = '<p class="atc-picker-empty">Nuk u gjet kategori. Provo një emër ose kod ATC tjetër.</p>';
      } else {
        items = catalog.roots.map(branch).join('');
        count = catalog.roots.length;
      }
      list.innerHTML = option('', 'Të gjitha grupet', 'Hiqe vetëm filtrin ATC') + items;
      status.textContent = query ? `${count} përputhje në klasifikimin ATC` : `${count} grupe · zgjidh edhe kategori dhe nënndarje`;
      selection.hidden = !active;
      selection.textContent = active ? codePath(active).map(code => `${code} · ${label(code)}`).join(' › ') : '';
      if (!panel.hidden) positionPanel();
    }
    function setValue(code) {
      const next = normalizeCode(code);
      const changed = next !== active;
      active = next;
      value.textContent = active ? `${active} — ${label(active)}` : 'Të gjitha grupet';
      trigger.title = value.textContent;
      hint.textContent = active ? levels[active.length] : `${catalog.roots.length} grupe · kategori dhe nënndarje`;
      trigger.classList.toggle('is-selected', Boolean(active));
      if (changed) {
        codePath(active).slice(0, -1).forEach(prefix => expanded.add(prefix));
        render();
      }
    }
    function close({ focusButton = false } = {}) {
      if (panel.hidden) return;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      search.value = '';
      if (focusButton) trigger.focus({ preventScroll:true });
    }
    function positionPanel() {
      if (root.innerWidth <= 760) {
        ['top', 'left', 'right', 'width', 'max-height'].forEach(property => panel.style.removeProperty(property));
        list.style.removeProperty('max-height');
        return;
      }
      const anchor = trigger.getBoundingClientRect();
      const width = Math.min(470, root.innerWidth - 36);
      const below = root.innerHeight - anchor.bottom - 16;
      const above = anchor.top - 16;
      const placeBelow = below >= 320 || below >= above;
      const available = Math.max(150, placeBelow ? below : above);
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(18, Math.min(anchor.right - width, root.innerWidth - width - 18))}px`;
      panel.style.right = 'auto';
      panel.style.removeProperty('max-height');
      const chrome = panel.offsetHeight - list.offsetHeight;
      list.style.maxHeight = `${Math.max(70, Math.min(410, available - chrome))}px`;
      panel.style.maxHeight = `${available}px`;
      panel.style.top = `${placeBelow ? anchor.bottom + 7 : Math.max(12, anchor.top - panel.offsetHeight - 7)}px`;
    }
    function open() {
      onOpen?.();
      search.value = '';
      codePath(active).slice(0, -1).forEach(prefix => expanded.add(prefix));
      render();
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      positionPanel();
      search.focus({ preventScroll:true });
      const selected = list.querySelector('.is-selected');
      if (selected) list.scrollTop += selected.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
    }
    trigger.addEventListener('click', () => panel.hidden ? open() : close());
    search.addEventListener('input', render);
    list.addEventListener('toggle', event => {
      const code = event.target.dataset.atcBranch;
      if (!code) return;
      if (event.target.open) expanded.add(code); else expanded.delete(code);
    }, true);
    panel.addEventListener('click', event => {
      if (event.target.closest('[data-atc-close]')) return close({ focusButton:true });
      const button = event.target.closest('[data-atc-select]');
      if (!button) return;
      const code = normalizeCode(button.dataset.atcSelect);
      setValue(code);
      close({ focusButton:true });
      onChange(code);
    });
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close({ focusButton:true }); return;
      }
      const visible = [...list.querySelectorAll('button, summary')].filter(node => node.getClientRects().length);
      if (event.key === 'Tab') {
        const focusable = [panel.querySelector('[data-atc-close]'), search, ...visible];
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      if (document.activeElement === search && !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      if (!visible.length) return;
      event.preventDefault();
      const index = visible.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : event.key === 'ArrowDown' ? Math.min(index + 1, visible.length - 1) : Math.max(index - 1, 0);
      visible[next].focus();
    });
    document.addEventListener('click', event => { if (!container.contains(event.target)) close(); });
    root.addEventListener('resize', () => { if (!panel.hidden) positionPanel(); });
    root.addEventListener('scroll', () => { if (root.innerWidth > 760) close(); });
    container.addEventListener('focusout', event => { if (event.relatedTarget && !container.contains(event.relatedTarget)) close(); });
    setValue('');
    render();
    return { setValue, close };
  }

  const api = { normalizeCode, codePath, buildCatalog, searchCatalog, createPicker };
  root.DrxRegistryAtc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
