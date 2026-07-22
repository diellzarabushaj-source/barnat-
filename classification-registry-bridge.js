(() => {
  'use strict';

  const FIELDS = [
    'Nr rendor','PDID','ProtocolNo','Emri tregtar','Substanca aktive','ATC Code',
    'Klasa / Çka është','Përdorimi (fjalë kyçe)','Fortësia','Forma farmaceutike',
    'Madhësia e paketimit','Bartësi i Autorizim Marketingut','Prodhuesi',
    'MA certifikata','Statusi','Çmimi me shumicë','Çmimi me marzhë','TVSH',
    'Çmimi me pakicë','Afati i vlefshmërisë'
  ];

  const canonicalToken = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  const fieldLookup = {};
  FIELDS.forEach(field => { fieldLookup[canonicalToken(field)] = field; });
  Object.assign(fieldLookup, {
    nr:'Nr rendor', number:'Nr rendor', pdid:'PDID', protocol:'ProtocolNo', protocolno:'ProtocolNo',
    emri:'Emri tregtar', name:'Emri tregtar', tradename:'Emri tregtar',
    substanca:'Substanca aktive', activesubstance:'Substanca aktive', activeingredient:'Substanca aktive',
    atc:'ATC Code', atccode:'ATC Code', klasa:'Klasa / Çka është', class:'Klasa / Çka është',
    perdorimi:'Përdorimi (fjalë kyçe)', uses:'Përdorimi (fjalë kyçe)', indications:'Përdorimi (fjalë kyçe)',
    fortesia:'Fortësia', strength:'Fortësia', forma:'Forma farmaceutike', pharmaceuticalform:'Forma farmaceutike',
    status:'Statusi'
  });

  function unwrap(value) {
    let current = value;
    for (let depth = 0; depth < 6; depth += 1) {
      if (Array.isArray(current)) return current;
      if (typeof current === 'string') {
        try { current = JSON.parse(current); continue; } catch { return []; }
      }
      if (current && typeof current === 'object') {
        const preferred = ['data','rows','records','items','drugs','barnat','Sheet1','sheet1'];
        const key = preferred.find(name => Array.isArray(current[name]) || typeof current[name] === 'string');
        if (key) { current = current[key]; continue; }
        const nestedArray = Object.values(current).find(Array.isArray);
        if (nestedArray) { current = nestedArray; continue; }
      }
      break;
    }
    return [];
  }

  function normalizeRow(row, index) {
    const result = Object.fromEntries(FIELDS.map(field => [field, '']));
    if (Array.isArray(row)) {
      FIELDS.forEach((field, fieldIndex) => { result[field] = row[fieldIndex] ?? ''; });
    } else if (row && typeof row === 'object') {
      const source = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : row;
      Object.entries(source).forEach(([key, value]) => {
        const field = fieldLookup[canonicalToken(key)];
        if (field) result[field] = value ?? '';
      });
    }
    if (result['Nr rendor'] === '') result['Nr rendor'] = index + 1;
    return result;
  }

  async function decodeParts() {
    if (!Array.isArray(window.DRUG_DATA_PARTS) || !window.DRUG_DATA_PARTS.length) return [];
    const encoded = window.DRUG_DATA_PARTS.join('');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    if (typeof DecompressionStream !== 'function') throw new Error('Shfletuesi nuk mbështet dekompresimin gzip.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  async function fetchParts() {
    const response = await fetch('/api/registry?fallback=1&classification=1&bridge=4', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Databaza nuk u ngarkua (${response.status}).`);
    window.DRUG_DATA_PARTS = [];
    (0, eval)(await response.text());
  }

  function auditRows(rows) {
    const empty = field => rows.filter(row => !String(row[field] ?? '').trim()).length;
    const cleanAtc = row => String(row['ATC Code'] || '').toUpperCase().replace(/\s+/g, '');
    const validAtcPattern = /^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/;
    const productAtcPattern = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/;
    const protocolPattern = /^PD\d+\/\d+$/i;
    const pdidPattern = /^\d+$/;
    const pdids = new Map();

    rows.forEach(row => {
      const pdid = String(row.PDID ?? '').trim();
      if (pdid) pdids.set(pdid, (pdids.get(pdid) || 0) + 1);
    });

    const quality = window.MedIndexRegistryQuality?.applyRows
      ? window.MedIndexRegistryQuality.applyRows(rows)
      : { rows, summary: { total: rows.length, corrected: 0, blocked: 0, warning: 0, verified: rows.length, issueCount: 0, correctionCount: 0 } };
    const auditedRows = quality.rows || rows;
    const issueCodeCounts = {};
    auditedRows.forEach(row => {
      (row.__qualityIssues || []).forEach(issue => {
        issueCodeCounts[issue.code] = (issueCodeCounts[issue.code] || 0) + 1;
      });
    });

    return {
      rows: auditedRows,
      summary: {
        total: auditedRows.length,
        validAtc: auditedRows.filter(row => validAtcPattern.test(cleanAtc(row))).length,
        productLevelAtc: auditedRows.filter(row => productAtcPattern.test(cleanAtc(row))).length,
        atypicalAtc: auditedRows.filter(row => cleanAtc(row) && !validAtcPattern.test(cleanAtc(row))).length,
        missingAtc: empty('ATC Code'),
        missingSubstance: empty('Substanca aktive'),
        missingClass: empty('Klasa / Çka është'),
        missingUse: empty('Përdorimi (fjalë kyçe)'),
        missingForm: empty('Forma farmaceutike'),
        missingStrength: empty('Fortësia'),
        missingStatus: empty('Statusi'),
        invalidProtocolNo: auditedRows.filter(row => !protocolPattern.test(String(row.ProtocolNo ?? '').trim())).length,
        invalidPdid: auditedRows.filter(row => !pdidPattern.test(String(row.PDID ?? '').trim())).length,
        duplicatePdidValues: [...pdids.values()].filter(count => count > 1).length,
        corrected: quality.summary?.corrected || 0,
        correctionCount: quality.summary?.correctionCount || 0,
        blocked: quality.summary?.blocked || 0,
        warning: quality.summary?.warning || 0,
        verified: quality.summary?.verified || 0,
        issueCount: quality.summary?.issueCount || 0,
        issueCodeCounts
      },
      quality
    };
  }

  async function loadRegistry() {
    let decoded = await decodeParts();
    if (!unwrap(decoded).length) {
      await fetchParts();
      decoded = await decodeParts();
    }
    const normalized = unwrap(decoded)
      .map(normalizeRow)
      .filter(row => row['Emri tregtar'] || row['Substanca aktive']);
    if (!normalized.length) throw new Error('Databaza u kthye pa rreshta të lexueshëm.');
    const audited = auditRows(normalized);
    window.MEDINDEX_REGISTRY_ROWS = audited.rows;
    window.MEDINDEX_REGISTRY_AUDIT = audited.summary;
    window.dispatchEvent(new CustomEvent('medindex:registry-ready', { detail: audited }));
    return audited;
  }

  window.MEDINDEX_REGISTRY_READY = loadRegistry().catch(error => {
    window.MEDINDEX_REGISTRY_ERROR = error;
    window.dispatchEvent(new CustomEvent('medindex:registry-error', { detail: { error } }));
    throw error;
  });
})();