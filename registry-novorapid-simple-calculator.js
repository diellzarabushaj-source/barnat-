(() => {
  'use strict';

  const VERSION = 'registry-novorapid-protocol-v3.0.0';
  const REGISTRY_NUMBER = '2508';
  const STORAGE_KEY = 'medindex:novorapid:patient-protocol:v4';
  const EMA_URL = 'https://www.ema.europa.eu/en/medicines/human/EPAR/novorapid';
  const SMPC_URL = 'https://www.medicines.org.uk/emc/product/7920/smpc';
  const ADA_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment';

  let modal = null;
  let lastFocus = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const num = value => {
    const text = clean(value).replace(',', '.');
    if (text === '') return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const round1 = value => Math.round(value * 10) / 10;
  const doseText = value => Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
  const esc = value => clean(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const ageGroup = age => age < 18 ? 'pediatric' : 'adult';

  function loadProtocol() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return null;
      const target = num(parsed.target);
      const icr = num(parsed.icr);
      const isf = num(parsed.isf);
      const tdd = num(parsed.tdd);
      if (!(target >= 3.9 && target <= 12) || !(icr > 0 && icr <= 100) || !(isf > 0 && isf <= 15)) return null;
      return {
        target,
        icr,
        isf,
        tdd: tdd > 0 ? tdd : null,
        source: clean(parsed.source) || 'manual',
        ageGroup: parsed.ageGroup === 'pediatric' ? 'pediatric' : 'adult'
      };
    } catch {
      return null;
    }
  }

  function saveProtocol(protocol) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(protocol)); } catch {}
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
            <p>Bolus i vaktit + korrigjim · SC</p>
          </div>
          <button type="button" class="novorapid-simple-close" data-novorapid-close aria-label="Mbyll">×</button>
        </header>

        <div class="novorapid-simple-body">
          <div class="novorapid-protocol-status" data-novorapid-protocol-status></div>

          <div class="novorapid-primary-grid">
            <label class="novorapid-simple-field">
              <span>Mosha</span>
              <div class="novorapid-simple-input-with-unit">
                <input type="number" min="0" step="1" inputmode="numeric" data-novorapid-age autocomplete="off" placeholder="p.sh. 42">
                <small>vjeç</small>
              </div>
            </label>

            <label class="novorapid-simple-field">
              <span>Glukoza tani</span>
              <div class="novorapid-simple-input-with-unit">
                <input type="number" min="0" step="0.1" inputmode="decimal" data-novorapid-glucose autocomplete="off" placeholder="p.sh. 8.4">
                <small>mmol/L</small>
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

          <details class="novorapid-more" open>
            <summary>Më shumë <span>IOB është i detyrueshëm</span></summary>
            <div class="novorapid-protocol-grid" style="padding-top:0">
              <label class="novorapid-simple-field">
                <span>IOB / insulinë aktive</span>
                <div class="novorapid-simple-input-with-unit">
                  <input type="number" min="0" step="0.1" inputmode="decimal" data-novorapid-iob autocomplete="off" placeholder="p.sh. 0">
                  <small>U</small>
                </div>
                <small class="novorapid-help">Shkruaj 0 vetëm kur nuk ka insulinë aktive nga bolusi i fundit.</small>
              </label>
              <label class="novorapid-simple-field">
                <span>Pesha <small style="font-weight:650;color:#64748b">(opsionale)</small></span>
                <div class="novorapid-simple-input-with-unit">
                  <input type="number" min="1" step="0.1" inputmode="decimal" data-novorapid-weight autocomplete="off" placeholder="p.sh. 77">
                  <small>kg</small>
                </div>
                <small class="novorapid-help">Nuk përdoret direkt në formulën e bolusit të këtij kalkulatori.</small>
              </label>
            </div>
          </details>

          <button type="button" class="novorapid-simple-calculate" data-novorapid-calculate>Llogarit dozën</button>
          <div class="novorapid-simple-result" data-novorapid-result aria-live="polite" hidden></div>

          <details class="novorapid-protocol-panel" data-novorapid-protocol-panel>
            <summary>Parametrat e pacientit <span>ruhen vetëm për këtë sesion</span></summary>

            <div class="novorapid-protocol-grid">
              <label class="novorapid-simple-field">
                <span>Insulina totale ditore (TDD)</span>
                <div class="novorapid-simple-input-with-unit">
                  <input type="number" min="1" max="300" step="1" inputmode="decimal" data-protocol-tdd placeholder="p.sh. 50">
                  <small>U/24h</small>
                </div>
                <small class="novorapid-help">Vetëm te të rriturit mund të përdoret si vlerësim fillestar i ICR/ISF; nuk aktivizohet pa verifikim.</small>
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

            <button type="button" class="novorapid-save-protocol" data-derive-protocol>Vlerëso ICR / ISF nga TDD</button>

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

            <p class="novorapid-protocol-note" data-protocol-estimate-note>ICR dhe ISF mund t’i shkruash direkt nëse janë të njohura. Te pediatria përdor vetëm parametrat e verifikuar të pacientit.</p>

            <label class="novorapid-simple-field" style="padding:0 12px 10px">
              <span>Konfirmim klinik</span>
              <span style="display:flex;gap:10px;align-items:flex-start;font-weight:600"><input type="checkbox" data-protocol-confirm style="width:18px;height:18px;min-height:18px;margin-top:2px"> I kam kontrolluar targetin, ICR dhe ISF për këtë pacient.</span>
            </label>

            <div class="novorapid-protocol-actions">
              <button type="button" class="novorapid-save-protocol" data-save-protocol>Aktivizo parametrat</button>
              <button type="button" class="novorapid-clear-protocol" data-clear-protocol>Fshije</button>
            </div>
            <p class="novorapid-protocol-note">NovoRapid FlexPen jep 1–60 U në hapa prej 1 U. Kalkulatori nuk ndan automatikisht doza mbi kapacitetin e pen-it.</p>
          </details>
        </div>

        <footer class="novorapid-simple-foot">
          <div class="novorapid-source-links"><a href="${EMA_URL}" target="_blank" rel="noopener noreferrer">EMA</a><a href="${SMPC_URL}" target="_blank" rel="noopener noreferrer">SmPC</a><a href="${ADA_URL}" target="_blank" rel="noopener noreferrer">ADA 2026</a></div>
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
      if (event.key === 'Enter' && event.target.matches('input,select')) {
        event.preventDefault();
        calculate();
      }
    });

    syncProtocolUI();
    return modal;
  }

  function currentAge() {
    return num(modal?.querySelector('[data-novorapid-age]')?.value);
  }

  function validAgeOrShow() {
    const age = currentAge();
    if (age === null || age < 0) {
      showResult('warning', 'Shkruaj moshën', '<span>Mosha nevojitet për të kontrolluar përdorimin pediatrik.</span>');
      return null;
    }
    if (age < 1) {
      showResult('block', 'Nën 1 vjeç', '<span>Siguria dhe efikasiteti i NovoRapid nuk janë të vendosura për fëmijë nën 1 vjeç në SmPC.</span>');
      return null;
    }
    return age;
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
      status.innerHTML = `<span>✓ Parametrat aktivë</span><small>Target ${protocol.target} · ICR 1:${protocol.icr} · ISF ${protocol.isf} mmol/L/U · ${protocol.ageGroup === 'pediatric' ? 'pediatrik' : 'adult'}</small>`;
      tdd.value = protocol.tdd || '';
      target.value = protocol.target;
      icr.value = protocol.icr;
      isf.value = protocol.isf;
      confirm.checked = true;
      if (panel) panel.open = false;
    } else {
      status.className = 'novorapid-protocol-status is-missing';
      status.innerHTML = '<span>Vendos parametrat një herë</span><small>Target + ICR + ISF të pacientit</small>';
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
    const age = validAgeOrShow();
    if (age === null) return;
    if (age < 18) {
      showResult('block', 'Pediatri · mos derivoni automatikisht', '<span>Te pacientët nën 18 vjeç vendos ICR, ISF dhe targetin e verifikuar individualisht; ky kalkulator nuk krijon faktorë pediatrikë nga TDD.</span>');
      return;
    }

    const tdd = num(modal.querySelector('[data-protocol-tdd]')?.value);
    const target = num(modal.querySelector('[data-protocol-target]')?.value);
    if (!(tdd >= 5 && tdd <= 300)) {
      showResult('warning', 'Shkruaj TDD', '<span>Duhet insulina totale ditore e pacientit (U/24h) për vlerësimin fillestar.</span>');
      return;
    }
    if (!(target >= 3.9 && target <= 12)) {
      showResult('warning', 'Shkruaj targetin', '<span>Vendos targetin e glukozës të përcaktuar për këtë pacient.</span>');
      return;
    }

    const icr = round1(500 / tdd);
    const isf = round1(100 / tdd);
    modal.querySelector('[data-protocol-icr]').value = icr;
    modal.querySelector('[data-protocol-isf]').value = isf;
    modal.querySelector('[data-protocol-confirm]').checked = false;

    const note = modal.querySelector('[data-protocol-estimate-note]');
    if (note) note.textContent = `Vlerësim fillestar adult nga TDD ${tdd} U/24h: ICR ≈ 1:${icr} g dhe ISF ≈ ${isf} mmol/L/U. Këto janë vetëm pika nisjeje; kontrolloji para aktivizimit.`;
    showResult('info', 'ICR / ISF u vlerësuan', '<span>Kontrolloji kundrejt protokollit dhe përgjigjes reale të pacientit, pastaj shëno konfirmimin klinik.</span>');
  }

  function persistProtocol() {
    if (!modal) return;
    const age = validAgeOrShow();
    if (age === null) return;

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
    if (age < 18 && tdd > 0) {
      showResult('warning', 'TDD nuk përdoret për derivim pediatrik', '<span>Te pediatria ICR/ISF duhet të jenë vendosur drejtpërdrejt si parametra individualë; TDD ruhet vetëm si kontekst.</span>');
    }

    const source = tdd > 0 && age >= 18 ? 'adult-tdd-estimate-reviewed' : 'manual-reviewed';
    saveProtocol({ target: round1(target), icr: round1(icr), isf: round1(isf), tdd: tdd > 0 ? round1(tdd) : null, source, ageGroup: ageGroup(age) });
    syncProtocolUI();
    showResult('info', 'Parametrat u aktivizuan', '<span>Kalkulatori tani përdor vetëm këta faktorë të verifikuar për bolusin e vaktit + korrigjimin.</span>');
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
    const age = validAgeOrShow();
    if (age === null) return;

    const glucose = num(modal.querySelector('[data-novorapid-glucose]')?.value);
    const carbs = num(modal.querySelector('[data-novorapid-carbs]')?.value);
    const iob = num(modal.querySelector('[data-novorapid-iob]')?.value);
    const weight = num(modal.querySelector('[data-novorapid-weight]')?.value);
    const protocol = loadProtocol();

    if (!(glucose > 0) || carbs === null || carbs < 0) {
      showResult('warning', 'Plotëso glukozën dhe karbohidratet', '<span>Duhet glukoza aktuale dhe gramët e karbohidrateve të vaktit.</span>');
      return;
    }
    if (iob === null || iob < 0) {
      showResult('warning', 'Shkruaj IOB', '<span>Shkruaj insulinën aktive në U. Përdor 0 vetëm kur nuk ka bolus aktiv që duhet zbritur.</span>');
      return;
    }
    if (weight !== null && weight <= 0) {
      showResult('warning', 'Kontrollo peshën', '<span>Pesha është opsionale, por nëse shkruhet duhet të jetë >0 kg.</span>');
      return;
    }

    if (!protocol) {
      const panel = modal.querySelector('[data-novorapid-protocol-panel]');
      if (panel) panel.open = true;
      showResult('warning', 'Mungojnë parametrat e pacientit', '<span>Vendos targetin, ICR dhe ISF të verifikuara. Te të rriturit mund të përdoret TDD vetëm për vlerësim fillestar.</span>');
      return;
    }

    if (protocol.ageGroup !== ageGroup(age)) {
      const panel = modal.querySelector('[data-novorapid-protocol-panel]');
      if (panel) panel.open = true;
      showResult('block', 'Parametrat nuk përputhen me grupmoshën', '<span>Protokolli i ruajtur është nga një grupmoshë tjetër. Shtyp “Pacient i ri” dhe vendos parametrat e këtij pacienti.</span>');
      return;
    }

    if (glucose < 3.9) {
      showResult('block', 'Hipoglikemi — mos llogarit bolus rutinë', `<span>Glukoza është ${round1(glucose)} mmol/L. Trajto/rivlerëso hipoglikeminë para dozimit rutinë.</span>`);
      return;
    }

    const meal = carbs / protocol.icr;
    const correctionRaw = (glucose - protocol.target) / protocol.isf;
    const correctionAfterIob = correctionRaw - iob;
    const mathematicalTotal = Math.max(0, meal + correctionAfterIob);
    const rounded = Math.max(0, Math.round(mathematicalTotal));

    if (rounded > 60) {
      showResult('block', 'Doza kalon kapacitetin e FlexPen', `<span>Rezultati matematik është ${doseText(round1(mathematicalTotal))} U, ndërsa NovoRapid FlexPen jep maksimum 60 U për një injeksion. Mos e ndani automatikisht pa plan të verifikuar.</span>`);
      return;
    }

    const ketoneWarning = glucose >= 13.9
      ? '<em class="novorapid-result-alert">Glukoza ≥13.9 mmol/L: kontrollo ketonet dhe gjendjen klinike. Në ketone/DKA, dehidrim ose sëmundje akute përdor protokollin përkatës, jo vetëm këtë kalkulator.</em>'
      : '';
    const pedNote = age < 18
      ? '<em class="novorapid-result-alert">Pediatrik: rezultati vlen vetëm me ICR/ISF/target të verifikuara individualisht dhe monitorim të afërt.</em>'
      : '';

    showResult(
      'ready',
      `Doza e llogaritur: ${rounded} U SC`,
      `<div class="novorapid-dose-breakdown">
        <span><b>Vakti</b><strong>${doseText(round1(meal))} U</strong><small>${round1(carbs)} g ÷ ICR ${protocol.icr}</small></span>
        <span><b>Korrigjimi</b><strong>${correctionAfterIob >= 0 ? '+' : ''}${doseText(round1(correctionAfterIob))} U</strong><small>(${round1(glucose)} − ${protocol.target}) ÷ ${protocol.isf} − IOB ${round1(iob)}</small></span>
      </div>
      <p class="novorapid-result-meta">Totali matematik ${doseText(round1(mathematicalTotal))} U → ${rounded} U (FlexPen: hapa 1 U).${weight !== null ? ` Pesha ${round1(weight)} kg është vetëm kontekst.` : ''}</p>
      ${pedNote}${ketoneWarning}`
    );
  }

  function open(trigger) {
    ensureModal();
    lastFocus = trigger || document.activeElement;
    syncProtocolUI();
    modal.hidden = false;
    document.body.classList.add('novorapid-simple-opened');
    window.requestAnimationFrame(() => modal.querySelector('[data-novorapid-age]')?.focus());
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('novorapid-simple-opened');
    lastFocus?.focus?.();
  }

  function resetEncounter(clearPatientProtocol = false) {
    if (!modal) return;
    ['[data-novorapid-age]','[data-novorapid-glucose]','[data-novorapid-weight]','[data-novorapid-carbs]','[data-novorapid-iob]'].forEach(selector => {
      const input = modal.querySelector(selector);
      if (input) input.value = '';
    });
    if (clearPatientProtocol) dropProtocol();
    syncProtocolUI();
    const result = modal.querySelector('[data-novorapid-result]');
    if (result) {
      result.hidden = true;
      result.textContent = '';
      result.className = 'novorapid-simple-result';
    }
    modal.querySelector('[data-novorapid-age]')?.focus();
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