(() => {
  'use strict';

  const VERSION = 'sq-terminology-ui-v1';
  const STATUS = Object.freeze({
    missing:{ label:'Mungon shqipja', className:'is-missing', title:'Nuk ka ende titull shqip.' },
    'machine-draft':{ label:'Draft automatik', className:'is-draft is-review', title:'Përkthim automatik që kërkon rishikim editorial.' },
    standardized:{ label:'Term i standardizuar', className:'is-standardized', title:'Terminologji e standardizuar nga shtresa editoriale MedIndex.' },
    verified:{ label:'I verifikuar', className:'is-verified', title:'Terminologji e verifikuar profesionalisht.' },
  });

  const clean = value => String(value ?? '').trim();

  function statusInfo(value) {
    return STATUS[clean(value)] || STATUS['machine-draft'];
  }

  function enhanceRows(payload) {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const byCode = new Map(rows.map(row => [clean(row.code), row]));
    for (const tableRow of document.querySelectorAll('[data-icd-row]')) {
      const node = byCode.get(clean(tableRow.dataset.icdRow));
      if (!node) continue;
      const info = statusInfo(node.translationStatus);
      const badge = tableRow.querySelector('.icd-translation-badge');
      if (badge) {
        badge.className = `icd-translation-badge ${info.className}`;
        badge.textContent = info.label;
        badge.title = info.title;
      }
      tableRow.dataset.translationStatus = clean(node.translationStatus) || 'machine-draft';
    }
  }

  function enhanceCoverage(meta) {
    const quality = meta?.quality || {};
    const value = Number(quality.terminologyCoverage || 0);
    const output = document.getElementById('icdTranslationCoverage');
    if (!output) return;
    output.textContent = `${value.toLocaleString('sq-AL', { maximumFractionDigits:2 })}%`;
    const stat = output.closest('.icd-registry-stat');
    if (!stat) return;
    stat.dataset.terminologyStat = 'standardized';
    const label = stat.querySelector('span');
    if (label) label.textContent = 'standardizuar';
    stat.title = `${Number(quality.standardizedTranslations || 0).toLocaleString('sq-AL')} terma të standardizuar; ${Number(quality.verifiedTranslations || 0).toLocaleString('sq-AL')} të verifikuar.`;
  }

  function enhance(event) {
    const payload = event?.detail?.payload;
    if (!payload) return;
    enhanceRows(payload);
    enhanceCoverage(payload.meta);
    document.documentElement.dataset.miIcdTerminology = VERSION;
    window.dispatchEvent(new CustomEvent('medindex:icd-terminology-rendered', {
      detail:{
        version:VERSION,
        terminologyVersion:payload.meta?.quality?.terminologyVersion || '',
        pilotChapter:payload.meta?.quality?.pilotChapter || '',
      },
    }));
  }

  window.addEventListener('medindex:icd-state', enhance);
  document.documentElement.dataset.miIcdTerminology = VERSION;
})();
