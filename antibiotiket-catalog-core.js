(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DRX_ANTIBIOTIC_CATALOG_CORE = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq').replace(/\s+/g, ' ').trim();
  const sortText = (a, b) => String(a).localeCompare(String(b), 'sq');

  function filterAntibiotics(antibiotics, filters = {}, selected = []) {
    const selectedSet = new Set(selected);
    const term = normalize(filters.search);
    return (Array.isArray(antibiotics) ? antibiotics : []).filter(item => {
      if (filters.group && item.group !== filters.group) return false;
      if (filters.subgroup && item.subgroup !== filters.subgroup) return false;
      if (filters.route && !(item.routes || []).some(route => route.toUpperCase().includes(String(filters.route).toUpperCase()))) return false;
      if (filters.indication && !(item.indications || []).includes(filters.indication)) return false;
      if (filters.selectedOnly && !selectedSet.has(item.atc)) return false;
      if (!term) return true;
      const text = [item.name, item.atc, item.group, item.subgroup, ...(item.indications || []), ...(item.products || []).flatMap(product => [product.brand, product.form, product.strength])].join(' ');
      return normalize(text).includes(term);
    }).sort((a, b) => sortText(a.group, b.group) || sortText(a.subgroup, b.subgroup) || sortText(a.name, b.name));
  }

  function readSelected(raw, allowedAtcs) {
    let parsed;
    try { parsed = JSON.parse(raw || '[]'); } catch { return []; }
    const allowed = new Set(allowedAtcs);
    return Array.isArray(parsed) ? [...new Set(parsed.filter(x => typeof x === 'string' && allowed.has(x)))] : [];
  }

  function isCalculatorApproved(regimen) {
    return regimen?.calculatorApproved === true && regimen?.qaStatus === 'MIRATUAR';
  }

  return Object.freeze({ filterAntibiotics, readSelected, isCalculatorApproved, normalize });
});
