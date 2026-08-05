(() => {
  'use strict';

  const VERSION = 'dose-calculator-fast-ux-v2';
  const AUTO_DELAY_MS = 220;
  const MAX_AGE_MONTHS = 1560;
  const MAX_WEIGHT_KG = 350;
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
  let copiedTimer = 0;

  function fieldLabel(control) {
    return control?.closest('label') || null;
  }

  function ageMonthsValue() {
    const age = numberValue(modal?.age?.value);
    if (age === null || age < 0) return null;
    return modal.ageUnit.value === 'months' ? age : age * 12;
  }

  function weightValue() {
    if (!modal || modal.weight.disabled) return null;
    return numberValue(modal.weight.value);
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

  function inferredGroupForAge() {
    const ageMonths = ageMonthsValue();
    if (ageMonths === null) return '';
    return ageMonths < 216 ? 'pediatric' : 'adult';
  }

  function inferGroupFromAge() {
    const inferred = inferredGroupForAge();
    if (!inferred) return;
    setGroup(inferred);
  }

  function ageGroupMismatch() {
    const inferred = inferredGroupForAge();
    if (!inferred) return false;
    const groups = availableGroups().map(group => group.value);
    return !groups.includes(inferred);
  }

  function updateIndicationVisibility() {
    const options = Array.from(modal.indication.options).filter(option => clean(option.value));
    modal.indicationField?.classList.toggle('dose-calculator-fast-hidden', options.length <= 1);
    modal.indicationField?.classList.toggle('dose-calculator-fast-span', options.length > 1);
    modal.indicationSummary.textContent = options.length === 1
      ? `Indikacioni: ${clean(options[0].textContent)}`
      : 'Zgjidhe indikacionin klinik.';
  }

  function updateWeightUi() {
    const enabled = !modal.weight.disabled;
    modal.weightField?.classList.toggle('dose-calculator-fast-hidden', !enabled);
    modal.weightPresets.hidden = !enabled;
    const current = numberValue(modal.weight.value);
    modal.weightPresets.querySelectorAll('[data-dose-weight-preset]').forEach(button => {
      const selected = current !== null && Number(button.dataset.doseWeightPreset) === current;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    modal.fastNoteText.textContent = enabled
      ? 'Shkruaj moshën dhe peshën e matur; doza del automatikisht.'
      : 'Shkruaj vetëm moshën; pesha nuk nevojitet për këtë skemë.';
  }

  function inputState() {
    if (!modal || modal.root.hidden) return { ready:false, message:'' };
    if (!clean(modal.indication.value)) return { ready:false, message:'Zgjidhe indikacionin.' };
    const ageMonths = ageMonthsValue();
    if (ageMonths === null) return { ready:false, message:'Shkruaje moshën e pacientit.' };
    if (ageMonths > MAX_AGE_MONTHS) return { ready:false, invalid:true, message:'Kontrolloje moshën e shkruar.' };
    if (!clean(modal.group.value)) return { ready:false, message:'Grupmosha zgjidhet automatikisht nga mosha.' };
    if (!modal.weight.disabled) {
      const weight = weightValue();
      if (weight === null || weight <= 0) return { ready:false, message:'Shkruaje peshën e matur në kilogramë.' };
      if (weight > MAX_WEIGHT_KG) return { ready:false, invalid:true, message:'Kontrolloje peshën e shkruar.' };
    }
    if (ageGroupMismatch()) {
      return { ready:true, warning:true, message:'Mosha nuk përputhet me grupin e lejuar; sistemi do ta bllokojë dozën.' };
    }
    return { ready:true, message:'Gati — rezultati po llogaritet automatikisht.' };
  }

  function updateProgress() {
    const state = inputState();
    const success = !modal.result.hidden && !modal.result.classList.contains('is-error') && clean(modal.resultText.textContent);
    const error = !modal.result.hidden && modal.result.classList.contains('is-error');
    if (success) state.message = 'Doza u llogarit — kontrolloje dhe kopjo udhëzimin.';
    else if (error) state.message = 'Rishiko paralajmërimin klinik para se të vazhdosh.';
    modal.submit.disabled = !state.ready;
    modal.autoStatus.textContent = state.message;
    modal.autoStatus.classList.toggle('is-warning', Boolean(state.warning));
    modal.autoStatus.classList.toggle('is-invalid', Boolean(state.invalid));
    modal.progress.dataset.state = state.ready ? 'ready' : 'waiting';
    modal.progressAge.classList.toggle('is-done', ageMonthsValue() !== null);
    modal.progressWeight.classList.toggle('is-done', modal.weight.disabled || (weightValue() !== null && weightValue() > 0));
    modal.progressResult.classList.toggle('is-done', !modal.result.hidden && !modal.result.classList.contains('is-error'));
    return state;
  }

  function calculationFingerprint() {
    return [
      clean(modal.productName.textContent), clean(modal.indication.value), clean(modal.group.value),
      clean(modal.age.value), clean(modal.ageUnit.value), modal.weight.disabled ? 'no-weight' : clean(modal.weight.value),
    ].join('|');
  }

  function syncResultActions() {
    const visible = !modal.result.hidden;
    const success = visible && !modal.result.classList.contains('is-error') && clean(modal.resultText.textContent);
    modal.resultActions.hidden = !success;
    updateProgress();
    if (success && window.matchMedia?.('(max-width: 760px)').matches) {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      modal.result.scrollIntoView({ block:'nearest', behavior:reducedMotion ? 'auto' : 'smooth' });
    }
  }

  function scheduleAutomaticCalculation() {
    clearTimeout(autoTimer);
    const state = updateProgress();
    if (!state.ready) return;
    autoTimer = window.setTimeout(() => {
      const fingerprint = calculationFingerprint();
      if (!fingerprint || fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      modal.submit.click();
      requestAnimationFrame(syncResultActions);
    }, AUTO_DELAY_MS);
  }

  function copyFallback(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand?.('copy');
    area.remove();
    return Boolean(copied);
  }

  async function copyResult() {
    const text = clean(modal.resultText.textContent);
    if (!text) return;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      } else {
        copied = copyFallback(text);
      }
    } catch {
      copied = copyFallback(text);
    }
    clearTimeout(copiedTimer);
    modal.copyButton.textContent = copied ? 'U kopjua' : 'Kopjimi dështoi';
    modal.copyButton.classList.toggle('is-success', copied);
    copiedTimer = window.setTimeout(() => {
      modal.copyButton.textContent = 'Kopjo udhëzimin';
      modal.copyButton.classList.remove('is-success');
    }, 1600);
  }

  function resetPatient() {
    clearTimeout(autoTimer);
    lastFingerprint = '';
    modal.age.value = '';
    modal.ageUnit.value = 'years';
    modal.weight.value = '';
    modal.age.dispatchEvent(new Event('input', { bubbles:true }));
    modal.weight.dispatchEvent(new Event('input', { bubbles:true }));
    updateWeightUi();
    syncResultActions();
    requestAnimationFrame(() => modal.age.focus());
  }

  function refreshFastFlow() {
    clearTimeout(autoTimer);
    lastFingerprint = '';
    updateIndicationVisibility();
    syncGroupButtons();
    inferGroupFromAge();
    updateWeightUi();
    modal.submit.textContent = 'Kalkulo tani';
    modal.copyButton.textContent = 'Kopjo udhëzimin';
    modal.resultActions.hidden = true;
    updateProgress();
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
    const result = root.querySelector('[data-dose-result]');
    const resultText = root.querySelector('[data-dose-result-text]');
    if (!form || !product || !indication || !group || !age || !ageUnit || !weight || !submit || !result || !resultText) return false;

    age.max = '130';
    age.step = '1';
    age.placeholder = 'p.sh. 12';
    weight.max = String(MAX_WEIGHT_KG);
    weight.placeholder = 'p.sh. 35';

    const fastNote = document.createElement('div');
    fastNote.className = 'dose-calculator-fast-note';
    fastNote.innerHTML = '<strong>Doza në 10 sekonda</strong><span data-dose-fast-note></span><small data-dose-indication-summary></small>';
    product.insertAdjacentElement('afterend', fastNote);

    const progress = document.createElement('div');
    progress.className = 'dose-calculator-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<span data-progress-age>1 · Mosha</span><span data-progress-weight>2 · Pesha</span><span data-progress-result>3 · Rezultati</span>';
    fastNote.insertAdjacentElement('afterend', progress);

    const groupButtons = document.createElement('div');
    groupButtons.className = 'dose-calculator-group-choices';
    groupButtons.setAttribute('role', 'group');
    groupButtons.setAttribute('aria-label', 'Zgjidh grupmoshën');
    group.insertAdjacentElement('afterend', groupButtons);
    group.classList.add('dose-calculator-visually-hidden');

    const weightPresets = document.createElement('div');
    weightPresets.className = 'dose-calculator-weight-presets';
    weightPresets.setAttribute('aria-label', 'Shkurtore për peshën e matur');
    WEIGHT_PRESETS.forEach(value => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.doseWeightPreset = String(value);
      button.textContent = `${value} kg`;
      button.setAttribute('aria-pressed', 'false');
      weightPresets.appendChild(button);
    });
    const presetNote = document.createElement('small');
    presetNote.className = 'dose-calculator-weight-note';
    presetNote.textContent = 'Përdor vetëm peshën e matur të pacientit.';
    fieldLabel(weight)?.append(weightPresets, presetNote);

    const autoStatus = document.createElement('p');
    autoStatus.className = 'dose-calculator-auto-status';
    autoStatus.setAttribute('role', 'status');
    autoStatus.setAttribute('aria-live', 'polite');
    submit.insertAdjacentElement('afterend', autoStatus);

    const resultActions = document.createElement('div');
    resultActions.className = 'dose-calculator-result-actions';
    resultActions.hidden = true;
    resultActions.innerHTML = '<button type="button" data-dose-copy>Kopjo udhëzimin</button><button type="button" data-dose-reset>Pacient i ri</button>';
    resultText.insertAdjacentElement('afterend', resultActions);

    const productField = fieldLabel(productOutput);
    productField?.classList.add('dose-calculator-fast-hidden');

    modal = {
      root, form, productName:product, indication, group, age, ageUnit, weight, submit,
      result, resultText, resultActions, groupButtons, weightPresets, autoStatus, progress,
      progressAge:progress.querySelector('[data-progress-age]'),
      progressWeight:progress.querySelector('[data-progress-weight]'),
      progressResult:progress.querySelector('[data-progress-result]'),
      copyButton:resultActions.querySelector('[data-dose-copy]'),
      resetButton:resultActions.querySelector('[data-dose-reset]'),
      fastNoteText:fastNote.querySelector('[data-dose-fast-note]'),
      indicationSummary:fastNote.querySelector('[data-dose-indication-summary]'),
      indicationField:fieldLabel(indication), groupField:fieldLabel(group), ageField:fieldLabel(age),
      weightField:fieldLabel(weight),
    };

    modal.indicationField?.classList.add('dose-calculator-fast-field');
    modal.groupField?.classList.add('dose-calculator-fast-field');
    modal.ageField?.classList.add('dose-calculator-fast-field');
    modal.weightField?.classList.add('dose-calculator-fast-field');

    root.dataset.fastDoseUx = VERSION;
    root.querySelector('.dose-calculator-dialog')?.setAttribute('data-fast-dose-ux', VERSION);

    groupButtons.addEventListener('click', event => {
      const button = event.target.closest('[data-dose-group-choice]');
      if (!button) return;
      setGroup(button.dataset.doseGroupChoice);
      scheduleAutomaticCalculation();
      modal.age.focus();
    });

    weightPresets.addEventListener('click', event => {
      const button = event.target.closest('[data-dose-weight-preset]');
      if (!button || modal.weight.disabled) return;
      modal.weight.value = button.dataset.doseWeightPreset;
      modal.weight.dispatchEvent(new Event('input', { bubbles:true }));
      updateWeightUi();
      scheduleAutomaticCalculation();
    });

    indication.addEventListener('change', () => {
      lastFingerprint = '';
      requestAnimationFrame(() => {
        updateIndicationVisibility();
        updateWeightUi();
        scheduleAutomaticCalculation();
      });
    });
    group.addEventListener('change', () => {
      lastFingerprint = '';
      syncGroupButtons();
      scheduleAutomaticCalculation();
    });
    age.addEventListener('input', () => {
      lastFingerprint = '';
      inferGroupFromAge();
      scheduleAutomaticCalculation();
    });
    ageUnit.addEventListener('change', () => {
      lastFingerprint = '';
      age.max = ageUnit.value === 'months' ? String(MAX_AGE_MONTHS) : '130';
      inferGroupFromAge();
      scheduleAutomaticCalculation();
    });
    weight.addEventListener('input', () => {
      lastFingerprint = '';
      updateWeightUi();
      scheduleAutomaticCalculation();
    });
    submit.addEventListener('click', () => requestAnimationFrame(syncResultActions), true);
    modal.copyButton.addEventListener('click', () => void copyResult());
    modal.resetButton.addEventListener('click', resetPatient);

    form.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (updateProgress().ready) {
        lastFingerprint = calculationFingerprint();
        submit.click();
        requestAnimationFrame(syncResultActions);
      }
    });

    new MutationObserver(() => {
      if (!root.hidden) refreshFastFlow();
      else {
        clearTimeout(autoTimer);
        clearTimeout(copiedTimer);
      }
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
