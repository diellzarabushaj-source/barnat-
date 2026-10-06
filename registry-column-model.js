(function(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.DrxRegistryColumns = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const fields = Object.freeze({ registry:'registryNumber', name:'tradeName', substance:'activeSubstance', strength:'strength', form:'form', prescription:'prescriptionNotation', drugClass:'drugClass', use:'use', population:'approvedPopulation', atc:'atc', adultDose:'adultDose', pediatricDose:'pediatricDose', updateStatus:'updateStatus', status:'productStatus', price:'retailPrice' });
  const sortKey = id => id === 'drugClass' ? 'class' : id;
  const numeric = id => id === 'registry' || id === 'price';
  const operators = Object.freeze(['contains','notContains','equals','notEquals','startsWith','endsWith','empty','notEmpty','gt','gte','lt','lte','between']);
  function populationLabel(value) {
    const raw = clean(value), key = raw.toLowerCase().replace(/[_-]+/g, ' ');
    if (['pediatric only','paediatric only'].includes(key)) return 'Vetëm pediatrik';
    if (key === 'adult only') return 'Vetëm të rritur';
    if (['pediatric and adult both','paediatric and adult both','adult and pediatric','adult and paediatric'].includes(key)) return 'Të rritur + pediatrik';
    return raw;
  }
  function prescriptionNotation(row) {
    if (clean(row.prescriptionNotation)) return clean(row.prescriptionNotation);
    const form = fold(row.form);
    const prefixes = [[/vaginal tablet|pessary|ovul/,'Ov.'],[/lozenge|pastill/,'Past.'],[/^(?!.*inject).*(?:infus|infuz)/,'Inf.'],[/inject|ampou?le|ampul/,'Amp.'],[/tablet|tablete|tableta/,'Tab.'],[/capsule|kapsul/,'Caps.'],[/suppository|supoz/,'Sup.'],[/ointment|unguent/,'Ung.'],[/cream|krem/,'Cr.'],[/gel|xhel|zhel/,'Gel.'],[/syrup|sirup/,'Sir.'],[/drops|pika/,'Gtt.'],[/spray|sprej|spraj/,'Spr.'],[/inhalation|inhalacion/,'Inh.'],[/suspension/,'Susp.'],[/solution|solucion/,'Sol.'],[/powder|pluhur/,'Pulv.'],[/granule|granula/,'Gran.'],[/implant/,'Impl.'],[/shampoo|shampo/,'Shamp.']];
    const prefix = prefixes.find(([pattern]) => pattern.test(form))?.[1] || '';
    const identity = [clean(row.activeSubstance), clean(row.strength)].filter(Boolean).join(' ');
    const line = [prefix, identity].filter(Boolean).join(' ');
    return line ? 'Rp.: ' + line : '';
  }
  function value(row, id) {
    if (id === 'population') return populationLabel(row.approvedPopulation);
    if (id === 'prescription') return prescriptionNotation(row);
    const raw = row[fields[id]];
    if (numeric(id)) return raw === null || raw === undefined || raw === '' ? '' : String(Number(raw));
    return clean(raw);
  }
  function label(id, val) {
    if (val === '') return id === 'adultDose' || id === 'pediatricDose' ? 'Pa dozë të publikuar' : '(Bosh)';
    if (id === 'price') return new Intl.NumberFormat('sq-XK', {style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(val));
    return val;
  }
  function parseFilters(input) {
    if (!input) return {};
    if (typeof input === 'string') {
      if (input.length > 6000) throw new Error('Filtrat janë shumë të gjatë. Përdor një kusht teksti ose më pak vlera.');
      try { input = JSON.parse(input); } catch { throw new Error('Filtrat e kolonave janë të pavlefshëm.'); }
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Filtrat e kolonave janë të pavlefshëm.');
    const result = {};
    for (const [id, filter] of Object.entries(input)) {
      if (!Object.hasOwn(fields, id) || !filter || typeof filter !== 'object' || Array.isArray(filter)) throw new Error('Kolonë filtri e pavlefshme.');
      const next = {};
      if (filter.values !== undefined) {
        if (!Array.isArray(filter.values) || filter.values.length > 100 || !['include','exclude'].includes(filter.mode)) throw new Error('Zgjidh më pak vlera ose përdor një kusht teksti.');
        if (filter.values.some(item => typeof item !== 'string' || item.length > 12000)) throw new Error('Vlerë filtri e pavlefshme.');
        next.mode = filter.mode;
        next.values = [...new Set(filter.values.map(clean))];
      }
      if (filter.op) {
        if (!operators.includes(filter.op) || (!numeric(id) && ['gt','gte','lt','lte','between'].includes(filter.op))) throw new Error('Kusht filtri i pavlefshëm.');
        next.op = filter.op;
        if (!['empty','notEmpty'].includes(next.op)) {
          next.text = clean(filter.text);
          if (!next.text || next.text.length > 500) throw new Error('Plotëso vlerën e kushtit (deri në 500 shkronja).');
          if (numeric(id) && !Number.isFinite(Number(next.text))) throw new Error('Shkruaj një numër të vlefshëm.');
          if (next.op === 'between') {
            next.text2 = clean(filter.text2);
            if (!next.text2 || !Number.isFinite(Number(next.text2)) || Number(next.text) > Number(next.text2)) throw new Error('Plotëso kufirin minimal dhe maksimal saktë.');
          }
        }
      }
      if (next.op || next.mode === 'include' || next.values?.length) result[id] = next;
    }
    if (JSON.stringify(result).length > 6000) throw new Error('Filtrat janë shumë të gjatë. Përdor një kusht teksti ose më pak vlera.');
    return result;
  }
  function matches(row, id, filter) {
    const raw = value(row, id), text = fold(raw), test = fold(filter.text);
    if (filter.values && (filter.mode === 'include' ? !filter.values.includes(raw) : filter.values.includes(raw))) return false;
    if (!filter.op) return true;
    if (filter.op === 'empty') return raw === '';
    if (filter.op === 'notEmpty') return raw !== '';
    if (filter.op === 'contains') return text.includes(test);
    if (filter.op === 'notContains') return !text.includes(test);
    if (filter.op === 'equals') return numeric(id) ? raw !== '' && Number(raw) === Number(filter.text) : text === test;
    if (filter.op === 'notEquals') return numeric(id) ? raw === '' || Number(raw) !== Number(filter.text) : text !== test;
    if (filter.op === 'startsWith') return text.startsWith(test);
    if (filter.op === 'endsWith') return text.endsWith(test);
    if (raw === '') return false;
    const number = Number(raw), bound = Number(filter.text);
    if (filter.op === 'gt') return number > bound;
    if (filter.op === 'gte') return number >= bound;
    if (filter.op === 'lt') return number < bound;
    if (filter.op === 'lte') return number <= bound;
    return number >= bound && number <= Number(filter.text2);
  }
  return Object.freeze({ clean, fold, fields, numeric, sortKey, value, label, parseFilters, matches, prescriptionNotation, populationLabel });
});
