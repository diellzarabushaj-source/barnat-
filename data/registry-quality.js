(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.MedIndexRegistryQuality = api;
    if (root.document) api.installBrowserAssets(root.document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '2026-07-22.1';
  const CORRECTIONS = [
    {
      id: 'REG-2026-001',
      match: { ProtocolNo: 'PD1339/051225', PDID: '42' },
      set: { 'Substanca aktive': 'Metamizole sodium' },
      reason: 'Regjistri burimor e kishte substancën gabimisht si “Metronidazole micronised”, ndërsa emri ANALGIN, ATC N02BB02, forma 1 g/2 ml dhe regjistri zyrtar i prodhuesit përputhen me metamizole sodium.',
      sourceUrl: 'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/51155',
      verifiedAt: '2026-07-22',
      verifiedBy: 'MedIndex data-quality audit'
    }
  ];

  const REQUIRED_IDENTITY_FIELDS = ['Emri tregtar', 'Substanca aktive', 'ATC Code', 'Fortësia', 'Forma farmaceutike'];

  function installBrowserAssets(documentRef) {
    if (!documentRef) return;
    if (!documentRef.getElementById('registryQualityStyles')) {
      const link = documentRef.createElement('link');
      link.id = 'registryQualityStyles';
      link.rel = 'stylesheet';
      link.href = './registry-quality.css?v=20260722-1';
      documentRef.head.appendChild(link);
    }
    if (!documentRef.querySelector('script[data-registry-quality-guard]')) {
      const script = documentRef.createElement('script');
      script.src = './registry-quality-guard.js?v=20260722-1';
      script.dataset.registryQualityGuard = '1';
      documentRef.head.appendChild(script);
    }
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalize(value) {
    return text(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function correctionMatches(row, correction) {
    return Object.entries(correction.match || {}).every(([field, expected]) => text(row[field]) === text(expected));
  }

  function addIssue(row, severity, code, message) {
    if (!Array.isArray(row.__qualityIssues)) row.__qualityIssues = [];
    if (row.__qualityIssues.some(issue => issue.code === code)) return;
    row.__qualityIssues.push({ severity, code, message });
  }

  function applyCorrections(row) {
    const output = { ...row };
    output.__qualityIssues = [];
    output.__qualityCorrections = [];

    CORRECTIONS.forEach(correction => {
      if (!correctionMatches(output, correction)) return;
      const original = {};
      Object.entries(correction.set || {}).forEach(([field, value]) => {
        original[field] = output[field];
        output[field] = value;
      });
      output.__qualityCorrections.push({
        id: correction.id,
        original,
        reason: correction.reason,
        sourceUrl: correction.sourceUrl,
        verifiedAt: correction.verifiedAt,
        verifiedBy: correction.verifiedBy
      });
    });

    return output;
  }

  function validateKnownClinicalIdentity(row) {
    const trade = normalize(row['Emri tregtar']);
    const active = normalize(row['Substanca aktive']);
    const atc = text(row['ATC Code']).toUpperCase().replace(/\s+/g, '');
    const metamizoleNames = ['metamizole', 'metamizol', 'dipyrone', 'noramidopyrine'];
    const isMetamizole = metamizoleNames.some(name => active.includes(name));

    if ((trade.includes('analgin') || atc === 'N02BB02') && !isMetamizole) {
      addIssue(
        row,
        'block',
        'ANALGIN_N02BB02_SUBSTANCE_MISMATCH',
        'Emri/ATC-ja tregojnë metamizol, por substanca aktive nuk përputhet. Rreshti nuk lejohet në recetë pa verifikim.'
      );
    }

    if (active.includes('metronidazole') && atc === 'N02BB02') {
      addIssue(
        row,
        'block',
        'METRONIDAZOLE_N02BB02_MISMATCH',
        'Metronidazole nuk përputhet me ATC N02BB02. Kërkohet verifikim i burimit.'
      );
    }
  }

  function validateCompleteness(row) {
    const missing = REQUIRED_IDENTITY_FIELDS.filter(field => !text(row[field]));
    if (missing.length) {
      addIssue(row, 'warning', 'MISSING_IDENTITY_FIELDS', `Mungojnë fusha identifikuese: ${missing.join(', ')}.`);
    }

    const atc = text(row['ATC Code']).toUpperCase().replace(/\s+/g, '');
    if (atc && !/^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/.test(atc)) {
      addIssue(row, 'warning', 'ATC_FORMAT', 'Kodi ATC ka format jo të zakonshëm dhe duhet kontrolluar.');
    }
  }

  function identitySignature(row) {
    return REQUIRED_IDENTITY_FIELDS.map(field => normalize(row[field])).join('|');
  }

  function markConflictingIdentifiers(rows) {
    const protocolGroups = new Map();
    const pdidGroups = new Map();

    rows.forEach(row => {
      const protocol = text(row.ProtocolNo);
      const pdid = text(row.PDID);
      if (/^PD\d+\/\d+$/i.test(protocol)) {
        if (!protocolGroups.has(protocol)) protocolGroups.set(protocol, []);
        protocolGroups.get(protocol).push(row);
      }
      if (/^\d+$/.test(pdid)) {
        if (!pdidGroups.has(pdid)) pdidGroups.set(pdid, []);
        pdidGroups.get(pdid).push(row);
      }
    });

    function mark(groups, label) {
      groups.forEach((items, value) => {
        if (items.length < 2) return;
        const signatures = new Set(items.map(identitySignature));
        if (signatures.size < 2) return;
        items.forEach(row => addIssue(
          row,
          'warning',
          `CONFLICTING_${label}`,
          `${label === 'PROTOCOL' ? 'ProtocolNo' : 'PDID'} ${value} përdoret për produkte me identitet të ndryshëm dhe kërkon kontroll administrativ.`
        ));
      });
    }

    mark(protocolGroups, 'PROTOCOL');
    mark(pdidGroups, 'PDID');
  }

  function finalizeStatus(row) {
    const issues = Array.isArray(row.__qualityIssues) ? row.__qualityIssues : [];
    const blocked = issues.some(issue => issue.severity === 'block');
    const warning = issues.some(issue => issue.severity === 'warning');
    const corrected = Array.isArray(row.__qualityCorrections) && row.__qualityCorrections.length > 0;

    row.__qualityStatus = blocked ? 'blocked' : corrected ? 'corrected' : warning ? 'warning' : 'verified';
    row.__qualityMessage = [
      ...issues.map(issue => issue.message),
      ...(row.__qualityCorrections || []).map(item => `${item.id}: ${item.reason}`)
    ].join(' ');
    row.__qualitySourceUrl = row.__qualityCorrections?.[0]?.sourceUrl || '';
    row.__qualityVersion = VERSION;
    return row;
  }

  function applyRows(inputRows) {
    const rows = Array.isArray(inputRows) ? inputRows.map(applyCorrections) : [];
    rows.forEach(row => {
      validateKnownClinicalIdentity(row);
      validateCompleteness(row);
    });
    markConflictingIdentifiers(rows);
    rows.forEach(finalizeStatus);

    const summary = rows.reduce((acc, row) => {
      const status = row.__qualityStatus || 'verified';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { total: rows.length, corrected: 0, blocked: 0, warning: 0, verified: 0 });

    return { version: VERSION, rows, summary, corrections: CORRECTIONS.map(item => ({ ...item })) };
  }

  return {
    version: VERSION,
    corrections: CORRECTIONS,
    installBrowserAssets,
    applyRows
  };
});
