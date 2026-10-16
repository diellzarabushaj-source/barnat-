/* Dozologjia pediatric-only runtime. The legacy Master v2.7 picker was removed from this page by request. */
/* Pediatric common-drug source table. Display text comes from the supplied
   reference file; calculator output is arithmetic over those source formulas. */
(() => {
  'use strict';

  const CALCULATE_URL = '/api/dosage?view=pediatric-common-calculate';
  let referenceRevision = '';
  let referenceActive = false;
  const DATA_URL = '/api/dosage?view=pediatric-common-reference&workspace=market-v1&build=63-market-clarity-20261017';
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
  const optionNeedsExactDays = option => rulesOf(option).some(ruleNeedsExactDays);
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
  const componentSq = value => ({'dexamethasone-base':'deksametazon bazë','cholecalciferol':'vitaminë D3','elemental-iron':'hekur elementar','trimethoprim':'TMP (trimetoprim)','cefoperazone+sulbactam-total':'shuma cefoperazonë + sulbaktam (1:1)'}[value] || (liquidCore?.componentSq ? liquidCore.componentSq(value) : String(value ?? '')));
  const mlNumber = value => {
    return String(Number(Number(value).toPrecision(4))).replace('.', ',');
  };
  const mlRange = (lo, hi) => `${mlNumber(lo)}${Math.abs(lo - hi) < 1e-9 ? '' : '–' + mlNumber(hi)} mL`;

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
    const panel = node('section', null, 'dz-evidence ' + (audit.calculator?.disabled ? 'dz-evidence-limited' : 'dz-evidence-verified'));
    const head = node('div', null, 'dz-evidence-head');
    head.append(node('span', audit.badgeSq || 'AUDIT KLINIK', 'dz-evidence-badge'));
    const auditedAt = audit.auditedAt || clinicalAudit.auditedAt;
    if (auditedAt) head.append(node('small', 'audit ' + auditedAt));
    panel.append(head);
    if (audit.summarySq) panel.append(node('p', audit.summarySq, 'dz-evidence-summary'));
    if (Array.isArray(audit.warningsSq)) {
      const box = node('div', null, 'dz-evidence-warnings');
      audit.warningsSq.forEach(value => box.append(node('p', '⚠ ' + value)));
      if (audit.warningsSq.length) panel.append(box);
    }
    if (audit.kosovoMarket && audit.kosovoMarket.summarySq) {
      panel.append(node('p', 'Kosovë · kontrolli ' + (audit.kosovoMarket.checkedAt||clinicalAudit.auditedAt) + ' · ' + audit.kosovoMarket.summarySq, 'dz-evidence-market'));
    }
    if (Array.isArray(audit.sources) && audit.sources.length) {
      const details = node('details', null, 'dz-evidence-source-details');
      details.open = false;
      const summary = node('summary');
      summary.append(
        node('strong', 'Burimet e auditit'),
        node('small', `${audit.sources.length} burim${audit.sources.length === 1 ? '' : 'e'}`)
      );
      details.append(summary);

      const links = node('div', null, 'dz-evidence-sources');
      audit.sources.forEach(source => {
        const link = node('a', (source.authority || 'Burim') + ' · ' + (source.title || 'Hap burimin'));
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        links.append(link);
      });
      details.append(links);
      panel.append(details);
    }
    return panel;
  }

  let marketCatalog=null;
  let ageEdited=false;
  let controller=null;
  let timer=null;
  let requestId=0;
  const selection=()=>{
    const drug=commonSections.flatMap(s=>s.drugs).find(d=>d.name===byId('pediatricDrug').value);
    const entry=marketCatalog?.drugs.find(d=>d.name===drug?.name);
    const form=entry?.forms.find(f=>f.id===byId('pediatricForm').value);
    const variant=form?.variants.find(v=>v.id===byId('pediatricStrength').value);
    const scheme=variant?.schemes.find(s=>String(s.index)===byId('pediatricScheme').value);
    return {drug,entry,form,variant,scheme};
  };
  function choices(id,items,placeholder){
    const select=byId(id);select.replaceChildren();
    const empty=node('option',placeholder);empty.value='';select.append(empty);
    items.forEach(item=>{const option=node('option',item.label);option.value=String(item.id);select.append(option);});
    select.disabled=!items.length;
  }
  function showPatient(visible){
    byId('pediatricPatient').hidden=!visible;
    byId('pediatricCalculation').classList.toggle('has-patient',Boolean(visible));
  }
  function clearResult(message='Shkruaj peshën për të llogaritur.',action=null){
    clearTimeout(timer);controller?.abort();requestId++;
    byId('pediatricAnswer').replaceChildren(node('p',message,'dz-market-message'));
    byId('pediatricAnswer').classList.remove('has-result');
    byId('pediatricAnswer').setAttribute('aria-busy','false');
    if(action){
      const button=node('button',action.label,'dz-result-next');button.type='button';
      button.addEventListener('click',()=>{
        const target=byId(action.target+'Search')||byId(action.target);
        if(!target||target.disabled)return;
        target.focus();if(target.getAttribute('role')==='combobox')target.click();
      });
      byId('pediatricAnswer').append(button);
    }
  }
  function patientResetState(){byId('pediatricReset').hidden=!byId('pediatricWeight').value.trim()&&!byId('pediatricAge').value.trim();}
  function nextChoice(target,label,message){clearResult(message,{target,label});}
  function showVariantReview(variant){
    clearResult(variant.reason||'Për këtë produkt nuk ka skemë pediatrike aktive.');
    if(!variant.review)return;
    byId('pediatricAnswer').prepend(node('strong',variant.review.labelSq,'dz-review-heading'));
    const details=node('details',null,'dz-variant-review');
    details.append(node('summary','Burimet e kontrolluara · '+variant.review.reviewedAt));
    details.append(node('p',variant.review.scopeSq,'dz-market-note'));
    for(const source of variant.review.sources){
      const link=node('a',source.title);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';details.append(link);
    }
    byId('pediatricAnswer').append(details);
  }
  function renderSources(drug){
    ['pediatricReferenceDetails','pediatricSourceDetails'].forEach(id=>{byId(id).hidden=!drug;byId(id).open=false;});
    byId('pediatricEvidence').replaceChildren();byId('pediatricSourceTable').replaceChildren();
    if(!drug)return;
    byId('pediatricEvidence').append(renderEvidence(drug));
    const table=byId('pediatricSourceTable');
    byId('pediatricSourceDetails').querySelector('summary').textContent=drug.marketAdditionVersion?'Referenca dhe format në AKKPM':'Tabela bazë e referencës';
    table.append(node('h4','Formula e dozimit'));drug.dose.forEach(line=>table.append(node('p',doseSq(line))));
    table.append(node('h4',drug.marketAdditionVersion?'Format e publikuara në AKKPM':'Format e disponueshme · tabela bazë'));
    drug.formulations.forEach(line=>table.append(node('p',formulationSq(line))));
    table.append(node('p',drug.marketAdditionVersion?'Format merren nga regjistri aktiv i AKKPM-së; skemat e llogaritjes lidhen me burimet klinike përkatëse.':'Zgjedhjet e kalkulatorit merren nga regjistri aktiv i AKKPM-së; tabela bazë ruhet për transparencë.'));
  }
  function renderProducts(variant){
    const details=byId('pediatricProductDetails');details.hidden=!variant;details.open=false;
    const host=byId('pediatricProducts');host.replaceChildren();if(!variant)return;
    if(variant.populationNoteSq)host.append(node('p',variant.populationNoteSq));
    variant.products.forEach(product=>{
      const row=node('article',null,'dz-market-product');row.append(node('strong',product.name),node('span',product.strength+' · '+product.form),node('small',product.packaging));host.append(row);
    });
  }
  function drugChanged(){
    clearResult('Zgjidh formën dhe fortësinë.');
    choices('pediatricForm',[],'Zgjidh barin më parë');choices('pediatricStrength',[],'Zgjidh formën më parë');
    byId('pediatricSchemeField').hidden=true;byId('pediatricSchemeNote').hidden=true;showPatient(false);
    byId('pediatricAgeConfirmed').checked=false;byId('pediatricSafetyConfirmed').checked=false;
    const {drug,entry}=selection();renderSources(drug);renderProducts(null);
    if(!drug){nextChoice('pediatricDrug','Zgjidh barin','Zgjidh barin për të filluar.');return;}
    choices('pediatricForm',(entry?.forms||[]).map(f=>({id:f.id,label:f.label})),'Zgjidh formën…');
    if(!entry?.forms.length)clearResult(referenceActive?'Nuk ka formë të konfirmuar në regjistrin e publikuar për këtë bar.':'Lidhja aktive mungon. Llogaritja nuk është e disponueshme.');
    else if(entry.forms.length===1){byId('pediatricForm').value=entry.forms[0].id;formChanged();}
    else nextChoice('pediatricForm','Zgjidh formën','Zgjidh formën e produktit që do të përdorësh.');
  }
  function formChanged(){
    clearResult('Zgjidh fortësinë / përqendrimin.');
    showPatient(false);byId('pediatricSchemeField').hidden=true;byId('pediatricSchemeNote').hidden=true;renderProducts(null);
    const {form}=selection();
    choices('pediatricStrength',[],'Zgjidh fortësinë…');
    const select=byId('pediatricStrength');
    for(const [active,title] of [[true,'Me skemë të verifikuar'],[false,'Pa llogaritje automatike']]){
      const variants=(form?.variants||[]).filter(v=>Boolean(v.schemes.length)===active);if(!variants.length)continue;
      const group=node('optgroup');group.label=title;variants.forEach(v=>{const option=node('option',v.label);option.value=v.id;group.append(option);});select.append(group);
    }
    select.disabled=!form?.variants.length;
    if(form?.variants.length===1){select.value=form.variants[0].id;strengthChanged();}
    else if(form)nextChoice('pediatricStrength','Zgjidh fortësinë','Zgjidh fortësinë / përqendrimin e produktit.');
  }
  function strengthChanged(){
    clearResult();
    byId('pediatricAgeConfirmed').checked=false;byId('pediatricSafetyConfirmed').checked=false;
    const {variant}=selection();renderProducts(variant);
    choices('pediatricScheme',(variant?.schemes||[]).map(s=>({id:s.index,label:s.label})),'Zgjidh skemën…');
    byId('pediatricSchemeField').hidden=!(variant?.schemes.length>1);
    // A single verified scheme is unambiguous; several indications require a choice.
    if(variant?.schemes.length===1)byId('pediatricScheme').value=String(variant.schemes[0].index);
    schemeChanged();
  }
  function schemeChanged(){
    clearResult();
    byId('pediatricSafetyConfirmed').checked=false;
    const {variant,scheme}=selection();
    byId('pediatricSchemeNote').textContent=scheme?.eligibilitySq||'';
    byId('pediatricSchemeNote').hidden=!scheme?.eligibilitySq;
    showPatient(Boolean(variant?.schemes.length));
    byId('pediatricAgeGate').hidden=!scheme?.needsAge;
    byId('pediatricSafetyGate').hidden=!scheme?.safetyConfirmation;
    byId('pediatricSafetyText').textContent=scheme?.safetyConfirmation||'';
    if(variant && !variant.schemes.length){showVariantReview(variant);return;}
    if(variant && !scheme){nextChoice('pediatricScheme','Zgjidh skemën','Zgjidh indikacionin / skemën.');return;}
    suggestAge();schedule();
  }
  function suggestAge(){
    patientResetState();
    byId('pediatricAgeSuggest').hidden=!ageEdited||!byId('pediatricWeight').value.trim();
    if(ageEdited){byId('pediatricAgeNote').textContent='Mosha e shënuar manualisht · konfirmo moshën reale.';return;}
    const {scheme}=selection();
    const inferred=weightAgeCore?.infer(byId('pediatricWeight').value,weightAgeDefaults);
    const neonatal=scheme?.exactDays && inferred && inferred.defaultMonths<2;
    byId('pediatricAgeUnit').value='month';
    byId('pediatricAge').value=inferred&&!neonatal?String(Math.round(inferred.defaultMonths)):'';
    if(neonatal)byId('pediatricAgeUnit').value='day';
    patientResetState();
    byId('pediatricAgeNote').textContent=neonatal?'Shëno moshën reale në ditë; ajo nuk përcaktohet nga pesha.':inferred?'Mosha e sugjeruar nga pesha · ndryshoje kur duhet.':'Mosha nga pesha është vetëm sugjerim.';
  }
  function displayResult(result){
    const host=byId('pediatricAnswer');host.replaceChildren();host.setAttribute('aria-busy','false');
    if(result.error){host.append(node('p',result.error,'dz-market-message'));return;}
    host.classList.add('has-result');
    const {drug,form,variant,scheme}=selection();
    const heading=node('div',null,'dz-result-heading');
    const context=node('div',null,'dz-result-context');
    context.append(node('strong',drug?.name||result.drugName),node('span',[form?.label,variant?.label].filter(Boolean).join(' · ')));
    if(scheme?.label)context.append(node('small',scheme.label));
    heading.append(context);host.append(heading);
    const measure=result.selectedMeasure;
    const per=result.perDoseMin!=null?'PËR DOZË':result.dosePeriod==='day'?'NË 24 ORË':'DOZA';
    const routeLabels={oral:'Nga goja',rectal:'Rektal',injectable:'Parenteral',nebulized:'Nebulizim',inhaled:'Inhalim'};
    host.append(node('small',[routeLabels[result.route],per].filter(Boolean).join(' · '),'dz-market-kicker'));
    const measured=measure && !measure.error;
    if(measured){
      const range=`${mlNumber(measure.min)}${Math.abs(measure.min-measure.max)>1e-9?'–'+mlNumber(measure.max):''} ${measure.unit}`;
      // Integer solids are never split or rounded by the interface.
      host.append(node('strong',range,'dz-market-measure'));
    }
    const mass=doseRange(measure?.actualMin??result.perDoseMin??result.doseMin,measure?.actualMax??result.perDoseMax??result.doseMax,measure?.actualUnit||result.doseUnit);
    host.append(node(measured?'span':'strong',mass,measured?'dz-common-result-dose':'dz-market-measure dz-common-result-dose'));
    if(result.administrationNote)host.append(node('p',result.administrationNote,'dz-market-frequency'));
    if(result.frequency)host.append(node('p',doseSq(result.frequency),'dz-market-frequency'));
    const note=(result.note||'').replace(result.frequency||'\u0000','').replace(/^\s*·\s*/, '').trim();
    if(note)host.append(node('p',doseSq(note),'dz-market-note'));
    if(measure?.basis)host.append(node('p','Sipas komponentit: '+componentSq(measure.basis.split('|')[0]),'dz-market-note'));
    if(measure?.preparation)host.append(node('p',measure.preparation,'dz-market-note'));
    if(measure?.error)host.append(node('p',measure.error,'dz-market-message'));
    (result.resultWarnings||[]).forEach(warning=>host.append(node('p',warning,'dz-market-note')));
    host.append(node('small','Kontrollo etiketën dhe udhëzimin e produktit para administrimit.','dz-market-note'));
    if(navigator.clipboard?.writeText){
      const copy=node('button','Kopjo','dz-result-copy');copy.type='button';copy.setAttribute('aria-label','Kopjo rezultatin e llogaritur');
      const patient='Pesha: '+byId('pediatricWeight').value+' kg'+(result.ageInfo?.manual?' · Mosha: '+result.ageInfo.label:' · Mosha e pakonfirmuar');
      const text=[host.innerText,patient].join('\n');const current=requestId;let copyError=null;
      copy.addEventListener('click',async()=>{
        copy.disabled=true;
        try{await navigator.clipboard.writeText(text);if(current===requestId&&copy.isConnected){copyError?.remove();copyError=null;copy.textContent='Kopjuar';setTimeout(()=>{if(copy.isConnected){copy.textContent='Kopjo';copy.disabled=false;}},1800);}}
        catch{if(current===requestId&&copy.isConnected){copy.disabled=false;copy.textContent='Provo sërish';if(!copyError){copyError=node('small','Kopjimi nuk u lejua. Mund ta përzgjedhësh tekstin manualisht.','dz-market-note');host.append(copyError);}}}
      });heading.append(copy);
    }
  }
  function schedule(){
    clearResult();
    const {drug,variant,scheme}=selection();
    if(!referenceActive||!variant||!scheme)return;
    const weight=byId('pediatricWeight').value.trim().replace(',','.');
    if(!weight){nextChoice('pediatricWeight','Shkruaj peshën','Shkruaj peshën për të llogaritur.');return;}
    if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(weight)||Number(weight)<0.4||Number(weight)>150){displayResult({error:'Shëno peshën reale ndërmjet 0,4 dhe 150 kg.'});return;}
    if(scheme.needsAge&&!byId('pediatricAgeConfirmed').checked){nextChoice('pediatricAgeConfirmed','Kontrollo moshën','Konfirmo ose ndrysho moshën e sugjeruar.');return;}
    if(scheme.safetyConfirmation&&!byId('pediatricSafetyConfirmed').checked){nextChoice('pediatricSafetyConfirmed','Kontrollo kushtet','Konfirmo kontrollin e sigurisë për skemën e zgjedhur.');return;}
    const id=requestId;
    timer=setTimeout(async()=>{
      controller=new AbortController();const active=controller;const timeout=setTimeout(()=>active.abort(),10000);
      byId('pediatricAnswer').replaceChildren(node('p','Duke llogaritur…','dz-market-message'));
      byId('pediatricAnswer').setAttribute('aria-busy','true');
      try{
        const input={referenceRevision,drugName:drug.name,variantId:variant.id,optionIndex:scheme.index,weight:byId('pediatricWeight').value,
          age:byId('pediatricAge').value,ageUnit:byId('pediatricAgeUnit').value,ageConfirmed:byId('pediatricAgeConfirmed').checked,
          safetyConfirmed:byId('pediatricSafetyConfirmed').checked};
        const response=await fetch(CALCULATE_URL,{method:'POST',credentials:'same-origin',cache:'no-store',signal:active.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
        const result=await response.json();if(id!==requestId)return;
        if(response.status>=500)throw Error('Calculation temporarily unavailable');
        if(!response.ok&&!result.error)throw Error('Calculation unavailable');
        displayResult(result);
      }catch{if(id===requestId){
        displayResult({error:'Llogaritja nuk u ngarkua. Rezultati i vjetër nuk përdoret.'});
        const retry=node('button','Provo përsëri','dz-result-retry');retry.type='button';retry.addEventListener('click',schedule);byId('pediatricAnswer').append(retry);
      }}
      finally{clearTimeout(timeout);}
    },180);
  }
  async function bootReference(){
    if(!byId('pediatricDrug'))return;
    try{
      let payload=null;let source = 'database';
      try{const response=await fetch(DATA_URL,{credentials:'same-origin',cache:'no-store',headers:{'Cache-Control':'no-cache'}});if(!response.ok)throw Error();payload=await response.json();}
      catch{
        source='static-fallback';
        const responses=await Promise.all([STATIC_FALLBACK_URL,STATIC_AGE_DEFAULTS_URL,CLINICAL_AUDIT_URL].map(url=>fetch(url,{credentials:'same-origin',cache:'no-store'})));
        if(responses.some(r=>!r.ok))throw Error();
        const [base,ages,audit]=await Promise.all(responses.map(r=>r.json()));payload={...base,weightAgeDefaults:ages,clinicalAudit:audit};
      }
      commonSections=payload.sections||[];weightAgeDefaults=payload.weightAgeDefaults;clinicalAudit=payload?.clinicalAudit||clinicalAudit;marketCatalog=payload.marketCatalog||null;
      referenceActive=source==='database' && Boolean(marketCatalog?.revision);
      referenceRevision=JSON.stringify([payload.database?.clinicalAudit?.version||clinicalAudit.schemaVersion||'',payload.database?.clinicalAudit?.updatedAt||clinicalAudit.auditedAt||'',payload.database?.payloadSha256||'',...(marketCatalog?[marketCatalog.revision]:[])]);
      const picker=byId('pediatricDrug');picker.replaceChildren(node('option','Zgjidh barin…'));picker.firstChild.value='';
      commonSections.forEach(section=>{
        const group=node('optgroup');group.label=section.title==='Miscellaneous'?'Të tjerat':sectionSq(section.title);
        section.drugs.forEach(drug=>{
          const entry=marketCatalog?.drugs.find(d=>d.name===drug.name);
          const brands=[...new Set(entry?.forms.flatMap(f=>f.variants.flatMap(v=>v.products.map(p=>p.name)))||[])];
          const option=node('option',drug.name);option.value=drug.name;
          option.dataset.searchTerms=[drug.searchTerms||'',...brands].join(' ');option.dataset.brands=JSON.stringify(brands);
          if(entry&&!entry.forms.some(f=>f.variants.some(v=>v.schemes.length)))option.dataset.referenceOnly='true';
          group.append(option);
        });picker.append(group);
      });picker.disabled=false;
      byId('pediatricCommonCount').textContent=referenceActive?`${marketCatalog.productCount} produkte · AKKPM`:'Referencë pa lidhje aktive';
      byId('pediatricCommonCount').dataset.source=source;
      picker.addEventListener('change',drugChanged);byId('pediatricForm').addEventListener('change',formChanged);
      document.addEventListener('pediatric:choice-editing',()=>clearResult('Zgjidh një rezultat nga lista.'));
      document.addEventListener('pediatric:choice-cancel',()=>{const {variant,scheme}=selection();if(scheme)schedule();else if(variant&&!variant.schemes.length)showVariantReview(variant);else clearResult('Zgjidh barin, formën dhe skemën.');});
      byId('pediatricStrength').addEventListener('change',strengthChanged);byId('pediatricScheme').addEventListener('change',schemeChanged);
      byId('pediatricWeight').addEventListener('input',()=>{byId('pediatricAgeConfirmed').checked=false;if(!byId('pediatricWeight').value.trim()){ageEdited=false;byId('pediatricAge').value='';byId('pediatricAgeUnit').value='month';byId('pediatricSafetyConfirmed').checked=false;}suggestAge();schedule();});
      byId('pediatricAge').addEventListener('input',()=>{ageEdited=true;suggestAge();byId('pediatricAgeConfirmed').checked=false;schedule();});
      byId('pediatricAgeUnit').addEventListener('change',()=>{ageEdited=true;suggestAge();byId('pediatricAgeConfirmed').checked=false;schedule();});
      ['pediatricAgeConfirmed','pediatricSafetyConfirmed'].forEach(id=>byId(id).addEventListener('change',schedule));
      byId('pediatricAgeSuggest').addEventListener('click',()=>{ageEdited=false;byId('pediatricAgeConfirmed').checked=false;suggestAge();schedule();byId('pediatricAge').focus({preventScroll:true});});
      byId('pediatricReset').addEventListener('click',()=>{
        ageEdited=false;byId('pediatricWeight').value='';byId('pediatricAge').value='';byId('pediatricAgeConfirmed').checked=false;byId('pediatricSafetyConfirmed').checked=false;suggestAge();schedule();byId('pediatricWeight').focus();
      });
      ['pediatricWeight','pediatricAge'].forEach(id=>byId(id).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();byId(id).blur();}}));
      drugChanged();
      window.addEventListener('pagehide',()=>{clearTimeout(timer);controller?.abort();requestId++;});
    }catch{byId('pediatricCommonCount').textContent='Nuk u ngarkua';clearResult('Referenca nuk u ngarkua. Ringarko faqen.');}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootReference,{once:true});
  else void bootReference();
})();
