(() => {
  const CACHE_KEY = 'medindex-dosage-data-v1';
  const CACHE_TIME_KEY = 'medindex-dosage-data-time-v1';
  const CACHE_MS = 6 * 60 * 60 * 1000;
  let dosageData = { forms: [], adult: [], pediatric: [], meta: {} };
  let scheduled = false;

  const $ = selector => document.querySelector(selector);
  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const text = value => String(value ?? '').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function addStyles() {
    if ($('#dosageIntegrationStyles')) return;
    const style = document.createElement('style');
    style.id = 'dosageIntegrationStyles';
    style.textContent = `
      .dosage-patient-grid{display:grid;grid-template-columns:1.1fr .8fr .8fr .8fr;gap:12px;margin-top:12px}
      .dosage-patient-grid .protocol-field{min-width:0}.dosage-patient-grid select,.dosage-patient-grid input{width:100%;min-height:44px;padding:9px 11px;border:1.5px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink)}
      .dosage-patient-grid label{display:block;margin-bottom:5px;color:#68777b;font-size:.72rem;font-weight:750}.dosage-patient-grid [data-pediatric-only][hidden]{display:none}
      .dosage-assist{grid-column:1/-1;position:relative;padding:13px 14px;border:1px solid #d5e0dc;border-radius:12px;background:linear-gradient(135deg,#f7fbf9,#eef6f3);overflow:hidden}
      .dosage-assist::before{content:'';position:absolute;inset:0 auto 0 0;width:4px;background:var(--teal)}
      .dosage-assist-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dosage-assist-title{display:flex;align-items:center;gap:9px;min-width:0}.dosage-assist-icon{width:31px;height:31px;flex:0 0 auto;border-radius:9px;display:grid;place-items:center;background:#dcecea;color:var(--teal-dark);font-weight:900}.dosage-assist-title strong{display:block;color:var(--teal-dark);font-size:.82rem}.dosage-assist-title small{display:block;margin-top:2px;color:#708084;font-size:.7rem;line-height:1.35}
      .dosage-badge{flex:0 0 auto;padding:5px 8px;border-radius:999px;background:#fff3dd;color:#87520f;font-size:.64rem;font-weight:850;text-transform:uppercase;letter-spacing:.04em}.dosage-badge.ready{background:#dcecea;color:#0d3d40}.dosage-badge.manual{background:#eef0ef;color:#596568}
      .dosage-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:11px}.dosage-controls select{min-width:0;height:40px;padding:7px 10px;border:1px solid #cbd8d3;border-radius:8px;background:#fff;color:#17252a}.dosage-controls button{height:40px;padding:0 13px;border:0;border-radius:8px;background:var(--teal);color:#fff;font-weight:800;cursor:pointer}.dosage-controls button:disabled{opacity:.45;cursor:not-allowed}
      .dosage-source{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;color:#68777b;font-size:.68rem}.dosage-source a{color:var(--teal);font-weight:800}.dosage-calc{margin-top:8px;padding:8px 10px;border-radius:8px;background:#fff8eb;color:#684718;font-family:var(--mono);font-size:.68rem;line-height:1.45}
      .protocol-drug-rp{margin-top:8px;padding:9px 11px;border-radius:9px;background:#f6f8f7;border:1px solid var(--line);font-family:Georgia,serif}.protocol-drug-rp b{margin-right:7px;font-style:italic;font-size:1.05rem;color:var(--teal-dark)}
      .dosage-api-state{margin:0 0 12px;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#f7faf8;color:#607074;font-size:.72rem}.dosage-api-state strong{color:var(--teal-dark)}
      html[data-theme=dark] .dosage-assist{background:linear-gradient(135deg,#182629,#142124);border-color:#35484a}html[data-theme=dark] .dosage-assist-title strong,html[data-theme=dark] .protocol-drug-rp b{color:#edf5f2}html[data-theme=dark] .dosage-assist-title small,html[data-theme=dark] .dosage-source{color:#a4b4b6}html[data-theme=dark] .dosage-controls select,html[data-theme=dark] .dosage-calc,html[data-theme=dark] .protocol-drug-rp,html[data-theme=dark] .dosage-api-state{background:#111d20;color:#e8efed;border-color:#34474a}html[data-theme=dark] .dosage-patient-grid select,html[data-theme=dark] .dosage-patient-grid input{background:#152124;color:#e8efed;border-color:#3a4d50}
      @media(max-width:720px){.dosage-patient-grid{grid-template-columns:1fr 1fr}.dosage-patient-grid>[data-patient-main]{grid-column:1/-1}.dosage-controls{grid-template-columns:1fr}.dosage-controls button{width:100%}.dosage-assist-head{align-items:flex-start}.dosage-source{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function loadCache() {
    try {
      const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!cached || Date.now() - cachedAt > CACHE_MS) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function saveCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    } catch {}
  }

  async function loadDosageData() {
    const cached = loadCache();
    if (cached) dosageData = cached;
    try {
      const response = await fetch('/api/dosage?v=20260722-1', { cache: 'no-store' });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const fresh = await response.json();
      if (fresh && Array.isArray(fresh.forms)) {
        dosageData = fresh;
        saveCache(fresh);
      }
    } catch (error) {
      console.warn('Dozologjia nuk u rifreskua:', error);
      if (!cached) dosageData = { forms: [], adult: [], pediatric: [], meta: {}, error: true };
    }
    window.MEDINDEX_DOSAGE = dosageData;
  }

  function patientContext() {
    const type = $('#protocolPatientType')?.value || 'adult';
    const ageValue = Number($('#protocolAgeValue')?.value || 0);
    const ageUnit = $('#protocolAgeUnit')?.value || 'years';
    return {
      type,
      ageMonths: ageValue > 0 ? (ageUnit === 'months' ? ageValue : ageValue * 12) : null,
      weightKg: Number($('#protocolWeightKg')?.value || 0) || null,
    };
  }

  function updatePatientFields() {
    const pediatric = patientContext().type === 'pediatric';
    document.querySelectorAll('[data-pediatric-only]').forEach(node => { node.hidden = !pediatric; });
    scheduleDecorate();
  }

  function setField(article, field, value, overwrite = true) {
    const input = article.querySelector(`[data-item-field="${field}"]`);
    if (!input || (!overwrite && text(input.value))) return;
    input.value = value ?? '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function fieldValue(article, field) {
    return text(article.querySelector(`[data-item-field="${field}"]`)?.value);
  }

  function formMapping(article) {
    const key = normalize(article.dataset.form);
    return dosageData.forms.find(item => item.formKey === key || normalize(item.form) === key) || null;
  }

  function splitFormPatterns(value) {
    return String(value || '').split(/\s*\/\s*|\s*;\s*/).map(normalize).filter(Boolean);
  }

  function regimenMatchesArticle(regimen, article) {
    const atc = normalize(article.dataset.atc);
    const substance = normalize(article.dataset.substance);
    const form = normalize(article.dataset.form);
    const atcMatch = !regimen.atc || !atc || normalize(regimen.atc) === atc;
    const substanceMatch = !regimen.substance || !substance || substance.includes(normalize(regimen.substance)) || normalize(regimen.substance).includes(substance);
    const patterns = splitFormPatterns(regimen.form);
    const formMatch = !patterns.length || patterns.some(pattern => form.includes(pattern) || pattern.includes(form));
    return atcMatch && substanceMatch && formMatch;
  }

  function eligiblePediatric(regimen, context) {
    if (!regimenMatchesArticle(regimen, context.article)) return false;
    if (context.ageMonths != null) {
      if (regimen.minAgeMonths != null && context.ageMonths < regimen.minAgeMonths) return false;
      if (regimen.maxAgeMonths != null && context.ageMonths > regimen.maxAgeMonths) return false;
    }
    if (context.weightKg != null) {
      if (regimen.minWeightKg != null && context.weightKg < regimen.minWeightKg) return false;
      if (regimen.maxWeightKg != null && context.weightKg > regimen.maxWeightKg) return false;
    }
    return true;
  }

  function matchingRegimens(article) {
    const patient = patientContext();
    if (patient.type === 'pediatric') {
      return dosageData.pediatric.filter(regimen => eligiblePediatric(regimen, { ...patient, article }));
    }
    if (patient.type === 'manual') return [];
    return dosageData.adult.filter(regimen => regimenMatchesArticle(regimen, article));
  }

  function parseConcentration(value) {
    const source = String(value || '').replace(',', '.');
    let match = source.match(/([\d.]+)\s*mg\s*\/\s*([\d.]+)\s*mL/i);
    if (match) return Number(match[1]) / Number(match[2]);
    match = source.match(/([\d.]+)\s*mg\s*\/\s*1\s*mL/i);
    if (match) return Number(match[1]);
    return null;
  }

  function roundClinical(value) {
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) >= 100) return Math.round(value);
    if (Math.abs(value) >= 10) return Math.round(value * 10) / 10;
    return Math.round(value * 100) / 100;
  }

  function adultValues(regimen) {
    const unitCount = text(regimen.unitCount);
    const practicalUnit = text(regimen.practicalUnit);
    const doseMg = text(regimen.doseMg);
    const dose = [doseMg ? `${doseMg} mg` : '', unitCount && practicalUnit ? `(${unitCount} ${practicalUnit})` : ''].filter(Boolean).join(' ');
    return {
      dose,
      route: regimen.route,
      frequency: regimen.frequency,
      duration: regimen.duration,
      quantity: regimen.dispense,
      instructions: [regimen.signatura, regimen.warnings, regimen.renalHepatic].filter(Boolean).join('\n'),
      calculation: '',
    };
  }

  function pediatricValues(regimen) {
    const patient = patientContext();
    const weight = patient.weightKg;
    let doseMg = regimen.fixedDoseMg;
    let volumeMl = regimen.fixedVolumeMl;
    let calculation = regimen.formula || '';

    if (regimen.mgPerKg != null) {
      if (!weight) return { error: 'Shkruaje peshën e fëmijës para aplikimit të formulës.' };
      const perDay = normalize(regimen.basis).includes('dite');
      doseMg = weight * regimen.mgPerKg;
      if (perDay && regimen.dosesPerDay) doseMg /= regimen.dosesPerDay;
      if (regimen.maxSingleMg != null) doseMg = Math.min(doseMg, regimen.maxSingleMg);
      if (regimen.max24hMg != null && regimen.dosesPerDay) doseMg = Math.min(doseMg, regimen.max24hMg / regimen.dosesPerDay);
      calculation = `${weight} kg × ${regimen.mgPerKg} mg/kg${perDay ? '/ditë ÷ ' + (regimen.dosesPerDay || 1) : '/dozë'} = ${roundClinical(doseMg)} mg/dozë`;
    }

    const mgPerMl = parseConcentration(regimen.concentration || articleStrengthFallback(regimen));
    if (volumeMl == null && doseMg != null && mgPerMl) volumeMl = doseMg / mgPerMl;
    doseMg = roundClinical(doseMg);
    volumeMl = roundClinical(volumeMl);

    const dose = [doseMg != null ? `${doseMg} mg` : '', volumeMl != null ? `(${volumeMl} mL)` : ''].filter(Boolean).join(' ');
    let signatura = regimen.signatura || '';
    if (regimen.mgPerKg != null && dose) signatura = `Jep ${volumeMl != null ? volumeMl + ' mL' : doseMg + ' mg'} ${regimen.route ? regimen.route + ' ' : ''}${regimen.frequency || ''}.`.replace(/\s+/g, ' ').trim();

    return {
      dose,
      route: regimen.route,
      frequency: regimen.frequency,
      duration: regimen.duration,
      quantity: '',
      instructions: [signatura, regimen.warnings].filter(Boolean).join('\n'),
      calculation,
    };
  }

  function articleStrengthFallback(regimen) {
    return regimen.concentration || '';
  }

  function regimenLabel(regimen) {
    const parts = [regimen.indication, regimen.referenceStrength || regimen.concentration, regimen.frequency].filter(Boolean);
    return `${regimen.regimenId} — ${parts.join(' · ')}`;
  }

  function applyRegimen(article, regimen, manual = true) {
    const patient = patientContext();
    const values = patient.type === 'pediatric' ? pediatricValues(regimen) : adultValues(regimen);
    if (values.error) {
      window.showProtocolToast ? window.showProtocolToast(values.error) : alert(values.error);
      return false;
    }

    setField(article, 'dose', values.dose, true);
    setField(article, 'route', values.route, true);
    setField(article, 'frequency', values.frequency, true);
    setField(article, 'duration', values.duration, true);
    setField(article, 'quantity', values.quantity, true);
    setField(article, 'instructions', values.instructions, true);
    setField(article, 'regimenId', regimen.regimenId, true);
    setField(article, 'dosageSource', regimen.sourceUrl || '', true);
    setField(article, 'dosageStatus', 'VERIFIKUAR', true);
    setField(article, 'doseCalculation', values.calculation || '', true);
    article.dataset.dosageApplied = regimen.regimenId;
    decorateArticle(article, true);
    if (manual && window.showProtocolToast) window.showProtocolToast('Skema e verifikuar u aplikua; mund ta ndryshosh çdo fushë.');
    return true;
  }

  function applyFormDefaults(article) {
    const mapping = formMapping(article);
    if (!mapping) return null;
    setField(article, 'prefix', mapping.prefix, false);
    if (mapping.routeSuggested) setField(article, 'route', mapping.route, false);
    return mapping;
  }

  function buildAssist(article, regimens, mapping) {
    const existing = article.querySelector('.dosage-assist');
    if (existing) existing.remove();

    const patient = patientContext();
    const regimenId = fieldValue(article, 'regimenId');
    const applied = regimens.find(regimen => regimen.regimenId === regimenId);
    const assist = document.createElement('section');
    assist.className = 'dosage-assist';

    let statusClass = 'manual';
    let statusText = 'Manual';
    let subtitle = 'Nuk ka skemë të publikuar për këtë kombinim.';
    if (applied) {
      statusClass = 'ready';
      statusText = 'Verifikuar';
      subtitle = `Skema ${applied.regimenId} është aplikuar dhe mbetet e editueshme.`;
    } else if (regimens.length) {
      statusText = `${regimens.length} skema`;
      subtitle = patient.type === 'pediatric' ? 'Zgjidhe skemën që përputhet me moshën, peshën dhe indikacionin.' : 'Zgjidhe skemën sipas indikacionit.';
    } else if (patient.type === 'pediatric' && (!patient.ageMonths || !patient.weightKg)) {
      subtitle = 'Plotëso moshën dhe peshën për kërkimin pediatrik.';
    }

    const options = regimens.map(regimen => `<option value="${escapeHtml(regimen.regimenId)}"${regimen.regimenId === regimenId ? ' selected' : ''}>${escapeHtml(regimenLabel(regimen))}</option>`).join('');
    const source = applied?.sourceUrl || fieldValue(article, 'dosageSource');
    const calculation = fieldValue(article, 'doseCalculation');

    assist.innerHTML = `
      <div class="dosage-assist-head">
        <div class="dosage-assist-title"><span class="dosage-assist-icon">Rx</span><div><strong>Auto-fill i dozologjisë</strong><small>${escapeHtml(subtitle)}</small></div></div>
        <span class="dosage-badge ${statusClass}">${escapeHtml(statusText)}</span>
      </div>
      ${regimens.length ? `<div class="dosage-controls"><select aria-label="Zgjidh skemën e dozimit"><option value="">Zgjidh skemën e verifikuar…</option>${options}</select><button type="button">Apliko skemën</button></div>` : ''}
      <div class="dosage-source"><span>${mapping ? `Forma: ${escapeHtml(mapping.prefix)} · Njësia: ${escapeHtml(mapping.unit || '—')}` : 'Forma nuk u gjet në hartën e publikimit.'}</span>${source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Hape burimin</a>` : ''}</div>
      ${calculation ? `<div class="dosage-calc">${escapeHtml(calculation)}</div>` : ''}`;

    const fields = article.querySelector('.protocol-drug-fields');
    fields?.prepend(assist);
    const select = assist.querySelector('select');
    const button = assist.querySelector('button');
    if (select && button) {
      button.disabled = !select.value;
      select.addEventListener('change', () => { button.disabled = !select.value; });
      button.addEventListener('click', () => {
        const regimen = regimens.find(item => item.regimenId === select.value);
        if (regimen) applyRegimen(article, regimen, true);
      });
    }
  }

  function addRpPreview(article) {
    let preview = article.querySelector('.protocol-drug-rp');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'protocol-drug-rp';
      article.querySelector('.protocol-drug-head')?.after(preview);
    }
    const prefix = fieldValue(article, 'prefix');
    const tradeName = text(article.dataset.tradeName);
    const strength = text(article.dataset.strength);
    preview.innerHTML = `<b>Rp.</b>${escapeHtml([prefix, tradeName, strength].filter(Boolean).join(' '))}`;
  }

  function decorateArticle(article, force = false) {
    if (!article || (!force && article.dataset.dosageDecorated === '1')) return;
    article.dataset.dosageDecorated = '1';
    const mapping = applyFormDefaults(article);
    const regimens = matchingRegimens(article);
    addRpPreview(article);
    buildAssist(article, regimens, mapping);

    const patient = patientContext();
    const emptyClinicalFields = ['dose', 'frequency', 'duration'].every(field => !fieldValue(article, field));
    if (regimens.length === 1 && emptyClinicalFields && !article.dataset.autoFillTried && patient.type !== 'manual') {
      article.dataset.autoFillTried = '1';
      applyRegimen(article, regimens[0], false);
    }

    article.querySelectorAll('[data-item-field="prefix"],[data-item-field="dose"],[data-item-field="route"],[data-item-field="frequency"],[data-item-field="duration"]').forEach(input => {
      if (input.dataset.dosageListener) return;
      input.dataset.dosageListener = '1';
      input.addEventListener('input', () => addRpPreview(article));
    });
  }

  function addApiState() {
    const list = $('#protocolDrugList');
    if (!list || $('#dosageApiState')) return;
    const node = document.createElement('div');
    node.id = 'dosageApiState';
    node.className = 'dosage-api-state';
    const meta = dosageData.meta || {};
    node.innerHTML = `<strong>Dozologjia e lidhur:</strong> ${meta.publishedAdultRegimens || 0} skema për të rritur · ${meta.publishedPediatricRegimens || 0} pediatrike · ${meta.publishedForms || dosageData.forms.length || 0} forma. Draft-et nuk publikohen.`;
    list.before(node);
  }

  function decorateAll(force = false) {
    scheduled = false;
    addApiState();
    document.querySelectorAll('#protocolDrugList .protocol-drug').forEach(article => decorateArticle(article, force));
  }

  function scheduleDecorate(force = true) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => decorateAll(force));
  }

  function initPatientControls() {
    $('#protocolPatientType')?.addEventListener('change', updatePatientFields);
    ['protocolAgeValue', 'protocolAgeUnit', 'protocolWeightKg'].forEach(id => {
      $('#' + id)?.addEventListener('input', () => scheduleDecorate(true));
      $('#' + id)?.addEventListener('change', () => scheduleDecorate(true));
    });
    updatePatientFields();
  }

  async function init() {
    addStyles();
    await loadDosageData();
    initPatientControls();
    decorateAll(true);
    new MutationObserver(() => scheduleDecorate(false)).observe(document.getElementById('protocolDrugList') || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
