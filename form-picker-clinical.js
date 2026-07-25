(() => {
  'use strict';

  const GROUPS = [
    { source:'Tableta & pilula', label:'TABLETA & PILULA', short:'Tab.', color:'#2f7d5c', icon:'pill' },
    { source:'Kapsula', label:'KAPSULA', short:'Caps.', color:'#b1502f', icon:'capsule' },
    { source:'Shurupe & solucione orale', label:'SHURUPE & SOLUCIONE ORALE', short:'Sir. / Sol.', color:'#2f6f9e', icon:'bottle' },
    { source:'Injeksione & Infuzione', label:'AMPULA, INJEKSIONE & INFUZIONE', short:'Amp. / Inf.', color:'#8a3e6b', icon:'syringe' },
    { source:'Kremra, xhel & pomada', label:'KREMRA, XHEL & POMADA', short:'Krem. / Ung.', color:'#b98a1e', icon:'tube' },
    { source:'Pika (sy, veshë, hundë)', label:'PIKA PËR SY, VESHË & HUNDË', short:'Gtt.', color:'#3f9a8f', icon:'drop' },
    { source:'Sprej & Inhalim', label:'SPREJ & INHALIM', short:'Spray / Inh.', color:'#6d5aa6', icon:'lungs' },
    { source:'Pluhur & granula', label:'PLUHUR & GRANULA', short:'Pulv. / Gran.', color:'#9c6b3f', icon:'powder' },
    { source:'Supozitorë & forma vaginale', label:'SUPOZITORË & FORMA VAGINALE', short:'Supp.', color:'#c2547e', icon:'suppository' },
    { source:'Forma të tjera speciale', label:'FORMA TË TJERA SPECIALE', short:'Tjera', color:'#6b6f76', icon:'special' },
  ];

  const ICONS = {
    all:'<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    pill:'<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/>',
    capsule:'<path d="M7.1 16.9a5 5 0 0 1 0-7.1l2.7-2.7a5 5 0 1 1 7.1 7.1l-2.7 2.7a5 5 0 0 1-7.1 0Z"/><path d="m9 9 6 6"/>',
    bottle:'<path d="M9 3h6v4l2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-2V3Z"/><path d="M8 12h8M10 3h4"/>',
    syringe:'<path d="m14 4 6 6M16 2l6 6M7 11l6 6M4 20l4-4M3 21l3-1"/><path d="m8 10 6-6 6 6-6 6-6-6Z"/>',
    tube:'<path d="m8 3 8 2-1 4 3 2-4 10-8-3 4-9-3-2 1-4Z"/><path d="m10 9 5 2"/>',
    drop:'<path d="M12 3S6 10 6 15a6 6 0 0 0 12 0c0-5-6-12-6-12Z"/><path d="M9.5 16.5c.5 1 1.3 1.5 2.5 1.5"/>',
    lungs:'<path d="M11 4v8c-2-3-4-5-6-5-2 0-3 4-3 8 0 4 3 6 7 6 2 0 2-2 2-4V4ZM13 4v8c2-3 4-5 6-5 2 0 3 4 3 8 0 4-3 6-7 6-2 0-2-2-2-4V4Z"/>',
    powder:'<path d="M8 3h8l-1 5 4 9a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4l4-9-1-5Z"/><path d="M7 16h10M9 3h6"/>',
    suppository:'<path d="M12 3c3 3 5 6 5 10a5 5 0 0 1-10 0c0-4 2-7 5-10Z"/><path d="M9 17h6"/>',
    special:'<path d="M12 3 9.8 8.2 4 9l4.2 4.1-1 5.8L12 16.2l4.8 2.7-1-5.8L20 9l-5.8-.8L12 3Z"/>',
  };

  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq')
    .replace(/\s+/g, ' ')
    .trim();

  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));

  function icon(name) {
    const body = ICONS[name] || ICONS.special;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function findGroup(text) {
    const value = normalize(text).replace(/\s*\(\d+\)\s*$/, '');
    return GROUPS.find(group => value.startsWith(normalize(group.source))) || null;
  }

  function setTheme(node, group) {
    node.style.setProperty('--form-accent', group.color);
    node.dataset.formCategory = group.source;
  }

  function makeKeyboardClickable(node) {
    if (node.dataset.formKeyboard === '1') return;
    node.dataset.formKeyboard = '1';
    node.tabIndex = 0;
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        node.click();
      }
    });
  }

  function decorateAllItem(item) {
    if (!item || item.dataset.formClinical === '1') return;
    item.dataset.formClinical = '1';
    item.setAttribute('role', 'option');
    makeKeyboardClickable(item);
    item.innerHTML = `
      <span class="form-all-icon">${icon('all')}</span>
      <span class="form-all-copy"><strong>Të gjitha format</strong><small>Shfaq regjistrin pa filtër farmaceutik</small></span>
      <span class="form-all-count">${GROUPS.length} kategori</span>`;
  }

  function decorateHeader(header, group) {
    if (!header || !group || header.dataset.formClinical === '1') return;
    const count = (header.textContent.match(/\((\d+)\)/) || [,''])[1];
    header.dataset.formClinical = '1';
    header.setAttribute('role', 'option');
    setTheme(header, group);
    makeKeyboardClickable(header);
    header.innerHTML = `
      <span class="form-category-icon">${icon(group.icon)}</span>
      <span class="form-category-copy"><strong>${escapeHtml(group.label)}</strong><small>Forma në recetë: <b>${escapeHtml(group.short)}</b></small></span>
      <span class="form-category-count">${escapeHtml(count || '0')}</span>`;
  }

  function decorateItem(item, group) {
    if (!item || !group || item.dataset.formClinical === '1') return;
    const label = String(item.textContent || '').trim();
    item.dataset.formClinical = '1';
    item.setAttribute('role', 'option');
    setTheme(item, group);
    makeKeyboardClickable(item);
    item.innerHTML = `
      <span class="form-option-dot" aria-hidden="true"></span>
      <span class="form-option-label">${escapeHtml(label)}</span>
      <span class="form-option-short">${escapeHtml(group.short)}</span>`;
  }

  function decorateList() {
    const list = document.getElementById('formList');
    if (!list) return;

    decorateAllItem(list.querySelector('.form-item-all'));
    const children = [...list.children];
    let currentGroup = null;
    let lastOption = null;

    children.forEach(node => {
      if (node.classList.contains('form-cat-header')) {
        if (lastOption) lastOption.classList.add('is-group-end');
        currentGroup = findGroup(node.textContent);
        lastOption = null;
        if (currentGroup) decorateHeader(node, currentGroup);
        return;
      }
      if (node.classList.contains('form-item-sub') && currentGroup) {
        decorateItem(node, currentGroup);
        lastOption = node;
      }
    });
    if (lastOption) lastOption.classList.add('is-group-end');
  }

  function visibleOptions() {
    return [...document.querySelectorAll('#formList .form-item-all, #formList .form-cat-header, #formList .form-item-sub')]
      .filter(node => node.offsetParent !== null);
  }

  function initNavigation() {
    const list = document.getElementById('formList');
    const panel = document.getElementById('formPanel');
    const button = document.getElementById('formPickerBtn');
    if (!list || !panel || !button) return;

    const syncExpanded = () => button.setAttribute('aria-expanded', panel.classList.contains('open') ? 'true' : 'false');
    button.addEventListener('click', () => requestAnimationFrame(syncExpanded));

    list.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const options = visibleOptions();
      if (!options.length) return;
      event.preventDefault();
      const current = Math.max(0, options.indexOf(document.activeElement));
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? options.length - 1
        : event.key === 'ArrowDown' ? Math.min(options.length - 1, current + 1)
        : Math.max(0, current - 1);
      options[next].focus({ preventScroll:true });
      options[next].scrollIntoView({ block:'nearest' });
    });

    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      panel.classList.remove('open');
      syncExpanded();
      button.focus({ preventScroll:true });
    });

    document.addEventListener('click', () => requestAnimationFrame(syncExpanded));
  }

  function init() {
    const list = document.getElementById('formList');
    if (!list) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(decorateList);
    };
    schedule();
    new MutationObserver(schedule).observe(list, { childList:true });
    initNavigation();
    window.dispatchEvent(new CustomEvent('medindex:clinical-form-picker-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
