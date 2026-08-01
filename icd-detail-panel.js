(() => {
  'use strict';

  const API = '/api/icd';
  const DIAGNOSIS_KEY = 'medindex_rx_diagnosis_v1';
  let lastFocused = null;
  let activeNode = null;
  let activeController = null;

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));
  const levelLabel = level => ({ chapter:'Kapitull', block:'Bllok', category:'Kategori', subcategory:'Nënkategori' }[level] || level || '—');

  function ensurePanel() {
    let overlay = document.getElementById('detailOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'med-panel-overlay icd-detail-overlay';
    overlay.id = 'detailOverlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<section class="med-panel icd-detail-panel" role="dialog" aria-modal="true" aria-labelledby="detailTitle" aria-describedby="detailBody">
      <header class="med-panel-head"><div><small id="detailKicker">ICD-10-WHO 2019</small><h2 id="detailTitle">Kodi ICD-10</h2></div><button class="med-panel-close" id="detailClose" type="button" aria-label="Mbyll">×</button></header>
      <div class="med-panel-body" id="detailBody"><p>Po ngarkohet…</p></div>
      <footer class="med-panel-foot"><button id="detailDone" type="button">Mbyll</button><button class="icd-use-diagnosis" id="icdUseDiagnosis" type="button">Përdore në recetë</button></footer>
    </section>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function addOpenButtons() {
    document.querySelectorAll('#icdTableBody tr[data-icd-row]').forEach(row => {
      const actions = row.querySelector('.icd-row-actions');
      const code = clean(row.dataset.icdRow);
      if (!actions || !code || actions.querySelector('[data-open-code]')) return;
      const button = document.createElement('button');
      button.className = 'icd-row-action';
      button.type = 'button';
      button.dataset.openCode = code;
      button.textContent = 'Hape kodin';
      actions.prepend(button);
    });
  }

  async function resolveCode(code) {
    activeController?.abort();
    activeController = new AbortController();
    const response = await fetch(`${API}?view=resolve&code=${encodeURIComponent(code)}`, {
      credentials:'same-origin',
      cache:'no-store',
      headers:{ Accept:'application/json' },
      signal:activeController.signal,
    });
    if (!response.ok) throw new Error(`ICD API ${response.status}`);
    const payload = await response.json();
    if (!payload?.ok || !payload?.data?.node) throw new Error('Kodi ICD-10 nuk u gjet.');
    return payload.data;
  }

  function field(label, value, full = false) {
    if (!clean(value)) return '';
    return `<section class="icd-detail-field${full ? ' is-full' : ''}"><strong>${esc(label)}</strong><p>${esc(value)}</p></section>`;
  }

  function renderDetail(data) {
    const node = data.node;
    const ancestors = Array.isArray(data.ancestors) ? data.ancestors : [];
    activeNode = node;
    document.getElementById('detailKicker').textContent = `ICD-10-WHO 2019 · ${node.code}`;
    document.getElementById('detailTitle').textContent = node.albanianDraft || node.englishTitle || node.code;
    const path = [...ancestors, node].map(item => `<span>${esc(item.code)} — ${esc(item.displayTitle)}</span>`).join('');
    const translation = node.translationStatus === 'missing'
      ? 'Përkthimi shqip mungon; po shfaqet titulli zyrtar anglisht.'
      : 'Përkthim automatik në draft; kërkon rishikim terminologjik para shënimit si i verifikuar.';
    document.getElementById('detailBody').innerHTML = `<div class="icd-detail-summary">
      ${field('Kodi ICD-10', node.code)}
      ${field('Niveli', levelLabel(node.level))}
      ${field('Titulli shqip', node.albanianDraft || 'Nuk është përkthyer ende.', true)}
      ${field('Titulli zyrtar anglisht', node.englishTitle, true)}
      ${field('Kapitulli', node.chapter)}
      ${field('Blloku', node.block)}
      ${field('Kodi prind', node.parentCode)}
      ${field('Nënkode direkte', String(Number(node.childCount || 0)))}
      <section class="icd-detail-field is-full"><strong>Hierarkia</strong><div class="icd-detail-path">${path}</div></section>
    </div>
    <p class="icd-detail-warning">${esc(translation)} Zgjedhja e kodit mbetet përgjegjësi klinike e mjekut dhe duhet përdorur niveli më specifik që mbështetet nga dokumentacioni.</p>
    <a class="icd-detail-source" href="${esc(node.sourceUrl)}" target="_blank" rel="noopener noreferrer">Hape te WHO ICD-10 Browser</a>`;
  }

  async function openDetail(code) {
    const overlay = ensurePanel();
    lastFocused = document.activeElement;
    activeNode = null;
    document.getElementById('detailKicker').textContent = `ICD-10-WHO 2019 · ${code}`;
    document.getElementById('detailTitle').textContent = code;
    document.getElementById('detailBody').innerHTML = '<p>Po ngarkohet kodi ICD-10…</p>';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.getElementById('detailClose')?.focus();
    try {
      const data = await resolveCode(code);
      renderDetail(data);
    } catch (error) {
      if (error.name === 'AbortError') return;
      document.getElementById('detailBody').innerHTML = `<p class="icd-error">${esc(error.message || 'Kodi nuk u ngarkua.')}</p>`;
    }
  }

  function closeDetail() {
    const overlay = ensurePanel();
    if (overlay.hidden) return;
    activeController?.abort();
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    activeNode = null;
    lastFocused?.focus?.({ preventScroll:true });
    lastFocused = null;
  }

  function useInPrescription() {
    if (!activeNode) return;
    const diagnosis = `${activeNode.code} — ${activeNode.albanianDraft || activeNode.englishTitle}`;
    try { sessionStorage.setItem(DIAGNOSIS_KEY, diagnosis); }
    catch {}
    location.assign('/recetat.html');
  }

  function focusables(panel) {
    return [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(node => !node.hidden && node.getClientRects().length);
  }

  function bindPanel() {
    const overlay = ensurePanel();
    document.getElementById('detailClose')?.addEventListener('click', closeDetail);
    document.getElementById('detailDone')?.addEventListener('click', closeDetail);
    document.getElementById('icdUseDiagnosis')?.addEventListener('click', useInPrescription);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeDetail(); });
    document.addEventListener('keydown', event => {
      if (overlay.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDetail();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables(overlay);
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function init() {
    const body = document.getElementById('icdTableBody');
    if (!body) return;
    bindPanel();
    addOpenButtons();
    const observer = new MutationObserver(() => requestAnimationFrame(addOpenButtons));
    observer.observe(body, { childList:true, subtree:true });
    body.addEventListener('click', event => {
      const button = event.target.closest('[data-open-code]');
      if (button) openDetail(button.dataset.openCode);
    });
    window.addEventListener('pageshow', addOpenButtons, { passive:true });
    window.dispatchEvent(new CustomEvent('medindex:icd-detail-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
