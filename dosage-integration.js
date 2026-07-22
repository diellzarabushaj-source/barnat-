(() => {
  const CACHE_KEY = 'medindex-dosage-forms-v2';
  const CACHE_TIME_KEY = 'medindex-dosage-forms-time-v2';
  const CACHE_MS = 24 * 60 * 60 * 1000;
  let dosageData = { forms: [], adult: [], pediatric: [], meta: {} };
  let scheduled = false;
  let scheduledForce = false;

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const safeUrl = value => /^https:\/\//i.test(text(value)) ? text(value) : '';

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
      .dosage-assist.is-stale::before{background:#b84d4d}.dosage-assist.is-disabled::before{background:#8a9496}
      .dosage-assist-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dosage-assist-title{display:flex;align-items:center;gap:9px;min-width:0}.dosage-assist-icon{width:31px;height:31px;flex:0 0 auto;border-radius:9px;display:grid;place-items:center;background:#dcecea;color:var(--teal-dark);font-weight:900}.dosage-assist-title strong{display:block;color:var(--teal-dark);font-size:.82rem}.dosage-assist-title small{display:block;margin-top:2px;color:#708084;font-size:.7rem;line-height:1.35}
      .dosage-badge{flex:0 0 auto;padding:5px 8px;border-radius:999px;background:#eef0ef;color:#596568;font-size:.64rem;font-weight:850;text-transform:uppercase;letter-spacing:.04em}.dosage-badge.ready{background:#dcecea;color:#0d3d40}.dosage-badge.edited{background:#fff0d8;color:#7b4c0b}.dosage-badge.stale{background:#f9dddd;color:#862d2d}
      .dosage-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:11px}.dosage-controls select{min-width:0;height:40px;padding:7px 10px;border:1px solid #cbd8d3;border-radius:8px;background:#fff;color:#17252a}.dosage-controls button{height:40px;padding:0 13px;border:0;border-radius:8px;background:var(--teal);color:#fff;font-weight:800;cursor:pointer}.dosage-controls button:disabled{opacity:.45;cursor:not-allowed}
      .dosage-source{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;color:#68777b;font-size:.68rem}.dosage-source a{color:var(--teal);font-weight:800}.dosage-calc{margin-top:8px;padding:8px 10px;border-radius:8px;background:#fff8eb;color:#684718;font-family:var(--mono);font-size:.68rem;line-height:1.45}
      .protocol-drug-rp{margin-top:8px;padding:9px 11px;border-radius:9px;background:#f6f8f7;border:1px solid var(--line);font-family:Georgia,serif}.protocol-drug-rp b{margin-right:7px;font-style:italic;font-size:1.05rem;color:var(--teal-dark)}
      .dosage-api-state{margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#f7faf8;color:#607074;font-size:.72rem;line-height:1.45}.dosage-api-state strong{color:var(--teal-dark)}.dosage-api-state.warning{background:#fff8eb;border-color:#e5c998;color:#684718}
      html[data-theme=dark] .dosage-assist{background:linear-gradient(135deg,#182629,#142124);border-color:#35484a}html[data-theme=dark] .dosage-assist-title strong,html[data-theme=dark] .protocol-drug-rp b{color:#edf5f2}html[data-theme=dark] .dosage-assist-title small,html[data-theme=dark] .dosage-source{color:#a4b4b6}html[data-theme=dark] .dosage-controls select,html[data-theme=dark] .dosage-calc,html[data-theme=dark] .protocol-drug-rp,html[data-theme=dark] .dosage-api-state{background:#111d20;color:#e8efed;border-color:#34474a}html[data-theme=dark] .dosage-patient-grid select,html[data-theme=dark] .dosage-patient-grid input{background:#152124;color:#e8efed;border-color:#3a4d50}
      @media(max-width:720px){.dosage-patient-grid{grid-template-columns:1fr 1fr}.dosage-patient-grid>[data-patient-main]{grid-column:1/-1}.dosage-controls{grid-template-columns:1fr}.dosage-controls button{width:100%}.dosage-assist-head{align-items:flex-start}.dosage-source{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function cachedForms() {
    try {
      const savedAt = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
      const forms = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      return Array.isArray(forms) && Date.now() - savedAt < CACHE_MS ? forms : [];
    } catch { return []; }
  }

  function saveForms(forms) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(forms || []));
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    } catch {}
  }

  async function loadDosageData() {
    const formsFallback = cachedForms();
    dosageData = { forms: formsFallback, adult: [], pediatric: [], meta: { clinicalAutoFillEnabled: false, cacheFallback: Boolean(formsFallback.length) } };
    try {
      const response = await fetch('/api/dosage?v=20260722-3', { cache: 'no-store' });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const fresh = await response.json();
      if (!fresh || !Array.isArray(fresh.forms) || !Array.isArray(fresh.adult) || !Array.isArray(fresh.pediatric)) throw new Error('payload i pavlefshëm');
      dosageData = fresh;
      saveForms(fresh.forms);
    } catch (error) {
      console.warn('Dozologjia klinike nuk u ngarkua; po përdoren vetëm parashtesat e cache-it:', error);
      dosageData.error = true;
    }
    window.MEDINDEX_DOSAGE = dosageData;
  }

  function patientContext() {
    const type = $('#protocolPatientType')?.value || 'adult';
    const ageValue = Number($('#protocolAgeValue')?.value || 0);
    const ageUnit = $('#protocolAgeUnit')?.value || 'years';
    return { type, ageMonths: ageValue > 0 ? (ageUnit === 'months' ? ageValue : ageValue * 12) : null, weightKg: Number($('#protocolWeightKg')?.value || 0) || null };
  }

  function updatePatientFields() {
    const pediatric = patientContext().type === 'pediatric';
    document.querySelectorAll('[data-pediatric-only]').forEach(node => { node.hidden = !pediatric; });
    scheduleDecorate(true);
  }

  function field(article, name) { return article.querySelector(`[data-item-field="${name}"]`); }
  function fieldValue(article, name) { return text(field(article, name)?.value); }
  function setField(article, name, value, overwrite = true) {
    const input = field(article, name);
    if (!input || (!overwrite && text(input.value))) return;
    input.value = value ?? '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function formMapping(article) {
    const key = normalize(article.dataset.form);
    return dosageData.forms.find(item => item.formKey === key || normalize(item.form) === key) || null;
  }

  function splitPatterns(value) { return String(value || '').split(/\s*\/\s*|\s*;\s*/).map(normalize).filter(Boolean); }
  function regimenMatches(regimen, article) {
    const atc = normalize(article.dataset.atc);
    const substance = normalize(article.dataset.substance);
    const form = normalize(article.dataset.form);
    const rSubstance = normalize(regimen.substance);
    const atcMatch = !regimen.atc || !atc || normalize(regimen.atc) === atc;
    const substanceMatch = !rSubstance || !substance || substance.includes(rSubstance) || rSubstance.includes(substance);
    const patterns = splitPatterns(regimen.form);
    const formMatch = !patterns.length || patterns.some(pattern => form.includes(pattern) || pattern.includes(form));
    return atcMatch && substanceMatch && formMatch;
  }

  function eligiblePediatric(regimen, patient, article) {
    if (!regimenMatches(regimen, article) || patient.ageMonths == null) return false;
    if (regimen.minAgeMonths != null && patient.ageMonths < regimen.minAgeMonths) return false;
    if (regimen.maxAgeMonths != null && patient.ageMonths > regimen.maxAgeMonths) return false;
    const needsWeight = regimen.mgPerKg != null || regimen.minWeightKg != null || regimen.maxWeightKg != null;
    if (needsWeight && patient.weightKg == null) return false;
    if (patient.weightKg != null && regimen.minWeightKg != null && patient.weightKg < regimen.minWeightKg) return false;
    if (patient.weightKg != null && regimen.maxWeightKg != null && patient.weightKg > regimen.maxWeightKg) return false;
    return true;
  }

  function matchingRegimens(article) {
    const patient = patientContext();
    if (patient.type === 'manual') return [];
    if (patient.type === 'pediatric') return dosageData.pediatric.filter(regimen => eligiblePediatric(regimen, patient, article));
    return dosageData.adult.filter(regimen => regimenMatches(regimen, article));
  }

  function parseConcentration(value) {
    const match = String(value || '').replace(',', '.').match(/([\d.]+)\s*mg\s*\/\s*([\d.]+)\s*mL/i);
    if (!match) return null;
    const numerator = Number(match[1]); const denominator = Number(match[2]);
    return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;
  }
  function round(value) { return !Number.isFinite(value) ? null : Math.abs(value) >= 100 ? Math.round(value) : Math.abs(value) >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100; }

  function adultValues(regimen) {
    const dose = [regimen.doseMg ? `${regimen.doseMg} mg` : '', regimen.unitCount && regimen.practicalUnit ? `(${regimen.unitCount} ${regimen.practicalUnit})` : ''].filter(Boolean).join(' ');
    return { dose, route: regimen.route, frequency: regimen.frequency, duration: regimen.duration, quantity: regimen.dispense, instructions: regimen.signatura, clinicalNotes: [regimen.warnings, regimen.renalHepatic].filter(Boolean).join('\n'), calculation: '' };
  }

  function pediatricValues(regimen) {
    const patient = patientContext();
    let doseMg = regimen.fixedDoseMg;
    let volumeMl = regimen.fixedVolumeMl;
    let calculation = regimen.formula || '';
    if (regimen.mgPerKg != null) {
      if (!patient.weightKg) return { error: 'Shkruaje peshën e fëmijës para aplikimit të formulës.' };
      const perDay = normalize(regimen.basis).includes('dite');
      doseMg = patient.weightKg * regimen.mgPerKg;
      if (perDay && regimen.dosesPerDay) doseMg /= regimen.dosesPerDay;
      if (regimen.maxSingleMg != null) doseMg = Math.min(doseMg, regimen.maxSingleMg);
      if (regimen.max24hMg != null && regimen.dosesPerDay) doseMg = Math.min(doseMg, regimen.max24hMg / regimen.dosesPerDay);
      calculation = `${patient.weightKg} kg × ${regimen.mgPerKg} mg/kg${perDay ? '/ditë ÷ ' + (regimen.dosesPerDay || 1) : '/dozë'} = ${round(doseMg)} mg/dozë`;
    }
    const mgPerMl = parseConcentration(regimen.concentration);
    if (volumeMl == null && doseMg != null && mgPerMl) volumeMl = doseMg / mgPerMl;
    doseMg = round(doseMg); volumeMl = round(volumeMl);
    const dose = [doseMg != null ? `${doseMg} mg` : '', volumeMl != null ? `(${volumeMl} mL)` : ''].filter(Boolean).join(' ');
    let instructions = regimen.signatura || '';
    if (regimen.mgPerKg != null && dose) instructions = `Jep ${volumeMl != null ? volumeMl + ' mL' : doseMg + ' mg'} ${regimen.route ? regimen.route + ' ' : ''}${regimen.frequency || ''}.`.replace(/\s+/g, ' ').trim();
    return { dose, route: regimen.route, frequency: regimen.frequency, duration: regimen.duration, quantity: '', instructions, clinicalNotes: regimen.warnings || '', calculation };
  }

  function applyRegimen(article, regimen) {
    const values = patientContext().type === 'pediatric' ? pediatricValues(regimen) : adultValues(regimen);
    if (values.error) { if (window.showProtocolToast) window.showProtocolToast(values.error); else alert(values.error); return; }
    article.dataset.applyingDosage = '1';
    ['dose', 'route', 'frequency', 'duration', 'quantity', 'instructions', 'clinicalNotes'].forEach(name => setField(article, name, values[name] || '', true));
    setField(article, 'regimenId', regimen.regimenId, true);
    setField(article, 'dosageSource', safeUrl(regimen.sourceUrl), true);
    setField(article, 'dosageStatus', 'VERIFIKUAR — PA NDRYSHIME', true);
    setField(article, 'doseCalculation', values.calculation || '', true);
    delete article.dataset.applyingDosage;
    decorateArticle(article, true);
    if (window.showProtocolToast) window.showProtocolToast('Skema u aplikua. Kontrolloje dhe ndryshoje vetëm sipas pacientit.');
  }

  function applyFormDefaults(article) {
    const mapping = formMapping(article);
    if (!mapping) return null;
    setField(article, 'prefix', mapping.prefix, false);
    if (mapping.routeSuggested) setField(article, 'route', mapping.route, false);
    return mapping;
  }

  function regimenLabel(regimen) { return `${regimen.regimenId} — ${[regimen.indication, regimen.referenceStrength || regimen.concentration, regimen.frequency].filter(Boolean).join(' · ')}`; }

  function buildAssist(article, regimens, mapping) {
    article.querySelector('.dosage-assist')?.remove();
    const patient = patientContext();
    const regimenId = fieldValue(article, 'regimenId');
    const status = fieldValue(article, 'dosageStatus');
    const applied = regimens.find(regimen => regimen.regimenId === regimenId);
    const stale = Boolean(regimenId && !applied);
    if (stale && status !== 'KËRKON RISHIKIM') setField(article, 'dosageStatus', 'KËRKON RISHIKIM', true);

    const assist = document.createElement('section');
    assist.className = `dosage-assist${stale ? ' is-stale' : ''}${dosageData.meta?.clinicalAutoFillEnabled === false ? ' is-disabled' : ''}`;
    let badgeClass = ''; let badge = 'Manual'; let subtitle = 'Nuk ka skemë të publikuar për këtë kombinim.';
    if (stale) { badgeClass = 'stale'; badge = 'Rishiko'; subtitle = 'Skema e ruajtur nuk përputhet më me pacientin ose mënyrën aktuale. Fushat nuk janë fshirë.'; }
    else if (applied && status.includes('EDITUAR')) { badgeClass = 'edited'; badge = 'Edituar'; subtitle = `Skema ${applied.regimenId} është ndryshuar pas aplikimit.`; }
    else if (applied) { badgeClass = 'ready'; badge = 'Verifikuar'; subtitle = `Skema ${applied.regimenId} është aplikuar pa ndryshime.`; }
    else if (regimens.length) { badge = `${regimens.length} skema`; subtitle = 'Zgjidhe skemën sipas indikacionit dhe aplikoje vetë.'; }
    else if (dosageData.meta?.clinicalAutoFillEnabled === false) subtitle = 'Auto-fill klinik është i bllokuar nga serveri; plotëso manualisht.';
    else if (patient.type === 'pediatric' && patient.ageMonths == null) subtitle = 'Shkruaje moshën për kërkimin pediatrik.';
    else if (patient.type === 'pediatric' && patient.weightKg == null) subtitle = 'Pesha kërkohet për skemat që varen nga kg.';

    const defaultSelection = applied?.regimenId || (regimens.length === 1 ? regimens[0].regimenId : '');
    const options = regimens.map(regimen => `<option value="${esc(regimen.regimenId)}"${regimen.regimenId === defaultSelection ? ' selected' : ''}>${esc(regimenLabel(regimen))}</option>`).join('');
    const source = safeUrl(applied?.sourceUrl || fieldValue(article, 'dosageSource'));
    const calculation = fieldValue(article, 'doseCalculation');
    assist.innerHTML = `<div class="dosage-assist-head"><div class="dosage-assist-title"><span class="dosage-assist-icon">Rx</span><div><strong>Dozologjia e strukturuar</strong><small>${esc(subtitle)}</small></div></div><span class="dosage-badge ${badgeClass}">${esc(badge)}</span></div>
      ${regimens.length ? `<div class="dosage-controls"><select aria-label="Zgjidh skemën"><option value="">Zgjidh skemën…</option>${options}</select><button type="button">${applied ? 'Riapliko skemën' : 'Apliko skemën'}</button></div>` : ''}
      <div class="dosage-source"><span>${mapping ? `Forma: ${esc(mapping.prefix)} · Njësia: ${esc(mapping.unit || '—')}${mapping.routeSuggested ? ' · Rruga: ' + esc(mapping.route) : ''}` : 'Forma nuk u gjet në hartën e publikimit.'}</span>${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Hape burimin</a>` : ''}</div>${calculation ? `<div class="dosage-calc">${esc(calculation)}</div>` : ''}`;
    article.querySelector('.protocol-drug-fields')?.prepend(assist);
    const select = assist.querySelector('select'); const button = assist.querySelector('button');
    if (select && button) {
      button.disabled = !select.value;
      select.addEventListener('change', () => { button.disabled = !select.value; });
      button.addEventListener('click', () => { const regimen = regimens.find(item => item.regimenId === select.value); if (regimen) applyRegimen(article, regimen); });
    }
  }

  function addRpPreview(article) {
    let preview = article.querySelector('.protocol-drug-rp');
    if (!preview) { preview = document.createElement('div'); preview.className = 'protocol-drug-rp'; article.querySelector('.protocol-drug-head')?.after(preview); }
    preview.innerHTML = `<b>Rp.</b>${esc([fieldValue(article, 'prefix'), text(article.dataset.tradeName), text(article.dataset.strength)].filter(Boolean).join(' '))}`;
  }

  function bindEditTracking(article) {
    article.querySelectorAll('[data-item-field]').forEach(input => {
      if (input.dataset.dosageListener) return;
      input.dataset.dosageListener = '1';
      input.addEventListener('input', () => {
        if (['prefix', 'dose', 'route', 'frequency', 'duration'].includes(input.dataset.itemField)) addRpPreview(article);
        const clinicalFields = ['dose', 'route', 'frequency', 'duration', 'quantity', 'instructions', 'clinicalNotes'];
        if (!article.dataset.applyingDosage && clinicalFields.includes(input.dataset.itemField) && fieldValue(article, 'regimenId')) {
          const statusInput = field(article, 'dosageStatus');
          if (statusInput && !statusInput.value.includes('EDITUAR')) setField(article, 'dosageStatus', 'VERIFIKUAR — EDITUAR NGA PËRDORUESJA', true);
        }
      });
    });
  }

  function decorateArticle(article, force = false) {
    if (!article || (!force && article.dataset.dosageDecorated === '1')) return;
    article.dataset.dosageDecorated = '1';
    const mapping = applyFormDefaults(article);
    addRpPreview(article);
    bindEditTracking(article);
    buildAssist(article, matchingRegimens(article), mapping);
  }

  function addApiState() {
    const list = $('#protocolDrugList');
    if (!list) return;
    let node = $('#dosageApiState');
    if (!node) { node = document.createElement('div'); node.id = 'dosageApiState'; node.className = 'dosage-api-state'; list.before(node); }
    const meta = dosageData.meta || {};
    node.classList.toggle('warning', dosageData.error || meta.clinicalAutoFillEnabled === false);
    if (dosageData.error) node.innerHTML = `<strong>Dozologjia klinike nuk u ngarkua.</strong> Po përdoren vetëm ${dosageData.forms.length} parashtesa të ruajtura; dozat dështojnë të mbyllura dhe plotësohen manualisht.`;
    else if (meta.clinicalAutoFillEnabled === false) node.innerHTML = `<strong>Auto-fill klinik i bllokuar.</strong> ${meta.eligibleAdultRegimens || 0} skema për të rritur dhe ${meta.eligiblePediatricRegimens || 0} pediatrike presin aktivizim server-side. ${meta.publishedForms || dosageData.forms.length || 0} forma janë aktive.`;
    else node.innerHTML = `<strong>Dozologjia aktive:</strong> ${meta.publishedAdultRegimens || 0} skema për të rritur · ${meta.publishedPediatricRegimens || 0} pediatrike · ${meta.publishedForms || dosageData.forms.length || 0} forma. Skema aplikohet vetëm pas konfirmimit tënd.`;
  }

  function decorateAll(force = false) {
    scheduled = false;
    document.querySelectorAll('#protocolDrugList .protocol-drug').forEach(article => decorateArticle(article, force));
    addApiState();
  }
  function scheduleDecorate(force = true) {
    scheduledForce = scheduledForce || force;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { const runForce = scheduledForce; scheduledForce = false; decorateAll(runForce); });
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
    new MutationObserver(() => scheduleDecorate(false)).observe($('#protocolDrugList') || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
