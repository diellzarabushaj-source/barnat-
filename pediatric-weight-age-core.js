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

  const DEFAULT_MAP = Object.freeze({"metadata":{"title":"Pediatric weight → default age map","source":"User-supplied age/weight reference ranges, 2026-09-28","purpose":"Auto-fill a default age suggestion after weight entry; chronological age always overrides.","version":"2026-09-28.v1","unitWeight":"kg","unitAge":"months"},"bands":[{"key":"newborn","labelSq":"I porsalindur","weightMinKg":3.2,"weightMaxKg":3.5,"ageMinMonths":0,"ageMaxMonths":0,"representativeMonths":0},{"key":"6m","labelSq":"rreth 6 muaj","weightMinKg":7,"weightMaxKg":7.5,"ageMinMonths":6,"ageMaxMonths":6,"representativeMonths":6},{"key":"1y","labelSq":"rreth 1 vjeç","weightMinKg":9,"weightMaxKg":10.5,"ageMinMonths":12,"ageMaxMonths":12,"representativeMonths":12},{"key":"2y","labelSq":"rreth 2 vjeç","weightMinKg":12,"weightMaxKg":13,"ageMinMonths":24,"ageMaxMonths":24,"representativeMonths":24},{"key":"3y","labelSq":"rreth 3 vjeç","weightMinKg":14,"weightMaxKg":15,"ageMinMonths":36,"ageMaxMonths":36,"representativeMonths":36},{"key":"4_5y","labelSq":"rreth 4–5 vjeç","weightMinKg":16,"weightMaxKg":20,"ageMinMonths":48,"ageMaxMonths":60,"representativeMonths":54},{"key":"6_7y","labelSq":"rreth 6–7 vjeç","weightMinKg":20,"weightMaxKg":23,"ageMinMonths":72,"ageMaxMonths":84,"representativeMonths":78},{"key":"8_9y","labelSq":"rreth 8–9 vjeç","weightMinKg":25,"weightMaxKg":28,"ageMinMonths":96,"ageMaxMonths":108,"representativeMonths":102},{"key":"10y","labelSq":"rreth 10 vjeç","weightMinKg":31,"weightMaxKg":36,"ageMinMonths":120,"ageMaxMonths":120,"representativeMonths":120},{"key":"12y","labelSq":"rreth 12 vjeç","weightMinKg":40,"weightMaxKg":45,"ageMinMonths":144,"ageMaxMonths":144,"representativeMonths":144},{"key":"13y","labelSq":"rreth 13 vjeç","weightMinKg":45,"weightMaxKg":50,"ageMinMonths":156,"ageMaxMonths":156,"representativeMonths":156},{"key":"14y","labelSq":"rreth 14 vjeç","weightMinKg":50,"weightMaxKg":55,"ageMinMonths":168,"ageMaxMonths":168,"representativeMonths":168},{"key":"15y","labelSq":"rreth 15 vjeç","weightMinKg":55,"weightMaxKg":58,"ageMinMonths":180,"ageMaxMonths":180,"representativeMonths":180},{"key":"16plus","labelSq":"rreth 16+ vjeç","weightMinKg":60,"weightMaxKg":null,"ageMinMonths":192,"ageMaxMonths":null,"representativeMonths":192}],"interpolationAnchors":[{"months":0,"kg":3.35},{"months":6,"kg":7.25},{"months":12,"kg":9.75},{"months":24,"kg":12.5},{"months":36,"kg":14.5},{"months":54,"kg":18},{"months":78,"kg":21.5},{"months":102,"kg":26.5},{"months":120,"kg":33.5},{"months":144,"kg":42.5},{"months":156,"kg":47.5},{"months":168,"kg":52.5},{"months":180,"kg":56.5},{"months":192,"kg":60}]});

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

  function defaultAgeLabel(months) {
    return Number.isFinite(months) ? `≈${monthsLabel(months)}` : '';
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
        defaultLabel:defaultAgeLabel(defaultMonths),
        label:exact.length === 1 ? exact[0].labelSq : rangeLabel(minMonths, maxMonths),
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
        defaultLabel:'',
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
        defaultLabel:defaultAgeLabel(Number(last.representativeMonths)),
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
        defaultLabel:defaultAgeLabel(Number(nearest.months)),
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
      defaultLabel:defaultAgeLabel(defaultMonths),
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
    DEFAULT_MAP,
    infer,
    rangeLabel,
    monthsLabel,
    defaultAgeLabel,
    ageRangeFitsBand,
    _test:Object.freeze({ inWeightBand, interpolate }),
  });
});
