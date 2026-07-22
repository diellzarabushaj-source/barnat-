(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.MedIndexRegistryQuality = api;
    if (root.document) api.installBrowserAssets(root.document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '2026-07-23.2';
  const CORRECTIONS = [
    {
      id: 'REG-2026-001',
      match: { ProtocolNo: 'PD1339/051225', PDID: '42' },
      set: { 'Substanca aktive': 'Metamizole sodium' },
      reason: 'Regjistri burimor e kishte substancën gabimisht si “Metronidazole micronised”, ndërsa emri ANALGIN, ATC N02BB02, forma 1 g/2 ml dhe regjistri zyrtar i produktit përputhen me metamizole sodium.',
      sourceUrl: 'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/51155',
      verifiedAt: '2026-07-22',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-002',
      match: { 'ATC Code': 'H02AB04', 'Substanca aktive': 'Methylprdenisolon' },
      set: { 'Substanca aktive': 'Methylprednisolone' },
      reason: 'Korrigjim drejtshkrimor i emrit gjenerik, i verifikuar me ATC H02AB04 dhe SmPC të methylprednisolone.',
      sourceUrl: 'https://www.medicines.org.uk/emc/product/1550/smpc',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-003',
      match: { 'ATC Code': 'C07AB02', 'Substanca aktive': 'Metopropol tartarate' },
      set: { 'Substanca aktive': 'Metoprolol tartrate' },
      reason: 'Korrigjim drejtshkrimor i metoprolol tartrate, i verifikuar me ATC C07AB02 dhe SmPC.',
      sourceUrl: 'https://www.medicines.org.uk/emc/product/866/smpc',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-004',
      match: { 'ATC Code': 'N03AF01', 'Substanca aktive': 'Carbamazine' },
      set: { 'Substanca aktive': 'Carbamazepine' },
      reason: 'Korrigjim drejtshkrimor i carbamazepine, i verifikuar me ATC N03AF01 dhe SmPC të Tegretol.',
      sourceUrl: 'https://www.medicines.org.uk/emc/product/7845/smpc',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-005',
      match: { 'ATC Code': 'A11HA02', 'Substanca aktive': 'pyrodixine' },
      set: { 'Substanca aktive': 'Pyridoxine' },
      reason: 'Korrigjim drejtshkrimor i pyridoxine, i verifikuar me ATC A11HA02 dhe SmPC.',
      sourceUrl: 'https://www.medicines.org.uk/emc/product/100831/smpc',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-006',
      match: { 'ATC Code': 'A03BB01', 'Substanca aktive': 'Hyoscine buyylbromide' },
      set: { 'Substanca aktive': 'Hyoscine butylbromide' },
      reason: 'Korrigjim drejtshkrimor i hyoscine butylbromide, i verifikuar me ATC A03BB01 dhe SmPC.',
      sourceUrl: 'https://www.medicines.org.uk/emc/product/102336/smpc',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-007',
      match: { 'ATC Code': 'S03CA01', 'Substanca aktive': 'Dexamethasone sodium phopshate,; neomycin sulfate' },
      set: { 'Substanca aktive': 'Dexamethasone sodium phosphate; Neomycin sulfate' },
      reason: 'Korrigjim drejtshkrimor dhe i pikësimit të kombinimit kortikosteroid/antiinfektiv për sy dhe vesh.',
      sourceUrl: 'https://www.medicines.org.uk/emc/product/841/smpc',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-008',
      match: { 'ATC Code': 'J01XD01', 'Substanca aktive': 'Metroniazole' },
      set: { 'Substanca aktive': 'Metronidazole' },
      reason: 'Korrigjim drejtshkrimor i metronidazole, në përputhje me ATC J01XD01.',
      sourceUrl: 'https://www.whocc.no/atc_ddd_index/?code=J01XD01',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-009',
      match: { 'ATC Code': 'G01AF20', 'Substanca aktive': 'Metroniazole; miconazole nitrate' },
      set: { 'Substanca aktive': 'Metronidazole; Miconazole nitrate' },
      reason: 'Korrigjim drejtshkrimor i kombinimit metronidazole/miconazole.',
      sourceUrl: 'https://www.whocc.no/atc_ddd_index/?code=G01AF20',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-010',
      match: { 'ATC Code': 'J01CA04', 'Substanca aktive': 'Amoxicilin trihydrats' },
      set: { 'Substanca aktive': 'Amoxicillin trihydrate' },
      reason: 'Korrigjim drejtshkrimor i amoxicillin trihydrate, në përputhje me ATC J01CA04.',
      sourceUrl: 'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=a3b98df9-eddc-441a-84dd-51bc5f8dc6e4&type=display',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-011',
      match: { 'ATC Code': 'M01AX17', 'Substanca aktive': 'Nimesuluide' },
      set: { 'Substanca aktive': 'Nimesulide' },
      reason: 'Korrigjim drejtshkrimor i nimesulide, në përputhje me ATC M01AX17.',
      sourceUrl: 'https://www.ema.europa.eu/en/medicines/human/referrals/nimesulide-containing-medicines',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-012',
      match: { 'ATC Code': 'S01AD03', 'Forma farmaceutike': 'Eye ointment' },
      set: {
        'Klasa / Çka është': 'Antiviral oftalmologjik',
        'Përdorimi (fjalë kyçe)': 'keratit herpetik; infeksion okular nga herpes simplex; antiviral okular'
      },
      reason: 'Aciclovir 3% eye ointment është antiviral për keratit nga herpes simplex, jo antibiotik për konjuktivit bakterial.',
      sourceUrl: 'https://www.medicines.org.uk/emc/product/12988/smpc',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-013',
      match: { 'ATC Code': 'B05BC01', 'Përdorimi (fjalë kyçe)': 'rehidratim; elektrolite; glukozë; infuzion' },
      set: {
        'Klasa / Çka është': 'Diuretik osmotik intravenoz',
        'Përdorimi (fjalë kyçe)': 'ulje e presionit intrakranial; edemë cerebrale; ulje e presionit intraokular; diurezë osmotike'
      },
      reason: 'Mannitol IV është diuretik osmotik; përshkrimi i vjetër si rehidrim/glukozë nuk përputhej me përdorimin zyrtar.',
      sourceUrl: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ad3145e-00e7-4412-b9a5-06f00f264f30',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-014',
      match: { 'ATC Code': 'B05BC01', 'Substanca aktive': 'Manitol' },
      set: { 'Substanca aktive': 'Mannitol' },
      reason: 'Standardizim drejtshkrimor i emrit gjenerik Mannitol.',
      sourceUrl: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ad3145e-00e7-4412-b9a5-06f00f264f30',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    },
    {
      id: 'REG-2026-015',
      match: { 'ATC Code': 'B05BC01', 'Substanca aktive': 'manitol' },
      set: { 'Substanca aktive': 'Mannitol' },
      reason: 'Standardizim drejtshkrimor i emrit gjenerik Mannitol.',
      sourceUrl: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ad3145e-00e7-4412-b9a5-06f00f264f30',
      verifiedAt: '2026-07-23',
      verifiedBy: 'MedIndex data-quality audit'
    }
  ];

  const REQUIRED_IDENTITY_FIELDS = ['Emri tregtar', 'Substanca aktive', 'ATC Code', 'Fortësia', 'Forma farmaceutike'];
  const REQUIRED_CLINICAL_FIELDS = ['Klasa / Çka është', 'Përdorimi (fjalë kyçe)'];

  function installBrowserAssets(documentRef) {
    if (!documentRef) return;
    if (!documentRef.getElementById('registryQualityStyles')) {
      const link = documentRef.createElement('link');
      link.id = 'registryQualityStyles';
      link.rel = 'stylesheet';
      link.href = './registry-quality.css?v=20260723-2';
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
      addIssue(row, 'block', 'ANALGIN_N02BB02_SUBSTANCE_MISMATCH', 'Emri/ATC-ja tregojnë metamizol, por substanca aktive nuk përputhet. Rreshti nuk lejohet në recetë pa verifikim.');
    }
    if (active.includes('metronidazole') && atc === 'N02BB02') {
      addIssue(row, 'block', 'METRONIDAZOLE_N02BB02_MISMATCH', 'Metronidazole nuk përputhet me ATC N02BB02. Kërkohet verifikim i burimit.');
    }
  }

  function validateCompleteness(row) {
    const missingIdentity = REQUIRED_IDENTITY_FIELDS.filter(field => !text(row[field]));
    if (missingIdentity.length) {
      addIssue(row, 'warning', 'MISSING_IDENTITY_FIELDS', `Mungojnë fusha identifikuese: ${missingIdentity.join(', ')}.`);
    }
    const missingClinical = REQUIRED_CLINICAL_FIELDS.filter(field => !text(row[field]));
    if (missingClinical.length) {
      addIssue(row, 'warning', 'MISSING_CLINICAL_FIELDS', `Mungojnë fusha klinike: ${missingClinical.join(', ')}.`);
    }
    if (!text(row.Statusi)) {
      addIssue(row, 'warning', 'MISSING_REGISTRY_STATUS', 'Mungon statusi Gjenerik/Origjinator në regjistrin burimor.');
    }

    const atc = text(row['ATC Code']).toUpperCase().replace(/\s+/g, '');
    if (atc && !/^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/.test(atc)) {
      addIssue(row, 'warning', 'ATC_FORMAT', 'Kodi ATC ka format jo standard ose placeholder dhe duhet kontrolluar.');
    }
  }

  function validateAdministrativeIdentifiers(row) {
    const protocol = text(row.ProtocolNo);
    const pdid = text(row.PDID);
    if (!/^PD\d+\/\d+$/i.test(protocol)) {
      addIssue(row, 'warning', 'INVALID_PROTOCOL_NUMBER', `ProtocolNo “${protocol || 'bosh'}” nuk është identifikues standard PD…/….`);
    }
    if (!/^\d+$/.test(pdid)) {
      addIssue(row, 'warning', 'INVALID_PDID', `PDID “${pdid || 'bosh'}” nuk është numerik.`);
    }
  }

  function validateFormAndAtcConsistency(row) {
    const form = normalize(row['Forma farmaceutike']);
    const atc = text(row['ATC Code']).toUpperCase().replace(/\s+/g, '');
    const active = normalize(row['Substanca aktive']);
    const clinicalClass = normalize(row['Klasa / Çka është']);
    const use = normalize(row['Përdorimi (fjalë kyçe)']);
    const parenteral = form.includes('injection') || form.includes('infusion');

    if (parenteral && atc.startsWith('M02AA')) {
      addIssue(row, 'block', 'PARENTERAL_WITH_TOPICAL_ATC', 'Forma është injektabile/infuzive, por ATC M02AA dhe klasa tregojnë preparat topik. Duhet verifikuar ATC-ja dhe identiteti i produktit.');
    }
    if (form.includes('solutionforinfusion') && atc.startsWith('B05C')) {
      addIssue(row, 'block', 'INFUSION_WITH_IRRIGATION_ATC', 'Forma është solution for infusion, ndërsa ATC B05C/klasa tregojnë solucion për irrigim. Duhet verifikuar autorizimi i produktit dhe ATC-ja.');
    }
    if (active.includes('aciclovir') && form.includes('eyeointment') && (use.includes('antibiotik') || use.includes('konjuktivit'))) {
      addIssue(row, 'block', 'ACICLOVIR_EYE_ANTIBIOTIC_DESCRIPTION', 'Aciclovir eye ointment është antiviral; përshkrimi si antibiotik/konjuktivit bakterial është i papërshtatshëm.');
    }
    if (parenteral && clinicalClass.includes('topik')) {
      addIssue(row, 'block', 'PARENTERAL_CLASSIFIED_AS_TOPICAL', 'Preparati parenteral është klasifikuar si topik dhe nuk lejohet në recetë pa verifikim.');
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
        items.forEach(row => addIssue(row, 'warning', `CONFLICTING_${label}`, `${label === 'PROTOCOL' ? 'ProtocolNo' : 'PDID'} ${value} përdoret për produkte me identitet të ndryshëm dhe kërkon kontroll administrativ.`));
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
      validateAdministrativeIdentifiers(row);
      validateFormAndAtcConsistency(row);
    });
    markConflictingIdentifiers(rows);
    rows.forEach(finalizeStatus);

    const summary = rows.reduce((acc, row) => {
      const status = row.__qualityStatus || 'verified';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { total: rows.length, corrected: 0, blocked: 0, warning: 0, verified: 0 });
    summary.issueCount = rows.reduce((total, row) => total + (row.__qualityIssues?.length || 0), 0);
    summary.correctionCount = rows.reduce((total, row) => total + (row.__qualityCorrections?.length || 0), 0);

    return { version: VERSION, rows, summary, corrections: CORRECTIONS.map(item => ({ ...item })) };
  }

  return {
    version: VERSION,
    corrections: CORRECTIONS,
    installBrowserAssets,
    applyRows
  };
});