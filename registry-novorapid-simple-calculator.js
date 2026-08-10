(() => {
  'use strict';

  const VERSION = 'registry-novorapid-simple-v1.0.0';
  const REGISTRY_NUMBER = '2508';
  const SOURCE_URL = 'https://www.ema.europa.eu/en/medicines/human/EPAR/novorapid';

  let modal = null;
  let lastFocus = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const numberValue = value => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

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
            <p>Kalkulator i shpejtë</p>
          </div>
          <button type="button" class="novorapid-simple-close" data-novorapid-close aria-label="Mbyll">×</button>
        </header>

        <div class="novorapid-simple-body">
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
              <input type="number" min="1" step="0.1" inputmode="decimal" data-novorapid-weight autocomplete="off" placeholder="p.sh. 78">
              <small>kg</small>
            </div>
          </label>

          <label class="novorapid-simple-field">
            <span>Kaloritë e vaktit, përafërsisht</span>
            <select data-novorapid-calories>
              <option value="">Zgjidh</option>
              <option value="500">≤ 500 kcal</option>
              <option value="1000">500–1000 kcal</option>
              <option value="1500">1000–1500 kcal</option>
              <option value="1500plus">1500+ kcal</option>
            </select>
          </label>

          <button type="button" class="novorapid-simple-calculate" data-novorapid-calculate>Llogarit</button>

          <div class="novorapid-simple-result" data-novorapid-result aria-live="polite" hidden></div>
        </div>

        <footer class="novorapid-simple-foot">
          <a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">Burimi zyrtar</a>
          <button type="button" data-novorapid-reset>Pacient i ri</button>
        </footer>
      </section>`;

    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (event.target.closest('[data-novorapid-close]')) close();
      if (event.target.closest('[data-novorapid-reset]')) reset();
      if (event.target.closest('[data-novorapid-calculate]')) calculate();
    });

    modal.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('input,select')) {
        event.preventDefault();
        calculate();
      }
    });

    return modal;
  }

  function showResult(level, title, text) {
    const result = modal?.querySelector('[data-novorapid-result]');
    if (!result) return;
    result.hidden = false;
    result.className = `novorapid-simple-result is-${level}`;
    result.innerHTML = `<strong>${title}</strong><span>${text}</span>`;
  }

  function calculate() {
    if (!modal) return;

    const glucose = numberValue(modal.querySelector('[data-novorapid-glucose]')?.value);
    const weight = numberValue(modal.querySelector('[data-novorapid-weight]')?.value);
    const calories = clean(modal.querySelector('[data-novorapid-calories]')?.value);

    if (glucose === null || glucose <= 0 || weight === null || weight <= 0 || !calories) {
      showResult('warning', 'Plotëso 3 fushat', 'Shkruaj glukozën, peshën dhe zgjidh kaloritë e përafërta të vaktit.');
      return;
    }

    if (glucose < 3.9) {
      showResult('block', 'Mos jep correction bolus', `Glukoza është ${glucose} mmol/L. Vlerëso dhe trajto hipoglikeminë sipas protokollit klinik para insulinës së vaktit.`);
      return;
    }

    showResult(
      'ready',
      'Kërkohet protokoll i verifikuar',
      `Glukoza ${glucose} mmol/L · ${weight} kg · vakti ${calories === '1500plus' ? '1500+ kcal' : `deri rreth ${calories} kcal`}. Doza e NovoRapid nuk llogaritet në mënyrë të sigurt vetëm nga glukoza, pesha dhe kaloritë; apliko ICR/ISF dhe targetin e verifikuar të pacientit në prapavijë.`
    );
  }

  function open(trigger) {
    ensureModal();
    lastFocus = trigger || document.activeElement;
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

  function reset() {
    if (!modal) return;
    modal.querySelectorAll('input').forEach(input => { input.value = ''; });
    modal.querySelectorAll('select').forEach(select => { select.selectedIndex = 0; });
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
    if (!modal?.hidden && event.key === 'Escape') close();
  });

  window.MEDINDEX_NOVORAPID_SIMPLE = Object.freeze({
    version: VERSION,
    registryNumber: REGISTRY_NUMBER,
    open: () => open(document.activeElement),
  });
})();