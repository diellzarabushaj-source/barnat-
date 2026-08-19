(() => {
  'use strict';

  const list = document.getElementById('emergencyList');
  const search = document.getElementById('emergencySearch');
  const detail = document.getElementById('emergencyDetail');
  if (!list || !search || !detail) return;

  const META_QUERY = `*[_type == "emergencyProtocol" && reviewStatus != "archived"]{
    _id,reviewStatus,lastReviewedAt,reviewDueAt,"sourceCount":count(sources),
    sources[]{title,url,publishedAt}
  }`;
  const directoryMeta = new Map();
  const sourceMeta = new Map();
  const STATUS_LABELS = {
    draft: 'Draft',
    review: 'Për verifikim',
    verified: 'Verifikuar',
    archived: 'Arkivuar',
  };

  const text = node => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[ch]));

  function normalizeUrl(value) {
    try { return new URL(String(value || ''), window.location.origin).href; }
    catch { return String(value || '').trim(); }
  }

  function dateLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat('sq-AL', {day:'2-digit', month:'short', year:'numeric'}).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  function isReviewOverdue(value) {
    if (!value) return false;
    const due = new Date(`${value}T23:59:59`);
    return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
  }

  function splitMeta(raw) {
    const parts = String(raw || '').split('·').map(part => part.trim()).filter(Boolean);
    const codes = parts.filter(part => /^[A-Z][0-9]/i.test(part));
    const labels = parts.filter(part => !codes.includes(part));
    return {codes, labels};
  }

  function safetyMarkup(meta) {
    if (!meta) return '';
    const status = String(meta.reviewStatus || 'draft');
    const sourceCount = Number(meta.sourceCount || 0);
    const sourceLabel = sourceCount === 1 ? '1 burim' : `${sourceCount} burime`;
    const sourceClass = sourceCount > 0 ? 'has-sources' : 'has-no-sources';
    const overdue = isReviewOverdue(meta.reviewDueAt);
    return `
      <span class="ck-directory-safety">
        <span class="ck-directory-review is-${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span>
        <span class="ck-directory-source-count ${sourceClass}">${esc(sourceCount ? sourceLabel : 'Pa burime')}</span>
        ${overdue ? '<span class="ck-directory-review is-overdue">Rishikim i vonuar</span>' : ''}
      </span>`;
  }

  function decorateDirectory() {
    const buttons = [...list.querySelectorAll('.ck-list-button[data-id]')];
    if (!buttons.length) return;

    list.setAttribute('aria-label', 'Urgjencat e disponueshme');

    buttons.forEach(button => {
      const isActive = button.classList.contains('is-active');
      if (isActive) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');

      if (!button.querySelector('.ck-directory-tags')) {
        const metaLine = [...button.children].find(node =>
          node.tagName === 'SPAN'
          && !node.classList.contains('ck-directory-tags')
          && !node.classList.contains('ck-directory-active')
          && !node.classList.contains('ck-directory-safety')
        );
        if (metaLine) {
          const {codes, labels} = splitMeta(text(metaLine));
          const tags = document.createElement('span');
          tags.className = 'ck-directory-tags';
          tags.innerHTML = [
            ...codes.map(code => `<span class="ck-directory-tag is-icd">${esc(code)}</span>`),
            ...labels.map(label => `<span class="ck-directory-tag">${esc(label)}</span>`),
          ].join('');
          metaLine.hidden = true;
          button.appendChild(tags);
        }
      }

      const itemMeta = directoryMeta.get(button.dataset.id);
      const existingSafety = button.querySelector('.ck-directory-safety');
      if (itemMeta) {
        if (existingSafety) existingSafety.outerHTML = safetyMarkup(itemMeta);
        else button.insertAdjacentHTML('beforeend', safetyMarkup(itemMeta));
      } else if (existingSafety) {
        existingSafety.remove();
      }

      const activeLabel = button.querySelector('.ck-directory-active');
      if (isActive && !activeLabel) {
        button.insertAdjacentHTML('beforeend', '<span class="ck-directory-active">Hapur</span>');
      } else if (!isActive && activeLabel) {
        activeLabel.remove();
      }
    });
  }

  function visibleButtons() {
    return [...list.querySelectorAll('.ck-list-button[data-id]')]
      .filter(button => !button.hidden && button.offsetParent !== null);
  }

  function moveDirectoryFocus(current, delta) {
    const buttons = visibleButtons();
    if (!buttons.length) return;
    const index = Math.max(0, buttons.indexOf(current));
    const next = buttons[(index + delta + buttons.length) % buttons.length];
    next?.focus({preventScroll:true});
    next?.scrollIntoView({block:'nearest'});
  }

  list.addEventListener('keydown', event => {
    const button = event.target.closest('.ck-list-button[data-id]');
    if (!button) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveDirectoryFocus(button, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveDirectoryFocus(button, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      visibleButtons()[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      visibleButtons().at(-1)?.focus();
    }
  });

  search.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    const first = visibleButtons()[0];
    if (!first) return;
    event.preventDefault();
    first.focus();
  });

  function enhanceSourceDrawer() {
    document.querySelectorAll('#ckDetailOverlay .ck-source-list li').forEach(item => {
      const link = item.querySelector('a[href]');
      const meta = sourceMeta.get(normalizeUrl(link?.href));
      if (!meta?.publishedAt || item.querySelector('.ck-source-published')) return;
      const date = document.createElement('small');
      date.className = 'ck-source-published';
      date.textContent = `Publikuar: ${dateLabel(meta.publishedAt)}`;
      item.appendChild(date);
    });
  }

  async function loadClinicalMeta() {
    try {
      if (!window.MedIndexSanity?.query) return;
      const rows = await window.MedIndexSanity.query(META_QUERY);
      if (!Array.isArray(rows)) return;
      rows.forEach(row => {
        if (row?._id) directoryMeta.set(row._id, row);
        (row?.sources || []).forEach(source => {
          const key = normalizeUrl(source?.url);
          if (key) sourceMeta.set(key, source);
        });
      });
      decorateDirectory();
      enhanceSourceDrawer();
    } catch (error) {
      console.warn('Urgjencat: metadata e sigurisë nuk u ngarkua.', error);
    }
  }

  detail.addEventListener('click', event => {
    if (!event.target.closest('[data-ck-detail],[data-ck-review],[data-ck-review-open]')) return;
    window.setTimeout(enhanceSourceDrawer, 80);
  });

  let listFrame = 0;
  const listObserver = new MutationObserver(() => {
    cancelAnimationFrame(listFrame);
    listFrame = requestAnimationFrame(decorateDirectory);
  });
  listObserver.observe(list, {childList:true, subtree:true});

  decorateDirectory();
  loadClinicalMeta();
})();
