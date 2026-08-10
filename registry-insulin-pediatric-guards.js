(() => {
  'use strict';

  function injectNovoRapidAge() {
    const modal = document.querySelector('#novorapidSimpleModal');
    if (!modal || modal.querySelector('[data-novorapid-age]')) return;
    const grid = modal.querySelector('.novorapid-primary-grid');
    if (!grid) return;
    const label = document.createElement('label');
    label.className = 'novorapid-simple-field';
    label.innerHTML = `<span>Mosha</span><div class="novorapid-simple-input-with-unit"><input type="number" min="0" step="1" inputmode="numeric" data-novorapid-age autocomplete="off" placeholder="p.sh. 12"><small>vjeç</small></div><small class="novorapid-help">NovoRapid FlexPen: i aprovuar nga 1 vjeç. Te pediatria doza individualizohet sipas ICR/ISF, vakteve dhe monitorimit.</small>`;
    grid.appendChild(label);
  }

  function injectNovoMixAge() {
    const modal = document.querySelector('#novomix30SimpleModal');
    if (!modal || modal.querySelector('[data-nm-age]')) return;
    const body = modal.querySelector('.novomix-simple-body');
    const modeField = body?.querySelector('.novomix-simple-field');
    if (!body || !modeField) return;
    const label = document.createElement('label');
    label.className = 'novomix-simple-field';
    label.innerHTML = `<span>Mosha</span><div class="novomix-input-unit"><input type="number" min="0" step="1" inputmode="numeric" data-nm-age autocomplete="off" placeholder="p.sh. 16"><small>vjeç</small></div><small class="novomix-simple-help">NovoMix30: i aprovuar për të rritur, adoleshentë dhe fëmijë ≥10 vjeç; 6–9 vjeç kanë vetëm eksperiencë klinike të kufizuar.</small>`;
    body.insertBefore(label, modeField);
  }

  function showNovoRapidAgeError(text) {
    const result = document.querySelector('#novorapidSimpleModal [data-novorapid-result]');
    if (!result) return;
    result.hidden = false;
    result.className = 'novorapid-simple-result is-block';
    result.innerHTML = `<strong>Kontrollo moshën</strong><span>${text}</span>`;
  }

  function showNovoMixAgeError(text) {
    const result = document.querySelector('#novomix30SimpleModal [data-nm-result]');
    if (!result) return;
    result.hidden = false;
    result.className = 'novomix-simple-result is-block';
    result.innerHTML = `<strong>Kontrollo moshën</strong><span>${text}</span>`;
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#novorapidSimpleModal [data-novorapid-calculate]')) {
      injectNovoRapidAge();
      const value = Number(document.querySelector('#novorapidSimpleModal [data-novorapid-age]')?.value);
      if (!Number.isFinite(value) || value <= 0) {
        event.preventDefault(); event.stopImmediatePropagation();
        showNovoRapidAgeError('Shkruaj moshën. NovoRapid është i aprovuar nga 1 vjeç.');
      } else if (value < 1) {
        event.preventDefault(); event.stopImmediatePropagation();
        showNovoRapidAgeError('Nën 1 vjeç: siguria dhe efikasiteti i NovoRapid nuk janë të vendosura në SmPC.');
      }
    }

    if (event.target.closest('#novomix30SimpleModal [data-nm-calculate]')) {
      injectNovoMixAge();
      const value = Number(document.querySelector('#novomix30SimpleModal [data-nm-age]')?.value);
      if (!Number.isFinite(value) || value <= 0) {
        event.preventDefault(); event.stopImmediatePropagation();
        showNovoMixAgeError('Shkruaj moshën. NovoMix30 është i aprovuar nga 10 vjeç.');
      } else if (value < 10) {
        event.preventDefault(); event.stopImmediatePropagation();
        showNovoMixAgeError(value >= 6 ? '6–9 vjeç: ka eksperiencë klinike të kufizuar, por indikacioni i SmPC është nga 10 vjeç; mos përdor kalkulatorin rutinë.' : 'Nën 6 vjeç: nuk ka të dhëna për NovoMix30; kalkulatori bllokohet.');
      }
    }
  }, true);

  const observer = new MutationObserver(() => { injectNovoRapidAge(); injectNovoMixAge(); });
  observer.observe(document.documentElement, { childList:true, subtree:true });
  injectNovoRapidAge();
  injectNovoMixAge();
})();