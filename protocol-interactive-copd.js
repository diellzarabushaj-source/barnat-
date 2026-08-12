(() => {
  'use strict';

  const SUPPORTED = new Set(['upk-05', 'upk-06', 'upk-07']);
  const DATA_URL = '/data/protocol-elaborations-copd.json';
  const MANIFEST_URL = '/data/protocols.json';
  let pending = null;
  let renderToken = 0;
  let scheduled = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (value, max = 2000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function routeId() {
    try {
      const id = new URL(window.location.href).searchParams.get('protocol') || '';
      return SUPPORTED.has(id) ? id : '';
    } catch {
      return '';
    }
  }

  function keys(id) {
    return {
      checks:`medindex_${id}_checks_v1`,
      mode:`medindex_${id}_mode_v1`,
    };
  }

  function read(key) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function save(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function remove(key) {
    try { sessionStorage.removeItem(key); } catch {}
  }

  function savedMode(id) {
    try { return sessionStorage.getItem(keys(id).mode) === 'full' ? 'full' : 'quick'; }
    catch { return 'quick'; }
  }

  async function loadPayload() {
    if (pending) return pending;
    pending = Promise.all([
      fetch(DATA_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
      fetch(MANIFEST_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
    ]).then(async ([dataResponse, manifestResponse]) => {
      if (!dataResponse.ok || !manifestResponse.ok) throw new Error('Të dhënat e protokolleve të SPOK-ut nuk u ngarkuan.');
      const [data, manifest] = await Promise.all([dataResponse.json(), manifestResponse.json()]);
      return { data, manifest };
    }).catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  }

  function matchedPayload(id, payload) {
    const entry = Array.isArray(payload?.data?.entries) ? payload.data.entries.find(item => item?.protocolId === id) : null;
    const documentRecord = Array.isArray(payload?.manifest?.documents) ? payload.manifest.documents.find(item => item?.id === id) : null;
    if (!entry?.primaryCare || !documentRecord) throw new Error('Pamja praktike nuk është konfiguruar për këtë protokoll.');
    const sourceHash = clean(entry.sourceHash, 64).toLowerCase();
    const currentHash = clean(documentRecord.contentSha256, 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sourceHash) || sourceHash !== currentHash) {
      throw new Error('Versioni i burimit ka ndryshuar. Pamja praktike është ndalur deri në rishikim.');
    }
    return { entry, documentRecord };
  }

  function toneClass(tone) {
    return ['danger', 'warning', 'info', 'primary'].includes(tone) ? ` is-${tone}` : '';
  }

  function sourceUrl(documentRecord, page) {
    const pageNumber = Number(page);
    if (!documentRecord?.officialUrl || !Number.isInteger(pageNumber) || pageNumber < 1) return '';
    try {
      const url = new URL(documentRecord.officialUrl);
      url.hash = `page=${pageNumber}`;
      return url.href;
    } catch {
      return '';
    }
  }

  function sourceChip(documentRecord, page, label = '') {
    const url = sourceUrl(documentRecord, page);
    if (!url) return '';
    return `<a class="pc-source-chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer external">${esc(label || `Burimi · f. ${page}`)}</a>`;
  }

  function sourceRow(documentRecord, pages) {
    const values = [...new Set((Array.isArray(pages) ? pages : [pages]).map(Number).filter(Number.isInteger))];
    return values.length ? `<div class="pc-source-row">${values.map(page => sourceChip(documentRecord, page)).join('')}</div>` : '';
  }

  function todayMarkup(pc, documentRecord) {
    const items = Array.isArray(pc.todayActions) ? pc.todayActions : [];
    if (!items.length) return '';
    return `<section class="pc-panel pc-today" id="copd-today">
      <div class="pc-section-head"><span class="pc-kicker">Sot në vizitë</span><h2>Gjërat që ndryshojnë vendimin</h2><p>Çdo kartë lidhet drejtpërdrejt me faqen përkatëse të protokollit zyrtar.</p></div>
      <div class="pc-today-grid">${items.map(item => `<article class="pc-today-card${toneClass(item.tone)}"><div class="pc-today-number">${esc(item.number)}</div><div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${sourceChip(documentRecord, item.sourcePage)}</div></article>`).join('')}</div>
    </section>`;
  }

  function checksMarkup(id, pc, documentRecord) {
    const items = Array.isArray(pc.quickChecks) ? pc.quickChecks : [];
    if (!items.length) return '';
    const stored = read(keys(id).checks);
    return `<section class="pc-panel pc-quick" id="copd-checks">
      <div class="pc-section-head pc-section-head-split"><div><span class="pc-kicker">Kontroll i shpejtë</span><h2>Kontrollo para se të vazhdosh</h2><p>Shëno vetëm çka vlen për pacientin. Paneli organizon protokollin; nuk vendos diagnozë dhe nuk zgjedh trajtimin në vend të mjekut.</p></div><div class="pc-progress-wrap"><strong data-copd-count>0/${items.length}</strong><span>të shënuara</span></div></div>
      <div class="pc-progress"><span data-copd-bar></span></div>
      <div class="pc-check-grid">${items.map(item => `<div class="pc-check-row"><label class="pc-check${toneClass(item.tone)}"><input type="checkbox" data-copd-check="${esc(item.id)}" ${stored[item.id] ? 'checked' : ''}><span class="pc-check-box"></span><span class="pc-check-copy">${esc(item.label)}</span></label>${sourceChip(documentRecord, item.sourcePage, `f. ${item.sourcePage}`)}</div>`).join('')}</div>
      <div class="pc-context-alerts" data-copd-alerts aria-live="polite"></div>
      <button class="pc-text-button" type="button" data-copd-reset>Rivendos kontrollin</button>
    </section>`;
  }

  function sectionMarkup(section, documentRecord, index) {
    const items = Array.isArray(section.items) ? section.items : [];
    return `<section class="pc-panel pc-deep" id="copd-section-${esc(section.id || index)}">
      <div class="pc-section-head"><span class="pc-kicker">${esc(section.kicker || 'Praktika')}</span><h2>${esc(section.title)}</h2><p>${esc(section.body)}</p>${sourceRow(documentRecord, section.sourcePages)}</div>
      ${items.length ? `<div class="pc-treatment-grid">${items.map(item => `<article class="pc-treatment-card${toneClass(item.tone)}"><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join('')}</div>` : ''}
    </section>`;
  }

  function referralMarkup(referral, documentRecord) {
    if (!referral) return '';
    const planned = Array.isArray(referral.planned) ? referral.planned : [];
    const urgent = Array.isArray(referral.urgent) ? referral.urgent : [];
    return `<section class="pc-panel pc-referral" id="copd-referral">
      <div class="pc-section-head"><span class="pc-kicker">Referimi</span><h2>${esc(referral.title || 'Kur referohet?')}</h2><p><strong>Destinacioni:</strong> ${esc(referral.destination || '')}</p>${sourceRow(documentRecord, referral.sourcePage)}</div>
      <div class="pc-referral-grid"><div class="pc-referral-box is-planned"><strong>${esc(referral.plannedLabel || 'Referim')}</strong><ul>${planned.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div><div class="pc-referral-box is-urgent"><strong>${esc(referral.urgentLabel || 'Urgjencë / hospitalizim')}</strong><ul>${urgent.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div></div>
    </section>`;
  }

  function mainMarkup(id, entry, documentRecord) {
    const pc = entry.primaryCare || {};
    const sections = Array.isArray(pc.sections) ? pc.sections : [];
    return `<article class="protocol-reader-main protocol-primary-care" data-copd-root="${esc(id)}" data-pc-mode="${esc(savedMode(id))}" aria-labelledby="copdProtocolHeading">
      <header class="pc-hero"><div><div class="pc-hero-meta"><span>${esc(pc.eyebrow || 'Për mjekun familjar')}</span><span class="pc-review-badge">${esc(pc.statusLabel || 'Në rishikim klinik')}</span></div><h2 id="copdProtocolHeading">${esc(pc.title)}</h2><p>${esc(pc.subtitle)}</p></div><div class="pc-hero-tools"><div class="pc-mode-toggle" role="group" aria-label="Pamja e protokollit"><button type="button" data-copd-mode="quick">Shpejt</button><button type="button" data-copd-mode="full">E plotë</button></div><div class="pc-hero-source"><span>Burimi</span><strong>MSH · ${esc(documentRecord.publishedAt || '')}</strong></div></div></header>
      <nav class="pc-jump-nav" aria-label="Shko te seksioni"><a href="#copd-today">Sot</a><a href="#copd-checks">Kontrolli</a><a href="#copd-referral">Referimi</a>${sections.map((section, index) => `<a class="pc-deep" href="#copd-section-${esc(section.id || index)}">${esc(section.kicker || `Pjesa ${index + 1}`)}</a>`).join('')}</nav>
      ${todayMarkup(pc, documentRecord)}
      ${checksMarkup(id, pc, documentRecord)}
      ${sections.map((section, index) => sectionMarkup(section, documentRecord, index)).join('')}
      ${referralMarkup(pc.referral, documentRecord)}
      <aside class="pc-safety-note"><strong>Gjurmueshmëri klinike</strong><p>Kjo pamje shfaqet vetëm kur SHA-256 përputhet me kopjen aktuale të protokollit zyrtar. Statusi mbetet “në rishikim klinik”; dokumenti zyrtar ka përparësi.</p></aside>
    </article>`;
  }

  function setMode(root, id, value) {
    const mode = value === 'full' ? 'full' : 'quick';
    root.dataset.pcMode = mode;
    try { sessionStorage.setItem(keys(id).mode, mode); } catch {}
    qa('[data-copd-mode]', root).forEach(button => button.setAttribute('aria-pressed', String(button.dataset.copdMode === mode)));
  }

  function updateChecks(root, id, pc) {
    const boxes = qa('[data-copd-check]', root);
    const checked = boxes.filter(box => box.checked);
    const count = q('[data-copd-count]', root);
    const bar = q('[data-copd-bar]', root);
    if (count) count.textContent = `${checked.length}/${boxes.length}`;
    if (bar) bar.style.width = boxes.length ? `${Math.round((checked.length / boxes.length) * 100)}%` : '0%';
    const items = Array.isArray(pc.quickChecks) ? pc.quickChecks : [];
    const alerts = q('[data-copd-alerts]', root);
    if (alerts) {
      alerts.innerHTML = checked.map(box => items.find(item => item.id === box.dataset.copdCheck)).filter(Boolean).map(item => `<div class="pc-context-alert${toneClass(item.tone)}"><strong>${esc(item.label)}</strong><span>${esc(item.response || '')}</span></div>`).join('');
    }
  }

  function bind(root, id, pc) {
    const keySet = keys(id);
    qa('[data-copd-check]', root).forEach(box => box.addEventListener('change', () => {
      const state = read(keySet.checks);
      state[box.dataset.copdCheck] = box.checked;
      save(keySet.checks, state);
      updateChecks(root, id, pc);
    }));
    q('[data-copd-reset]', root)?.addEventListener('click', () => {
      qa('[data-copd-check]', root).forEach(box => { box.checked = false; });
      remove(keySet.checks);
      updateChecks(root, id, pc);
    });
    qa('[data-copd-mode]', root).forEach(button => button.addEventListener('click', () => setMode(root, id, button.dataset.copdMode)));
    setMode(root, id, root.dataset.pcMode);
    updateChecks(root, id, pc);
  }

  async function render() {
    scheduled = false;
    const id = routeId();
    const token = ++renderToken;
    if (!id) return;
    const reader = q('#protocolReader:not([hidden])');
    if (!reader || q(`[data-copd-root="${id}"]`, reader)) return;
    const target = q('.protocol-reader-main, .protocol-source-only', reader);
    if (!target) return;
    try {
      const payload = await loadPayload();
      const { entry, documentRecord } = matchedPayload(id, payload);
      if (token !== renderToken || routeId() !== id) return;
      const currentReader = q('#protocolReader:not([hidden])');
      const currentTarget = currentReader && q('.protocol-reader-main, .protocol-source-only', currentReader);
      if (!currentReader || !currentTarget || q(`[data-copd-root="${id}"]`, currentReader)) return;
      currentTarget.outerHTML = mainMarkup(id, entry, documentRecord);
      const root = q(`[data-copd-root="${id}"]`, currentReader);
      const integrity = q('.protocol-reader-integrity', currentReader);
      if (integrity) {
        integrity.classList.add('is-review');
        integrity.innerHTML = '<span class="protocol-integrity-mark" aria-hidden="true"></span><div><strong>Pamje praktike e lidhur me burimin</strong>SHA-256 përputhet me dokumentin aktual. Përmbajtja mbetet në rishikim klinik.</div>';
      }
      if (root) bind(root, id, entry.primaryCare || {});
    } catch (error) {
      const integrity = q('#protocolReader:not([hidden]) .protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-warning');
        const copy = q('div', integrity);
        if (copy) copy.textContent = clean(error?.message) || 'Pamja praktike nuk u ngarkua.';
      }
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => setTimeout(render, 0));
  }

  function init() {
    new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule, { passive:true });
    document.addEventListener('click', event => {
      if (event.target.closest?.('[data-protocol-open], [data-protocol-back]')) schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
