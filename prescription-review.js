(() => {
  'use strict';

  const REVIEW_VERSION = '1.3';
  let reviewedAt = '';
  let scheduled = false;
  let restoring = false;

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const fieldValue = (article, name) => text(article.querySelector(`[data-item-field="${name}"]`)?.value);

  function itemFromArticle(article) {
    return {
      tradeName:text(article.dataset.tradeName),
      substance:text(article.dataset.substance),
      prefix:fieldValue(article, 'prefix'),
      dose:fieldValue(article, 'dose'),
      route:fieldValue(article, 'route'),
      frequency:fieldValue(article, 'frequency'),
      duration:fieldValue(article, 'duration'),
      quantity:fieldValue(article, 'quantity'),
      instructions:fieldValue(article, 'instructions'),
      clinicalNotes:fieldValue(article, 'clinicalNotes'),
      regimenId:fieldValue(article, 'regimenId'),
      dosageStatus:fieldValue(article, 'dosageStatus'),
      doseCalculation:fieldValue(article, 'doseCalculation'),
    };
  }

  function protocolFromDom() {
    const checkbox = $('#protocolClinicalReview');
    return {
      name:text($('#protocolName')?.value),
      indication:text($('#protocolIndication')?.value),
      population:text($('#protocolPopulation')?.value),
      allergies:text($('#protocolAllergies')?.value),
      patientType:$('#protocolPatientType')?.value || 'adult',
      ageValue:text($('#protocolAgeValue')?.value),
      ageUnit:$('#protocolAgeUnit')?.value || 'years',
      weightKg:text($('#protocolWeightKg')?.value),
      clinicalReview:Boolean(checkbox?.checked),
      reviewedAt,
      dosageDatasetVersion:text(window.MEDINDEX_DOSAGE?.datasetVersion),
      items:[...document.querySelectorAll('#protocolDrugList .protocol-drug')].map(itemFromArticle),
    };
  }

  function evaluateProtocol(protocol, { requireReview = false } = {}) {
    const issues = [];
    const warnings = [];
    const items = Array.isArray(protocol?.items) ? protocol.items : [];
    const issue = (message, key = '') => issues.push({ message, key });
    const warning = (message, key = '') => warnings.push({ message, key });

    if (!text(protocol?.name)) issue('Mungon emri i recetës.', 'name');
    if (!items.length) issue('Nuk është zgjedhur asnjë bar.', 'items');
    if (!text(protocol?.allergies)) warning('Alergjitë nuk janë shënuar; shkruaj “Nuk dihen” kur nuk ka të dhëna.', 'allergies');
    if (!text(protocol?.indication)) warning('Diagnoza ose indikacioni nuk është plotësuar.', 'indication');

    if (protocol?.patientType === 'pediatric' && !text(protocol?.ageValue)) {
      issue('Për recetë pediatrike duhet të shkruhet mosha.', 'age');
    }

    items.forEach((item, index) => {
      const label = text(item.tradeName || item.substance) || `Bari ${index + 1}`;
      const status = normalize(item.dosageStatus);
      const hasStructuredDose = text(item.dose) && text(item.frequency);
      const hasSignatura = Boolean(text(item.instructions) || hasStructuredDose);

      if (!text(item.prefix)) warning(`${label}: mungon parashtesa farmaceutike Rp.`, `item-${index}-prefix`);
      if (!hasSignatura) issue(`${label}: Signatura ose skema e dozimit nuk është plotësuar.`, `item-${index}-instructions`);
      if (!text(item.quantity)) warning(`${label}: mungon sasia për dispensim.`, `item-${index}-quantity`);
      if (!text(item.route) && !text(item.instructions)) warning(`${label}: rruga e administrimit nuk është e qartë.`, `item-${index}-route`);
      if (!text(item.duration) && !text(item.instructions)) warning(`${label}: kohëzgjatja nuk është e shënuar.`, `item-${index}-duration`);
      if (status.includes('KERKON RISHIKIM')) issue(`${label}: skema kërkon rishikim para përdorimit.`, `item-${index}-status`);
      if (status.includes('EDITUAR')) warning(`${label}: skema e verifikuar është ndryshuar nga përdoruesja.`, `item-${index}-status`);
      if (protocol?.patientType === 'pediatric' && text(item.doseCalculation) && !text(protocol?.weightKg)) {
        issue(`${label}: pesha është e detyrueshme për llogaritjen pediatrike.`, 'weight');
      }
    });

    const currentDataset = text(window.MEDINDEX_DOSAGE?.datasetVersion);
    if (text(protocol?.dosageDatasetVersion) && currentDataset && text(protocol.dosageDatasetVersion) !== currentDataset) {
      warning(`Receta është krijuar me dataset-in ${protocol.dosageDatasetVersion}; versioni aktual është ${currentDataset}.`, 'dataset');
    }

    if (requireReview && (!protocol?.clinicalReview || !text(protocol?.reviewedAt))) {
      issue('Receta nuk është shënuar dhe datuar si e kontrolluar klinikisht.', 'review');
    }

    return {
      issues,
      warnings,
      ok:issues.length === 0,
      printable:issues.length === 0 && Boolean(protocol?.clinicalReview) && Boolean(text(protocol?.reviewedAt)),
    };
  }

  function focusKey(key) {
    const map = {
      name:'#protocolName',
      indication:'#protocolIndication',
      allergies:'#protocolAllergies',
      age:'#protocolAgeValue',
      weight:'#protocolWeightKg',
      review:'#protocolClinicalReview',
    };
    let node = map[key] ? $(map[key]) : null;
    const itemMatch = /^item-(\d+)-(.+)$/.exec(key || '');
    if (itemMatch) {
      const article = document.querySelectorAll('#protocolDrugList .protocol-drug')[Number(itemMatch[1])];
      node = article?.querySelector(`[data-item-field="${itemMatch[2]}"]`) || article;
    }
    if (!node) node = $('#prescriptionReview');
    node?.scrollIntoView({ behavior:'smooth', block:'center' });
    if (typeof node?.focus === 'function') setTimeout(() => node.focus({ preventScroll:true }), 250);
  }

  function notify(message) {
    window.showProtocolToast?.(message);
  }

  function render() {
    scheduled = false;
    const card = $('#prescriptionReview');
    const badge = $('#prescriptionReviewBadge');
    const summary = $('#prescriptionReviewSummary');
    const list = $('#prescriptionReviewList');
    const checkbox = $('#protocolClinicalReview');
    const reviewedNode = $('#protocolReviewedAt');
    if (!card || !badge || !summary || !list || !checkbox || !reviewedNode) return;

    let protocol = protocolFromDom();
    let result = evaluateProtocol(protocol);
    if (result.issues.length && checkbox.checked) {
      restoring = true;
      checkbox.checked = false;
      reviewedAt = '';
      restoring = false;
      protocol = protocolFromDom();
      result = evaluateProtocol(protocol);
    }

    checkbox.disabled = result.issues.length > 0;
    card.classList.remove('is-ready', 'is-warning', 'is-blocked');
    badge.className = 'rx-review-badge';

    if (result.issues.length) {
      card.classList.add('is-blocked');
      badge.classList.add('blocked');
      badge.textContent = 'Draft i paplotë';
      summary.textContent = `${result.issues.length} çështje bllokojnë finalizimin dhe printimin; drafti mund të ruhet.`;
    } else if (checkbox.checked) {
      card.classList.add('is-ready');
      badge.classList.add('ready');
      badge.textContent = 'Kontrolluar';
      summary.textContent = result.warnings.length ? `E kontrolluar me ${result.warnings.length} vërejtje të dukshme.` : 'E gatshme për ruajtje dhe printim profesional.';
    } else {
      card.classList.add(result.warnings.length ? 'is-warning' : 'is-ready');
      badge.classList.add(result.warnings.length ? 'warning' : 'ready');
      badge.textContent = result.warnings.length ? 'Për kontroll' : 'Gati për kontroll';
      summary.textContent = result.warnings.length ? `${result.warnings.length} vërejtje jo-bllokuese kërkojnë kontroll.` : 'Plotëso kontrollin klinik për ta finalizuar recetën.';
    }

    const rows = [
      ...result.issues.map(entry => ({ ...entry, type:'issue' })),
      ...result.warnings.map(entry => ({ ...entry, type:'warning' })),
    ];
    list.innerHTML = rows.length
      ? rows.slice(0, 8).map(entry => `<li class="${entry.type}" data-review-key="${esc(entry.key)}">${esc(entry.message)}</li>`).join('')
      : '<li>Të gjitha fushat kritike janë plotësuar.</li>';

    reviewedNode.textContent = checkbox.checked && reviewedAt
      ? `Kontrolluar më: ${new Date(reviewedAt).toLocaleString('sq-AL')}`
      : 'Statusi: Draft — ndryshimet pas kontrollit e kthejnë automatikisht në draft.';
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function invalidateReview(showMessage = false) {
    const checkbox = $('#protocolClinicalReview');
    if (!checkbox?.checked) return;
    restoring = true;
    checkbox.checked = false;
    reviewedAt = '';
    restoring = false;
    if (showMessage) notify('Receta u kthye në draft sepse u ndryshua pas kontrollit.');
  }

  function state() {
    render();
    const checkbox = $('#protocolClinicalReview');
    const result = evaluateProtocol(protocolFromDom());
    return {
      reviewed:Boolean(checkbox?.checked),
      reviewedAt:checkbox?.checked ? reviewedAt : '',
      reviewVersion:REVIEW_VERSION,
      issues:result.issues.length,
      warnings:result.warnings.length,
    };
  }

  function validateForSave() {
    const result = evaluateProtocol(protocolFromDom());
    const hardIssues = result.issues.filter(entry => ['name', 'items'].includes(entry.key));
    render();
    if (hardIssues.length) {
      notify(hardIssues[0].message);
      focusKey(hardIssues[0].key);
      return { ...result, ok:false, issues:hardIssues };
    }
    return { ...result, ok:true };
  }

  function validateForPrint() {
    const result = evaluateProtocol(protocolFromDom(), { requireReview:true });
    render();
    if (!result.ok) {
      notify(result.issues[0].message);
      focusKey(result.issues[0].key);
    }
    return result;
  }

  function restore(protocol) {
    const checkbox = $('#protocolClinicalReview');
    if (!checkbox) return;
    restoring = true;
    reviewedAt = text(protocol?.reviewedAt);
    checkbox.checked = Boolean(protocol?.clinicalReview && reviewedAt);
    restoring = false;
    schedule();
  }

  function reset() {
    const checkbox = $('#protocolClinicalReview');
    restoring = true;
    if (checkbox) checkbox.checked = false;
    reviewedAt = '';
    restoring = false;
    schedule();
  }

  function init() {
    const overlay = $('#protocolOverlay');
    const checkbox = $('#protocolClinicalReview');
    if (!overlay || !checkbox) return;

    checkbox.addEventListener('change', () => {
      if (restoring) return;
      const result = evaluateProtocol(protocolFromDom());
      if (checkbox.checked && result.issues.length) {
        checkbox.checked = false;
        notify(result.issues[0].message);
        focusKey(result.issues[0].key);
      } else if (checkbox.checked) {
        reviewedAt = new Date().toISOString();
        notify('Receta u shënua si e kontrolluar klinikisht.');
      } else {
        reviewedAt = '';
      }
      render();
    });

    overlay.addEventListener('input', event => {
      if (event.target === checkbox) return;
      invalidateReview(true);
      schedule();
    }, true);
    overlay.addEventListener('change', event => {
      if (event.target === checkbox) return;
      invalidateReview(true);
      schedule();
    }, true);

    $('#prescriptionReviewList')?.addEventListener('click', event => {
      const row = event.target.closest('[data-review-key]');
      if (row) focusKey(row.dataset.reviewKey);
    });

    const list = $('#protocolDrugList');
    if (list) new MutationObserver(schedule).observe(list, { childList:true, subtree:true });
    render();
  }

  window.MedIndexPrescriptionReview = {
    state,
    reset,
    restore,
    render,
    validateForSave,
    validateForPrint,
    validateProtocol:evaluateProtocol,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
