(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DRxPediatricLiquid = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MASS_TO_MG = Object.freeze({ g:1000, mg:1, mcg:0.001 });

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const plain = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const number = value => {
    const parsed = Number(String(value ?? '').replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const positive = value => Number.isFinite(value) && value > 0;

  function kindFromLine(line) {
    const text = plain(line);
    if (/\b(?:syp|syrup|suspension)\b/.test(text)) return 'oral';
    if (/\b(?:dps|drops?)\b/.test(text)) return 'oral';
    if (/\brespules?\b/.test(text)) return 'nebulized';
    if (/respiratory solution|nebul/.test(text)) return 'nebulized';
    if (/\b(?:injection|ampoule|vial)\b/.test(text)) return 'injectable';
    return '';
  }

  function formLabel(line, kind) {
    const text = plain(line);
    if (/\b(?:syp|syrup|suspension)\b/.test(text)) return 'Shurup';
    if (/\b(?:dps|drops?)\b/.test(text)) return 'Pika';
    if (/\brespules?\b/.test(text)) return 'Respule';
    if (/respiratory solution/.test(text)) return 'Solucion respirator';
    if (/\bampoule\b/.test(text)) return 'Ampulë';
    if (/\bvial\b/.test(text)) return 'Vial';
    if (/\binjection\b/.test(text)) return 'Injeksion';
    return kind === 'oral' ? 'Lëng oral' : kind === 'nebulized' ? 'Nebulizim' : 'Preparat';
  }

  function specialPresentations(drugName, formulations) {
    const name = plain(drugName);
    const source = Array.isArray(formulations) ? formulations : [];

    if (name === 'amoxicillin + clavulanic') {
      return [
        { kind:'oral', form:'Shurup', mg:200, mL:5, componentBasis:'amoxicillin', source:source.find(line => /228\.5\s*\/\s*5/i.test(line)) || 'Syp – 228.5/5' },
        { kind:'oral', form:'Shurup', mg:400, mL:5, componentBasis:'amoxicillin', source:source.find(line => /457\s*\/\s*5/i.test(line)) || 'Syp – 457/5' },
        { kind:'oral', form:'Pika', mg:80, mL:1, componentBasis:'amoxicillin', source:source.find(line => /91\.4\s*\/\s*1/i.test(line)) || 'Dps – 91.4/1' },
      ];
    }

    if (name === 'cloxacillin') {
      const line = source.find(item => /cloxacillin\s*\/\s*5/i.test(item));
      return line ? [{ kind:'oral', form:'Shurup', mg:125, mL:5, componentBasis:'cloxacillin', source:line }] : [];
    }

    if (name.startsWith('cotrimoxazole')) {
      const line = source.find(item => /\bsyp\b/i.test(item) && /40\s*\/\s*5/i.test(item));
      return line ? [{ kind:'oral', form:'Shurup', mg:40, mL:5, componentBasis:'TMP', source:line }] : [];
    }

    return [];
  }

  function parseGenericLine(line) {
    const kind = kindFromLine(line);
    if (!kind || /\+/.test(line)) return [];
    const matches = [];
    const expression = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|g)?\s*\/\s*(\d+(?:[.,]\d+)?)\s*(?:m?l)?/gi;
    for (const match of String(line).matchAll(expression)) {
      const numerator = number(match[1]);
      const unit = String(match[2] || 'mg').toLowerCase();
      const denominator = number(match[3]);
      const factor = MASS_TO_MG[unit];
      if (!positive(numerator) || !positive(denominator) || !positive(factor)) continue;
      matches.push({
        kind,
        form:formLabel(line, kind),
        mg:numerator * factor,
        mL:denominator,
        componentBasis:'',
        source:line,
      });
    }
    return matches;
  }

  function routeFilter(option, items) {
    const raw = clean([option?.label, option?.displayLabel].filter(Boolean).join(' ')).toLowerCase();
    let wanted = '';
    if (/nebul|respir/.test(raw)) wanted = 'nebulized';
    else if (/(?:\bi\.?v\.?\b|\bi\.?m\.?\b|infusion)/.test(raw)) wanted = 'injectable';
    else if (/\boral\b/.test(raw)) wanted = 'oral';

    if (wanted) return items.filter(item => item.kind === wanted);
    if (items.some(item => item.kind === 'oral')) return items.filter(item => item.kind === 'oral');
    return items;
  }

  function presentationsFor(drug, option) {
    const formulations = Array.isArray(drug?.formulations) ? drug.formulations : [];
    const special = specialPresentations(drug?.name, formulations);
    const generic = formulations.flatMap(parseGenericLine);
    /* For component-aware combinations, never mix the total-strength notation
       back into a component-based dose conversion. The curated special set is
       the only safe automatic mL path for that drug. */
    const combined = special.length ? special : generic;

    const seen = new Set();
    return routeFilter(option, combined).filter(item => {
      const key = [item.kind, item.form, item.mg, item.mL, item.componentBasis].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function amountFromResult(result) {
    const unit = clean(result?.doseUnit);
    if (!/^mg(?:\b|\s)/i.test(unit)) return null;

    if (positive(result?.perDoseMin) && positive(result?.perDoseMax)) {
      return {
        min:result.perDoseMin,
        max:result.perDoseMax,
        basis:'dose',
        label:'për dozë',
      };
    }
    if (positive(result?.doseMin) && positive(result?.doseMax)) {
      if (result?.dosePeriod === 'day') {
        return { min:result.doseMin, max:result.doseMax, basis:'day', label:'në 24 orë' };
      }
      if (result?.dosePeriod === 'hour') {
        return { min:result.doseMin, max:result.doseMax, basis:'hour', label:'në orë' };
      }
      return { min:result.doseMin, max:result.doseMax, basis:'dose', label:'për dozë' };
    }
    return null;
  }

  function volumeConversions(result, presentations) {
    const amount = amountFromResult(result);
    if (!amount) return [];
    return (presentations || []).filter(item => positive(item?.mg) && positive(item?.mL)).map(item => {
      const min = amount.min * item.mL / item.mg;
      const max = amount.max * item.mL / item.mg;
      return {
        ...item,
        volumeMin:min,
        volumeMax:max,
        basis:amount.basis,
        basisLabel:amount.label,
        frequency:clean(result?.frequency),
      };
    });
  }

  return Object.freeze({
    presentationsFor,
    volumeConversions,
    _test:Object.freeze({
      kindFromLine,
      parseGenericLine,
      specialPresentations,
      routeFilter,
      amountFromResult,
    }),
  });
});
