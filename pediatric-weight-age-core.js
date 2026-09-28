(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DRxPediatricWeightAge = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const num = value => {
    const parsed = Number(String(value ?? '').replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const positive = value => Number.isFinite(value) && value > 0;

  function inWeightBand(weight, band) {
    if (!positive(weight) || !band) return false;
    const min = Number(band.weightMinKg);
    const max = band.weightMaxKg == null ? null : Number(band.weightMaxKg);
    if (Number.isFinite(min) && weight < min) return false;
    if (Number.isFinite(max) && weight > max) return false;
    return true;
  }

  function monthsLabel(months) {
    if (!Number.isFinite(months)) return '';
    const rounded = Math.round(months);
    if (rounded < 12) return `${rounded} muaj`;
    const years = Math.floor(rounded / 12);
    const rest = rounded % 12;
    if (!rest) return `${years} ${years === 1 ? 'vjeç' : 'vjeç'}`;
    return `${years} vjeç ${rest} muaj`;
  }

  function rangeLabel(minMonths, maxMonths) {
    if (!Number.isFinite(minMonths)) return '';
    if (maxMonths == null) {
      const years = Math.round(minMonths / 12);
      return `≈${years}+ vjeç`;
    }
    if (Math.abs(maxMonths - minMonths) < 0.001) return `≈${monthsLabel(minMonths)}`;
    if (minMonths >= 12 && maxMonths >= 12 && minMonths % 12 === 0 && maxMonths % 12 === 0) {
      return `≈${Math.round(minMonths / 12)}–${Math.round(maxMonths / 12)} vjeç`;
    }
    return `≈${monthsLabel(minMonths)} – ${monthsLabel(maxMonths)}`;
  }

  function interpolate(weight, a, b) {
    if (!a || !b || !positive(a.kg) || !positive(b.kg) || b.kg <= a.kg) return NaN;
    const ratio = (weight - a.kg) / (b.kg - a.kg);
    return a.months + ratio * (b.months - a.months);
  }

  function infer(weightValue, payload) {
    const weight = num(weightValue);
    const bands = Array.isArray(payload?.bands) ? payload.bands : [];
    const anchors = Array.isArray(payload?.interpolationAnchors) ? payload.interpolationAnchors : [];
    if (!positive(weight) || !bands.length || !anchors.length) return null;

    const exact = bands.filter(band => inWeightBand(weight, band));
    if (exact.length) {
      const mins = exact.map(band => Number(band.ageMinMonths)).filter(Number.isFinite);
      const maxes = exact.map(band => band.ageMaxMonths == null ? null : Number(band.ageMaxMonths));
      const reps = exact.map(band => Number(band.representativeMonths)).filter(Number.isFinite);
      const minMonths = Math.min(...mins);
      const maxMonths = maxes.some(value => value == null) ? null : Math.max(...maxes.filter(Number.isFinite));
      const defaultMonths = reps.length ? reps.reduce((a,b)=>a+b,0) / reps.length : minMonths;
      return {
        weightKg:weight,
        minMonths,
        maxMonths,
        defaultMonths,
        label:rangeLabel(minMonths, maxMonths),
        kind:exact.length > 1 ? 'overlap' : 'band',
        bandKeys:exact.map(band => band.key),
        sourceLabels:exact.map(band => band.labelSq),
        ambiguous:exact.length > 1 || maxMonths == null || (Number.isFinite(maxMonths) && Math.abs(maxMonths - minMonths) > 0.001),
      };
    }

    const orderedBands = [...bands].filter(band => Number.isFinite(Number(band.weightMinKg))).sort((a,b)=>Number(a.weightMinKg)-Number(b.weightMinKg));
    const firstMin = Number(orderedBands[0]?.weightMinKg);
    if (Number.isFinite(firstMin) && weight < firstMin) {
      return {
        weightKg:weight,
        minMonths:null,
        maxMonths:null,
        defaultMonths:null,
        label:'Nën intervalin e tabelës',
        kind:'below-range',
        bandKeys:[],
        sourceLabels:[],
        ambiguous:true,
      };
    }

    const last = orderedBands[orderedBands.length - 1];
    if (last && last.weightMaxKg == null && weight >= Number(last.weightMinKg)) {
      return {
        weightKg:weight,
        minMonths:Number(last.ageMinMonths),
        maxMonths:null,
        defaultMonths:Number(last.representativeMonths),
        label:rangeLabel(Number(last.ageMinMonths), null),
        kind:'open-ended',
        bandKeys:[last.key],
        sourceLabels:[last.labelSq],
        ambiguous:true,
      };
    }

    let lowerBand = null;
    let upperBand = null;
    for (const band of orderedBands) {
      const max = band.weightMaxKg == null ? Infinity : Number(band.weightMaxKg);
      const min = Number(band.weightMinKg);
      if (max < weight) lowerBand = band;
      if (min > weight) { upperBand = band; break; }
    }

    let left = null;
    let right = null;
    for (let i=0;i<anchors.length-1;i++) {
      if (weight >= Number(anchors[i].kg) && weight <= Number(anchors[i+1].kg)) {
        left = anchors[i];
        right = anchors[i+1];
        break;
      }
    }
    if (!left || !right) {
      const nearest = [...anchors].sort((a,b)=>Math.abs(Number(a.kg)-weight)-Math.abs(Number(b.kg)-weight))[0];
      if (!nearest) return null;
      return {
        weightKg:weight,
        minMonths:Number(nearest.months),
        maxMonths:Number(nearest.months),
        defaultMonths:Number(nearest.months),
        label:rangeLabel(Number(nearest.months), Number(nearest.months)),
        kind:'nearest',
        bandKeys:[],
        sourceLabels:[],
        ambiguous:true,
      };
    }

    const defaultMonths = interpolate(weight, {kg:Number(left.kg),months:Number(left.months)}, {kg:Number(right.kg),months:Number(right.months)});
    const minMonths = lowerBand
      ? Number(lowerBand.ageMaxMonths == null ? lowerBand.ageMinMonths : lowerBand.ageMaxMonths)
      : Number(left.months);
    const maxMonths = upperBand
      ? Number(upperBand.ageMinMonths)
      : Number(right.months);

    return {
      weightKg:weight,
      minMonths:Number.isFinite(minMonths) ? minMonths : defaultMonths,
      maxMonths:Number.isFinite(maxMonths) ? maxMonths : defaultMonths,
      defaultMonths,
      label:rangeLabel(Number.isFinite(minMonths) ? minMonths : defaultMonths, Number.isFinite(maxMonths) ? maxMonths : defaultMonths),
      kind:'interpolated-gap',
      bandKeys:[lowerBand?.key, upperBand?.key].filter(Boolean),
      sourceLabels:[lowerBand?.labelSq, upperBand?.labelSq].filter(Boolean),
      ambiguous:true,
    };
  }

  function ageRangeFitsBand(ageInfo, band, minKey='minMonths', maxKey='maxMonths') {
    if (!ageInfo || !band || !Number.isFinite(ageInfo.minMonths)) return false;
    const min = band[minKey];
    const max = band[maxKey];
    const lowerOk = !Number.isFinite(min) || (band.minInclusive === false ? ageInfo.minMonths > min : ageInfo.minMonths >= min);
    if (!lowerOk) return false;

    if (ageInfo.maxMonths == null) return !Number.isFinite(max);
    const upperOk = !Number.isFinite(max) || (band.maxInclusive === false ? ageInfo.maxMonths < max : ageInfo.maxMonths <= max);
    return upperOk;
  }

  return Object.freeze({
    infer,
    rangeLabel,
    monthsLabel,
    ageRangeFitsBand,
    _test:Object.freeze({ inWeightBand, interpolate }),
  });
});
