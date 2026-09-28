/* Dozologjia pediatric-only runtime. The legacy Master v2.7 picker was removed from this page by request. */
/* Pediatric common-drug source table. Display text comes from the supplied
   reference file; calculator output is arithmetic over those source formulas. */
(() => {
  'use strict';

  const DATA_URL = '/api/dosage?view=pediatric-common-reference';
  const STATIC_FALLBACK_URL = '/data/pediatric-common-drugs-reference.json';
  const STATIC_AGE_DEFAULTS_URL = '/data/pediatric-weight-age-defaults.json';
  const CLINICAL_AUDIT_URL = '/data/pediatric-clinical-audit-v1.json';
  const byId = id => document.getElementById(id);
  const node = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text != null) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  const numeric = value => {
    const parsed = Number(String(value ?? '').replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const positiveNumber = value => Number.isFinite(value) && value > 0;
  const calcFmt = value => {
    const rounded = Math.round(value * 10000) / 10000;
    if (Number.isInteger(rounded) && Math.abs(rounded) >= 10000) {
      return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    return String(rounded).replace('.', ',');
  };
  const doseRange = (lo, hi, unit) => `${calcFmt(lo)}${lo === hi ? '' : '–' + calcFmt(hi)} ${unit}`;
  const searchText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let commonSections = [];
  let weightAgeDefaults = null;
  let clinicalAudit = { schemaVersion:'', auditedAt:'', defaultStatus:'source-table', drugs:{} };
  const weightAgeCore = window.DRxPediatricWeightAge || null;

  function inBand(value, band, minKey, maxKey) {
    const min = band[minKey], max = band[maxKey];
    if (Number.isFinite(min) && (band.minInclusive === false ? value <= min : value < min)) return false;
    if (Number.isFinite(max) && (band.maxInclusive === false ? value >= max : value > max)) return false;
    return true;
  }
  function ageMonths(ageValue, ageUnit) {
    const value = numeric(ageValue);
    if (!Number.isFinite(value) || value < 0) return NaN;
    if (ageUnit === 'day') return value / 30.4375;
    if (ageUnit === 'month') return value;
    return value * 12;
  }
  function ageDays(ageValue, ageUnit) {
    const value = numeric(ageValue);
    if (!Number.isFinite(value) || value < 0) return NaN;
    if (ageUnit === 'day') return value;
    if (ageUnit === 'month') return value * 30.4375;
    return value * 365.25;
  }
  const validAgeMonths = value => Number.isFinite(value) && value >= 0;
  const rulesOf = option => Array.isArray(option?.rules) ? option.rules : [];
  const ruleNeedsExactDays = rule => Number.isFinite(rule?.minDays) || Number.isFinite(rule?.maxDays);
  const ruleNeedsAge = rule => ruleNeedsExactDays(rule) || Number.isFinite(rule?.minMonths) || Number.isFinite(rule?.maxMonths);
  const ruleNeedsWeight = rule => rule?.doseType === 'weight' || Number.isFinite(rule?.minKg) || Number.isFinite(rule?.maxKg);
  const needsWeight = option => ['weight', 'ageWeight', 'oseltamivirBands'].includes(option?.mode)
    || (option?.mode === 'clinicalRules' && rulesOf(option).some(ruleNeedsWeight));
  const needsAge = option => ['ageBands', 'ageWeight', 'ageFixed', 'oseltamivirBands'].includes(option?.mode)
    || (option?.mode === 'clinicalRules' && rulesOf(option).some(ruleNeedsAge));
  const needsPatientWeight = option => needsWeight(option) || needsAge(option);

  function auditFor(drug) {
    return clinicalAudit?.drugs?.[drug?.name] || null;
  }

  const auditedDrugCount = () => Object.keys(clinicalAudit?.drugs || {}).length;
  const blockedAutoCount = () => Object.values(clinicalAudit?.drugs || {})
    .filter(item => item?.calculator?.disabled).length;
  const activeAutoCount = () => auditedDrugCount() - blockedAutoCount();

  function effectiveOptions(drug) {
    const audit = auditFor(drug);
    if (audit?.calculator?.replace && Array.isArray(audit.calculator.options) && audit.calculator.options.length) {
      return audit.calculator.options;
    }
    // Clinical safety: the original 50-drug table remains visible as a source
    // artifact, but it is not allowed to drive automatic calculations until an
    // independent authoritative audit explicitly promotes that drug.
    return [];
  }

  function practicalDrug(drug) {
    const audit = auditFor(drug);
    if (audit && Object.prototype.hasOwnProperty.call(audit, 'practicalFormulations')) {
      return { ...drug, formulations:Array.isArray(audit.practicalFormulations) ? audit.practicalFormulations : [] };
    }
    return drug;
  }

  function resolvedAgeInfo(values) {
    if (values.ageManual) {
      const months = ageMonths(values.age, values.ageUnit);
      const days = ageDays(values.age, values.ageUnit);
      if (validAgeMonths(months) && Number.isFinite(days)) {
        const exactLabel = values.ageUnit === 'day'
          ? `${calcFmt(numeric(values.age))} ditë`
          : values.ageUnit === 'month'
            ? `${calcFmt(numeric(values.age))} muaj`
            : `${calcFmt(numeric(values.age))} vjeç`;
        return {
          minMonths:months,
          maxMonths:months,
          defaultMonths:months,
          exactDays:days,
          exactAgeUnit:values.ageUnit,
          label:exactLabel,
          kind:'manual',
          manual:true,
          ambiguous:false,
        };
      }
    }
    if (!weightAgeCore || !weightAgeDefaults) return null;
    const inferred = weightAgeCore.infer(values.weight, weightAgeDefaults);
    return inferred ? { ...inferred, manual:false } : null;
  }

  function safeAgeBand(ageInfo, bands) {
    if (!ageInfo || !Array.isArray(bands)) return null;
    if (ageInfo.manual || (Number.isFinite(ageInfo.maxMonths) && Math.abs(ageInfo.maxMonths - ageInfo.minMonths) < 0.001)) {
      return bands.find(item => inBand(ageInfo.defaultMonths, item, 'minMonths', 'maxMonths')) || null;
    }
    if (!weightAgeCore?.ageRangeFitsBand) return null;
    const candidates = bands.filter(item => weightAgeCore.ageRangeFitsBand(ageInfo, item, 'minMonths', 'maxMonths'));
    return candidates.length === 1 ? candidates[0] : null;
  }

  function ageInfoFitsOption(ageInfo, option) {
    if (!ageInfo || !option) return false;
    if (ageInfo.manual || (Number.isFinite(ageInfo.maxMonths) && Math.abs(ageInfo.maxMonths - ageInfo.minMonths) < 0.001)) {
      return inBand(ageInfo.defaultMonths, option, 'minMonths', 'maxMonths');
    }
    return Boolean(weightAgeCore?.ageRangeFitsBand?.(ageInfo, option, 'minMonths', 'maxMonths'));
  }

  function boundPass(value, bound, inclusive, side) {
    if (!Number.isFinite(bound)) return true;
    if (!Number.isFinite(value)) return false;
    if (side === 'min') return inclusive === false ? value > bound : value >= bound;
    return inclusive === false ? value < bound : value <= bound;
  }

  function weightFitsRule(weight, rule) {
    if (!ruleNeedsWeight(rule)) return true;
    if (!positiveNumber(weight)) return false;
    return boundPass(weight, Number(rule.minKg), rule.minKgInclusive, 'min')
      && boundPass(weight, Number(rule.maxKg), rule.maxKgInclusive, 'max');
  }

  function exactAgeFitsRule(ageInfo, rule) {
    if (!ruleNeedsAge(rule)) return true;
    if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return false;

    const monthFits = boundPass(ageInfo.defaultMonths, Number(rule.minMonths), rule.minInclusive, 'min')
      && boundPass(ageInfo.defaultMonths, Number(rule.maxMonths), rule.maxInclusive, 'max');
    if (!monthFits) return false;

    if (ruleNeedsExactDays(rule)) {
      if (!ageInfo.manual || !Number.isFinite(ageInfo.exactDays)) return false;
      return boundPass(ageInfo.exactDays, Number(rule.minDays), rule.minDaysInclusive, 'min')
        && boundPass(ageInfo.exactDays, Number(rule.maxDays), rule.maxDaysInclusive, 'max');
    }
    return true;
  }

  function ageRangeFitsRule(ageInfo, rule) {
    if (!ruleNeedsAge(rule)) return true;
    if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return false;
    if (ageInfo.manual) return exactAgeFitsRule(ageInfo, rule);

    // Day-level neonatal cutoffs must never be guessed from the weight-derived
    // age estimate. They require the clinician to enter chronological age.
    if (ruleNeedsExactDays(rule)) return false;

    const lo = Number.isFinite(ageInfo.minMonths) ? ageInfo.minMonths : ageInfo.defaultMonths;
    const hi = Number.isFinite(ageInfo.maxMonths) ? ageInfo.maxMonths : ageInfo.defaultMonths;
    const loInfo = { defaultMonths:lo, manual:false };
    const hiInfo = { defaultMonths:hi, manual:false };
    return exactAgeFitsRule(loInfo, rule) && exactAgeFitsRule(hiInfo, rule);
  }

  function clinicalRuleFor(option, weight, ageInfo) {
    const matches = rulesOf(option).filter(rule => weightFitsRule(weight, rule) && ageRangeFitsRule(ageInfo, rule));
    return matches.length === 1 ? matches[0] : null;
  }

  function ageConfirmation(ageInfo) {
    return {
      error:ageInfo?.label
        ? `Pesha sugjeron moshën ${ageInfo.label}. Për këtë bar mosha e saktë mund ta ndryshojë dozën.`
        : 'Pesha nuk mjafton për ta përcaktuar moshën për këtë dozë.',
      needsAgeConfirmation:true,
    };
  }

  function doseResult({
    min, max, unit, period = 'dose', frequency = '', source = '', split = null, note = '',
    maxPerDose = null, maxPerDay = null, maxDailyPerKg = null, weight = null,
  }) {
    let doseMin = min;
    let doseMax = max;
    const caps = [];
    const dynamicDailyMax = positiveNumber(maxDailyPerKg) && positiveNumber(weight)
      ? maxDailyPerKg * weight
      : null;
    // When both an absolute ceiling and a weight-based ceiling exist, the
    // stricter one wins. Never let an adult absolute maximum override a lower
    // pediatric mg/kg/day limit.
    const dailyCaps = [maxPerDay, dynamicDailyMax].filter(positiveNumber);
    const dailyCap = dailyCaps.length ? Math.min(...dailyCaps) : null;

    if (period === 'dose' && positiveNumber(maxPerDose)) {
      if (doseMin > maxPerDose || doseMax > maxPerDose) caps.push(`maks. ${calcFmt(maxPerDose)} ${unit}/dozë`);
      doseMin = Math.min(doseMin, maxPerDose);
      doseMax = Math.min(doseMax, maxPerDose);
    }
    if (period === 'day' && positiveNumber(dailyCap)) {
      if (doseMin > dailyCap || doseMax > dailyCap) caps.push(`maks. ${calcFmt(dailyCap)} ${unit}/24 orë`);
      doseMin = Math.min(doseMin, dailyCap);
      doseMax = Math.min(doseMax, dailyCap);
    }

    const result = {
      primary:doseRange(doseMin, doseMax, unit),
      note:[note, ...caps].filter(Boolean).join(' · '),
      source,
      doseMin,
      doseMax,
      doseUnit:unit,
      dosePeriod:period,
      frequency,
      capped:caps.length > 0,
    };
    if (period === 'dose') {
      result.perDoseMin = doseMin;
      result.perDoseMax = doseMax;
      if (positiveNumber(dailyCap)) {
        result.dailyCap = dailyCap;
        result.dailyCapLabel = `maks. ${calcFmt(dailyCap)} ${unit}/24 orë`;
        result.note = [result.note, result.dailyCapLabel].filter(Boolean).join(' · ');
      }
    } else if (period === 'day' && Number.isFinite(split) && split > 0) {
      result.perDoseMin = doseMin / split;
      result.perDoseMax = doseMax / split;
      if (split > 1) {
        result.secondary = `Aritmetikisht / ${split} marrje: ${doseRange(result.perDoseMin, result.perDoseMax, unit)} për marrje`;
      }
    }
    return result;
  }

  function calculateOption(option, values) {
    if (!option) return { error:'Zgjidh formulën.' };
    if (option.mode === 'fixed') {
      return doseResult({
        min:option.min, max:option.max, unit:option.unit, period:'dose',
        frequency:option.frequency || '', source:option.label, note:option.frequency || '',
      });
    }

    const weight = needsPatientWeight(option) ? numeric(values.weight) : NaN;
    const ageInfo = needsAge(option) ? resolvedAgeInfo(values) : null;

    if (needsPatientWeight(option) && !positiveNumber(weight)) {
      return { error:'Shëno vetëm peshën reale në kg. Mosha do të sugjerohet automatikisht.' };
    }

    if (option.mode === 'clinicalRules') {
      const ageInfo = needsAge(option) ? resolvedAgeInfo(values) : null;
      if (needsAge(option) && (!ageInfo || !Number.isFinite(ageInfo.defaultMonths))) return ageConfirmation(ageInfo);

      const rule = clinicalRuleFor(option, weight, ageInfo);
      if (!rule) {
        if (needsAge(option) && !ageInfo?.manual) return ageConfirmation(ageInfo);
        return { error:'Nuk ka skemë të verifikuar për këtë kombinim moshe/peshe.' };
      }

      const min = rule.doseType === 'weight' ? rule.min * weight : rule.min;
      const max = rule.doseType === 'weight' ? rule.max * weight : rule.max;
      return doseResult({
        min, max, unit:rule.unit, period:rule.period || 'dose', split:rule.split,
        frequency:rule.frequency || '', source:rule.source || option.label,
        note:[rule.noteSq || '', rule.period === 'day' ? 'në 24 orë' : ''].filter(Boolean).join(' · '),
        maxPerDose:rule.maxPerDose,
        maxPerDay:rule.maxPerDay,
        maxDailyPerKg:rule.maxDailyPerKg,
        weight,
      });
    }

    if (option.mode === 'ageBands') {
      if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return ageConfirmation(ageInfo);
      const band = safeAgeBand(ageInfo, option.bands);
      if (!band) {
        if (ageInfo.manual) return { error:'Tabela nuk përcakton dozë për këtë moshë.' };
        return ageConfirmation(ageInfo);
      }
      return doseResult({
        min:band.min, max:band.max, unit:band.unit, period:'dose',
        frequency:band.frequency || '', source:band.source, note:band.frequency || '',
      });
    }

    if (option.mode === 'ageFixed') {
      if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return ageConfirmation(ageInfo);
      if (!ageInfoFitsOption(ageInfo, option)) {
        if (ageInfo.manual) return { error:'Kjo formulë nuk i përket kësaj moshe.' };
        return ageConfirmation(ageInfo);
      }
      return doseResult({
        min:option.min, max:option.max, unit:option.unit, period:'dose',
        frequency:option.frequency || '', source:option.label, note:option.frequency || '',
      });
    }

    if (option.mode === 'ageWeight') {
      if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return ageConfirmation(ageInfo);
      if (!ageInfoFitsOption(ageInfo, option)) {
        if (ageInfo.manual) return { error:'Kjo formulë nuk i përket kësaj moshe.' };
        return ageConfirmation(ageInfo);
      }
      const min = option.min * weight;
      const max = option.max * weight;
      return doseResult({
        min, max, unit:option.unit, period:option.period || 'day', split:option.split,
        frequency:option.frequency || '', source:option.label,
        note:[option.period === 'day' ? 'në 24 orë' : '', option.frequency].filter(Boolean).join(' · '),
      });
    }

    if (option.mode === 'oseltamivirBands') {
      if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return ageConfirmation(ageInfo);
      const ageBand = safeAgeBand(ageInfo, option.bands);
      if (ageBand) {
        return doseResult({
          min:ageBand.min, max:ageBand.max, unit:ageBand.unit, period:'dose',
          frequency:ageBand.frequency || '', source:ageBand.source, note:ageBand.frequency || '',
        });
      }

      const certainlyOverOneYear = Number.isFinite(ageInfo.minMonths) && ageInfo.minMonths > 12;
      const manuallyOverOneYear = ageInfo.manual && ageInfo.defaultMonths > 12;
      if (!certainlyOverOneYear && !manuallyOverOneYear) {
        if (ageInfo.manual && ageInfo.defaultMonths <= 12) return { error:'Tabela nuk përcakton dozë për këtë moshë.' };
        return ageConfirmation(ageInfo);
      }

      const weightBand = option.weightBands.find(item => inBand(weight, item, 'minKg', 'maxKg'));
      if (!weightBand) return { error:'Tabela nuk përcakton brez peshe për këtë vlerë.' };
      return doseResult({
        min:weightBand.min, max:weightBand.max, unit:weightBand.unit, period:'dose',
        frequency:weightBand.frequency || '', source:weightBand.source, note:weightBand.frequency || '',
      });
    }

    if (option.mode === 'weight') {
      const min = option.min * weight;
      const max = option.max * weight;
      let periodText = 'për një marrje';
      if (option.period === 'day') periodText = 'në 24 orë';
      else if (option.period === 'hour') periodText = 'në orë';
      return doseResult({
        min, max, unit:option.unit, period:option.period || 'dose', split:option.split,
        frequency:option.frequency || '', source:option.label,
        note:[periodText, option.frequency].filter(Boolean).join(' · '),
      });
    }

    return { error:'Kjo formulë nuk ka kalkulator numerik.' };
  }

  const liquidCore = window.DRxPediatricLiquid || null;
  const doseSq = value => liquidCore?.doseTextSq ? liquidCore.doseTextSq(value) : String(value ?? '');
  const formulationSq = value => liquidCore?.formulationTextSq ? liquidCore.formulationTextSq(value) : String(value ?? '');
  const sectionSq = value => liquidCore?.sectionTitleSq ? liquidCore.sectionTitleSq(value) : String(value ?? '');
  const componentSq = value => liquidCore?.componentSq ? liquidCore.componentSq(value) : String(value ?? '');
  const mlNumber = value => {
    const digits = Math.abs(value) < 1 ? 2 : 1;
    const factor = 10 ** digits;
    return String(Math.round(value * factor) / factor).replace('.', ',');
  };
  const mlRange = (lo, hi) => `${mlNumber(lo)}${Math.abs(lo - hi) < 1e-9 ? '' : '–' + mlNumber(hi)} mL`;

  function renderLiquidConversions(drug, option, result, answer) {
    if (!liquidCore || result.error) return;

    const calcDrug = practicalDrug(drug);
    const presentations = liquidCore.presentationsFor(calcDrug, option);
    const conversions = liquidCore.volumeConversions(result, presentations);
    const vialItems = liquidCore.vialConversions ? liquidCore.vialConversions(result, calcDrug, option) : [];
    const audit = liquidCore.formulationAudit ? liquidCore.formulationAudit(calcDrug, option) : [];
    const vialSources = new Set(vialItems.map(item => String(item.source || '')));
    const extras = audit.filter(item => item.status !== 'auto-ml' && item.status !== 'vial-equivalent' && !vialSources.has(String(item.source || '')));

    if (!conversions.length && !vialItems.length && !extras.length) return;

    const box = node('section', null, 'dz-common-volume');
    const head = node('div', null, 'dz-common-volume-head');
    head.append(node('strong', 'Format praktike'));
    head.append(node('span', 'AUTO + KONTROLL', 'dz-common-volume-badge'));
    box.append(head);

    const routeAudit = liquidCore.optionAudit ? liquidCore.optionAudit(drug, option) : { ok:true };
    if (!routeAudit.ok && routeAudit.message) {
      box.append(node('p', routeAudit.message, 'dz-common-route-warning'));
    }

    const list = node('div', null, 'dz-common-volume-list');

    conversions.forEach(item => {
      const card = node('article', null, 'dz-common-volume-card');
      const top = node('div', null, 'dz-common-volume-top');
      top.append(node('b', item.form));
      const basis = item.componentBasis ? componentSq(item.componentBasis) : '';
      const concentration = basis
        ? `${calcFmt(item.mg)} mg ${basis} / ${calcFmt(item.mL)} mL`
        : `${calcFmt(item.mg)} mg / ${calcFmt(item.mL)} mL`;
      top.append(node('small', concentration));
      card.append(top);

      const practical = node('div', null, 'dz-common-volume-dose');
      practical.append(node('strong', `≈ ${mlRange(item.volumeMin, item.volumeMax)}`));
      practical.append(node('span', [item.basisLabel, doseSq(item.frequency)].filter(Boolean).join(' · ')));
      card.append(practical);

      const source = node('small', null, 'dz-common-volume-source');
      source.append(node('span', 'Nga formulimi: '), node('b', formulationSq(item.source)));
      card.append(source);
      list.append(card);
    });

    vialItems.forEach(item => {
      const card = node('article', null, `dz-common-volume-card dz-common-vial-card${item.convertible ? '' : ' is-gated'}`);
      const top = node('div', null, 'dz-common-volume-top');
      top.append(node('b', 'Flakon (vial)'));
      const basis = item.componentBasis ? ` ${componentSq(item.componentBasis)}` : '';
      if (Number.isFinite(item.amount) && item.amount > 0) {
        top.append(node('small', `${calcFmt(item.amount)} ${item.unit}${basis} / flakon`));
      } else {
        top.append(node('small', 'Forca e komponentit duhet verifikuar'));
      }
      card.append(top);

      const practical = node('div', null, 'dz-common-volume-dose');
      if (item.convertible) {
        const vialRange = `${mlNumber(item.vialMin)}${Math.abs(item.vialMin - item.vialMax) < 1e-9 ? '' : '–' + mlNumber(item.vialMax)} flakon`;
        practical.append(node('strong', `≈ ${vialRange}`));
        practical.append(node('span', [item.basisLabel, doseSq(item.frequency)].filter(Boolean).join(' · ')));
      } else {
        practical.append(node('strong', 'Pa AUTO', 'dz-common-vial-gated'));
        practical.append(node('span', item.reason || 'Kërkohet verifikim i produktit dhe rrugës së administrimit.'));
      }
      card.append(practical);

      const source = node('small', null, 'dz-common-volume-source');
      source.append(node('span', 'Formulimi: '), node('b', formulationSq(item.source)));
      card.append(source);
      card.append(node('p',
        item.convertible
          ? 'Ekuivalenti i flakonit tregon vetëm sasinë e barit para rikonstituimit. mL pas rikonstituimit varen nga etiketa/udhëzimi i produktit.'
          : 'Flakoni nuk fshihet: sistemi tregon pse nuk lejohet konvertim automatik.',
        'dz-common-volume-safety'
      ));
      list.append(card);
    });

    box.append(list);

    if (extras.length) {
      const other = node('details', null, 'dz-common-formulation-status');
      const summary = node('summary');
      summary.append(node('strong', 'Format tjera të disponueshme'), node('small', `${extras.length} për kontroll`));
      other.append(summary);
      const statusList = node('div', null, 'dz-common-formulation-status-list');
      extras.forEach(item => {
        const row = node('div', null, `dz-common-formulation-status-row is-${item.status}`);
        row.append(node('b', item.display || formulationSq(item.source)));
        row.append(node('span', item.reason || 'Kjo formë nuk kërkon konvertim në mL.'));
        statusList.append(row);
      });
      other.append(statusList);
      box.append(other);
    }

    box.append(node('p', 'Gjithmonë verifiko përqendrimin, rrugën dhe mënyrën e rikonstituimit në etiketën/SmPC e produktit para administrimit.', 'dz-common-volume-safety'));
    answer.append(box);
  }

  function addWeightShortcuts(field, input, values, update) {
    const row = node('div', null, 'dz-common-weight-quick');
    [3.5, 7, 10, 12, 15, 20, 25, 30, 40, 50, 60].forEach(kg => {
      const button = node('button', `${kg} kg`);
      button.type = 'button';
      button.addEventListener('click', () => {
        input.value = String(kg);
        values.weight = String(kg);
        update();
      });
      row.append(button);
    });
    field.append(row);
  }

  function makeNumberField(label, id, suffix, value = '') {
    const field = node('label', null, 'dz-common-field');
    const box = node('span', null, 'dz-number');
    const input = node('input');
    input.id = id; input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.autocapitalize = 'none'; input.spellcheck = false; input.enterKeyHint = 'done'; input.value = value;
    box.append(input);
    if (suffix) box.append(node('span', suffix));
    field.append(node('span', label, 'dz-label'), box);
    return { field, input };
  }

  function renderCalculator(drug, host) {
    host.replaceChildren();
    const audit = auditFor(drug);
    const options = effectiveOptions(drug);

    if (audit?.calculator?.disabled) {
      const blocked = node('div', null, 'dz-common-calculator dz-common-calculator-blocked');
      blocked.append(node('strong', 'Kalkulatori AUTO është i çaktivizuar'));
      blocked.append(node(
        'p',
        audit.calculator.reasonSq || 'Ky bar nuk ka skemë automatike të lejuar.',
        'dz-common-blocked-reason'
      ));
      host.append(blocked);
      return;
    }

    if (!audit || !options.length) {
      const blocked = node('div', null, 'dz-common-calculator dz-common-calculator-blocked');
      blocked.append(node('strong', 'AUTO i bllokuar për siguri'));
      blocked.append(node(
        'p',
        'Auditi klinik i verifikuar nuk u ngarkua. Tabela bazë mbetet vetëm për referencë dhe nuk përdoret për llogaritje automatike.',
        'dz-common-blocked-reason'
      ));
      host.append(blocked);
      return;
    }

    const shell = node('div', null, 'dz-common-calculator');
    const title = node('div', null, 'dz-common-calc-head');
    title.append(node('strong', 'Kalkulatori'), node('small', 'Pesha → mosha AUTO → doza → forma praktike'));
    shell.append(title);

    const selector = node('select', null, 'dz-unit dz-common-select');
    options.forEach((option, index) => {
      const choice = node('option', doseSq(option.displayLabel || option.label));
      choice.value = String(index);
      selector.append(choice);
    });
    if (options.length > 1) {
      const wrap = node('label', null, 'dz-common-field dz-common-field-wide');
      wrap.append(node('span', 'Formula', 'dz-label'), selector);
      shell.append(wrap);
    }

    const fields = node('div', null, 'dz-common-calc-fields');
    const answer = node('div', null, 'dz-common-calc-answer');
    shell.append(fields, answer);
    host.append(shell);

    const values = {
      weight:'',
      age:'',
      ageUnit:'year',
      ageManual:false,
      ageManualVisible:false,
    };
    let ageSummary = null;

    function currentOption() {
      return options[Number(selector.value) || 0];
    }

    function renderAgeSummary() {
      if (!ageSummary) return;
      ageSummary.replaceChildren();
      const weight = numeric(values.weight);
      if (!positiveNumber(weight)) {
        ageSummary.hidden = true;
        return;
      }

      ageSummary.hidden = false;
      const info = resolvedAgeInfo(values);
      const copy = node('div', null, 'dz-common-age-copy');
      const kicker = node('span', values.ageManual ? 'MOSHA E SAKTË' : 'MOSHA AUTO NGA PESHA', 'dz-common-age-kicker');
      copy.append(kicker);

      if (info?.defaultLabel || info?.label) {
        copy.append(node('strong', info.defaultLabel || info.label, 'dz-common-age-value'));
      } else {
        copy.append(node('strong', 'Nuk u përcaktua', 'dz-common-age-value'));
      }

      if (!values.ageManual) {
        const sourceRange = info?.label && info?.defaultLabel && info.label !== info.defaultLabel
          ? ` · intervali referues ${info.label}`
          : '';
        copy.append(node('small',
          info?.kind === 'below-range'
            ? 'Pesha është nën intervalin e tabelës; për doza sipas moshës duhet mosha e saktë.'
            : `Sugjerim praktik nga pesha${sourceRange}. Mosha kronologjike ka përparësi kur dihet.`,
          'dz-common-age-note'
        ));
      } else {
        copy.append(node('small', 'Vlera që e shënove ti po përdoret në vend të sugjerimit nga pesha.', 'dz-common-age-note'));
      }

      const action = node('button', values.ageManual ? 'Përdor AUTO' : 'Mosha e saktë');
      action.type = 'button';
      action.className = 'dz-common-age-action';
      action.addEventListener('click', () => {
        if (values.ageManual) {
          values.ageManual = false;
          values.age = '';
          values.ageManualVisible = false;
        } else {
          values.ageManualVisible = true;
        }
        rebuildFields();
        if (values.ageManualVisible) {
          const slug = searchText(drug.name).replace(/[^a-z0-9]+/g, '-');
          setTimeout(() => byId(`${slug}-common-age`)?.focus(), 0);
        }
      });

      ageSummary.append(copy, action);
    }

    function renderError(result) {
      const wrap = node('div', null, result.needsAgeConfirmation ? 'dz-common-age-alert' : '');
      wrap.append(node('p', result.error, 'dz-waiting'));
      if (result.needsAgeConfirmation) {
        const button = node('button', 'Shëno moshën e saktë');
        button.type = 'button';
        button.className = 'dz-common-age-cta';
        button.addEventListener('click', () => {
          values.ageManualVisible = true;
          rebuildFields();
          const slug = searchText(drug.name).replace(/[^a-z0-9]+/g, '-');
          setTimeout(() => byId(`${slug}-common-age`)?.focus(), 0);
        });
        wrap.append(button);
      }
      answer.append(wrap);
    }

    function update() {
      renderAgeSummary();
      const option = currentOption();
      const result = calculateOption(option, values);
      answer.replaceChildren();

      if (result.error) {
        renderError(result);
        return;
      }

      const primary = node('div', null, 'dz-common-result-main');
      primary.append(node('span', 'DOZA', 'dz-common-result-kicker'));
      primary.append(node('p', doseSq(result.primary), 'dz-common-result-dose'));
      if (result.note) primary.append(node('p', doseSq(result.note), 'dz-common-result-note'));
      answer.append(primary);

      if (result.secondary) answer.append(node('p', doseSq(result.secondary), 'dz-common-derived'));
      renderLiquidConversions(drug, option, result, answer);

      if (result.source) {
        const source = node('p', null, 'dz-common-source-line');
        source.append(node('span', 'Formula: '), node('b', doseSq(result.source)));
        answer.append(source);
      }
    }

    function appendExactAgeField(option) {
      if (!needsAge(option) || !values.ageManualVisible) return;
      const ageField = node('div', null, 'dz-common-field dz-common-age-exact');
      ageField.append(node('span', 'Mosha e saktë', 'dz-label'));
      const row = node('span', null, 'dz-common-age-row');
      const slug = searchText(drug.name).replace(/[^a-z0-9]+/g, '-');
      const age = makeNumberField('', `${slug}-common-age`, '', values.age);
      age.input.placeholder = 'p.sh. 5';
      age.input.addEventListener('input', () => {
        values.age = age.input.value;
        values.ageManual = validAgeMonths(ageMonths(values.age, values.ageUnit));
        update();
      });

      const unit = node('select', null, 'dz-unit');
      [['year','vjeç'],['month','muaj'],['day','ditë']].forEach(([value, label]) => {
        const choice = node('option', label);
        choice.value = value;
        choice.selected = value === values.ageUnit;
        unit.append(choice);
      });
      unit.addEventListener('change', () => {
        values.ageUnit = unit.value;
        values.ageManual = validAgeMonths(ageMonths(values.age, values.ageUnit));
        update();
      });

      row.append(age.field.lastElementChild, unit);
      ageField.append(row);
      fields.append(ageField);
    }

    function rebuildFields() {
      fields.replaceChildren();
      ageSummary = null;
      const option = currentOption();

      if (needsPatientWeight(option)) {
        const slug = searchText(drug.name).replace(/[^a-z0-9]+/g, '-');
        const weight = makeNumberField('Pesha e fëmijës', `${slug}-common-weight`, 'kg', values.weight);
        weight.field.classList.add('dz-common-weight-field');
        weight.field.lastElementChild?.classList.add('dz-number-lead');
        weight.input.placeholder = 'p.sh. 12';
        weight.input.addEventListener('input', () => {
          values.weight = weight.input.value;
          update();
        });
        addWeightShortcuts(weight.field, weight.input, values, update);
        fields.append(weight.field);

        ageSummary = node('div', null, 'dz-common-age-auto');
        ageSummary.hidden = true;
        fields.append(ageSummary);
      }

      appendExactAgeField(option);
      update();
    }

    selector.addEventListener('change', () => {
      values.ageManualVisible = false;
      values.ageManual = false;
      values.age = '';
      rebuildFields();
    });
    rebuildFields();
  }

  function drugMatches(drug, query) {
    if (!query) return true;
    const raw = [drug.name, ...drug.dose, ...drug.formulations].join(' ');
    const audit = auditFor(drug);
    const translated = [
      drug.name,
      ...drug.dose.map(doseSq),
      ...drug.formulations.map(formulationSq),
      audit?.badgeSq || '',
      audit?.summarySq || '',
      ...(audit?.warningsSq || []),
      audit?.kosovoMarket?.summarySq || '',
    ].join(' ');
    return searchText(raw).includes(query) || searchText(translated).includes(query);
  }

  function renderEvidence(drug) {
    const audit = auditFor(drug);
    if (!audit) {
      const panel = node('section', null, 'dz-evidence dz-evidence-unverified');
      const head = node('div', null, 'dz-evidence-head');
      head.append(node('span', 'PA AUDIT KLINIK', 'dz-evidence-badge'));
      panel.append(head);
      panel.append(node('p',
        'Tabela bazë ruhet për transparencë, por kjo skemë ende nuk është verifikuar kundrejt një burimi autoritativ të pavarur.',
        'dz-evidence-summary'
      ));
      const warnings = node('div', null, 'dz-evidence-warnings');
      warnings.append(node('p', '⚠ Kalkulatori AUTO është i bllokuar derisa bari të kalojë auditin klinik.'));
      panel.append(warnings);
      return panel;
    }
    const panel = node('section', null, 'dz-evidence dz-evidence-verified');
    const head = node('div', null, 'dz-evidence-head');
    head.append(node('span', audit.badgeSq || 'AUDIT KLINIK', 'dz-evidence-badge'));
    if (clinicalAudit.auditedAt) head.append(node('small', 'audit ' + clinicalAudit.auditedAt));
    panel.append(head);
    if (audit.summarySq) panel.append(node('p', audit.summarySq, 'dz-evidence-summary'));
    if (Array.isArray(audit.warningsSq)) {
      const box = node('div', null, 'dz-evidence-warnings');
      audit.warningsSq.forEach(value => box.append(node('p', '⚠ ' + value)));
      if (audit.warningsSq.length) panel.append(box);
    }
    if (audit.kosovoMarket && audit.kosovoMarket.summarySq) {
      panel.append(node('p', 'Kosovë · ' + audit.kosovoMarket.summarySq, 'dz-evidence-market'));
    }
    if (Array.isArray(audit.sources) && audit.sources.length) {
      const links = node('div', null, 'dz-evidence-sources');
      audit.sources.forEach(source => {
        const link = node('a', (source.authority || 'Burim') + ' · ' + (source.title || 'Hap burimin'));
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        links.append(link);
      });
      panel.append(links);
    }
    return panel;
  }

  function renderDrug(drug, autoOpen = false) {
    const card = node('details', null, 'dz-common-drug');
    card.open = Boolean(autoOpen);
    const summary = node('summary');
    const formula = node('span', null, 'dz-common-summary-dose');
    const audit = auditFor(drug);
    const autoBlocked = Boolean(audit?.calculator?.disabled);
    formula.append(node(
      'small',
      autoBlocked
        ? 'Audit klinik · AUTO i bllokuar'
        : audit
          ? 'Audit klinik · AUTO aktiv'
          : 'Pa audit klinik · AUTO bllokuar',
      autoBlocked
        ? 'dz-summary-audit is-blocked'
        : audit
          ? 'dz-summary-audit is-verified'
          : 'dz-summary-audit is-unverified'
    ));
    summary.append(node('span', String(drug.no), 'dz-common-no'), node('strong', drug.name), formula);
    card.append(summary);

    const body = node('div', null, 'dz-common-drug-body');
    const evidence = renderEvidence(drug);
    if (evidence) body.append(evidence);
    const calcHost = node('div');
    body.append(calcHost);

    const sourceDetails = node('details', null, 'dz-common-source-details');
    sourceDetails.open = !window.matchMedia('(max-width:760px)').matches;
    const sourceSummary = node('summary');
    sourceSummary.append(node('strong', 'Tabela bazë'), node('small', 'doza + format farmaceutike'));
    sourceDetails.append(sourceSummary);

    const grid = node('div', null, 'dz-common-source-grid');
    const doseCol = node('div', null, 'dz-common-source-col');
    doseCol.append(node('h4', 'Formula e dozimit'));
    drug.dose.forEach(line => doseCol.append(node('p', doseSq(line))));
    const formCol = node('div', null, 'dz-common-source-col');
    formCol.append(node('h4', 'Format e disponueshme'));
    drug.formulations.forEach(line => formCol.append(node('p', formulationSq(line))));
    grid.append(doseCol, formCol);
    sourceDetails.append(grid);
    body.append(sourceDetails);

    let built = false;
    const build = () => {
      if (!built) { built = true; renderCalculator(drug, calcHost); }
    };
    if (card.open) build();
    card.addEventListener('toggle', () => {
      if (!card.open) return;
      build();
      if (window.matchMedia('(max-width:760px)').matches) {
        const list = card.parentElement;
        list?.querySelectorAll(':scope > details.dz-common-drug[open]').forEach(other => {
          if (other !== card) other.open = false;
        });
      }
    });
    card.append(body);
    return card;
  }

  function renderSections() {
    const target = byId('pediatricCommonSections');
    if (!target) return;
    const query = searchText(byId('pediatricCommonSearch')?.value.trim());
    target.replaceChildren();

    const allMatches = query
      ? commonSections.flatMap(section => section.drugs.filter(drug => drugMatches(drug, query)))
      : [];
    const uniqueDrug = query && allMatches.length === 1 ? allMatches[0] : null;
    let shown = 0;

    commonSections.forEach((section, sectionIndex) => {
      const matching = section.drugs.filter(drug => drugMatches(drug, query));
      if (query && !matching.length && !searchText(`${section.roman} ${section.title} ${sectionSq(section.title)}`).includes(query)) return;
      const visible = matching.length ? matching : section.drugs;
      shown += visible.length;
      const block = node('details', null, 'dz-common-section');
      block.open = sectionIndex === 0 || Boolean(query);
      const summary = node('summary');
      summary.append(node('span', section.roman, 'dz-common-roman'), node('strong', sectionSq(section.title)), node('small', String(visible.length)));
      block.append(summary);
      const list = node('div', null, 'dz-common-drug-list');
      visible.forEach(drug => list.append(renderDrug(drug, uniqueDrug === drug)));
      block.append(list);
      target.append(block);
    });

    const count = byId('pediatricCommonCount');
    if (count) count.textContent = query
      ? `${shown} barna të gjetura`
      : `50 barna · 10 ndarje · ${auditedDrugCount()} të audituara · ${activeAutoCount()} AUTO · ${blockedAutoCount()} të bllokuara`;
    if (!shown) target.append(node('p', 'Nuk u gjet bar në këtë referencë.', 'dz-empty'));
  }

  async function bootReference() {
    const target = byId('pediatricCommonSections');
    if (!target) return;
    try {
      let payload = null;
      let source = 'database';
      try {
        const response = await fetch(DATA_URL, { cache:'no-store', credentials:'same-origin' });
        if (!response.ok) throw new Error('Database reference unavailable');
        payload = await response.json();
      } catch {
        source = 'static-fallback';
        const fallback = await fetch(STATIC_FALLBACK_URL, { cache:'force-cache', credentials:'same-origin' });
        if (!fallback.ok) throw new Error('Static reference unavailable');
        payload = await fallback.json();
      }
      commonSections = Array.isArray(payload?.sections) ? payload.sections : [];
      weightAgeDefaults = payload?.weightAgeDefaults && Array.isArray(payload.weightAgeDefaults.bands)
        ? payload.weightAgeDefaults
        : null;

      if (!weightAgeDefaults) {
        const ageFallback = await fetch(STATIC_AGE_DEFAULTS_URL, { cache:'force-cache', credentials:'same-origin' });
        if (!ageFallback.ok) throw new Error('Weight-age defaults unavailable');
        weightAgeDefaults = await ageFallback.json();
      }

      if (!commonSections.length) throw new Error('Reference empty');
      if (!Array.isArray(weightAgeDefaults?.bands) || !weightAgeDefaults.bands.length) {
        throw new Error('Weight-age defaults empty');
      }

      if (payload?.clinicalAudit && typeof payload.clinicalAudit === 'object' && payload.clinicalAudit.drugs) {
        clinicalAudit = payload.clinicalAudit;
      } else {
        try {
          const auditResponse = await fetch(CLINICAL_AUDIT_URL, { cache:'no-store', credentials:'same-origin' });
          if (auditResponse.ok) {
            const auditPayload = await auditResponse.json();
            if (auditPayload && typeof auditPayload === 'object' && auditPayload.drugs) clinicalAudit = auditPayload;
          }
        } catch {
          /* Fail closed: the source table remains visible, but AUTO stays disabled without the audit layer. */
        }
      }

      renderSections();
      const count = byId('pediatricCommonCount');
      if (count) count.dataset.source = source;
      byId('pediatricCommonSearch')?.addEventListener('input', renderSections);
    } catch {
      if (byId('pediatricCommonCount')) byId('pediatricCommonCount').textContent = 'Nuk u ngarkua';
      target.replaceChildren(node('p', 'Referenca pediatrike nuk u ngarkua. Ringarko faqen.', 'dz-empty'));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootReference, { once:true });
  else void bootReference();
})();
