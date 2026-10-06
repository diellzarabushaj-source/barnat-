(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry-substance-data.js'));
  else root.DrxRegistrySubstances = factory(root.DrxRegistrySubstanceData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(data) {
  'use strict';
  if (!data) throw new Error('Substance naming policy is missing.');
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  // Exact, case-insensitive names only. Punctuation, numbers, salts and hydrates
  // are significant; similarity scores never decide whether substances merge.
  const fold = value => clean(value).normalize('NFC').toLowerCase();
  const lookup = (map, key) => Object.hasOwn(map, key) ? map[key] : '';
  function parts(value) {
    const result = []; let depth = 0, start = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') depth = Math.max(0, depth - 1);
      else if (value[i] === ';' && !depth) { result.push(clean(value.slice(start, i))); start = i + 1; }
    }
    result.push(clean(value.slice(start))); return result;
  }
  function exact(value) {
    let name = clean(value);
    for (let i = 0; i < 8; i++) {
      const key = fold(name), next = lookup(data.aliases, key) || lookup(data.preferred, key);
      if (!next || next === name) break;
      name = next;
    }
    return name;
  }
  function canonicalName(value) {
    const raw = clean(value);
    if (!raw) return '';
    const resolved = exact(raw);
    const mapped = parts(resolved).map(part => {
      const known = exact(part);
      if (lookup(data.aliases, fold(part)) || lookup(data.preferred, fold(part))) return known;
      const lower = fold(known);
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join('; ');
    return exact(mapped);
  }
  function isKnownQuery(value) {
    const key = fold(value);
    return Boolean(key && (lookup(data.aliases, key) || lookup(data.preferred, key)));
  }
  function searchText(value) {
    const raw = clean(value);
    // Preserve ordinary query casing and partial/brand searches. Only reviewed
    // whole substance names receive spelling corrections.
    if (!isKnownQuery(raw)) return raw;
    const canonical = canonicalName(raw);
    return fold(raw) === fold(canonical) ? raw : canonical;
  }
  function normalizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    const sourceActiveSubstance = clean(row.sourceActiveSubstance ?? row.activeSubstance ?? row.substance);
    const activeSubstance = canonicalName(sourceActiveSubstance);
    return {...row, sourceActiveSubstance, activeSubstance, substanceKey:fold(activeSubstance),
      ...(Object.hasOwn(row, 'substance') ? {substance:activeSubstance} : {})};
  }
  return Object.freeze({version:data.version, clean, fold, canonicalName, key:value => fold(canonicalName(value)), searchText, isKnownQuery, normalizeRow});
});
