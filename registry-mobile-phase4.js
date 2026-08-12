(() => {
  'use strict';

  const VERSION = 'registry-mobile-phase4-v1';
  const MOBILE_QUERY = '(max-width: 767px)';
  const ENDPOINT = '/api/dosage';
  const CACHE_LIMIT = 12;
  const media = window.matchMedia?.(MOBILE_QUERY);
  if (!media?.matches) return;

  const root = document.documentElement;
  const cache = new Map();
  let controller = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));
  const safeUrl = value => {
    const text = clean(value);
    if (!/^https:\/\/[^\s]+$/i.test(text)) return '';
    try { return new URL(text).href; } catch { return ''; }
  };

  function remember(id, payload) {
    if (cache.has(id)) cache.delete(id);
    cache.set(id, payload);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }

  function hostLabel(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return 'Burim zyrtar'; }
  }

  function textSection(title, value, extraClass = '') {
    const text = clean(value);
    if (!text) return '';
    return `<section class="mi-phase4-section ${extraClass}"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p></section>`;
  }

  function doseSection(title, regimen, key) {
    const dose = clean(regimen?.dose);
    if (!dose) return '';
    const metadata = [
      clean(regimen.route) ? `Rruga: ${clean(regimen.route)}` : '',
      clean(regimen.frequency) ? `Shpeshtësia: ${clean(regimen.frequency)}` : '',
      clean(regimen.duration) ? `Kohëzgjatja: ${clean(regimen.duration)}` : '',
      clean(regimen.maximum) ? `Maksimumi: ${clean(regimen.maximum)}` : '',
    ].filter(Boolean);
    return `<section class="mi-phase4-section mi-phase4-dose" data-mi-phase4-dose="${key}">
      <div class="mi-phase4-section-head"><h4>${escapeHtml(title)}</h4>${clean(regimen.route) ? `<span>${escapeHtml(regimen.route)}</span>` : ''}</div>
      <p class="mi-phase4-dose-text">${escapeHtml(dose)}</p>
      ${metadata.length ? `<p class="mi-phase4-dose-meta">${metadata.map(escapeHtml).join(' · ')}</p>` : ''}
      ${clean(regimen.indication) ? `<p class="mi-phase4-indication-note"><strong>Indikacioni:</strong> ${escapeHtml(regimen.indication)}</p>` : ''}
    </section>`;
  }

  function uniqueText(values) {
    return [...new Set(values.map(clean).filter(Boolean))].join(' · ');
  }

  function dosageAvailability(payload) {
    const adult = Boolean(clean(payload?.adult?.dose));
    const pediatric = Boolean(clean(payload?.pediatric?.dose));
    if (adult && pediatric) return 'Të rritur + pediatrik';
    if (adult) return 'Vetëm të rritur';
    if (pediatric) return 'Vetëm pediatrik';
    return 'Pa dozë të strukturuar';
  }

  function sourceSection(sources) {
    const urls = (Array.isArray(sources) ? sources : []).map(safeUrl).filter(Boolean);
    if (!urls.length) return '';
    return `<section class="mi-phase4-section mi-phase4-sources"><h4>Burimet</h4><div class="mi-phase4-source-list">${urls.map((url, index) =>
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(hostLabel(url))}${urls.length > 1 ? ` · ${index + 1}` : ''}</a>`
    ).join('')}</div></section>`;
  }

  function renderClinical(payload) {
    const profile = payload?.profile || {};
    const warnings = uniqueText([profile.warnings, payload?.adult?.warnings, payload?.pediatric?.warnings]);
    const indications = clean(profile.indications) || uniqueText([payload?.adult?.indication, payload?.pediatric?.indication]);
    const reviewed = profile.reviewedAt || payload?.adult?.reviewedAt || payload?.pediatric?.reviewedAt || '';
    const verified = clean(profile.verificationStatus).toLowerCase() === 'verified';

    return `
      <div class="mi-phase4-clinical-head">
        <div><span class="mi-phase4-eyebrow">KARTELA KLINIKE</span><h3>Të dhënat klinike</h3></div>
        ${verified ? '<span class="mi-phase4-verified">✓ Verifikuar</span>' : ''}
      </div>
      <div class="mi-phase4-population"><span>Dozim i regjistruar</span><strong>${escapeHtml(dosageAvailability(payload))}</strong></div>
      ${textSection('Përmbledhje', profile.summary)}
      ${textSection('Indikacionet', indications)}
      ${doseSection('Dozimi për të rritur', payload?.adult, 'adult')}
      ${doseSection('Dozimi për fëmijë', payload?.pediatric, 'pediatric')}
      ${textSection('Kundërindikacionet', profile.contraindications, 'mi-phase4-safety')}
      ${textSection('Paralajmërimet', warnings, 'mi-phase4-safety')}
      ${textSection('Ndërveprimet', profile.interactions, 'mi-phase4-safety')}
      ${textSection('Shtatzënia dhe gjidhënia', profile.pregnancyLactation)}
      ${textSection('Përshtatja renale', profile.renalAdjustment)}
      ${textSection('Përshtatja hepatike', profile.hepaticAdjustment)}
      ${textSection('Monitorimi', profile.monitoring)}
      ${textSection('Administrimi', profile.administrationNotes)}
      ${sourceSection(payload?.sources)}
      ${reviewed ? `<p class="mi-phase4-reviewed">Rishikuar: ${escapeHtml(new Date(reviewed).toLocaleDateString('sq-AL'))}</p>` : ''}`;
  }

  function detailBody() {
    return document.querySelector('#mobileLiteDrugDetail [data-mobile-lite-detail-body]');
  }

  function ensurePanel() {
    const body = detailBody();
    if (!body) return null;
    body.querySelector('[data-mi-phase4-clinical]')?.remove();
    const panel = document.createElement('section');
    panel.className = 'mi-phase4-clinical';
    panel.dataset.miPhase4Clinical = VERSION;
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = '<div class="mi-phase4-loading"><span></span><span></span><span></span></div>';
    const fullAction = body.querySelector('[data-mobile-lite-full]');
    if (fullAction) fullAction.before(panel);
    else body.appendChild(panel);
    return panel;
  }

  function renderError(panel, message) {
    if (!panel?.isConnected) return;
    panel.innerHTML = `<div class="mi-phase4-unavailable"><strong>Detajet klinike nuk u ngarkuan.</strong><span>${escapeHtml(message || 'Provo përsëri.')}</span></div>`;
  }

  async function fetchClinical(id, signal) {
    if (cache.has(id)) return cache.get(id);
    const params = new URLSearchParams({ view:'card', id });
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      credentials:'same-origin',
      cache:'no-store',
      signal,
      headers:{ Accept:'application/json' },
    });
    if (response.status === 401) throw new Error('Sesioni ka skaduar.');
    if (!response.ok) throw new Error(`Serveri ktheu ${response.status}.`);
    const payload = await response.json();
    if (!payload?.ok || payload.drugId !== id) throw new Error('Kartela klinike është e pavlefshme.');
    remember(id, payload);
    return payload;
  }

  async function onDetailOpened(event) {
    const id = clean(event.detail?.id);
    if (!id || !window.MEDINDEX_MOBILE_LITE_ACTIVE) return;
    const panel = ensurePanel();
    if (!panel) return;
    controller?.abort();
    controller = new AbortController();
    root.dataset.registryMobilePhase4State = 'loading';
    try {
      const payload = await fetchClinical(id, controller.signal);
      if (!panel.isConnected) return;
      panel.innerHTML = renderClinical(payload);
      root.dataset.registryMobilePhase4State = 'ready';
      window.dispatchEvent(new CustomEvent('medindex:mobile-phase4-ready', {
        detail:{ id, hasAdult:Boolean(payload.adult?.dose), hasPediatric:Boolean(payload.pediatric?.dose), source:'neon' }
      }));
    } catch (error) {
      if (error?.name === 'AbortError') return;
      root.dataset.registryMobilePhase4State = 'error';
      renderError(panel, error?.message);
    }
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-mobile-lite-close]')) return;
    controller?.abort();
  }, true);
  window.addEventListener('medindex:mobile-lite-detail-opened', onDetailOpened);

  root.dataset.registryMobilePhase4 = VERSION;
  window.MEDINDEX_MOBILE_PHASE4 = Object.freeze({
    version:VERSION,
    clearCache:() => cache.clear(),
    cacheSize:() => cache.size,
  });
})();