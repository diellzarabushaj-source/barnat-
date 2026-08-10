(() => {
  'use strict';

  const VERSION = 'registry-novorapid-protocol-v2.2.0';
  const REGISTRY_NUMBER = '2508';
  const STORAGE_KEY = 'medindex:novorapid:patient-protocol:v3';
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
  const esc = value => clean(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function loadProtocol() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return null;
      const target = num(parsed.target);
      const icr = num(parsed.icr);
      const isf = num(parsed.isf);
      const tdd = num(parsed.tdd);
      if (!(target > 0) || !(icr > 0) || !(isf > 0)) return null;
      return { target, icr, isf, tdd: tdd > 0 ? tdd : null, source: clean(parsed.source) || 'manual' };
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
            <span class="novorapid-simple-kicker">INSULIN ASPART · NOVORAPID FLEXPEN</span>
            <h2 id="novorapidSimpleTitle">NovoRapid</h2>
            <p>Bolus i vaktit + korrigjim</p>
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
              <span>Pesha</span>
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
            <div class="novorapid-carb-chips" aria-label="Zgjedhje të shpejta">
              <button type="button" data-carb="30">30 g</button>
              <button type="button" data-carb="45">45 g</button>
              <button type="button" data-carb="60">60 g</button>
              <button type="button" data-carb="90">90 g</button>
            </div>
          </label>

          <details class="novorapid-more">
            <summary>Më shumë <span>IOB / insulinë aktive</span></summary>
            <label class="novorapid-simple-field novorapid-iob-field">
              <span>Insulinë aktive nga bolusi i fundit</span>
              <div class="novorapid-simple-input-with-unit">
                <input type="number" min="0" step="0.1" inputmode="decimal" data-novorapid-iob autocomplete="off" value="0">
                <small>U</small>
              </div>
              <small class="novorapid-help">0 vetëm kur nuk ka insulinë aktive për t’u zbritur.</small>
            </label>
          </details>

          <button type="button" class="novorapid-simple-calculate" data-novorapid-calculate>Llogarit dozën</button>
          <div class="novorapid-simple-result" data-novorapid-result aria-live="polite" hidden></div>

          <details class="novorapid-protocol-panel" data-novorapid-protocol-panel>
            <summary>Parametrat e pacientit <span>vetëm për këtë sesion</span></summary>

            <div class="novorapid-protocol-grid">
              <label class="novorapid-simple-field">
                <span>Insulina totale ditore (TDD)</span>
                <div class="novorapid-simple-input-with-unit">
                  <input type="number" min="1" max="300" step="1" inputmode="decimal" data-protocol-tdd placeholder="p.sh. 50">
                  <small>U/24h</small>
                </div>
                <small class="novorapid-help">Nëse pacienti ka regjim të qëndrueshëm, TDD mund të përdoret për vlerësim fillestar të ICR/ISF.</small>
              </label>

              <label class="novorapid-simple-field">
                <span>Targeti i glukozës</span>
                <div class="novorapid-simple-input-with-unit">
                  <input type="number" min="3.9" max="12" step="0.1" inputmode="decimal" data-protocol-target placeholder="p.sh. 6.0">
                  <small>mmol/L</small>
                </div>
                <small class="novorapid-help">Përdor targetin e përcaktuar për këtë pacient.</small>
              </label>
            </div>

            <button type="button" class="novorapid-save-protocol" data-derive-protocol>Llogarit ICR / ISF fillestar</button>

            <div class="novorapid-protocol-grid">
              <label class="novorapid-simple-field">
                <span>ICR</span>
                <div class="novorapid-simple-input-with-unit"><input type="number" min="1" max="100" step="0.1" inputmode="decimal" data-protocol-icr><small>g/U</small></div>
              </label>
              <label class="novorapid-simple-field">
                <span>ISF</span>
                <div class="novorapid-simple-input-with-unit"><input type="number" min="0.1" max="15" step="0.1" inputmode="decimal" data-protocol-isf><small>mmol/L/U</small></div>
              </label>
            </div>

            <p class="novorapid-protocol-note" data-protocol-estimate-note>ICR dhe ISF mund t’i shkruash direkt nëse janë tashmë të njohura. Vlerësimi nga TDD është vetëm pikënisje dhe duhet verifikuar klinikisht.</p>

            <label class="novorapid-simple-field">
              <span>Konfirmim klinik</span>
              <span style="display:flex;gap:10px;align-items:flex-start;font-weight:600"><input type="checkbox" data-protocol-confirm style="width:18px;height:18px;min-height:18px;margin-top:2px"> I kam kontrolluar targetin, ICR dhe ISF për këtë pacient.</span>
            </label>

            <div class="novorapid-protocol-actions">
              <button type="button" class="novorapid-save-protocol" data-save-protocol>Aktivizo parametrat</button>
              <button type="button" class="novorapid-clear-protocol" data-clear-protocol>Fshije</button>
            </div>
            <p class="novorapid-protocol-note">NovoRapid FlexPen jep 1–60 U në hapa prej 1 U; rezultati rrumbullakoset në 1 U. “Pacient i ri” i fshin parametrat.</p>
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
      if (event.target.closest('[data-derive-protocol]')) deriveProtocol();
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
    const tdd = modal.querySelector('[data-protocol-tdd]');
    const target = modal.querySelector('[data-protocol-target]');
    const icr = modal.querySelector('[data-protocol-icr]');
    const isf = modal.querySelector('[data-protocol-isf]');
    const confirm = modal.querySelector('[data-protocol-confirm]');

    if (protocol) {
      status.className = 'novorapid-protocol-status is-ready';
      status.innerHTML = `<span>✓ Parametrat aktivë</span><small>Target ${protocol.target} · ICR 1:${protocol.icr} · ISF ${protocol.isf} mmol/L/U</small>`;
      tdd.value = protocol.tdd || '';
      target.value = protocol.target;
      icr.value = protocol.icr;
      isf.value = protocol.isf;
      confirm.checked = true;
      if (panel) panel.open = false;
    } else {
      status.className = 'novorapid-protocol-status is-missing';
      status.innerHTML = '<span>Vendos parametrat një herë</span><small>TDD + target → ICR/ISF fillestar, ose shkruaji direkt</small>';
      tdd.value = '';
      target.value = '';
      icr.value = '';
      isf.value = '';
      confirm.checked = false;
      if (panel) panel.open = true;
    }
  }

  function deriveProtocol() {
    if (!modal) return;
    const tdd = num(modal.querySelector('[data-protocol-tdd]')?.value);
    const target = num(modal.querySelector('[data-protocol-target]')?.value);
    if (!(tdd >= 5 && tdd <= 300)) {
      showResult('warning', 'Shkruaj TDD', '<span>Duhet insulina totale ditore e pacientit (U/24h) për të krijuar një vlerësim fillestar.</span>');
      return;
    }
    if (!(target >= 3.9 && target <= 12)) {
      showResult('warning', 'Shkruaj targetin', '<span>Vendos targetin e glukozës të përcaktuar për këtë pacient.</span>');
      return;
    }

    const icr = round1(500 / tdd);
    const isf = round1(100 / tdd); // 1800-rule converted from mg/dL to mmol/L: (1800/TDD)/18 = 100/TDD.
    modal.querySelector('[data-protocol-icr]').value = icr;
    modal.querySelector('[data-protocol-isf]').value = isf;
    modal.querySelector('[data-protocol-confirm]').checked = false;

    const note = modal.querySelector('[data-protocol-estimate-note]');
    if (note) note.textContent = `Vlerësim fillestar nga TDD ${tdd} U/24h: ICR ≈ 1:${icr} g dhe ISF ≈ ${isf} mmol/L/U. Kontrolloji para aktivizimit.`;

    const targetWarning = target < 4.4
      ? ' Targeti është nën intervalin preprandial 4.4–7.2 mmol/L që ADA jep për shumë të rritur jo-shtatzënë; përdore vetëm nëse është zgjedhur posaçërisht për këtë pacient.'
      : '';
    showResult('info', 'ICR / ISF u vlerësuan', `<span>Kontrolloji dhe shëno konfirmimin klinik para se t’i aktivizosh.${esc(targetWarning)}</span>`);
  }

  function persistProtocol() {
    if (!modal) return;
    const tdd = num(modal.querySelector('[data-protocol-tdd]')?.value);
    const target = num(modal.querySelector('[data-protocol-target]')?.value);
    const icr = num(modal.querySelector('[data-protocol-icr]')?.value);
    const isf = num(modal.querySelector('[data-protocol-isf]')?.value);
    const confirmed = Boolean(modal.querySelector('[data-protocol-confirm]')?.checked);

    if (!(target >= 3.9 && target <= 12) || !(icr > 0 && icr <= 100) || !(isf > 0 && isf <= 15)) {
      showResult('warning', 'Kontrollo parametrat', '<span>Plotëso targetin, ICR dhe ISF me vlera të vlefshme për pacientin.</span>');
      return;
    }
    if (!confirmed) {
      showResult('warning', 'Konfirmimi mungon', '<span>Kontrollo targetin, ICR dhe ISF dhe shëno konfirmimin klinik.</span>');
      return;
    }

    const source = tdd > 0 ? 'tdd-estimate-or-reviewed' : 'manual';
    saveProtocol({ target: round1(target), icr: round1(icr), isf: round1(isf), tdd: tdd > 0 ? round1(tdd) : null, source });
    syncProtocolUI();
    showResult('info', 'Parametrat u aktivizuan', '<span>Tani kalkulatori mund të japë bolusin e vaktit + korrigjimin sipas këtyre parametrave.</span>');
  }

  function clearProtocol() {
    dropProtocol();
    syncProtocolUI();
    showResult('warning', 'Parametrat u fshinë', '<span>Nuk llogaritet dozë derisa të aktivizohen parametrat e pacientit.</span>');
  }

  function showResult(level, title, html) {
    const result = modal?.querySelector('[data-novorapid-result]');
    if (!result) return;
    result.hidden = false;
    result.className = `novorapid-simple-result is-${level}`;
    result.innerHTML = `<strong>${esc(title)}</strong>${html}`;
  }

  function calculate() {
    if (!modal) return;
    const glucose = num(modal.querySelector('[data-novorapid-glucose]')?.value);
    const weight = num(modal.querySelector('[data-novorapid-weight]')?.value);
    const carbs = num(modal.querySelector('[data-novorapid-carbs]')?.value);
    const iob = num(modal.querySelector('[data-novorapid-iob]')?.value);
    const protocol = loadProtocol();

    if (glucose === null || glucose <= 0 || weight === null || weight <= 0 || carbs === null || carbs < 0 || iob === null || iob < 0) {
      showResult('warning', 'Plotëso inputet', '<span>Shkruaj glukozën, peshën, karbohidratet dhe IOB (0 nëse nuk ka insulinë aktive).</span>');
      return;
    }

    if (!protocol) {
      const panel = modal.querySelector('[data-novorapid-protocol-panel]');
      if (panel) panel.open = true;
      showResult('warning', 'Mungojnë parametrat e pacientit', '<span>Jep TDD + target për vlerësim fillestar të ICR/ISF, ose shkruaj ICR/ISF të njohura dhe aktivizoji.</span>');
      return;
    }

    if (glucose < 3.9) {
      showResult('block', 'Hipoglikemi — mos jep bolus rutinë', `<span>Glukoza është ${round1(glucose)} mmol/L. Trajto/rivlerëso hipoglikeminë para insulinës së vaktit.</span>`);
      return;
    }

    const meal = carbs / protocol.icr;
    const correctionRaw = (glucose - protocol.target) / protocol.isf;
    const correctionAfterIob = correctionRaw - iob;
    const mathematicalTotal = Math.max(0, meal + correctionAfterIob);
    const rounded = Math.max(0, Math.round(mathematicalTotal)); // FlexPen = 1 U increments.

    if (rounded > 60) {
      showResult('block', 'Doza kalon kapacitetin e FlexPen', `<span>Rezultati matematik është ${doseText(round1(mathematicalTotal))} U, ndërsa FlexPen zgjedh 1–60 U për injeksion. Mos e ndaj automatikisht; rishiko regjimin klinik.</span>`);
      return;
    }

    const ketoneWarning = glucose >= 13.9
      ? '<em class="novorapid-result-alert">Glukoza ≥13.9 mmol/L: kontrollo ketonet dhe kontekstin klinik; në dyshim për DKA/dehidrim/sëmundje akute mos u mbështet vetëm në kalkulator.</em>'
      : '';

    showResult(
      'ready',
      `Doza e llogaritur: ${rounded} U SC`,
      `<div class="novorapid-dose-breakdown">
        <span><b>Vakti</b><strong>${doseText(round1(meal))} U</strong><small>${round1(carbs)} g ÷ ICR ${protocol.icr}</small></span>
        <span><b>Korrigjimi</b><strong>${correctionAfterIob >= 0 ? '+' : ''}${doseText(round1(correctionAfterIob))} U</strong><small>(${round1(glucose)} − ${protocol.target}) ÷ ${protocol.isf} − IOB ${round1(iob)}</small></span>
      </div>
      <p class="novorapid-result-meta">Totali matematik ${doseText(round1(mathematicalTotal))} U → ${rounded} U, sepse NovoRapid FlexPen punon me hapa 1 U. Pesha ${round1(weight)} kg përdoret vetëm si kontekst dhe kontroll, jo për të shpikur bolusin.</p>
      ${ketoneWarning}`
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
    ['[data-novorapid-glucose]','[data-novorapid-weight]','[data-novorapid-carbs]'].forEach(selector => {
      const input = modal.querySelector(selector);
      if (input) input.value = '';
    });
    const iob = modal.querySelector('[data-novorapid-iob]');
    if (iob) iob.value = '0';
    if (clearPatientProtocol) dropProtocol();
    syncProtocolUI();
    const result = modal.querySelector('[data-novorapid-result]');
    if (result) {
      result.hidden = true;
      result.textContent = '';
      result.className = 'novorapid-simple-result';
    }
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