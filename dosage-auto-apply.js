(() => {
  'use strict';

  const VERSION = '2026-07-23.3';
  let scheduled = false;
  let notified = false;
  let waitAttempts = 0;

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:as|equivalent\s+to|eq\.?\s+to)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const token = value => normalize(value).replace(/\s+/g, '');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const field = (article, name) => article.querySelector(`[data-item-field="${name}"]`);
  const fieldValue = (article, name) => text(field(article, name)?.value);

  function setField(article, name, value) {
    const input = field(article, name);
    if (!input) return;
    input.value = value ?? '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function patientContext() {
    const type = document.getElementById('protocolPatientType')?.value || 'adult';
    const ageValue = Number(document.getElementById('protocolAgeValue')?.value || 0);
    const ageUnit = document.getElementById('protocolAgeUnit')?.value || 'years';
    const weightKg = Number(document.getElementById('protocolWeightKg')?.value || 0) || null;
    return {
      type,
      ageMonths: ageValue > 0 ? (ageUnit === 'months' ? ageValue : ageValue * 12) : null,
      weightKg,
    };
  }

  function substanceComponents(value) {
    return text(value)
      .split(/\s*(?:;|\+)\s*/)
      .map(normalize)
      .filter(Boolean)
      .sort();
  }

  function sameSubstanceComponents(left, right) {
    const a = substanceComponents(left);
    const b = substanceComponents(right);
    return a.length > 0 && a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function formPatterns(value) {
    return text(value).split(/\s*;\s*/).map(token).filter(Boolean);
  }

  function exactFormMatch(actual, expected) {
    const actualToken = token(actual);
    const patterns = formPatterns(expected);
    return Boolean(actualToken && patterns.length && patterns.includes(actualToken));
  }

  function exactStrengthMatch(actual, expected) {
    return Boolean(token(actual) && token(expected) && token(actual) === token(expected));
  }

  function exactRegimenMatch(regimen, article) {
    const articleAtc = token(article.dataset.atc);
    const regimenAtc = token(regimen.atc);
    if (!articleAtc || !regimenAtc || articleAtc !== regimenAtc) return false;
    if (!sameSubstanceComponents(article.dataset.substance, regimen.substance)) return false;
    if (!exactFormMatch(article.dataset.form, regimen.form)) return false;
    if (!exactStrengthMatch(article.dataset.strength, regimen.referenceStrength || regimen.concentration)) return false;
    return true;
  }

  function pediatricEligible(regimen, patient, article) {
    if (!exactRegimenMatch(regimen, article) || patient.ageMonths == null) return false;
    if (regimen.minAgeMonths != null && patient.ageMonths < regimen.minAgeMonths) return false;
    if (regimen.maxAgeMonths != null && patient.ageMonths > regimen.maxAgeMonths) return false;
    const needsWeight = regimen.mgPerKg != null || regimen.minWeightKg != null || regimen.maxWeightKg != null;
    if (needsWeight && patient.weightKg == null) return false;
    if (patient.weightKg != null && regimen.minWeightKg != null && patient.weightKg < regimen.minWeightKg) return false;
    if (patient.weightKg != null && regimen.maxWeightKg != null && patient.weightKg > regimen.maxWeightKg) return false;
    return true;
  }

  function matchingRegimens(article) {
    const dosage = window.MEDINDEX_DOSAGE;
    const patient = patientContext();
    if (!dosage || dosage.meta?.clinicalAutoFillEnabled !== true || patient.type === 'manual') return [];
    return patient.type === 'pediatric'
      ? (dosage.pediatric || []).filter(regimen => pediatricEligible(regimen, patient, article))
      : (dosage.adult || []).filter(regimen => exactRegimenMatch(regimen, article));
  }

  function regimenLabel(regimen) {
    return [regimen.indication || regimen.regimenId, regimen.route, regimen.frequency, regimen.duration]
      .filter(Boolean).join(' · ');
  }

  function syncStrictChooser(article, regimens) {
    const assist = article.querySelector('.dosage-assist');
    if (!assist) return;
    const subtitle = assist.querySelector('.dosage-assist-title small');
    const badge = assist.querySelector('.dosage-badge');
    const select = assist.querySelector('.dosage-controls select');
    const button = assist.querySelector('.dosage-controls button');
    const appliedId = fieldValue(article, 'regimenId');

    assist.classList.toggle('requires-choice', regimens.length > 1 && !appliedId);
    if (regimens.length > 1 && !appliedId) {
      if (subtitle) subtitle.textContent = `U gjetën ${regimens.length} skema të verifikuara. Zgjidhe indikacionin e duhur.`;
      if (badge) { badge.textContent = 'Zgjidh skemën'; badge.className = 'dosage-badge edited'; }
    } else if (regimens.length === 1 && !appliedId) {
      if (subtitle) subtitle.textContent = 'U gjet një skemë e vetme e saktë; po plotësohet automatikisht.';
      if (badge) { badge.textContent = 'Auto-fill'; badge.className = 'dosage-badge ready'; }
    }

    if (!select || !button) return;
    const current = select.value;
    const allowedIds = new Set(regimens.map(item => item.regimenId));
    select.innerHTML = '<option value="">Zgjidh skemën…</option>' + regimens.map(regimen =>
      `<option value="${esc(regimen.regimenId)}">${esc(regimenLabel(regimen))}</option>`
    ).join('');
    if (appliedId && allowedIds.has(appliedId)) select.value = appliedId;
    else if (current && allowedIds.has(current)) select.value = current;
    else select.value = '';
    button.disabled = !select.value;
  }

  function round(value) {
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) >= 100) return Math.round(value);
    if (Math.abs(value) >= 10) return Math.round(value * 10) / 10;
    return Math.round(value * 100) / 100;
  }

  function parseConcentration(value) {
    const match = text(value).replace(',', '.').match(/([\d.]+)\s*mg\s*\/\s*([\d.]+)\s*mL/i);
    if (!match) return null;
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;
  }

  function doseWithUnit(value) {
    const raw = text(value);
    if (!raw) return '';
    return /\b(?:mg|g|mcg|µg|mL|IU|NJ)\b/i.test(raw) ? raw : `${raw} mg`;
  }

  function adultValues(regimen) {
    const practicalDose = regimen.unitCount && regimen.practicalUnit ? `${regimen.unitCount} ${regimen.practicalUnit}` : '';
    const medicinalDose = doseWithUnit(regimen.doseMg);
    return {
      dose: [medicinalDose, practicalDose ? `(${practicalDose})` : ''].filter(Boolean).join(' '),
      route: regimen.route || '',
      frequency: regimen.frequency || '',
      duration: regimen.duration || '',
      quantity: regimen.dispense || '',
      instructions: regimen.signatura || '',
      clinicalNotes: [regimen.warnings, regimen.renalHepatic].filter(Boolean).join('\n'),
      calculation: '',
    };
  }

  function pediatricValues(regimen) {
    const patient = patientContext();
    let doseMg = regimen.fixedDoseMg;
    let volumeMl = regimen.fixedVolumeMl;
    let calculation = regimen.formula || '';

    if (regimen.mgPerKg != null) {
      if (!patient.weightKg) return { error: 'Shkruaje peshën e fëmijës para auto-plotësimit.' };
      const perDay = normalize(regimen.basis).includes('dite');
      doseMg = patient.weightKg * regimen.mgPerKg;
      if (perDay && regimen.dosesPerDay) doseMg /= regimen.dosesPerDay;
      if (regimen.maxSingleMg != null) doseMg = Math.min(doseMg, regimen.maxSingleMg);
      if (regimen.max24hMg != null && regimen.dosesPerDay) doseMg = Math.min(doseMg, regimen.max24hMg / regimen.dosesPerDay);
      calculation = `${patient.weightKg} kg × ${regimen.mgPerKg} mg/kg${perDay ? `/ditë ÷ ${regimen.dosesPerDay || 1}` : '/dozë'} = ${round(doseMg)} mg/dozë`;
    }

    const mgPerMl = parseConcentration(regimen.concentration);
    if (volumeMl == null && doseMg != null && mgPerMl) volumeMl = doseMg / mgPerMl;
    doseMg = round(doseMg);
    volumeMl = round(volumeMl);
    const dose = [doseMg != null ? `${doseMg} mg` : '', volumeMl != null ? `(${volumeMl} mL)` : ''].filter(Boolean).join(' ');

    let instructions = regimen.signatura || '';
    if (regimen.mgPerKg != null && dose) {
      instructions = [
        `Jep ${volumeMl != null ? `${volumeMl} mL` : `${doseMg} mg`}`,
        regimen.route || '', regimen.frequency || '', regimen.duration ? `për ${regimen.duration}` : ''
      ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + '.';
    }

    return {
      dose,
      route: regimen.route || '',
      frequency: regimen.frequency || '',
      duration: regimen.duration || '',
      quantity: regimen.dispense || '',
      instructions,
      clinicalNotes: regimen.warnings || '',
      calculation,
    };
  }

  function hasManualClinicalContent(article) {
    if (fieldValue(article, 'regimenId')) return true;
    return ['dose', 'frequency', 'duration', 'quantity', 'instructions', 'clinicalNotes']
      .some(name => Boolean(fieldValue(article, name)));
  }

  function refreshPrescriptionUi() {
    document.getElementById('protocolPatientType')?.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function notify(message) {
    if (window.showProtocolToast) window.showProtocolToast(message);
    else console.info(message);
  }

  function applyAutomatically(article, regimen) {
    const values = patientContext().type === 'pediatric' ? pediatricValues(regimen) : adultValues(regimen);
    if (values.error) { notify(values.error); return; }
    article.dataset.applyingDosage = '1';
    ['dose', 'route', 'frequency', 'duration', 'quantity', 'instructions', 'clinicalNotes']
      .forEach(name => setField(article, name, values[name] || ''));
    setField(article, 'regimenId', regimen.regimenId || '');
    setField(article, 'dosageSource', /^https:\/\//i.test(text(regimen.sourceUrl)) ? regimen.sourceUrl : '');
    setField(article, 'dosageStatus', 'VERIFIKUAR — AUTO-APLIKUAR');
    setField(article, 'doseCalculation', values.calculation || '');
    article.dataset.autoAppliedRegimen = regimen.regimenId || '';
    article.dataset.autoApplyVersion = VERSION;
    delete article.dataset.applyingDosage;
    refreshPrescriptionUi();
    notify(`Skema ${regimen.regimenId} u plotësua automatikisht. Mund ta ndryshosh çdo fushë.`);
  }

  function maybeAutoApply(article) {
    if (!article || article.dataset.qualityStatus === 'blocked') return;
    const regimens = matchingRegimens(article);
    syncStrictChooser(article, regimens);
    if (hasManualClinicalContent(article) || regimens.length !== 1) return;
    const regimen = regimens[0];
    const patient = patientContext();
    const applicationKey = [regimen.regimenId, patient.type, patient.ageMonths, patient.weightKg].join('|');
    if (article.dataset.autoApplyAttempt === applicationKey) return;
    article.dataset.autoApplyAttempt = applicationKey;
    applyAutomatically(article, regimen);
  }

  function run() {
    scheduled = false;
    const dosage = window.MEDINDEX_DOSAGE;
    if (!dosage) {
      waitAttempts += 1;
      if (waitAttempts < 100) window.setTimeout(schedule, 150);
      return;
    }
    document.querySelectorAll('#protocolDrugList .protocol-drug').forEach(maybeAutoApply);
    if (!notified && dosage.meta?.clinicalAutoFillEnabled === true) {
      notified = true;
      console.info(`MedIndex auto-fill ${VERSION} aktiv.`);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  const target = document.getElementById('protocolDrugList') || document.documentElement;
  new MutationObserver(schedule).observe(target, { childList: true, subtree: true });
  ['protocolPatientType', 'protocolAgeValue', 'protocolAgeUnit', 'protocolWeightKg'].forEach(id => {
    const node = document.getElementById(id);
    node?.addEventListener('input', schedule);
    node?.addEventListener('change', schedule);
  });

  window.MEDINDEX_DOSAGE_MATCHING = { sameSubstanceComponents, exactFormMatch, exactStrengthMatch };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
