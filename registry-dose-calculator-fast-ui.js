(() => {
  'use strict';

  const VERSION = 'dose-calculator-fast-ux-v1';
  const AUTO_DELAY_MS = 220;
  const WEIGHT_PRESETS = Object.freeze([5, 10, 15, 30, 40]);
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const numberValue = value => {
    const raw = clean(value);
    if (!raw) return null;
    const parsed = Number(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  let modal = null;
  let autoTimer = 0;
  let lastFingerprint = '';

  function fieldLabel(control) {
    return control?.closest('label') || null;
  }

  function availableGroups() {
    return Array.from(modal.group.options)
      .map(option => ({ value:clean(option.value), label:clean(option.textContent) }))
      .filter(option => option.value);
  }

  function setGroup(value, announce = true) {
    if (!value || !availableGroups().some(option => option.value === value)) return false;
    const changed = modal.group.value !== value;
    modal.group.value = value;
    if (changed && announce) modal.group.dispatchEvent(new Event('change', { bubbles:true }));
    syncGroupButtons();
    return true;
  }

  function syncGroupButtons() {
    const groups = availableGroups();
    modal.groupButtons.replaceChildren();
    groups.forEach(group => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dose-calculator-group-choice';
      button.dataset.doseGroupChoice = group.value;
      button.textContent = group.label;
      const selected = modal.group.value === group.value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      modal.groupButtons.appendChild(button);
    });
    modal.groupField?.classList.toggle('dose-calculator-fast-hidden', groups.length <= 1);
    if (groups.length === 1 && modal.group.value !== groups[0].value) setGroup(groups[0].value);
  }

  function inferGroupFromAge() {
    const age = numberValue(modal.age.value);
    if (age === null || age < 0) return;
    const ageMonths = modal.ageUnit.value === 'months' ? age : age * 12;
    const inferred = ageMonths < 216 ? 'pediatric' : 'adult';
    setGroup(inferred);
  }

  function updateIndicationVisibility() {
    const visibleOptions = Array.from(modal.indication.options).filter(option => clean(option.value));
    modal.indicationField?.classList.toggle('dose-calculator-fast-hidden', visibleOptions.length <= 1);
  }

  function updateWeightPresets() {
    const enabled = !modal.weight.disabled;
    modal.weightPresets.hidden = !enabled;
    modal.weightField?.classList.toggle('dose-calculator-weight-disabled', !enabled);
    const current = numberValue(modal.weight.value);
    modal.weightPresets.querySelectorAll('[data-dose-weight-preset]').forEach(button => {
      const selected = current !== null && Number(button.dataset.doseWeightPreset) === current;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    modal.fastNoteText.textContent = enabled
      ? 'Zgjidh pacientin, shkruaj moshën dhe peshën — rezultati del automatikisht.'
      : 'Zgjidh pacientin dhe shkruaj moshën — pesha nuk nevojitet për këtë skemë.';
  }

  function readyForAutomaticCalculation() {
    if (!modal || modal.root.hidden || !clean(modal.indication.value) || !clean(modal.group.value)) return false;
    const age = numberValue(modal.age.value);
    if (age === null || age < 0) return false;
    if (!modal.weight.disabled) {
      const weight = numberValue(modal.weight.value);
      if (weight === null || weight <= 0) return false;
    }
    return true;
  }

  function calculationFingerprint() {
    return [
      clean(modal.productName.textContent), clean(modal.indication.value), clean(modal.group.value),
      clean(modal.age.value), clean(modal.ageUnit.value), modal.weight.disabled ? 'no-weight' : clean(modal.weight.value),
    ].join('|');
  }

  function scheduleAutomaticCalculation() {
    clearTimeout(autoTimer);
    if (!readyForAutomaticCalculation()) return;
    autoTimer = window.setTimeout(() => {
      const fingerprint = calculationFingerprint();
      if (!fingerprint || fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      modal.submit.click();
    }, AUTO_DELAY_MS);
  }

  function refreshFastFlow() {
    lastFingerprint = '';
    updateIndicationVisibility();
    syncGroupButtons();
    inferGroupFromAge();
    updateWeightPresets();
    modal.submit.textContent = 'Kalkulo tani';
    modal.autoStatus.textContent = 'Rezultati shfaqet automatikisht sapo të plotësohen fushat.';
    requestAnimationFrame(() => requestAnimationFrame(() => modal.age.focus()));
    scheduleAutomaticCalculation();
  }

  function initialize() {
    const root = document.getElementById('doseCalculatorModal');
    if (!root || root.dataset.fastDoseUx === VERSION) return false;
    const form = root.querySelector('.dose-calculator-form');
    const product = root.querySelector('[data-dose-product-name]');
    const indication = root.querySelector('[data-dose-indication]');
    const group = root.querySelector('[data-dose-group]');
    const age = root.querySelector('[data-dose-age]');
    const ageUnit = root.querySelector('[data-dose-age-unit]');
    const weight = root.querySelector('[data-dose-weight]');
    const submit = root.querySelector('[data-dose-calculate]');
    const productOutput = root.querySelector('[data-dose-product-output]');
    if (!form || !product || !indication || !group || !age || !ageUnit || !weight || !submit) return false;

    const fastNote = document.createElement('div');
    fastNote.className = 'dose-calculator-fast-note';
    fastNote.innerHTML = '<strong>Doza në 10 sekonda</strong><span data-dose-fast-note></span>';
    product.insertAdjacentElement('afterend', fastNote);

    const groupButtons = document.createElement('div');
    groupButtons.className = 'dose-calculator-group-choices';
    groupButtons.setAttribute('role', 'group');
    groupButtons.setAttribute('aria-label', 'Zgjidh grupmoshën');
    group.insertAdjacentElement('afterend', groupButtons);
    group.classList.add('dose-calculator-visually-hidden');

    const weightPresets = document.createElement('div');
    weightPresets.className = 'dose-calculator-weight-presets';
    weightPresets.setAttribute('aria-label', 'Pesha të shpejta');
    WEIGHT_PRESETS.forEach(value => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.doseWeightPreset = String(value);
      button.textContent = `${value} kg`;
      button.setAttribute('aria-pressed', 'false');
      weightPresets.appendChild(button);
    });
    fieldLabel(weight)?.appendChild(weightPresets);

    const autoStatus = document.createElement('p');
    autoStatus.className = 'dose-calculator-auto-status';
    submit.insertAdjacentElement('afterend', autoStatus);

    const productField = fieldLabel(productOutput);
    productField?.classList.add('dose-calculator-fast-hidden');

    modal = {
      root, form, productName:product, indication, group, age, ageUnit, weight, submit,
      groupButtons, weightPresets, autoStatus,
      fastNoteText:fastNote.querySelector('[data-dose-fast-note]'),
      indicationField:fieldLabel(indication), groupField:fieldLabel(group), weightField:fieldLabel(weight),
    };

    root.dataset.fastDoseUx = VERSION;
    root.querySelector('.dose-calculator-dialog')?.setAttribute('data-fast-dose-ux', VERSION);

    groupButtons.addEventListener('click', event => {
      const button = event.target.closest('[data-dose-group-choice]');
      if (!button) return;
      setGroup(button.dataset.doseGroupChoice);
      scheduleAutomaticCalculation();
      if (!modal.weight.disabled) modal.weight.focus();
      else modal.age.focus();
    });

    weightPresets.addEventListener('click', event => {
      const button = event.target.closest('[data-dose-weight-preset]');
      if (!button || modal.weight.disabled) return;
      modal.weight.value = button.dataset.doseWeightPreset;
      modal.weight.dispatchEvent(new Event('input', { bubbles:true }));
      updateWeightPresets();
      scheduleAutomaticCalculation();
    });

    indication.addEventListener('change', () => {
      requestAnimationFrame(() => {
        updateWeightPresets();
        scheduleAutomaticCalculation();
      });
    });
    group.addEventListener('change', () => {
      syncGroupButtons();
      scheduleAutomaticCalculation();
    });
    age.addEventListener('input', () => {
      inferGroupFromAge();
      scheduleAutomaticCalculation();
    });
    ageUnit.addEventListener('change', () => {
      inferGroupFromAge();
      scheduleAutomaticCalculation();
    });
    weight.addEventListener('input', () => {
      updateWeightPresets();
      scheduleAutomaticCalculation();
    });
    form.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (readyForAutomaticCalculation()) submit.click();
    });

    new MutationObserver(() => {
      if (!root.hidden) refreshFastFlow();
      else clearTimeout(autoTimer);
    }).observe(root, { attributes:true, attributeFilter:['hidden'] });

    if (!root.hidden) refreshFastFlow();
    document.documentElement.dataset.doseCalculatorFastUx = VERSION;
    return true;
  }

  if (!initialize()) {
    const observer = new MutationObserver(() => {
      if (initialize()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
  }
})();
