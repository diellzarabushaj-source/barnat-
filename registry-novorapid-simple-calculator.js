(() => {
  'use strict';

  const VERSION = 'registry-novorapid-protocol-v2.1.0';
  const REGISTRY_NUMBER = '2508';
  const STORAGE_KEY = 'medindex:novorapid:patient-protocol:v2';
  const EMA_URL = 'https://www.ema.europa.eu/en/medicines/human/EPAR/novorapid';
  const ADA_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment';

  let modal = null;
  let lastFocus = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const num = value => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const round1 = value => Math.round(value * 10) / 10;
  const doseText = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function loadProtocol() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return null;
      const target = num(parsed.target);
      const icr = num(parsed.icr);
      const isf = num(parsed.isf);
      const step = num(parsed.step);
      if (!(target > 0) || !(icr > 0) || !(isf > 0) || ![0.5, 1].includes(step)) return null;
      return { target, icr, isf, step };
    } catch {
      return null;
    }
  }

  function saveProtocol(protocol) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(protocol));
  }

  function dropProtocol() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function ensureModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'novorapid-simple-modal';
    modal.id = 'novorapidSimpleModal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'novorapidSimpleTitle');
    modal.innerHTML = `
      <div class="novorapid-simple-backdrop" data-novorapid-close></div>
      <section class="novorapid-simple-card" tabindex="-1">
        <header class="novorapid-simple-head">
          <div>
            <span class="novorapid-simple-kicker">INSULIN ASPART · SC</span>
            <h2 id="novorapidSimpleTitle">NovoRapid</h2>
            <p>Bolus i vaktit + korrigjim sipas protokollit të pacientit</p>
          </div>
          <button type="button" class="novorapid-simple-close" data-novorapid-close aria-label="Mbyll">×</button>
        </header>

        <div class="novorapid-simple-body">
          <div class="novorapid-protocol-status" data-novorapid-protocol-status></div>

          <div class="novorapid-primary-grid">
            <label class="novorapid-simple-field">
              <span>Glukoza tani</span>
              <div class="novorapid-simple-input-with-unit">
                <input type="number" min="0" step="0.1" inputmode="decimal" data-novorapid-glucose autocomplete="off" placeholder="p.sh. 8.4">
                <small>mmol/L</small>
              </div>
            </label>

            <label class="novorapid-simple-field">
              <span>Pesha e pacientit</span>
              <div class="novorapid-simple-input-with-unit">
                <input type="number" min="1" step="0.1" inputmode="decimal" data-novorapid-weight autocomplete="off" placeholder="p.sh. 77">
                <small>kg</small>
              </div>
            </label>
          </div>

          <label class="novorapid-simple-field">
            <span>Karbohidratet e vaktit</span>
            <div class="novorapid-simple-input-with-unit">
              <input type="number" min="0" step="1" inputmode="numeric" data-novorapid-carbs autocomplete="off" placeholder="p.sh. 60">
              <small>g</small>
            </div>
            <div class="novorapid-carb-chips" aria-label="Zgjedhje të shpejta të karbohidrateve">
              <button type="button" data-carb="30">30 g</button>
              <button type="button" data-carb="45">45 g</button>
              <button type="button" data-carb="60">60 g</button>
              <button type="button" data-carb="90">90 g</button>
            </div>
          </label>

          <details class="novorapid-more">
            <summary>Më shumë <span>IOB / insulinë aktive</span></summary>
            <label class="novorapid-simple-field novorapid-iob-field">
              <span>Insulinë aktive nga bolusi i fundit (IOB)</span>
              <div class="novorapid-simple-input-with-unit">
                <input type="number" min="0" step="0.1" inputmode="decimal" data-novorapid-iob autocomplete="off" value="0">
                <small>U</small>
              </div>
              <small class="novorapid-help">Lëre 0 vetëm kur nuk ka insulinë aktive për t’u zbritur.</small>
            </label>
          </details>

          <button type="button" class="novorapid-simple-calculate" data-novorapid-calculate>Llogarit dozën</button>

          <div class="novorapid-simple-result" data-novorapid-result aria-live="polite" hidden></div>

          <details class="novorapid-protocol-panel" data-novorapid-protocol-panel>
            <summary>Protokolli i pacientit <span>vetëm për këtë sesion</span></summary>
            <div class="novorapid-protocol-grid">
              <label class="novorapid-simple-field">
                <span>Targeti i glukozës</span>
                <div class="novorapid-simple-input-with-unit"><input type="number" min="3.9" step="0.1" inputmode="decimal" data-protocol-target><small>mmol/L</small></div>
              </label>
              <label class="novorapid-simple-field">
                <span>ICR</span>
                <div class="novorapid-simple-input-with-unit"><input type="number" min="1" step="0.1" inputmode="decimal" data-protocol-icr><small>g/U</small></div>
              </label>
              <label class="novorapid-simple-field">
                <span>ISF</span>
                <div class="novorapid-simple-input-with-unit"><input type="number" min="0.1" step="0.1" inputmode="decimal" data-protocol-isf><small>mmol/L/U</small></div>
              </label>
              <label class="novorapid-simple-field">
                <span>Hapi i pen-it</span>
                <select data-protocol-step><option value="1">1 U</option><option value="0.5">0.5 U</option></select>
              </label>
            </div>
            <div class="novorapid-protocol-actions">
              <button type="button" class="novorapid-save-protocol" data-save-protocol>Ruaje protokollin</button>
              <button type="button" class="novorapid-clear-protocol" data-clear-protocol>Fshije</button>
            </div>
            <p class="novorapid-protocol-note">ICR, ISF dhe targeti duhet të jenë të përcaktuara/verifikuara për pacientin. Kalkulatori nuk i shpik nga pesha ose kaloritë. “Pacient i ri” i fshin këto vlera që të mos kalojnë te pacienti tjetër.</p>
          </details>
        </div>

        <footer class="novorapid-simple-foot">
          <div class="novorapid-source-links"><a href="${ADA_URL}" target="_blank" rel="noopener noreferrer">ADA 2026</a><a href="${EMA_URL}" target="_blank" rel="noopener noreferrer">EMA NovoRapid</a></div>
          <button type="button" data-novorapid-reset>Pacient i ri</button>
        </footer>
      </section>`;

    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (event.target.closest('[data-novorapid-close]')) close();
      if (event.target.closest('[data-novorapid-reset]')) resetEncounter(true);
      if (event.target.closest('[data-novorapid-calculate]')) calculate();
      if (event.target.closest('[data-save-protocol]')) persistProtocol();
      if (event.target.closest('[data-clear-protocol]')) clearProtocol();
      const chip = event.target.closest('[data-carb]');
      if (chip) {
        const carbs = modal.querySelector('[data-novorapid-carbs]');
        if (carbs) carbs.value = chip.dataset.carb;
      }
    });

    modal.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('[data-novorapid-glucose],[data-novorapid-weight],[data-novorapid-carbs],[data-novorapid-iob]')) {
        event.preventDefault();
        calculate();
      }
    });

    syncProtocolUI();
    return modal;
  }

  function syncProtocolUI() {
    if (!modal) return;
    const protocol = loadProtocol();
    const status = modal.querySelector('[data-novorapid-protocol-status]');
    const panel = modal.querySelector('[data-novorapid-protocol-panel]');
    const target = modal.querySelector('[data-protocol-target]');
    const icr = modal.querySelector('[data-protocol-icr]');
    const isf = modal.querySelector('[data-protocol-isf]');
    const step = modal.querySelector('[data-protocol-step]');

    if (protocol) {
      status.className = 'novorapid-protocol-status is-ready';
      status.innerHTML = `<span>✓ Protokoll aktiv për këtë pacient</span><small>Target ${protocol.target} · ICR 1:${protocol.icr} · ISF ${protocol.isf} mmol/L/U</small>`;
      target.value = protocol.target;
      icr.value = protocol.icr;
      isf.value = protocol.isf;
      step.value = protocol.step;
      if (panel) panel.open = false;
    } else {
      status.className = 'novorapid-protocol-status is-missing';
      status.innerHTML = '<span>Vendos protokollin e pacientit një herë</span><small>Target + ICR + ISF</small>';
      target.value = '';
      icr.value = '';
      isf.value = '';
      step.value = '1';
      if (panel) panel.open = true;
    }
  }

  function persistProtocol() {
    if (!modal) return;
    const target = num(modal.querySelector('[data-protocol-target]')?.value);
    const icr = num(modal.querySelector('[data-protocol-icr]')?.value);
    const isf = num(modal.querySelector('[data-protocol-isf]')?.value);
    const step = num(modal.querySelector('[data-protocol-step]')?.value);

    if (!(target >= 3.9 && target <= 12) || !(icr > 0 && icr <= 100) || !(isf > 0 && isf <= 15) || ![0.5, 1].includes(step)) {
      showResult('warning', 'Kontrollo protokollin', '<span>Plotëso targetin, ICR dhe ISF me vlera të verifikuara për pacientin.</span>');
      return;
    }

    saveProtocol({ target: round1(target), icr: round1(icr), isf: round1(isf), step });
    syncProtocolUI();
    showResult('info', 'Protokolli u ruajt', '<span>Tani mjafton glukoza, karbohidratet dhe IOB për të llogaritur bolusin.</span>');
  }

  function clearProtocol() {
    dropProtocol();
    syncProtocolUI();
    showResult('warning', 'Protokolli u fshi', '<span>Doza nuk llogaritet derisa të ruhet një protokoll i verifikuar për pacientin.</span>');
  }

  function showResult(level, title, html) {
    const result = modal?.querySelector('[data-novorapid-result]');
    if (!result) return;
    result.hidden = false;
    result.className = `novorapid-simple-result is-${level}`;
    result.innerHTML = `<strong>${escapeHtml(title)}</strong>${html}`;
  }

  function calculate() {
    if (!modal) return;

    const glucose = num(modal.querySelector('[data-novorapid-glucose]')?.value);
    const weight = num(modal.querySelector('[data-novorapid-weight]')?.value);
    const carbs = num(modal.querySelector('[data-novorapid-carbs]')?.value);
    const iob = num(modal.querySelector('[data-novorapid-iob]')?.value);
    const protocol = loadProtocol();

    if (glucose === null || glucose <= 0 || weight === null || weight <= 0 || carbs === null || carbs < 0 || iob === null || iob < 0) {
      showResult('warning', 'Plotëso inputet', '<span>Shkruaj glukozën, peshën, gramët e karbohidrateve dhe IOB (0 nëse nuk ka insulinë aktive).</span>');
      return;
    }

    if (!protocol) {
      const panel = modal.querySelector('[data-novorapid-protocol-panel]');
      if (panel) panel.open = true;
      showResult('warning', 'Mungon protokolli i pacientit', '<span>Ruaj targetin, ICR dhe ISF një herë. Pa to nuk ekziston një dozë e saktë universale e NovoRapid.</span>');
      return;
    }

    if (glucose < 3.9) {
      showResult('block', 'Hipoglikemi — mos llogarit bolus rutinë', `<span>Glukoza është ${round1(glucose)} mmol/L. Trajto/rivlerëso hipoglikeminë sipas protokollit klinik para bolusit të vaktit.</span>`);
      return;
    }

    const meal = carbs / protocol.icr;
    const correctionBeforeIob = (glucose - protocol.target) / protocol.isf;
    const correctionAfterIob = correctionBeforeIob - iob;
    const rawTotal = Math.max(0, meal + correctionAfterIob);
    const rounded = Math.max(0, Math.round(rawTotal / protocol.step) * protocol.step);
    const referenceLow = round1(weight * 0.5);
    const referenceHigh = round1(weight * 1.0);
    const highGlucoseNote = glucose >= 13.9
      ? '<em class="novorapid-result-alert">Glukoza është shumë e lartë: nëse ka ketone, sëmundje akute, dehidrim ose dyshim për DKA, mos u mbështet vetëm në këtë kalkulator.</em>'
      : '';

    showResult(
      'ready',
      `Doza e llogaritur: ${doseText(rounded)} U SC`,
      `<div class="novorapid-dose-breakdown">
        <span><b>Vakti</b><strong>${doseText(round1(meal))} U</strong><small>${round1(carbs)} g ÷ ICR ${protocol.icr}</small></span>
        <span><b>Korrigjimi</b><strong>${correctionAfterIob >= 0 ? '+' : ''}${doseText(round1(correctionAfterIob))} U</strong><small>(${round1(glucose)} − ${protocol.target}) ÷ ${protocol.isf} − IOB ${round1(iob)}</small></span>
      </div>
      <p class="novorapid-result-meta">Totali matematik: ${doseText(round1(rawTotal))} U → rrumbullakosur në hapin ${protocol.step} U. Pesha ${round1(weight)} kg; EMA jep si referencë të përgjithshme rreth ${referenceLow}–${referenceHigh} U/ditë për nevojën totale, jo si dozë bolusi.</p>
      ${highGlucoseNote}`
    );
  }

  function open(trigger) {
    ensureModal();
    lastFocus = trigger || document.activeElement;
    syncProtocolUI();
    modal.hidden = false;
    document.body.classList.add('novorapid-simple-opened');
    window.requestAnimationFrame(() => modal.querySelector('[data-novorapid-glucose]')?.focus());
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('novorapid-simple-opened');
    lastFocus?.focus?.();
  }

  function resetEncounter(clearPatientProtocol = false) {
    if (!modal) return;
    if (clearPatientProtocol) dropProtocol();
    ['[data-novorapid-glucose]','[data-novorapid-weight]','[data-novorapid-carbs]'].forEach(selector => {
      const input = modal.querySelector(selector);
      if (input) input.value = '';
    });
    const iob = modal.querySelector('[data-novorapid-iob]');
    if (iob) iob.value = '0';
    const result = modal.querySelector('[data-novorapid-result]');
    if (result) {
      result.hidden = true;
      result.textContent = '';
      result.className = 'novorapid-simple-result';
    }
    syncProtocolUI();
    modal.querySelector('[data-novorapid-glucose]')?.focus();
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest(`[data-insulin-smart-open="${REGISTRY_NUMBER}"]`);
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(trigger);
  }, true);

  document.addEventListener('keydown', event => {
    if (modal && !modal.hidden && event.key === 'Escape') close();
  });

  window.MEDINDEX_NOVORAPID_SIMPLE = Object.freeze({
    version: VERSION,
    registryNumber: REGISTRY_NUMBER,
    open: () => open(document.activeElement),
    protocol: () => loadProtocol(),
  });
})();