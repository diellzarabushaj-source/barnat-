(() => {
  'use strict';

  const VERSION = 'registry-insulin-final-safety-v1.0.0';
  const NOVORAPID_PROTOCOL_KEY = 'medindex:novorapid:patient-protocol:v4';
  const APIDRA_PROTOCOL_KEY = 'medindex:apidra:patient-protocol:v2';

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const num = value => {
    const text = clean(value).replace(',', '.');
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const round1 = value => Math.round(value * 10) / 10;
  const isWholeUnit = value => Math.abs(value - Math.round(value)) < 1e-9;

  function readSession(key) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  function stop(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function showNovoRapid(title, text) {
    const result = document.querySelector('#novorapidSimpleModal [data-novorapid-result]');
    if (!result) return;
    result.hidden = false;
    result.className = 'novorapid-simple-result is-warning';
    result.innerHTML = `<strong>${title}</strong><span>${text}</span>`;
  }

  function showOther(level, title, text) {
    const result = document.querySelector('#otherInsulinSimpleModal [data-ois-result]');
    if (!result) return;
    result.hidden = false;
    result.className = `ois-result is-${level}`;
    result.innerHTML = `<strong>${title}</strong><span>${text}</span>`;
  }

  function guardNovoRapidPediatricPrecision(event) {
    if (!event.target.closest('#novorapidSimpleModal [data-novorapid-calculate]')) return false;
    const root = document.getElementById('novorapidSimpleModal');
    if (!root) return false;
    const age = num(root.querySelector('[data-novorapid-age]')?.value);
    if (!(age >= 1 && age < 18)) return false;

    const glucose = num(root.querySelector('[data-novorapid-glucose]')?.value);
    const carbs = num(root.querySelector('[data-novorapid-carbs]')?.value);
    const iob = num(root.querySelector('[data-novorapid-iob]')?.value);
    const protocol = readSession(NOVORAPID_PROTOCOL_KEY);
    const target = num(protocol?.target);
    const icr = num(protocol?.icr);
    const isf = num(protocol?.isf);

    if (!(glucose >= 3.9) || carbs === null || carbs < 0 || iob === null || iob < 0) return false;
    if (!(target >= 3.9) || !(icr > 0) || !(isf > 0) || protocol?.ageGroup !== 'pediatric') return false;

    const total = Math.max(0, (carbs / icr) + ((glucose - target) / isf) - iob);
    if (total <= 0 || isWholeUnit(total)) return false;

    stop(event);
    showNovoRapid(
      'Pediatrik · kërkohet vendim për hapin e pen-it',
      `Rezultati matematik është ${round1(total)} U, ndërsa NovoRapid FlexPen jep vetëm hapa prej 1 U. Kalkulatori nuk e rrumbullakos automatikisht një dozë pediatrike në ${Math.round(total)} U. Zgjidh dozën/pajisjen sipas planit individual të pacientit.`
    );
    return true;
  }

  function guardApidraPediatricPrecision(event) {
    if (!event.target.closest('#otherInsulinSimpleModal [data-ois-calculate]')) return false;
    const root = document.getElementById('otherInsulinSimpleModal');
    if (!root || clean(root.querySelector('#oisTitle')?.textContent).toLowerCase() !== 'apidra solostar') return false;
    const age = num(root.querySelector('[data-ois-age]')?.value);
    if (!(age >= 6 && age < 18)) return false;

    const glucose = num(root.querySelector('[data-api-glucose]')?.value);
    const carbs = num(root.querySelector('[data-api-carbs]')?.value);
    const iob = num(root.querySelector('[data-api-iob]')?.value);
    const protocol = readSession(APIDRA_PROTOCOL_KEY);
    const target = num(protocol?.target);
    const icr = num(protocol?.icr);
    const isf = num(protocol?.isf);

    if (!(glucose >= 3.9) || carbs === null || carbs < 0 || iob === null || iob < 0) return false;
    if (!(target >= 3.9) || !(icr > 0) || !(isf > 0) || protocol?.ageGroup !== 'pediatric') return false;

    const total = Math.max(0, (carbs / icr) + ((glucose - target) / isf) - iob);
    if (total <= 0 || isWholeUnit(total)) return false;

    stop(event);
    showOther(
      'warning',
      'Pediatrik · kërkohet vendim për hapin e pen-it',
      `Rezultati matematik është ${round1(total)} U, ndërsa Apidra SoloStar zgjedh doza në hapa prej 1 U. Kalkulatori nuk e rrumbullakos automatikisht në ${Math.round(total)} U për pacient pediatrik; verifiko dozën/pajisjen sipas planit individual.`
    );
    return true;
  }

  function guardPlannedWholeUnitDoses(event) {
    if (!event.target.closest('#otherInsulinSimpleModal [data-ois-calculate]')) return false;
    const root = document.getElementById('otherInsulinSimpleModal');
    if (!root) return false;
    const title = clean(root.querySelector('#oisTitle')?.textContent).toLowerCase();
    const mode = root.querySelector('[data-ois-mode]')?.value || '';

    const rules = [
      { product:'levemir flexpen', mode:'individual', selector:'[data-lev-planned]', max:60, device:'Levemir FlexPen' },
      { product:'semglee', mode:'individual', selector:'[data-sem-planned]', max:80, device:'Semglee pre-filled pen' },
    ];
    const rule = rules.find(item => title === item.product && mode === item.mode);
    if (!rule) return false;

    const dose = num(root.querySelector(rule.selector)?.value);
    if (!(dose > 0) || isWholeUnit(dose)) return false;

    stop(event);
    showOther(
      'warning',
      'Doza nuk përputhet me hapin e pen-it',
      `${rule.device} jep doza në hapa prej 1 U. Është futur ${dose} U. Mos e rrumbullakos automatikisht; shkruaj dozën e plotë të verifikuar klinikisht (1–${rule.max} U për injeksion).`
    );
    return true;
  }

  function guardTresibaPresentationAndPremix(event) {
    if (!event.target.closest('#otherInsulinSimpleModal [data-ois-calculate]')) return false;
    const root = document.getElementById('otherInsulinSimpleModal');
    if (!root || clean(root.querySelector('#oisTitle')?.textContent).toLowerCase() !== 'tresiba') return false;
    const mode = root.querySelector('[data-ois-mode]')?.value || '';

    if (mode === 't2_switch' && root.querySelector('[data-tre-switch-type]')?.value === 'premix') {
      stop(event);
      showOther(
        'manual',
        'Premix/self-mixed · kërko komponentin bazal',
        'Për kalim në Tresiba, SmPC e bazon dozën te doza e mëparshme BAZALE, jo te i gjithë totali i premix-it. Mos përdor automatikisht dozën totale të premix-it; identifiko komponentin bazal dhe bëj medication reconciliation para switch-it.'
      );
      return true;
    }

    if (mode === 'individual') {
      const dose = num(root.querySelector('[data-tre-planned]')?.value);
      if (dose > 0 && !isWholeUnit(dose)) {
        stop(event);
        showOther(
          'manual',
          'Verifiko prezantimin e Tresiba',
          `Është futur ${dose} U. Tresiba ka prezantime/pajisje me hapa të ndryshëm dozimi; kalkulatori nuk e rrumbullakos pa e ditur pajisjen konkrete. Verifiko pen-in/cartridge-in dhe shkruaj një dozë që pajisja mund ta japë saktë.`
        );
        return true;
      }
    }
    return false;
  }

  function patchTresibaSwitch() {
    const root = document.getElementById('otherInsulinSimpleModal');
    if (!root || clean(root.querySelector('#oisTitle')?.textContent).toLowerCase() !== 'tresiba') return;
    const select = root.querySelector('[data-tre-switch-type]');
    if (!select) return;

    const once = select.querySelector('option[value="once"]');
    if (once) once.textContent = 'Bazale 1×/ditë / basal-bolus';
    if (!select.querySelector('option[value="premix"]')) {
      const option = document.createElement('option');
      option.value = 'premix';
      option.textContent = 'Premix / self-mixed';
      select.appendChild(option);
    }
    const callout = select.closest('.ois-two')?.previousElementSibling;
    const span = callout?.querySelector('span');
    if (span) span.textContent = 'Te premix/self-mixed duhet të njihet komponenti bazal; mos përdor totalin e premix-it si dozë bazale.';
  }

  document.addEventListener('click', event => {
    if (guardNovoRapidPediatricPrecision(event)) return;
    if (guardApidraPediatricPrecision(event)) return;
    if (guardPlannedWholeUnitDoses(event)) return;
    guardTresibaPresentationAndPremix(event);
  }, true);

  const observer = new MutationObserver(() => patchTresibaSwitch());
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('change', event => {
    if (event.target.matches('#otherInsulinSimpleModal [data-ois-mode]')) queueMicrotask(patchTresibaSwitch);
  });

  window.MEDINDEX_INSULIN_FINAL_SAFETY = Object.freeze({ version:VERSION, patchTresibaSwitch });
})();
