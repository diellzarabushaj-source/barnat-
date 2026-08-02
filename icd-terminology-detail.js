(() => {
  'use strict';

  const VERSION = 'icd-terminology-detail-v1';
  const API_PATH = '/api/icd';
  const CONTEXT_KEY = 'medindex_rx_diagnosis_context_v2';
  const STATUS = Object.freeze({
    verified:{
      label:'Term i verifikuar',
      tone:'verified',
      title:'Verifikim profesional i regjistruar',
      note:'Termi shqip është shënuar si i verifikuar në burimin editorial.',
      review:'I verifikuar',
    },
    standardized:{
      label:'Term i standardizuar',
      tone:'standardized',
      title:'Standardizim editorial',
      note:'Termi është standardizuar editorialisht, por kjo nuk përbën verifikim profesional përfundimtar.',
      review:'Rishikim editorial',
    },
    'machine-draft':{
      label:'Draft automatik',
      tone:'machine',
      title:'Kërkon rishikim terminologjik',
      note:'Titulli shqip është draft automatik. Krahasoje me titullin zyrtar anglisht para përdorimit klinik.',
      review:'Në pritje të rishikimit',
    },
    machine:{
      label:'Draft automatik',
      tone:'machine',
      title:'Kërkon rishikim terminologjik',
      note:'Titulli shqip është draft automatik. Krahasoje me titullin zyrtar anglisht para përdorimit klinik.',
      review:'Në pritje të rishikimit',
    },
    missing:{
      label:'Vetëm anglisht',
      tone:'missing',
      title:'Përkthimi shqip mungon',
      note:'Për këtë kod po përdoret titulli zyrtar anglisht. Mos e trajto si përkthim të verifikuar shqip.',
      review:'Pa përkthim shqip',
    },
  });

  const originalFetch = window.fetch.bind(window);
  let activeDetail = null;
  let observer = null;
  let scheduled = 0;
  let controlsBound = false;

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function statusInfo(value) {
    return STATUS[clean(value).toLowerCase()] || {
      label:'Status i papërcaktuar',
      tone:'unknown',
      title:'Status terminologjik i papërcaktuar',
      note:'Kontrollo titullin zyrtar anglisht dhe burimin WHO para përdorimit.',
      review:'I papërcaktuar',
    };
  }

  function resolveRoute(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input?.url, location.origin);
      return url.origin === location.origin
        && url.pathname === API_PATH
        && clean(url.searchParams.get('view')).toLowerCase() === 'resolve';
    } catch {
      return false;
    }
  }

  function scheduleEnhancement() {
    clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      scheduled = 0;
      enhancePanel();
    }, 0);
  }

  window.fetch = async function medIndexTerminologyDetailFetch(input, init) {
    const isResolve = resolveRoute(input);
    const response = await originalFetch(input, init);
    if (isResolve && response.ok) {
      response.clone().json().then(payload => {
        if (!payload?.ok || !payload?.data?.node) return;
        activeDetail = payload.data;
        scheduleEnhancement();
      }).catch(() => {});
    }
    return response;
  };

  function terminologyVersion(data) {
    return clean(data?.node?.terminologyVersion)
      || clean(data?.meta?.quality?.terminologyVersion)
      || 'Pa version editorial';
  }

  function sourceLabel(data) {
    const source = data?.meta?.source || {};
    const type = clean(source.type) === 'google-sheet' ? 'Google Sheet publik' : 'Dataset ICD-10';
    const state = clean(source.status).toLowerCase();
    if (state === 'stale') return `${type} · cache i fundit`;
    if (state === 'live') return `${type} · live`;
    return type;
  }

  function trustMarkup(data) {
    const node = data.node;
    const info = statusInfo(node.translationStatus);
    const professional = clean(node.translationStatus).toLowerCase() === 'verified';
    return `<section class="icd-terminology-trust is-${esc(info.tone)}" data-terminology-status="${esc(clean(node.translationStatus))}" aria-labelledby="icdTerminologyTrustTitle">
      <div class="icd-terminology-trust-head">
        <span class="icd-terminology-trust-icon" aria-hidden="true">${professional ? '✓' : 'i'}</span>
        <div>
          <strong id="icdTerminologyTrustTitle">${esc(info.title)}</strong>
          <p>${esc(info.note)}</p>
        </div>
      </div>
      <dl class="icd-terminology-trust-grid">
        <div><dt>Statusi i termit</dt><dd>${esc(info.label)}</dd></div>
        <div><dt>Rishikimi</dt><dd>${esc(clean(node.reviewState) || info.review)}</dd></div>
        <div><dt>Versioni</dt><dd>${esc(terminologyVersion(data))}</dd></div>
        <div><dt>Burimi i dataset-it</dt><dd>${esc(sourceLabel(data))}</dd></div>
      </dl>
      <p class="icd-terminology-clinical-note">Kodi ICD-10 është referenca kryesore. Titulli shqip ndihmon leximin, por përzgjedhja dhe dokumentimi mbeten vendim klinik.</p>
    </section>`;
  }

  function detailCodeMatches(node) {
    const kicker = clean(document.getElementById('detailKicker')?.textContent);
    return Boolean(node?.code && kicker.includes(clean(node.code)));
  }

  function enhancePanel() {
    const data = activeDetail;
    const node = data?.node;
    const body = document.getElementById('detailBody');
    const summary = body?.querySelector('.icd-detail-summary');
    if (!node || !summary || !detailCodeMatches(node)) return;

    const info = statusInfo(node.translationStatus);
    const badge = document.getElementById('detailTranslationBadge');
    if (badge) {
      badge.textContent = info.label;
      badge.className = `icd-detail-badge is-${info.tone}`;
    }

    body.querySelector('.icd-terminology-trust')?.remove();
    summary.insertAdjacentHTML('afterend', trustMarkup(data));
    body.dataset.terminologyEnhancedCode = clean(node.code);
    body.dataset.terminologyStatus = clean(node.translationStatus);

    const panel = document.querySelector('#detailOverlay .icd-detail-panel');
    if (panel) panel.dataset.terminologyStatus = clean(node.translationStatus);

    const copy = document.getElementById('icdCopyCode');
    if (copy) copy.textContent = 'Kopjo kodin + titujt';
  }

  function copyText(data) {
    const node = data?.node || {};
    const info = statusInfo(node.translationStatus);
    return [
      'ICD-10-WHO 2019',
      `Kodi: ${clean(node.code)}`,
      `Shqip: ${clean(node.albanianDraft) || '—'}`,
      `English: ${clean(node.englishTitle) || '—'}`,
      `Statusi i termit: ${info.label}`,
    ].join('\n');
  }

  async function writeClipboard(value) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {}
    const area = document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }

  async function copyTerminology(event) {
    if (!activeDetail?.node || event.currentTarget.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await writeClipboard(copyText(activeDetail));
    const status = document.getElementById('detailActionStatus');
    if (status) status.textContent = 'Kodi dhe titujt shqip/anglisht u kopjuan.';
  }

  function enrichPrescriptionContext() {
    const node = activeDetail?.node;
    if (!node) return;
    try {
      const context = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || 'null');
      if (!context || clean(context.code) !== clean(node.code)) return;
      const status = clean(node.translationStatus).toLowerCase();
      context.terminology = {
        version:terminologyVersion(activeDetail),
        status,
        reviewState:clean(node.reviewState) || statusInfo(status).review,
        professionalVerification:status === 'verified',
        requiresTerminologyReview:['machine-draft', 'machine', 'missing'].includes(status),
        officialTitleEn:clean(node.englishTitle),
        sourceState:clean(activeDetail?.meta?.source?.status) || 'unknown',
      };
      sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
    } catch {}
  }

  function bindControls() {
    if (controlsBound) return;
    const copy = document.getElementById('icdCopyCode');
    const use = document.getElementById('icdUseDiagnosis');
    if (!copy || !use) return;
    controlsBound = true;
    copy.addEventListener('click', copyTerminology, true);
    use.addEventListener('click', enrichPrescriptionContext);
  }

  function installObserver() {
    const body = document.getElementById('detailBody');
    if (!body || observer) return;
    observer = new MutationObserver(scheduleEnhancement);
    observer.observe(body, { childList:true, subtree:false });
  }

  function init() {
    bindControls();
    installObserver();
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-open-code]')) return;
      activeDetail = null;
      document.querySelector('.icd-terminology-trust')?.remove();
    }, true);
    document.documentElement.dataset.miIcdTerminologyDetail = VERSION;
    window.dispatchEvent(new CustomEvent('medindex:icd-terminology-detail-ready', {
      detail:{ version:VERSION },
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
