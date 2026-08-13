(() => {
  'use strict';

  const VERSION = 'registry-dose-safety-v1.2.0';
  const ENDPOINT = '/api/dosage?view=safety';
  const MAX_VISIBLE_ITEMS = 4;
  const AGE_ADULT_MONTHS = 18 * 12;
  const PRIORITY = Object.freeze({ block:0, manual_review:1, caution:2, info:3 });

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const num = value => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const within = (value, minimum, maximum) => {
    if (value === null) return minimum === null && maximum === null;
    if (minimum !== null && value < minimum) return false;
    if (maximum !== null && value > maximum) return false;
    return true;
  };

  let catalog = { status:'loading', byProduct:new Map(), errorMessage:'' };
  let activeProductKey = '';
  let observer = null;
  let internalMutation = false;

  function ensureStyles() {
    if (document.getElementById('doseSafetyLayerStyles')) return;
    const style = document.createElement('style');
    style.id = 'doseSafetyLayerStyles';
    style.textContent = `
      .dose-safety-panel{margin:12px 0 2px;border:1px solid rgba(15,23,42,.10);border-radius:14px;background:linear-gradient(180deg,#fff,#fbfcfc);overflow:hidden}
      .dose-safety-panel[hidden]{display:none!important}
      .dose-safety-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(15,23,42,.07)}
      .dose-safety-title{display:flex;align-items:center;gap:8px;min-width:0;font-size:.78rem;font-weight:850;color:#172b2e}
      .dose-safety-title i{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:rgba(13,95,99,.09);color:#0d5f63;font-style:normal;font-size:.72rem}
      .dose-safety-status{font-size:.67rem;font-weight:850;color:#667085;white-space:nowrap}
      .dose-safety-items{display:grid;gap:0;padding:2px 10px 5px}
      .dose-safety-item{display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:start;padding:8px 2px;border-bottom:1px solid rgba(15,23,42,.055);cursor:pointer}
      .dose-safety-item:last-child{border-bottom:0}
      .dose-safety-item input{width:17px;height:17px;margin:1px 0 0;accent-color:#0d5f63}
      .dose-safety-copy{display:grid;gap:2px;min-width:0}
      .dose-safety-copy strong{font-size:.74rem;line-height:1.25;color:#263638}
      .dose-safety-copy small{font-size:.66rem;line-height:1.35;color:#667085}
      .dose-safety-more{margin:0 10px 9px;border:0;background:transparent;color:#0d5f63;font:inherit;font-size:.68rem;font-weight:800;cursor:pointer;padding:2px}
      .dose-safety-gate{margin:10px 0 0;border-radius:12px;padding:10px 12px;display:grid;gap:4px}
      .dose-safety-gate[hidden]{display:none!important}
      .dose-safety-gate strong{font-size:.77rem}.dose-safety-gate span{font-size:.69rem;line-height:1.38}
      .dose-safety-gate.is-block{border:1px solid rgba(180,35,24,.24);background:rgba(180,35,24,.07);color:#8f1d15}
      .dose-safety-gate.is-manual_review{border:1px solid rgba(181,71,8,.24);background:rgba(181,71,8,.07);color:#8b3a09}
      .dose-safety-gate.is-caution{border:1px solid rgba(180,120,0,.22);background:rgba(245,158,11,.08);color:#7a4d00}
      .dose-safety-source{display:inline-flex;margin-top:3px;color:inherit;font-size:.64rem;font-weight:750;text-decoration:underline;text-underline-offset:2px}
      .dose-calculator-result[data-safety-suppressed="true"]{display:none!important}
      [data-theme="dark"] .dose-safety-panel{border-color:rgba(255,255,255,.12);background:linear-gradient(180deg,#1f3033,#1b292c)}
      [data-theme="dark"] .dose-safety-head,[data-theme="dark"] .dose-safety-item{border-color:rgba(255,255,255,.08)}
      [data-theme="dark"] .dose-safety-title,[data-theme="dark"] .dose-safety-copy strong{color:#edf4f4}
      [data-theme="dark"] .dose-safety-copy small,[data-theme="dark"] .dose-safety-status{color:#aab9bb}
      @media(max-width:760px){.dose-safety-panel{margin-top:10px}.dose-safety-item{padding:9px 2px}.dose-safety-copy strong{font-size:.77rem}.dose-safety-copy small{font-size:.68rem}}
      @media(prefers-reduced-motion:reduce){.dose-safety-panel *{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  async function loadCatalog() {
    catalog = { status:'loading', byProduct:new Map(), errorMessage:'' };
    refresh();
    try {
      const response = await fetch(ENDPOINT, { cache:'no-store', credentials:'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.meta?.officialVerifiedOnly
        || !payload?.meta?.failClosed
        || !payload?.meta?.publishedOnly
        || !payload?.meta?.coverageRequired
        || !Array.isArray(payload.catalog)) throw new Error('Kontratë safety e pavlefshme.');
      const byProduct = new Map();
      payload.catalog.forEach(entry => {
        if (!entry?.productKey || !Array.isArray(entry.safety)) return;
        byProduct.set(clean(entry.productKey), {
          productKey:clean(entry.productKey),
          coverageVerified:entry.coverageVerified === true,
          coverageReason:clean(entry.coverageReason),
          requiresManualGate:entry.requiresManualGate === true,
          safety:entry.safety,
        });
      });
      catalog = { status:'ready', byProduct, errorMessage:'' };
    } catch (error) {
      console.error('Dose safety layer:', error);
      catalog = { status:'error', byProduct:new Map(), errorMessage:'Kontrolli i sigurisë nuk është i disponueshëm. Verifiko manualisht para përdorimit të dozës.' };
    }
    refresh();
  }

  function modalRoot() { return document.getElementById('doseCalculatorModal'); }
  function modalOpen() { const root = modalRoot(); return Boolean(root && !root.hidden); }
  function ageMonths() {
    const root = modalRoot();
    if (!root) return null;
    const value = num(root.querySelector('[data-dose-age]')?.value);
    if (value === null || value < 0) return null;
    return root.querySelector('[data-dose-age-unit]')?.value === 'months' ? value : value * 12;
  }
  function indicationKey() { return clean(modalRoot()?.querySelector('[data-dose-indication]')?.value); }
  function patientGroupMatches(item, age) {
    const group = clean(item.patientGroup);
    if (!group || group === 'pediatric_and_adult' || age === null) return true;
    if (group === 'pediatric_only') return age < AGE_ADULT_MONTHS;
    if (group === 'adult_only') return age >= AGE_ADULT_MONTHS;
    return true;
  }
  function productEntry(productKey = activeProductKey) {
    if (!productKey || catalog.status !== 'ready') return null;
    return catalog.byProduct.get(clean(productKey)) || null;
  }
  function coverageVerified(productKey = activeProductKey) {
    return productEntry(productKey)?.coverageVerified === true;
  }
  function applicableItems() {
    const entry = productEntry();
    if (!entry) return [];
    const age = ageMonths();
    const indication = indicationKey();
    return entry.safety
      .filter(item => !clean(item.indicationKey) || clean(item.indicationKey) === indication)
      .filter(item => within(age, num(item.minAgeMonths), num(item.maxAgeMonths)))
      .filter(item => patientGroupMatches(item, age))
      .sort((a, b) => (PRIORITY[clean(a.severity)] ?? 9) - (PRIORITY[clean(b.severity)] ?? 9)
        || clean(a.promptLabel).localeCompare(clean(b.promptLabel), 'sq'));
  }

  function ensurePanel() {
    const root = modalRoot();
    if (!root) return null;
    let panel = root.querySelector('[data-dose-safety-panel]');
    if (panel) return panel;
    const result = root.querySelector('[data-dose-result]');
    if (!result) return null;
    panel = document.createElement('section');
    panel.className = 'dose-safety-panel';
    panel.dataset.doseSafetyPanel = 'true';
    panel.innerHTML = `<div class="dose-safety-head"><div class="dose-safety-title"><i>✓</i><span>Kontroll i shpejtë i sigurisë</span></div><span class="dose-safety-status" data-dose-safety-status>Po ngarkohet…</span></div><div class="dose-safety-items" data-dose-safety-items></div><button type="button" class="dose-safety-more" data-dose-safety-more hidden>Shfaq të gjitha</button><div class="dose-safety-gate" data-dose-safety-gate hidden aria-live="assertive"></div>`;
    result.parentNode.insertBefore(panel, result);
    panel.addEventListener('change', event => {
      if (event.target.matches('[data-dose-safety-check]')) applyGate();
    });
    panel.querySelector('[data-dose-safety-more]').addEventListener('click', event => {
      const expanded = event.currentTarget.dataset.expanded === 'true';
      event.currentTarget.dataset.expanded = expanded ? 'false' : 'true';
      renderItems();
    });
    return panel;
  }

  function suppressResult(suppressed) {
    const result = modalRoot()?.querySelector('[data-dose-result]');
    if (!result) return;
    if (suppressed) result.dataset.safetySuppressed = 'true';
    else delete result.dataset.safetySuppressed;
  }

  function renderUnavailable() {
    const panel = ensurePanel();
    if (!panel) return;
    panel.hidden = false;
    panel.querySelector('[data-dose-safety-items]').replaceChildren();
    panel.querySelector('[data-dose-safety-more]').hidden = true;
    const status = panel.querySelector('[data-dose-safety-status]');
    const gate = panel.querySelector('[data-dose-safety-gate]');
    gate.hidden = false;
    gate.className = 'dose-safety-gate is-manual_review';
    if (catalog.status === 'loading') {
      status.textContent = 'Duke ngarkuar sigurinë…';
      gate.innerHTML = '<strong>Kontrolli i sigurisë po ngarkohet</strong><span>Rezultati automatik do të shfaqet vetëm pasi Safety Layer të jetë gati.</span>';
    } else {
      status.textContent = 'Kontroll manual';
      gate.innerHTML = `<strong>Kërkohet verifikim manual</strong><span>${escapeHtml(catalog.errorMessage || 'Kontrolli i sigurisë nuk është i disponueshëm.')}</span>`;
    }
    suppressResult(true);
  }

  function renderCoverageMissing() {
    const panel = ensurePanel();
    if (!panel) return;
    const entry = productEntry();
    panel.hidden = false;
    panel.querySelector('[data-dose-safety-items]').replaceChildren();
    panel.querySelector('[data-dose-safety-more]').hidden = true;
    const status = panel.querySelector('[data-dose-safety-status]');
    const gate = panel.querySelector('[data-dose-safety-gate]');
    status.textContent = 'Mbulim i paplotë';
    gate.hidden = false;
    gate.className = 'dose-safety-gate is-manual_review';
    const message = entry?.coverageReason === 'manual_gate_missing'
      ? 'Ky preparat ka rregull që kërkon kontroll renal ose specialistik, por gate-i përkatës i sigurisë nuk është publikuar ende.'
      : 'Safety coverage për këtë preparat nuk është publikuar ende. Rezultati automatik është bllokuar dhe kërkon verifikim manual.';
    gate.innerHTML = `<strong>Kërkohet verifikim manual</strong><span>${escapeHtml(message)}</span>`;
    suppressResult(true);
  }

  function itemMarkup(item, hiddenExtra) {
    const severity = clean(item.severity);
    const badge = severity === 'block' ? 'MOS E PËRDOR' : severity === 'manual_review' ? 'KONTROLL' : severity === 'caution' ? 'KUJDES' : 'INFO';
    return `<label class="dose-safety-item"${hiddenExtra ? ' hidden data-dose-safety-extra="true"' : ''}><input type="checkbox" data-dose-safety-check data-safety-key="${escapeHtml(item.safetyKey)}"><span class="dose-safety-copy"><strong>${escapeHtml(item.promptLabel)}</strong><small>${badge} · ${escapeHtml(item.shortMessage)}</small></span></label>`;
  }

  function escapeHtml(value) {
    return clean(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  }

  function renderItems() {
    const panel = ensurePanel();
    if (!panel) return;
    if (catalog.status !== 'ready') {
      renderUnavailable();
      return;
    }
    if (!coverageVerified()) {
      renderCoverageMissing();
      return;
    }
    const items = applicableItems();
    panel.hidden = !items.length;
    if (!items.length) {
      releaseGate();
      return;
    }
    const previous = new Set(Array.from(panel.querySelectorAll('[data-dose-safety-check]:checked')).map(input => input.dataset.safetyKey));
    const expanded = panel.querySelector('[data-dose-safety-more]').dataset.expanded === 'true';
    panel.querySelector('[data-dose-safety-items]').innerHTML = items.map((item, index) => itemMarkup(item, !expanded && index >= MAX_VISIBLE_ITEMS)).join('');
    panel.querySelectorAll('[data-dose-safety-check]').forEach(input => { input.checked = previous.has(input.dataset.safetyKey); });
    const more = panel.querySelector('[data-dose-safety-more]');
    more.hidden = items.length <= MAX_VISIBLE_ITEMS;
    more.textContent = expanded ? 'Shfaq më pak' : `Shfaq edhe ${items.length - MAX_VISIBLE_ITEMS}`;
    applyGate();
  }

  function selectedItems() {
    const panel = ensurePanel();
    if (!panel || panel.hidden) return [];
    const keys = new Set(Array.from(panel.querySelectorAll('[data-dose-safety-check]:checked')).map(input => input.dataset.safetyKey));
    return applicableItems().filter(item => keys.has(clean(item.safetyKey)));
  }

  function highestSelected(items) {
    return [...items].sort((a, b) => (PRIORITY[clean(a.severity)] ?? 9) - (PRIORITY[clean(b.severity)] ?? 9))[0] || null;
  }

  function releaseGate() {
    const root = modalRoot();
    if (!root || catalog.status !== 'ready' || !coverageVerified()) return;
    const result = root.querySelector('[data-dose-result]');
    const gate = root.querySelector('[data-dose-safety-gate]');
    if (gate) gate.hidden = true;
    if (result?.dataset.safetySuppressed === 'true') {
      delete result.dataset.safetySuppressed;
      root.querySelector('[data-dose-age]')?.dispatchEvent(new Event('input', { bubbles:true }));
    }
  }

  function applyGate() {
    if (internalMutation) return;
    if (catalog.status !== 'ready') {
      renderUnavailable();
      return;
    }
    if (!coverageVerified()) {
      renderCoverageMissing();
      return;
    }
    const root = modalRoot();
    const panel = ensurePanel();
    if (!root || !panel || panel.hidden) return;
    const selected = selectedItems();
    const status = panel.querySelector('[data-dose-safety-status]');
    const gate = panel.querySelector('[data-dose-safety-gate]');
    const result = root.querySelector('[data-dose-result]');
    const blocking = highestSelected(selected.filter(item => ['block','manual_review'].includes(clean(item.severity))));
    const caution = highestSelected(selected.filter(item => clean(item.severity) === 'caution'));
    status.textContent = selected.length ? `${selected.length} red flag${selected.length === 1 ? '' : 's'} aktiv` : 'Pa red flags të zgjedhura';

    internalMutation = true;
    try {
      if (blocking) {
        gate.hidden = false;
        gate.className = `dose-safety-gate is-${clean(blocking.severity)}`;
        const title = blocking.severity === 'block' ? 'Kalkulimi u bllokua' : 'Kërkohet vlerësim manual';
        gate.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(blocking.actionMessage || blocking.shortMessage)}</span>${blocking.source?.url ? `<a class="dose-safety-source" href="${escapeHtml(blocking.source.url)}" target="_blank" rel="noopener noreferrer">Burimi zyrtar</a>` : ''}`;
        if (result) result.dataset.safetySuppressed = 'true';
      } else {
        if (result) delete result.dataset.safetySuppressed;
        if (caution) {
          gate.hidden = false;
          gate.className = 'dose-safety-gate is-caution';
          gate.innerHTML = `<strong>Kujdes</strong><span>${escapeHtml(caution.actionMessage || caution.shortMessage)}</span>${caution.source?.url ? `<a class="dose-safety-source" href="${escapeHtml(caution.source.url)}" target="_blank" rel="noopener noreferrer">Burimi zyrtar</a>` : ''}`;
        } else {
          gate.hidden = true;
          gate.replaceChildren();
        }
      }
    } finally {
      internalMutation = false;
    }
  }

  function resetPanel() {
    const panel = modalRoot()?.querySelector('[data-dose-safety-panel]');
    if (!panel) return;
    panel.querySelectorAll('[data-dose-safety-check]').forEach(input => { input.checked = false; });
    panel.querySelector('[data-dose-safety-more]').dataset.expanded = 'false';
    renderItems();
  }

  function refresh() {
    if (!modalOpen()) return;
    ensurePanel();
    renderItems();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('.dose-calculator-open');
    if (button) {
      activeProductKey = clean(button.dataset.doseProductKey);
      requestAnimationFrame(refresh);
      return;
    }
    if (event.target.closest('[data-dose-new-patient]')) requestAnimationFrame(resetPanel);
    if (event.target.closest('[data-dose-calculator-close]')) activeProductKey = '';
  }, true);

  document.addEventListener('input', event => {
    if (event.target.matches('[data-dose-age],[data-dose-weight]')) requestAnimationFrame(renderItems);
  });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-dose-age-unit],[data-dose-indication]')) requestAnimationFrame(renderItems);
  });

  function observeModal() {
    const root = modalRoot();
    if (!root || observer) return;
    observer = new MutationObserver(() => {
      if (!internalMutation && modalOpen()) requestAnimationFrame(() => { ensurePanel(); applyGate(); });
    });
    observer.observe(root, { attributes:true, attributeFilter:['hidden'], subtree:true });
  }

  ensureStyles();
  const boot = () => {
    observeModal();
    void loadCatalog();
    document.documentElement.dataset.doseSafetyVersion = VERSION;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  window.MedIndexDoseSafety = Object.freeze({
    version:VERSION,
    refresh,
    status:() => catalog.status,
    coverageVerified:productKey => coverageVerified(productKey),
    coverageState:productKey => productEntry(productKey),
    _test:Object.freeze({ within, patientGroupMatches, highestSelected }),
  });
})();
