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
    if (/\b(?:injection|ampoule|vial|infusion)\b/.test(text)) return 'injectable';
    if (/\b(?:supp|suppository|suppositories)\b/.test(text)) return 'rectal';
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
    if (/\binfusion\b/.test(text)) return 'Infuzion';
    if (/\b(?:supp|suppository|suppositories)\b/.test(text)) return 'Supozitor';
    return kind === 'oral' ? 'Lëng oral' : kind === 'nebulized' ? 'Nebulizim' : 'Preparat';
  }

  function specialPresentations(drugName, formulations) {
    const name = plain(drugName);
    const source = Array.isArray(formulations) ? formulations : [];

    if (name === 'amoxicillin + clavulanic') {
      const presentations = [];
      const low = source.find(line => /228\.5\s*\/\s*5/i.test(line));
      const high = source.find(line => /457\s*\/\s*5/i.test(line));
      const drops = source.find(line => /91\.4\s*\/\s*1/i.test(line));
      if (low) presentations.push({ kind:'oral', form:'Shurup', mg:200, mL:5, componentBasis:'amoxicillin', source:low });
      if (high) presentations.push({ kind:'oral', form:'Shurup', mg:400, mL:5, componentBasis:'amoxicillin', source:high });
      if (drops) presentations.push({ kind:'oral', form:'Pika', mg:80, mL:1, componentBasis:'amoxicillin', source:drops });
      return presentations;
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
    const explicit = clean(option?.route);
    const raw = clean([option?.label, option?.displayLabel].filter(Boolean).join(' ')).toLowerCase();
    let wanted = explicit;
    if (!wanted && /nebul|respir/.test(raw)) wanted = 'nebulized';
    else if (!wanted && /(?:\bi\.?v\.?\b|\bi\.?m\.?\b|infusion)/.test(raw)) wanted = 'injectable';
    else if (!wanted && /\boral\b/.test(raw)) wanted = 'oral';

    if (wanted === 'oral_or_injectable') return items.filter(item => item.kind === 'oral' || item.kind === 'injectable');
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


  const SECTION_TITLES_SQ = Object.freeze({
    'Antibiotics':'Antibiotikë',
    'Anti- Helminthics':'Antihelmintikë',
    'Analgesics':'Analgjezikë',
    'Anti emetics':'Antiemetikë',
    'Anti Histaminic':'Antihistaminikë',
    'Antiviral Agents':'Antiviralë',
    'Bronchodilators':'Bronkodilatatorë',
    'Steroids':'Kortikosteroide',
    'Anti Gastritis':'Barna për gastrit dhe aciditet',
    'Miscellaneous':'Të tjera',
  });

  function sectionTitleSq(value) {
    const text = clean(value);
    return SECTION_TITLES_SQ[text] || text;
  }

  function componentSq(value) {
    const key = plain(value);
    if (key === 'amoxicillin') return 'amoksicilinë';
    if (key === 'clavulanic' || key === 'clavulanate') return 'klavulanat';
    if (key === 'cefoperazone') return 'cefoperazonë';
    if (key === 'piperacillin') return 'piperacilinë';
    if (key === 'tazobactam') return 'tazobaktam';
    if (key === 'tmp') return 'TMP (trimetoprim)';
    if (key === 'elemental iron') return 'hekur elementar';
    return clean(value);
  }

  function doseTextSq(value) {
    let text = clean(value);
    if (!text) return '';

    text = text
      .replace(/Half dose of Salbutamol/gi, 'Gjysma e dozës së salbutamolit')
      .replace(/Same as Amoxicillin/gi, 'Njësoj si amoksicilina')
      .replace(/Can give upto/gi, 'Mund të jepet deri në')
      .replace(/Prophylaxis/gi, 'Profilaksi')
      .replace(/Pneumonia/gi, 'Pneumoni')
      .replace(/Meningitis/gi, 'Meningjit')
      .replace(/Nebulisation/gi, 'Nebulizim')
      .replace(/\bOral\b/gi, 'Nga goja')
      .replace(/\bi\.?v\.?\b/gi, 'IV')
      .replace(/\bi\.?m\.?\b/gi, 'IM')
      .replace(/infusion/gi, 'infuzion')
      .replace(/single dose/gi, 'dozë e vetme')
      .replace(/next\s+4\s+days/gi, '4 ditët në vijim')
      .replace(/on\s+d1\b/gi, 'ditën 1')
      .replace(/3\s*days\s*\/\s*week/gi, '3 ditë/javë')
      .replace(/2\s*-\s*3\s*hrs?/gi, '2–3 orë');

    text = text
      .replace(/(\d+(?:[.,]\d+)?)\s*m\s*-\s*(\d+(?:[.,]\d+)?)\s*m\b/gi, '$1–$2 muaj')
      .replace(/(\d+(?:[.,]\d+)?)\s*m\s*-\s*(\d+(?:[.,]\d+)?)\s*y(?:r|rs)?\b/gi, '$1 muaj–$2 vjeç')
      .replace(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*y(?:r|rs)?\b/gi, '$1–$2 vjeç')
      .replace(/([<>≥≤])\s*(\d+(?:[.,]\d+)?)\s*y(?:r|rs)?\b/gi, '$1 $2 vjeç')
      .replace(/([<>≥≤])\s*(\d+(?:[.,]\d+)?)\s*m\b/gi, '$1 $2 muaj')
      .replace(/\b(\d+(?:[.,]\d+)?)\s*y(?:r|rs)?\b/gi, '$1 vjeç')
      .replace(/\b(\d+(?:[.,]\d+)?)\s*m\b/gi, '$1 muaj');

    text = text
      .replace(/mg\s*\/\s*kg\s*\/\s*dose/gi, 'mg/kg/dozë')
      .replace(/mg\s*\/\s*kg\s*\/\s*day/gi, 'mg/kg/ditë')
      .replace(/U\s*\/\s*kg\s*\/\s*dose/gi, 'U/kg/dozë')
      .replace(/U\s*\/\s*kg\s*\/\s*day/gi, 'U/kg/ditë')
      .replace(/mg\s*\/\s*kg\s*\/\s*hr/gi, 'mg/kg/orë')
      .replace(/\bq\s*(\d+)\s*-\s*(\d+)\s*h(?:r)?\b/gi, 'çdo $1–$2 orë')
      .replace(/\bq\s*(\d+)\s*h(?:r)?\b/gi, 'çdo $1 orë')
      .replace(/(\d+(?:[.,]\d+)?)\s*mg\s*BD\b/gi, '$1mg 2 herë/ditë')
      .replace(/\bBD\b/g, '2 herë/ditë')
      .replace(/\bOD\b/g, '1 herë/ditë')
      .replace(/\bHS\b/g, 'para gjumit')
      .replace(/\bof\s+TMP\b/gi, 'si TMP')
      .replace(/\bas\s+(?=2 herë\/ditë)/gi, '')
      .replace(/\bMDI\b/g, 'Inhalator MDI')
      .replace(/\bpuffs?\b/gi, 'spërkatje')
      .replace(/\bday\b/gi, 'ditë')
      .replace(/\bhrs?\b/gi, 'orë');

    text = text
      .replace(/(\d)\.(\d)/g, '$1,$2')
      .replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
      .replace(/(\d)(mg|mcg|kg|U)\b/g, '$1 $2');
    return clean(text.replace(/\s+([,.;])/g, '$1'));
  }

  function formulationTextSq(value) {
    let text = clean(value);
    if (!text) return '';
    text = text
      .replace(/\bIron drops\b/gi, 'Pika hekuri')
      .replace(/\bRespiratory solution\b/gi, 'Solucion për nebulizim')
      .replace(/\bDuolin Respules\b/gi, 'Respula Duolin')
      .replace(/\bRespules?\b/gi, 'Respula')
      .replace(/\bInjection\b/gi, 'Injeksion')
      .replace(/\bAmpoule\b/gi, 'Ampulë')
      .replace(/\bSyp\b/gi, 'Shurup')
      .replace(/\bCap\b/gi, 'Kapsulë')
      .replace(/\bTab\b/gi, 'Tabletë')
      .replace(/\bSupp\b/gi, 'Supozitor')
      .replace(/\bSuppositor(?:y|ies)\b/gi, 'Supozitor')
      .replace(/\bDps\b/gi, 'Pika')
      .replace(/\bMDI\b/gi, 'Inhalator MDI')
      .replace(/\bVial\b/gi, 'Flakon (vial)')
      .replace(/\b5\s+lakhs\b/gi, '500 000 U')
      .replace(/\b1\s+million\s+U\b/gi, '1 000 000 U')
      .replace(/\bAmox\b/gi, 'amoksicilinë')
      .replace(/\bClav\b/gi, 'klavulanat')
      .replace(/\bCefo\b/gi, 'cefoperazonë')
      .replace(/\bSulbactam\b/gi, 'sulbaktam')
      .replace(/\bLevosalb\b/gi, 'levosalbutamol')
      .replace(/\bIpravent\b/gi, 'ipratropium')
      .replace(/(\d)\s*ml\b/gi, '$1 mL')
      .replace(/\bml\b/gi, 'mL');
    text = text
      .replace(/(\d)\.(\d)/g, '$1,$2')
      .replace(/(\d)(mg|mcg|kg|g|U)\b/g, '$1 $2');
    return clean(text);
  }

  function formulationRouteKind(line) {
    const kind = kindFromLine(line);
    if (kind) return kind;
    const text = plain(line);
    if (/\b(?:tab|tablet|cap|capsule)\b/.test(text)) return 'oral';
    if (/\b(?:supp|suppository|suppositories)\b/.test(text)) return 'rectal';
    if (/\bmdi\b/.test(text)) return 'inhaled';
    return '';
  }

  function wantedRoute(option) {
    const explicit = clean(option?.route);
    if (explicit) return explicit;
    const raw = plain([option?.label, option?.displayLabel].filter(Boolean).join(' '));
    if (/nebul|respir/.test(raw)) return 'nebulized';
    if (/(?:\bi\.?v\.?\b|\bi\.?m\.?\b|infusion)/.test(raw)) return 'injectable';
    if (/\boral\b/.test(raw)) return 'oral';
    if (/\bmdi\b/.test(raw)) return 'inhaled';
    return '';
  }

  function routeAssessment(drug, option, targetKind) {
    const wanted = wantedRoute(option);
    if (wanted) {
      const same = wanted === targetKind
        || (wanted === 'inhaled' && targetKind === 'nebulized')
        || (wanted === 'oral_or_injectable' && ['oral','injectable'].includes(targetKind));
      return same
        ? { applicable:true, reason:'' }
        : { applicable:false, reason:'Ky formulim nuk përputhet me rrugën e zgjedhur të administrimit.' };
    }

    const kinds = new Set((drug?.formulations || []).map(formulationRouteKind).filter(Boolean));
    if (targetKind === 'injectable' && kinds.has('oral')) {
      return {
        applicable:false,
        reason:'Formula e dozimit nuk e specifikon rrugën IV/IM; prandaj forma injektabile nuk përdoret automatikisht.',
      };
    }
    if (targetKind === 'nebulized' && (kinds.has('oral') || kinds.has('inhaled'))) {
      return {
        applicable:false,
        reason:'Formula e dozimit nuk e specifikon nebulizimin; prandaj kjo formë nuk përdoret automatikisht.',
      };
    }
    return { applicable:true, reason:'' };
  }

  function dryVialsFromLine(drugName, line) {
    if (kindFromLine(line) !== 'injectable' || parseGenericLine(line).length) return [];
    const name = plain(drugName);
    const source = clean(line);

    if (name === 'amoxicillin + clavulanic' && /1000\s*amox\s*\+\s*200\s*clav/i.test(source)) {
      return [{ kind:'injectable', form:'Flakon (vial)', amount:1000, unit:'mg', componentBasis:'amoxicillin', source, reconstitutionRequired:true }];
    }
    if (name === 'cefoperazone' && /1000\s*cefo\s*\+\s*500\s*sulbactam/i.test(source)) {
      return [{ kind:'injectable', form:'Flakon (vial)', amount:1000, unit:'mg', componentBasis:'cefoperazone', source, reconstitutionRequired:true }];
    }
    if (name === 'piperacillin + tazobactam') {
      const explicit = source.match(/(\d+(?:[.,]\d+)?)\s*g\s*piperacillin\s*\+\s*(\d+(?:[.,]\d+)?)\s*g\s*tazobactam/i);
      if (explicit) {
        return [{
          kind:'injectable',
          form:'Flakon (vial)',
          amount:number(explicit[1]) * 1000,
          unit:'mg',
          componentBasis:'piperacillin',
          source,
          reconstitutionRequired:true,
        }];
      }
      return [{
        kind:'injectable', form:'Flakon (vial)', amount:NaN, unit:'mg', componentBasis:'', source,
        reconstitutionRequired:true,
        reason:'Burimi jep vetëm 4,5 g total pa ndarjen piperacilinë/tazobaktam; ekuivalenti i sigurt i flakonit nuk automatizohet.',
      }];
    }
    if (name === 'penicillin g') {
      if (/5\s*lakhs?/i.test(source)) {
        return [{ kind:'injectable', form:'Flakon (vial)', amount:500000, unit:'U', componentBasis:'', source, reconstitutionRequired:true }];
      }
      const million = source.match(/(\d+(?:[.,]\d+)?)\s*million\s*(?:i?u)\b/i);
      if (million) {
        return [{ kind:'injectable', form:'Flakon (vial)', amount:number(million[1]) * 1000000, unit:'U', componentBasis:'', source, reconstitutionRequired:true }];
      }
      const explicitUnits = source.match(/([\d\s,.]+)\s*(?:iu|u)\b/i);
      if (explicitUnits) {
        const amount = Number(String(explicitUnits[1]).replace(/[\s,.]/g, ''));
        if (positive(amount)) {
          return [{ kind:'injectable', form:'Flakon (vial)', amount, unit:'U', componentBasis:'', source, reconstitutionRequired:true }];
        }
      }
    }
    if (name === 'colistin') {
      const million = source.match(/(\d+(?:[.,]\d+)?)\s*million\s*(?:i?u)\b/i);
      if (million) {
        return [{ kind:'injectable', form:'Flakon (vial)', amount:number(million[1]) * 1000000, unit:'U', componentBasis:'', source, reconstitutionRequired:true }];
      }
      const explicitUnits = source.match(/([\d\s,.]+)\s*(?:iu|u)\b/i);
      if (explicitUnits) {
        const amount = Number(String(explicitUnits[1]).replace(/[\s,.]/g, ''));
        if (positive(amount)) {
          return [{ kind:'injectable', form:'Flakon (vial)', amount, unit:'U', componentBasis:'', source, reconstitutionRequired:true }];
        }
      }
    }

    const items = [];
    const expression = /(\d+(?:[.,]\d+)?)\s*(mg|g)\b/gi;
    for (const match of source.matchAll(expression)) {
      const amount = number(match[1]);
      const unit = String(match[2]).toLowerCase();
      if (!positive(amount)) continue;
      items.push({
        kind:'injectable',
        form:'Flakon (vial)',
        amount:amount * MASS_TO_MG[unit],
        unit:'mg',
        componentBasis:'',
        source,
        reconstitutionRequired:true,
      });
    }
    return items;
  }

  function dryVialsFor(drug, option) {
    const source = Array.isArray(drug?.formulations) ? drug.formulations : [];
    const seen = new Set();
    return source.flatMap(line => dryVialsFromLine(drug?.name, line)).map(item => {
      const route = routeAssessment(drug, option, item.kind);
      return { ...item, applicable:route.applicable, routeReason:route.reason };
    }).filter(item => {
      const key = [item.source, item.amount, item.unit, item.componentBasis].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function amountForUnit(result, unit) {
    const resultUnit = clean(result?.doseUnit);
    const target = clean(unit);
    const compatible = target === 'U'
      ? /^U(?:\b|\s)/i.test(resultUnit)
      : target === 'mg'
        ? /^mg(?:\b|\s)/i.test(resultUnit)
        : false;
    if (!compatible) return null;

    if (positive(result?.perDoseMin) && positive(result?.perDoseMax)) {
      return { min:result.perDoseMin, max:result.perDoseMax, basis:'dose', label:'për dozë' };
    }
    if (positive(result?.doseMin) && positive(result?.doseMax)) {
      if (result?.dosePeriod === 'day') return { min:result.doseMin, max:result.doseMax, basis:'day', label:'në 24 orë' };
      if (result?.dosePeriod === 'hour') return { min:result.doseMin, max:result.doseMax, basis:'hour', label:'në orë' };
      return { min:result.doseMin, max:result.doseMax, basis:'dose', label:'për dozë' };
    }
    return null;
  }

  function vialConversions(result, drug, option) {
    return dryVialsFor(drug, option).map(item => {
      const amount = amountForUnit(result, item.unit);
      if (!item.applicable) {
        return { ...item, convertible:false, reason:item.routeReason || item.reason || 'Ky flakon nuk i përket rrugës së zgjedhur.' };
      }
      if (!amount || !positive(item.amount)) {
        return { ...item, convertible:false, reason:item.reason || 'Forca e flakonit nuk mjafton për një llogaritje automatike të sigurt.' };
      }
      return {
        ...item,
        convertible:true,
        vialMin:amount.min / item.amount,
        vialMax:amount.max / item.amount,
        basis:amount.basis,
        basisLabel:amount.label,
        frequency:clean(result?.frequency),
      };
    });
  }

  function optionAudit(drug, option) {
    const wanted = wantedRoute(option);
    if (!wanted) return { ok:true, wanted:'', message:'' };
    const kinds = new Set((drug?.formulations || []).map(formulationRouteKind).filter(Boolean));
    const matched = wanted === 'inhaled'
      ? kinds.has('inhaled')
      : wanted === 'oral_or_injectable'
        ? (kinds.has('oral') || kinds.has('injectable'))
        : kinds.has(wanted);
    if (matched) return { ok:true, wanted, message:'' };
    const routeLabel = wanted === 'injectable'
      ? 'IV/IM'
      : wanted === 'nebulized'
        ? 'nebulizim'
        : wanted === 'inhaled'
          ? 'MDI'
          : wanted === 'rectal'
            ? 'rektale'
            : 'nga goja';
    return {
      ok:false,
      wanted,
      message:`Tabela jep dozë për rrugën ${routeLabel}, por nuk jep një formulim të përputhshëm për atë rrugë. Mos bëj konvertim automatik pa produkt/burim shtesë.`,
    };
  }

  function formulationAudit(drug, option) {
    const source = Array.isArray(drug?.formulations) ? drug.formulations : [];
    const special = specialPresentations(drug?.name, source);
    return source.map(line => {
      const routeKind = formulationRouteKind(line);
      const specialItems = special.filter(item => clean(item.source) === clean(line));
      const genericItems = parseGenericLine(line);
      const measurable = specialItems.length ? specialItems : genericItems;
      if (measurable.length) {
        const route = routeAssessment(drug, option, measurable[0].kind);
        return {
          source:line,
          display:formulationTextSq(line),
          status:route.applicable ? 'auto-ml' : 'route-mismatch',
          reason:route.reason,
        };
      }

      const dry = dryVialsFromLine(drug?.name, line);
      if (dry.length) {
        const route = routeAssessment(drug, option, 'injectable');
        const hasStrength = dry.some(item => positive(item.amount));
        return {
          source:line,
          display:formulationTextSq(line),
          status:route.applicable ? (hasStrength ? 'vial-equivalent' : 'needs-product') : 'route-mismatch',
          reason:route.reason || dry.find(item => item.reason)?.reason || '',
        };
      }

      const text = plain(line);
      if (/\b(?:tab|tablet|cap|capsule|supp|suppository|suppositories)\b/.test(text)) {
        const solidKind = /\b(?:supp|suppository|suppositories)\b/.test(text) ? 'rectal' : 'oral';
        const route = routeAssessment(drug, option, solidKind);
        return {
          source:line,
          display:formulationTextSq(line),
          status:route.applicable ? 'solid' : 'route-mismatch',
          reason:route.reason || (solidKind === 'rectal'
            ? 'Formë rektale solide: doza llogaritet në mg; ndarja e supozitorit nuk automatizohet.'
            : 'Formë solide: doza llogaritet në mg; ndarja e tabletës/kapsulës nuk automatizohet pa verifikuar produktin.'),
        };
      }
      if (/\bmdi\b/.test(text)) {
        const route = routeAssessment(drug, option, 'inhaled');
        return {
          source:line,
          display:formulationTextSq(line),
          status:route.applicable ? 'device' : 'route-mismatch',
          reason:route.reason || 'Përdor numrin e spërkatjeve vetëm kur formula është specifike për MDI.',
        };
      }
      if (/\+/.test(line)) {
        return {
          source:line,
          display:formulationTextSq(line),
          status:'manual-combination',
          reason:'Formulim me më shumë se një substancë aktive; konvertimi automatik kërkon bazën e saktë të komponentit.',
        };
      }
      return {
        source:line,
        display:formulationTextSq(line),
        status:'unknown',
        reason:'Formulimi nuk u klasifikua automatikisht.',
      };
    });
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
    dryVialsFor,
    vialConversions,
    formulationAudit,
    optionAudit,
    sectionTitleSq,
    doseTextSq,
    formulationTextSq,
    componentSq,
    _test:Object.freeze({
      kindFromLine,
      parseGenericLine,
      specialPresentations,
      routeFilter,
      amountFromResult,
      wantedRoute,
      routeAssessment,
      dryVialsFromLine,
      amountForUnit,
      formulationRouteKind,
    }),
  });
});
