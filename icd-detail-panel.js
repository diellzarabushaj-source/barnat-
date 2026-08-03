(() => {
  'use strict';

  const API = '/api/icd';
  const DIAGNOSIS_CONTEXT_KEY = 'medindex_rx_diagnosis_context_v2';
  const CONTEXT_VERSION = 2;
  const DETAIL_VERSION = 'clinical-detail-v3';
  const PRESCRIBABLE_LEVELS = new Set(['category', 'subcategory']);
  let lastFocused = null;
  let activeNode = null;
  let activeController = null;
  let panelBound = false;

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));
  const levelLabel = level => ({ chapter:'Kapitull', block:'Bllok', category:'Kategori', subcategory:'Nënkategori' }[level] || level || '—');
  const canUseAsDiagnosis = node => PRESCRIBABLE_LEVELS.has(clean(node?.level));

  function ensureWorkflowStyles() {
    if (document.getElementById('miIcdDetailWorkflowCss')) return;
    const link = document.createElement('link');
    link.id = 'miIcdDetailWorkflowCss';
    link.rel = 'stylesheet';
    link.href = `/icd-detail-workflow.css?v=${DETAIL_VERSION}`;
    document.head.appendChild(link);
  }

  function ensurePanel() {
    let overlay = document.getElementById('detailOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'med-panel-overlay icd-detail-overlay';
    overlay.id = 'detailOverlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<section class="med-panel icd-detail-panel" role="dialog" aria-modal="true" aria-labelledby="detailTitle" aria-describedby="detailBody">
      <header class="med-panel-head">
        <div>
          <small id="detailKicker">ICD-10-WHO 2019</small>
          <h2 id="detailTitle">Kodi ICD-10</h2>
          <div class="icd-detail-head-meta" aria-label="Statusi i kodit">
            <span class="icd-detail-badge" id="detailLevelBadge">—</span>
            <span class="icd-detail-badge" id="detailTranslationBadge">—</span>
            <span class="icd-detail-badge icd-detail-clinical-badge" id="detailClinicalBadge" hidden></span>
          </div>
        </div>
        <button class="med-panel-close" id="detailClose" type="button" aria-label="Mbyll">×</button>
      </header>
      <div class="med-panel-body" id="detailBody"><p>Po ngarkohet…</p></div>
      <footer class="med-panel-foot">
        <p class="icd-detail-action-status" id="detailActionStatus" role="status" aria-live="polite"></p>
        <div class="icd-detail-actions">
          <button id="detailDone" type="button">Mbyll</button>
          <button class="icd-copy-code" id="icdCopyCode" type="button" hidden>Kopjo kodin</button>
          <button class="icd-use-diagnosis" id="icdUseDiagnosis" type="button" hidden>Përdore në recetë</button>
        </div>
      </footer>
    </section>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(clean(value), location.origin);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  async function resolveCode(code) {
    activeController?.abort();
    activeController = new AbortController();
    const response = await fetch(`${API}?view=resolve&code=${encodeURIComponent(code)}`, {
      credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' }, signal:activeController.signal,
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

  function translationLabel(status) {
    return ({
      verified:'Term i verifikuar',
      standardized:'Term i standardizuar',
      machine:'Draft automatik',
      missing:'Pa përkthim shqip',
    })[clean(status)] || 'Status i papërcaktuar';
  }

  function translationClass(status) {
    if (status === 'verified') return 'is-verified';
    if (status === 'standardized') return 'is-standardized';
    if (status === 'missing') return 'is-missing';
    return 'is-machine';
  }

  function clinicalPresentation(node) {
    const role = clean(node?.primaryCareRole || node?.role);
    const management = clean(node?.managementSummary || node?.management);
    const contractLevel = clean(node?.urgencyLevel || node?.clinicalPriority).toLowerCase();
    const normalizedRole = role.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let level = contractLevel === 'emergency' ? 'direct' : contractLevel === 'primary-care' ? 'family-medicine' : contractLevel;
    if (!['direct', 'urgent', 'family-medicine'].includes(level)) {
      if (node?.isDirectUrgency || normalizedRole === 'urgjence ne mf') level = 'direct';
      else if (node?.isUrgent || normalizedRole.includes('urgjenc')) level = 'urgent';
      else if (normalizedRole.startsWith('mf')) level = 'family-medicine';
      else level = '';
    }
    const label = level === 'direct' ? 'Urgjencë në MF' : level === 'urgent' ? 'Urgjencë' : level === 'family-medicine' ? 'Menaxhim në MF' : '';
    return { role, management, level, label };
  }

  function translationNote(node) {
    if (node.translationStatus === 'verified') return 'Termi shqip është shënuar si i verifikuar në burimin editorial.';
    if (node.translationStatus === 'standardized') return 'Termi shqip është standardizuar editorialisht, por nuk është shënuar si verifikim profesional përfundimtar.';
    if (node.translationStatus === 'missing') return 'Përkthimi shqip mungon; po shfaqet titulli zyrtar anglisht.';
    return 'Përkthimi shqip është draft automatik dhe kërkon rishikim terminologjik.';
  }

  function codingNote(node) {
    return canUseAsDiagnosis(node)
      ? 'Zgjedhja e kodit mbetet përgjegjësi klinike e mjekut dhe duhet përdorur niveli më specifik që mbështetet nga dokumentacioni.'
      : 'Ky nivel përdoret vetëm për navigim në hierarki. Për recetë duhet zgjedhur një kategori ose nënkategori diagnostike.';
  }

  function specificityNote(node) {
    const count = Number(node?.childCount || 0);
    if (!canUseAsDiagnosis(node)) {
      return '<div class="icd-detail-specificity"><span class="icd-detail-specificity-icon" aria-hidden="true">ℹ</span><div><strong>Nivel navigues</strong><span>Zgjidh një kategori ose nënkategori para transferimit në recetë.</span></div></div>';
    }
    if (count > 0) {
      return `<div class="icd-detail-specificity"><span class="icd-detail-specificity-icon" aria-hidden="true">↳</span><div><strong>Ka ${count} nënkode direkte</strong><span>Përdore këtë kategori vetëm kur dokumentacioni nuk mbështet një nënkod më specifik.</span></div></div>`;
    }
    return '<div class="icd-detail-specificity"><span class="icd-detail-specificity-icon" aria-hidden="true">✓</span><div><strong>Niveli më specifik i disponueshëm</strong><span>Ky kod nuk ka nënkode direkte në dataset-in aktual.</span></div></div>';
  }

  function diagnosisContext(node) {
    const titleSq = clean(node?.albanianDraft);
    const titleEn = clean(node?.englishTitle);
    return {
      version:CONTEXT_VERSION,
      system:'ICD-10-WHO 2019',
      source:'medindex-icd-browser',
      code:clean(node?.code).slice(0, 24),
      level:clean(node?.level).slice(0, 24),
      titleSq:titleSq.slice(0, 500),
      titleEn:titleEn.slice(0, 500),
      display:`${clean(node?.code)} — ${titleSq || titleEn || clean(node?.code)}`.slice(0, 1000),
      translationStatus:clean(node?.translationStatus).slice(0, 40),
      sourceUrl:safeHttpsUrl(node?.sourceUrl),
      childCount:Math.max(0, Number(node?.childCount || 0)),
      selectedAt:Date.now(),
    };
  }

  function renderDetail(data) {
    const node = data.node;
    const ancestors = Array.isArray(data.ancestors) ? data.ancestors : [];
    activeNode = node;
    const useButton = document.getElementById('icdUseDiagnosis');
    const copyButton = document.getElementById('icdCopyCode');
    useButton.hidden = !canUseAsDiagnosis(node);
    copyButton.hidden = false;
    useButton.textContent = 'Përdore në recetë';
    document.getElementById('detailActionStatus').textContent = '';
    document.getElementById('detailKicker').textContent = `ICD-10-WHO 2019 · ${node.code}`;
    document.getElementById('detailTitle').textContent = node.albanianDraft || node.englishTitle || node.code;
    document.getElementById('detailLevelBadge').textContent = levelLabel(node.level);
    const translationBadge = document.getElementById('detailTranslationBadge');
    translationBadge.textContent = translationLabel(node.translationStatus);
    translationBadge.className = `icd-detail-badge ${translationClass(node.translationStatus)}`;
    const clinical = clinicalPresentation(node);
    const clinicalBadge = document.getElementById('detailClinicalBadge');
    clinicalBadge.hidden = !clinical.level;
    clinicalBadge.textContent = clinical.label;
    clinicalBadge.dataset.urgencyLevel = clinical.level;
    const path = [...ancestors, node].map(item => `<span>${esc(item.code)} — ${esc(item.displayTitle)}</span>`).join('');
    const sourceUrl = safeHttpsUrl(node.sourceUrl);
    document.getElementById('detailBody').innerHTML = `<div class="icd-detail-summary">
      ${field('Kodi ICD-10', node.code)}
      ${field('Niveli', levelLabel(node.level))}
      ${field('Titulli shqip', node.albanianDraft || 'Nuk është përkthyer ende.', true)}
      ${field('Titulli zyrtar anglisht', node.englishTitle, true)}
      ${field('Kapitulli', node.chapter)}
      ${field('Blloku', node.block)}
      ${field('Kodi prind', node.parentCode)}
      ${field('Nënkode direkte', String(Number(node.childCount || 0)))}
      ${field('Roli në mjekësinë familjare', clinical.role, true)}
      ${field('Menaxhimi i rekomanduar', clinical.management, true)}
      <section class="icd-detail-field is-full"><strong>Hierarkia</strong><div class="icd-detail-path">${path}</div></section>
    </div>
    ${specificityNote(node)}
    <p class="icd-detail-warning">${esc(translationNote(node))} ${esc(codingNote(node))}</p>
    ${sourceUrl ? `<a class="icd-detail-source" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Hape te WHO ICD-10 Browser</a>` : ''}`;
  }

  async function openDetail(code) {
    const key = clean(code);
    if (!key) return;
    const overlay = ensurePanel();
    lastFocused = document.activeElement;
    activeNode = null;
    document.getElementById('icdUseDiagnosis').hidden = true;
    document.getElementById('icdCopyCode').hidden = true;
    document.getElementById('detailActionStatus').textContent = '';
    document.getElementById('detailKicker').textContent = `ICD-10-WHO 2019 · ${key}`;
    document.getElementById('detailTitle').textContent = key;
    document.getElementById('detailLevelBadge').textContent = 'Duke u ngarkuar';
    const translationBadge = document.getElementById('detailTranslationBadge');
    translationBadge.textContent = '—';
    translationBadge.className = 'icd-detail-badge';
    const clinicalBadge = document.getElementById('detailClinicalBadge');
    clinicalBadge.hidden = true;
    clinicalBadge.removeAttribute('data-urgency-level');
    document.getElementById('detailBody').innerHTML = '<p>Po ngarkohet kodi ICD-10…</p>';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.getElementById('detailClose')?.focus();
    try { renderDetail(await resolveCode(key)); }
    catch (error) {
      if (error.name === 'AbortError') return;
      document.getElementById('detailBody').innerHTML = `<p class="icd-error">${esc(error.message || 'Kodi nuk u ngarkua.')}</p>`;
      document.getElementById('detailLevelBadge').textContent = 'Gabim';
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

  async function copyCode() {
    if (!activeNode) return;
    const value = `${activeNode.code} — ${activeNode.albanianDraft || activeNode.englishTitle || ''}`.trim();
    try { await navigator.clipboard.writeText(value); }
    catch {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    document.getElementById('detailActionStatus').textContent = 'Kodi dhe titulli u kopjuan.';
  }

  function useInPrescription() {
    if (!activeNode || !canUseAsDiagnosis(activeNode)) return;
    const context = diagnosisContext(activeNode);
    try { sessionStorage.setItem(DIAGNOSIS_CONTEXT_KEY, JSON.stringify(context)); } catch {}
    document.getElementById('detailActionStatus').textContent = 'Kodi u përgatit për recetë.';
    location.assign('/recetat.html?from=icd');
  }

  function focusables(panel) {
    return [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(node => !node.hidden && node.getClientRects().length);
  }

  function bindPanel() {
    if (panelBound) return;
    panelBound = true;
    const overlay = ensurePanel();
    document.getElementById('detailClose')?.addEventListener('click', closeDetail);
    document.getElementById('detailDone')?.addEventListener('click', closeDetail);
    document.getElementById('icdCopyCode')?.addEventListener('click', copyCode);
    document.getElementById('icdUseDiagnosis')?.addEventListener('click', useInPrescription);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeDetail(); });
    document.addEventListener('keydown', event => {
      if (overlay.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDetail(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables(overlay);
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  function init() {
    if (!document.getElementById('icdTree')) return;
    ensureWorkflowStyles();
    bindPanel();
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-open-code]');
      if (button) openDetail(button.dataset.openCode);
    });
    window.addEventListener('medindex:icd-open-detail', event => openDetail(event.detail?.code));
    window.MedIndexIcdDetail = Object.freeze({ open:openDetail, close:closeDetail, canUseAsDiagnosis, diagnosisContext });
    document.documentElement.dataset.miIcdDetail = DETAIL_VERSION;
    window.dispatchEvent(new CustomEvent('medindex:icd-detail-ready', { detail:{ version:DETAIL_VERSION } }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
