(() => {
  'use strict';

  const VERSION = 'registry-novomix30-simple-v2.0.0';
  const REGISTRY_NUMBER = '2509';
  const EMA_URL = 'https://www.ema.europa.eu/en/medicines/human/EPAR/novomix';
  const SMPC_URL = 'https://www.medicines.org.uk/emc/product/1600/smpc';

  let modal = null;
  let lastFocus = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const num = value => {
    const text = clean(value).replace(',', '.');
    if (text === '') return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function titrationAdjustment(mmol) {
    if (mmol < 4.4) return -2;
    if (mmol <= 6.1) return 0;
    if (mmol <= 7.8) return 2;
    if (mmol <= 10) return 4;
    return 6;
  }

  function ensureModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'novomix-simple-modal';
    modal.id = 'novomix30SimpleModal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'novomixSimpleTitle');
    modal.innerHTML = `
      <div class="novomix-simple-backdrop" data-nm-close></div>
      <section class="novomix-simple-card" tabindex="-1">
        <header class="novomix-simple-head">
          <div>
            <span class="novomix-simple-kicker">INSULIN ASPART 30/70 · SC</span>
            <h2 id="novomixSimpleTitle">NovoMix30 FlexPen</h2>
            <p>Fillim, titrim ose kalim nga insulinë bifazike</p>
          </div>
          <button type="button" class="novomix-simple-close" data-nm-close aria-label="Mbyll">×</button>
        </header>

        <div class="novomix-simple-body">
          <div class="novomix-simple-two">
            <label class="novomix-simple-field">
              <span>Mosha</span>
              <div class="novomix-input-unit"><input type="number" min="0" step="1" inputmode="numeric" data-nm-age autocomplete="off" placeholder="p.sh. 48"><small>vjeç</small></div>
            </label>
            <label class="novomix-simple-field">
              <span>Çfarë po bën?</span>
              <select data-nm-mode>
                <option value="init">Fillim · Diabet tip 2 (T2D)</option>
                <option value="titrate">Rregullim javor · Diabet tip 2 (T2D)</option>
                <option value="switch">Kalim nga insulinë njerëzore bifazike</option>
              </select>
            </label>
          </div>

          <div data-nm-age-note class="novomix-simple-callout"></div>
          <div data-nm-fields></div>

          <button type="button" class="novomix-simple-calculate" data-nm-calculate>Llogarit</button>
          <div class="novomix-simple-result" data-nm-result aria-live="polite" hidden></div>

          <details class="novomix-simple-safety">
            <summary>Kontroll i shpejtë sigurie</summary>
            <div>
              <p><strong>Mos përdor kalkulatorin rutinë</strong> në hipoglikemi aktive, ketone/DKA, dehidrim të rëndë ose sëmundje akute.</p>
              <p>NovoMix30 është vetëm SC. Suspensioni duhet të jetë uniformisht i bardhë/turbullt pas resuspensionit.</p>
              <p>Për titrim përdoret vlera më e ulët pre-meal nga 3 ditët e fundit, doza paraprake dhe ndryshimi jo më shpesh se një herë në javë.</p>
            </div>
          </details>
        </div>

        <footer class="novomix-simple-foot">
          <div><a href="${EMA_URL}" target="_blank" rel="noopener noreferrer">EMA</a><a href="${SMPC_URL}" target="_blank" rel="noopener noreferrer">SmPC</a></div>
          <button type="button" data-nm-reset>Pacient i ri</button>
        </footer>
      </section>`;

    document.body.appendChild(modal);

    modal.addEventListener('change', event => {
      if (event.target.matches('[data-nm-mode]')) {
        renderFields();
        clearResult();
      }
      if (event.target.matches('[data-nm-age]')) updateAgeNote();
    });
    modal.addEventListener('input', event => {
      if (event.target.matches('[data-nm-age]')) updateAgeNote();
    });

    modal.addEventListener('click', event => {
      if (event.target.closest('[data-nm-close]')) close();
      if (event.target.closest('[data-nm-reset]')) reset();
      if (event.target.closest('[data-nm-calculate]')) calculate();
    });

    modal.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('input,select')) {
        event.preventDefault();
        calculate();
      }
    });

    renderFields();
    updateAgeNote();
    return modal;
  }

  function age() {
    return num(modal?.querySelector('[data-nm-age]')?.value);
  }

  function updateAgeNote() {
    const host = modal?.querySelector('[data-nm-age-note]');
    if (!host) return;
    const a = age();
    if (a === null) {
      host.innerHTML = '<strong>Mosha kërkohet</strong><span>NovoMix30 është i aprovuar nga 10 vjeç e lart.</span>';
      return;
    }
    if (a < 10) {
      host.innerHTML = '<strong>Nën 10 vjeç · bllokohet</strong><span>Kalkulatori nuk përdoret për këtë grupmoshë.</span>';
      return;
    }
    if (a < 18) {
      host.innerHTML = `<strong>Pediatrik · ${a} vjeç</strong><span>Produkti lejohet nga 10 vjeç; dozimi dhe titrimi duhen individualizuar me monitorim të afërt.</span>`;
      return;
    }
    host.innerHTML = `<strong>I rritur · ${a} vjeç</strong><span>Dozimi individualizohet sipas glukozës dhe regjimit.</span>`;
  }

  function validateAge() {
    const a = age();
    if (a === null || a < 0) {
      showResult('warning', 'Shkruaj moshën', '<span>Mosha nevojitet para llogaritjes.</span>');
      return null;
    }
    if (a < 10) {
      showResult('block', 'Nën 10 vjeç', '<span>NovoMix30 është i indikuar për të rritur, adoleshentë dhe fëmijë nga 10 vjeç; ky kalkulator bllokohet nën këtë moshë.</span>');
      return null;
    }
    return a;
  }

  function renderFields() {
    if (!modal) return;
    const mode = modal.querySelector('[data-nm-mode]')?.value || 'init';
    const host = modal.querySelector('[data-nm-fields]');
    if (!host) return;

    if (mode === 'init') {
      host.innerHTML = `
        <div class="novomix-simple-callout">
          <strong>Fillim · Diabet tip 2 (T2D)</strong>
          <span>Zgjidh regjimin fillestar të përshkruar në SmPC; pastaj doza individualizohet.</span>
        </div>
        <label class="novomix-simple-field">
          <span>Regjimi fillestar</span>
          <select data-nm-init-regimen>
            <option value="bid">2×/ditë — 6 U mëngjes + 6 U darkë</option>
            <option value="od">1×/ditë — 12 U me darkë</option>
          </select>
        </label>`;
      return;
    }

    if (mode === 'titrate') {
      host.innerHTML = `
        <div class="novomix-simple-two">
          <label class="novomix-simple-field">
            <span>Doza paraprake që po rishikohet</span>
            <div class="novomix-input-unit"><input type="number" min="1" max="60" step="1" inputmode="numeric" data-nm-current-dose placeholder="p.sh. 14"><small>U</small></div>
          </label>
          <label class="novomix-simple-field">
            <span>Glukoza më e ulët pre-meal · 3 ditë</span>
            <div class="novomix-input-unit"><input type="number" min="0" step="0.1" inputmode="decimal" data-nm-glucose placeholder="p.sh. 7.2"><small>mmol/L</small></div>
          </label>
        </div>
        <label class="novomix-simple-check"><input type="checkbox" data-nm-week-ok><span>Kanë kaluar të paktën 7 ditë nga ndryshimi i fundit i dozës</span></label>
        <label class="novomix-simple-check"><input type="checkbox" data-nm-hypo><span>Ka pasur hipoglikemi në këto 3 ditë</span></label>
        <small class="novomix-simple-help">Tabela SmPC: &lt;4.4 → −2 U · 4.4–6.1 → 0 · 6.2–7.8 → +2 U · 7.9–10 → +4 U · &gt;10 → +6 U. Mos rrit dozën nëse ka pasur hipoglikemi.</small>`;
      return;
    }

    host.innerHTML = `
      <div class="novomix-simple-two">
        <label class="novomix-simple-field">
          <span>Doza aktuale për injeksion</span>
          <div class="novomix-input-unit"><input type="number" min="1" max="60" step="1" inputmode="numeric" data-nm-switch-dose placeholder="p.sh. 18"><small>U</small></div>
        </label>
        <label class="novomix-simple-field">
          <span>Regjimi aktual</span>
          <select data-nm-switch-regimen>
            <option value="od">1×/ditë</option>
            <option value="bid" selected>2×/ditë</option>
            <option value="tid">3×/ditë</option>
          </select>
        </label>
      </div>
      <small class="novomix-simple-help">Nga insulinë njerëzore bifazike: nis me të njëjtën dozë dhe të njëjtin regjim, pastaj titro sipas nevojave individuale.</small>`;
  }

  function showResult(level, title, html) {
    const result = modal?.querySelector('[data-nm-result]');
    if (!result) return;
    result.hidden = false;
    result.className = `novomix-simple-result is-${level}`;
    result.innerHTML = `<strong>${esc(title)}</strong>${html}`;
  }

  function clearResult() {
    const result = modal?.querySelector('[data-nm-result]');
    if (!result) return;
    result.hidden = true;
    result.textContent = '';
    result.className = 'novomix-simple-result';
  }

  function pediatricNote(a) {
    return a < 18 ? '<em>Pediatrik ≥10 vjeç: përdor monitorim të afërt dhe individualizo më tej dozën sipas përgjigjes.</em>' : '';
  }

  function calculate() {
    if (!modal) return;
    const a = validateAge();
    if (a === null) return;
    const mode = modal.querySelector('[data-nm-mode]')?.value || 'init';

    if (mode === 'init') {
      const regimen = modal.querySelector('[data-nm-init-regimen]')?.value || 'bid';
      if (regimen === 'od') {
        showResult(a < 18 ? 'warning' : 'ready', '12 U SC me darkë', `<span>Regjim fillestar i SmPC për Diabet tip 2 (T2D); jepet zakonisht menjëherë para vaktit dhe mund të jepet shpejt pas vaktit kur nevojitet.</span>${pediatricNote(a)}`);
      } else {
        showResult(a < 18 ? 'warning' : 'ready', '6 U mëngjes + 6 U darkë', `<span>Regjim fillestar i SmPC për Diabet tip 2 (T2D); jepet zakonisht menjëherë para vakteve.</span>${pediatricNote(a)}`);
      }
      return;
    }

    if (mode === 'switch') {
      const dose = num(modal.querySelector('[data-nm-switch-dose]')?.value);
      const regimen = modal.querySelector('[data-nm-switch-regimen]')?.value || 'bid';
      if (!(dose > 0)) {
        showResult('warning', 'Shkruaj dozën aktuale', '<span>Duhet doza për injeksion e insulinës njerëzore bifazike që po zëvendësohet.</span>');
        return;
      }
      if (dose > 60) {
        showResult('block', 'Mbi 60 U për injeksion', '<span>NovoMix30 FlexPen jep maksimum 60 U për një injeksion. Mos e ndani automatikisht pa plan të verifikuar.</span>');
        return;
      }
      const regimenText = regimen === 'od' ? '1×/ditë' : regimen === 'tid' ? '3×/ditë' : '2×/ditë';
      showResult(a < 18 ? 'warning' : 'ready', `${dose} U · ${regimenText}`, `<span>Nis me të njëjtën dozë dhe të njëjtin regjim si insulina njerëzore bifazike, me monitorim të afërt dhe titrim individual.</span>${pediatricNote(a)}`);
      return;
    }

    const current = num(modal.querySelector('[data-nm-current-dose]')?.value);
    const glucose = num(modal.querySelector('[data-nm-glucose]')?.value);
    const hypo = Boolean(modal.querySelector('[data-nm-hypo]')?.checked);
    const weekOk = Boolean(modal.querySelector('[data-nm-week-ok]')?.checked);

    if (!(current > 0) || !(glucose > 0)) {
      showResult('warning', 'Plotëso 2 vlerat', '<span>Shkruaj dozën paraprake dhe vlerën më të ulët pre-meal nga 3 ditët e fundit.</span>');
      return;
    }
    if (current > 60) {
      showResult('block', 'Doza aktuale >60 U', '<span>NovoMix30 FlexPen jep maksimum 60 U për injeksion.</span>');
      return;
    }
    if (!weekOk) {
      showResult('block', 'Titrimi jo më shpesh se 1× në javë', '<span>Konfirmo se kanë kaluar të paktën 7 ditë nga ndryshimi i fundit para përdorimit të tabelës së titrimit.</span>');
      return;
    }

    let adjustment = titrationAdjustment(glucose);
    if (hypo && adjustment > 0) adjustment = 0;
    const proposed = current + adjustment;

    if (proposed > 60) {
      showResult('block', 'Doza e propozuar kalon 60 U', `<span>${current} U ${adjustment >= 0 ? '+' : ''}${adjustment} U = ${proposed} U. Kërko rishikim të regjimit/device-it.</span>`);
      return;
    }
    if (proposed < 1) {
      showResult('block', 'Kërko rishikim klinik', `<span>Algoritmi jep ${proposed} U. Mos e konverto automatikisht në dozë tjetër.</span>`);
      return;
    }

    const delta = adjustment === 0 ? 'pa ndryshim' : `${adjustment > 0 ? '+' : ''}${adjustment} U`;
    const hypoNote = hypo ? '<em>Ka pasur hipoglikemi: doza nuk u rrit.</em>' : '';
    const lowNote = glucose < 3.9 ? '<em>Vlera përfshin hipoglikemi; nevojitet rivlerësim klinik përveç reduktimit sipas tabelës.</em>' : '';

    showResult(
      a < 18 || adjustment < 0 || glucose < 3.9 ? 'warning' : 'ready',
      `Doza e re: ${proposed} U`,
      `<div class="novomix-result-row"><span>Doza aktuale</span><b>${current} U</b></div>
       <div class="novomix-result-row"><span>Ndryshimi</span><b>${delta}</b></div>
       <div class="novomix-result-row"><span>Glukoza më e ulët</span><b>${glucose} mmol/L</b></div>
       ${hypoNote}${lowNote}${pediatricNote(a)}`
    );
  }

  function open(trigger) {
    ensureModal();
    lastFocus = trigger || document.activeElement;
    modal.hidden = false;
    document.body.classList.add('novomix-simple-opened');
    window.requestAnimationFrame(() => modal.querySelector('[data-nm-age]')?.focus());
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('novomix-simple-opened');
    lastFocus?.focus?.();
  }

  function reset() {
    if (!modal) return;
    const ageInput = modal.querySelector('[data-nm-age]');
    if (ageInput) ageInput.value = '';
    const mode = modal.querySelector('[data-nm-mode]');
    if (mode) mode.value = 'init';
    renderFields();
    updateAgeNote();
    clearResult();
    ageInput?.focus();
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

  window.MEDINDEX_NOVOMIX30_SIMPLE = Object.freeze({
    version: VERSION,
    registryNumber: REGISTRY_NUMBER,
    open: () => open(document.activeElement),
    titrationAdjustment,
  });
})();