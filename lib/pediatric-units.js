'use strict';

/*
 * Dimensional safety for the pediatric calculator.
 *
 * The clinician never types a formula or a conversion. The only numeric inputs
 * that may come from the browser are patient measurements. Dose units,
 * concentrations and caps come from the verified database row and are resolved
 * here on the server.
 *
 * Rules:
 * - convert only inside the same physical dimension;
 * - mass uses mg as the internal base (mcg <-> mg <-> g);
 * - volume uses mL as the internal base;
 * - IU, mmol and mEq are separate dimensions and are never guessed into mass;
 * - tablet/capsule/pastille/sachet aliases are count units compatible with
 *   the generic dose unit `unit`;
 * - a dose already expressed in mL is already a measure and must never be
 *   divided by a mg/mL concentration again;
 * - a configured cap that cannot be resolved is a blocking error, because
 *   silently ignoring a safety ceiling is worse than returning no calculation.
 */

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = value => clean(value).toLowerCase().replace(/μ/g, 'u');

const COUNT_ALIASES = new Set([
  'unit', 'units', 'njësi', 'njesi',
  'tabletë', 'tablete', 'tableta', 'tablet', 'tablets',
  'kapsulë', 'kapsule', 'kapsula', 'capsule', 'capsules',
  'pastilë', 'pastile', 'pastila', 'lozenge', 'lozenges',
  'qese', 'sachet', 'sachets',
  'supozitor', 'supozitore', 'suppository', 'suppositories',
]);

const VOLUME_ALIASES = new Map([
  ['ml', 1], ['milil', 1], ['mililitër', 1], ['mililiter', 1],
  ['l', 1000], ['litër', 1000], ['liter', 1000],
]);

const MASS_ALIASES = new Map([
  ['mcg', 0.001], ['ug', 0.001], ['microgram', 0.001], ['mikrogram', 0.001],
  ['mg', 1], ['milligram', 1], ['miligram', 1],
  ['g', 1000], ['gram', 1000],
]);

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/*
 * `mg sodium alginate` is still a mass unit. We accept a recognized scalar unit
 * as the first token when the remaining text is a substance descriptor, but we
 * do not strip slash expressions here; slash expressions belong to caps and are
 * parsed explicitly by parseCapUnit(). Count units are deliberately exact-only:
 * `njësi e panjohur` must never become a valid generic `unit` merely because its
 * first word happens to be `njësi`.
 */
function unitDescriptor(rawUnit) {
  const normalized = key(rawUnit);
  if (!normalized || normalized.includes('/')) return null;

  const first = normalized.split(' ')[0];
  if (MASS_ALIASES.has(first)) {
    return { dimension:'mass', factor:MASS_ALIASES.get(first), canonical:'mg', raw:clean(rawUnit) };
  }
  if (VOLUME_ALIASES.has(first)) {
    return { dimension:'volume', factor:VOLUME_ALIASES.get(first), canonical:'mL', raw:clean(rawUnit) };
  }
  if (COUNT_ALIASES.has(normalized)) {
    return { dimension:'count', factor:1, canonical:'unit', raw:clean(rawUnit) };
  }
  if (normalized === 'iu' || normalized === 'ui') {
    return { dimension:'iu', factor:1, canonical:'IU', raw:clean(rawUnit) };
  }
  if (normalized === 'mmol') {
    return { dimension:'mmol', factor:1, canonical:'mmol', raw:clean(rawUnit) };
  }
  if (normalized === 'meq') {
    return { dimension:'meq', factor:1, canonical:'mEq', raw:clean(rawUnit) };
  }
  return null;
}

function convertValue(value, fromUnit, toUnit) {
  const amount = numeric(value);
  if (amount === null) return null;
  const from = unitDescriptor(fromUnit);
  const to = unitDescriptor(toUnit);
  if (!from || !to || from.dimension !== to.dimension) return null;
  return amount * from.factor / to.factor;
}

function measureKind(rawUnit) {
  const descriptor = unitDescriptor(rawUnit);
  if (!descriptor) return null;
  if (descriptor.dimension === 'volume') return 'volume';
  if (descriptor.dimension === 'count') return 'solid';
  return null;
}

function concentrationOf(row = {}) {
  const value = positive(row.pediatric_concentration_value);
  const per = positive(row.pediatric_concentration_per_value);
  const doseUnit = clean(row.pediatric_concentration_unit);
  const measureUnit = clean(row.pediatric_concentration_per_unit);
  if (value === null || per === null || !doseUnit || !measureUnit) return null;

  const doseDescriptor = unitDescriptor(doseUnit);
  const kind = measureKind(measureUnit);
  if (!doseDescriptor || !kind) return null;

  return {
    perMeasureValue:value / per,
    doseUnit,
    measureUnit,
    kind,
  };
}

/*
 * Returns a server-derived administration measure. The direct-volume branch is
 * intentionally first: 20 mL/kg is already a volume dose and must never pass
 * through a mass concentration such as 9 mg/mL.
 */
function measureFromDose(perDoseValue, doseUnit, concentration) {
  const amount = positive(perDoseValue);
  if (amount === null) return { measure:null, issue:null, mode:'none' };

  const doseDescriptor = unitDescriptor(doseUnit);
  if (!doseDescriptor) {
    return { measure:null, issue:`Njësia e dozës "${clean(doseUnit)}" nuk njihet për konvertim.`, mode:'unavailable' };
  }

  if (doseDescriptor.dimension === 'volume') {
    const mL = convertValue(amount, doseUnit, 'mL');
    return {
      measure:{ amount:mL, unit:'mL', kind:'volume' },
      issue:null,
      mode:'direct-volume',
    };
  }

  if (!concentration) return { measure:null, issue:null, mode:'none' };

  const inConcentrationUnit = convertValue(amount, doseUnit, concentration.doseUnit);
  if (inConcentrationUnit === null) {
    return {
      measure:null,
      issue:`Doza (${clean(doseUnit)}) nuk është dimensionisht kompatibile me përqendrimin (${clean(concentration.doseUnit)}).`,
      mode:'unavailable',
    };
  }

  const measured = inConcentrationUnit / concentration.perMeasureValue;
  if (!Number.isFinite(measured) || measured <= 0) {
    return { measure:null, issue:'Përqendrimi nuk prodhoi një masë administrimi të vlefshme.', mode:'unavailable' };
  }
  return {
    measure:{ amount:measured, unit:concentration.measureUnit, kind:concentration.kind },
    issue:null,
    mode:'converted',
  };
}

function normalizeCapText(rawUnit) {
  return key(rawUnit)
    .replace(/\s+/g, '')
    .replace(/doze/g, 'dozë')
    .replace(/dite/g, 'ditë')
    .replace(/day/g, 'ditë')
    .replace(/dose/g, 'dozë');
}

/*
 * A cap may be absolute (`4 g`), per patient weight (`0.5 mg/kg/ditë`) or may
 * carry an explicit period (`mg/ditë`, `mg/dozë`). The result keeps the scalar
 * unit separate from the period so it can be converted to the row's dose unit.
 */
function parseCapUnit(rawUnit) {
  const raw = clean(rawUnit);
  let normalized = normalizeCapText(raw);
  if (!normalized) return null;

  let perKg = false;
  let period = null;

  for (const suffix of ['/kg/ditë', '/kg/24h', '/kg/dozë']) {
    if (normalized.endsWith(suffix)) {
      perKg = true;
      period = suffix.includes('dozë') ? 'single' : 'daily';
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }

  if (!perKg) {
    for (const suffix of ['/ditë', '/24h', '/dozë']) {
      if (normalized.endsWith(suffix)) {
        period = suffix.includes('dozë') ? 'single' : 'daily';
        normalized = normalized.slice(0, -suffix.length);
        break;
      }
    }
  }

  const scalar = unitDescriptor(normalized);
  if (!scalar) return null;
  return { raw, scalarUnit:normalized, scalar, perKg, period };
}

function resolveCap(value, rawUnit, targetDoseUnit, weightKg, expectedPeriod) {
  const amount = positive(value);
  if (amount === null) return { value:null, error:null, sourceUnit:clean(rawUnit) || null };

  const parsed = parseCapUnit(rawUnit);
  if (!parsed) {
    return {
      value:null,
      error:`Kufiri ${amount} ${clean(rawUnit) || '(pa njësi)'} nuk mund të normalizohet automatikisht.`,
      sourceUnit:clean(rawUnit) || null,
    };
  }

  if (parsed.period && parsed.period !== expectedPeriod) {
    return {
      value:null,
      error:`Kufiri "${parsed.raw}" ka periudhë tjetër nga ${expectedPeriod === 'daily' ? '24 orë' : 'doza e vetme'}.`,
      sourceUnit:parsed.raw,
    };
  }

  let absolute = amount;
  if (parsed.perKg) {
    const weight = positive(weightKg);
    if (weight === null) {
      return {
        value:null,
        error:`Kufiri "${parsed.raw}" kërkon peshën e pacientit.`,
        sourceUnit:parsed.raw,
      };
    }
    absolute *= weight;
  }

  const converted = convertValue(absolute, parsed.scalarUnit, targetDoseUnit);
  if (converted === null) {
    return {
      value:null,
      error:`Kufiri "${parsed.raw}" nuk është kompatibil me njësinë e dozës "${clean(targetDoseUnit)}".`,
      sourceUnit:parsed.raw,
    };
  }

  return { value:converted, error:null, sourceUnit:parsed.raw };
}

function resolveCaps(row = {}, doseUnit, patient = {}) {
  const maxSingle = resolveCap(
    row.pediatric_max_single_value,
    row.pediatric_max_single_unit,
    doseUnit,
    patient.weightKg,
    'single',
  );
  const maxDaily = resolveCap(
    row.pediatric_max_daily_value,
    row.pediatric_max_daily_unit,
    doseUnit,
    patient.weightKg,
    'daily',
  );
  return {
    maxSingle:maxSingle.value,
    maxDaily:maxDaily.value,
    source:{ maxSingle:maxSingle.sourceUnit, maxDaily:maxDaily.sourceUnit },
    errors:[maxSingle.error, maxDaily.error].filter(Boolean),
  };
}

module.exports = {
  unitDescriptor,
  convertValue,
  concentrationOf,
  measureFromDose,
  parseCapUnit,
  resolveCap,
  resolveCaps,
  _test:{ numeric, positive, measureKind, normalizeCapText },
};
