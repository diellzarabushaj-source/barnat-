(() => {
  'use strict';

  const STORAGE_KEY = 'regjistriBarnave_protokollet_v1';
  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const Core = window.MedIndexPrescriptionFormat;

  const state = {
    selectedDrugs: [],
    result: null,
    editingId: '',
    source: '',
    searchTimer: 0,
    searchController: null,
    renderTimer: 0,
    generatedReviewConfirmed: false,
  };

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));
  const uid = () => `rx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  function toast(message) {
    const node = $('#rxToast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function setStatus(message = '', type = '') {
    const node = $('#rxStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `rx-status${type ? ` is-${type}` : ''}`;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const button = $('#themeButton');
    if (button) {
      button.textContent = theme === 'dark' ? '☀' : '☾';
      button.setAttribute('aria-label', theme === 'dark' ? 'Aktivizo temën e çelët' : 'Aktivizo temën e errët');
    }
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    const theme = ['dark', 'light'].includes(saved)
      ? saved
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    $('#themeButton')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function getSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function setSaved(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
    renderSaved();
  }

  function normalizeDrug(item) {
    return Core.normalizeDrug(item);
  }

  function addSelectedDrug(raw, { insert = true } = {}) {
    const drug = normalizeDrug(raw);
    if (!drug.substance && !drug.tradeName) return;
    const key = drug.key || `${drug.substance}|${drug.tradeName}|${drug.strength}`;
    if (!state.selectedDrugs.some(item => item.key === key)) state.selectedDrugs.push({ ...drug, key });
    renderSelectedDrugs();
    if (insert) insertAtCursor(`${Core.selectedDrugLine(drug)}\n\n`);
  }

  function removeSelectedDrug(key) {
    state.selectedDrugs = state.selectedDrugs.filter(item => item.key !== key);
    renderSelectedDrugs();
  }

  function renderSelectedDrugs() {
    const holder = $('#rxSelectedDrugs');
    if (!holder) return;
    holder.hidden = !state.selectedDrugs.length;
    holder.innerHTML = state.selectedDrugs.length
      ? `<span class="rx-selected-label">Nga regjistri:</span>${state.selectedDrugs.map(drug => `<span class="rx-drug-chip"><span>${esc(drug.substance || drug.tradeName)}${drug.strength ? ` · ${esc(drug.strength)}` : ''}${drug.form ? ` · ${esc(Core.formLabel(drug.form))}` : ''}</span><button type="button" data-remove-drug="${esc(drug.key)}" aria-label="Hiqe ${esc(drug.substance || drug.tradeName)}">×</button></span>`).join('')}`
      : '';
  }

  function loadSelection() {
    try {
      const items = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || '[]');
      sessionStorage.removeItem(SELECTION_KEY);
      if (!Array.isArray(items) || !items.length) return;
      items.forEach(item => addSelectedDrug(item, { insert:false }));
      const composer = $('#rxComposer');
      if (composer && !text(composer.value)) {
        composer.value = items.map(item => Core.selectedDrugLine(normalizeDrug(item))).filter(Boolean).join('\n\n');
        scheduleLocalPreview();
      }
      setStatus(`${items.length} barna të zgjedhura u bartën nga regjistri.`, 'success');
    } catch {}
  }

  function insertAtCursor(value) {
    const input = $('#rxComposer');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const prefix = before && !before.endsWith('\n') && !/^\s/.test(value) ? ' ' : '';
    input.value = `${before}${prefix}${value}${after}`;
    const cursor = start + prefix.length + value.length;
    input.focus();
    input.setSelectionRange(cursor, cursor);
    input.dispatchEvent(new Event('input', { bubbles:true }));
  }

  function closePopovers(except = '') {
    ['rxFormPopover', 'rxDrugPopover'].forEach(id => {
      const node = document.getElementById(id);
      if (node && id !== except) node.hidden = true;
    });
  }

  function command(commandName) {
    if (commandName === 'form') {
      const node = $('#rxFormPopover');
      closePopovers('rxFormPopover');
      if (node) node.hidden = !node.hidden;
      return;
    }
    if (commandName === 'drug') {
      const node = $('#rxDrugPopover');
      closePopovers('rxDrugPopover');
      if (node) {
        node.hidden = !node.hidden;
        if (!node.hidden) setTimeout(() => $('#rxDrugSearch')?.focus(), 0);
      }
      return;
    }
    closePopovers();
    if (commandName === 'dose') insertAtCursor('Doza: ');
    if (commandName === 'quantity') insertAtCursor('Sasia: Scat. No I (Një kuti)\n');
    if (commandName === 'other') insertAtCursor('Tjetër: ');
    if (commandName === 'signature') insertAtCursor('S (Signatura): ');
  }

  function localParse(input = $('#rxComposer')?.value || '') {
    return Core.parse(input, $('#rxDiagnosis')?.value || '');
  }

  function resultToText(result) {
    return Core.formatText(result);
  }

  function medicationLine(item) {
    return Core.medicationLine(item);
  }

  function hasGeneratedSignature(result) {
    return Core.hasGeneratedSignature(result);
  }

  function reviewRequired() {
    return hasGeneratedSignature(state.result);
  }

  function updateActionState() {
    const hasResult = Boolean(state.result);
    const allowed = hasResult && (!reviewRequired() || state.generatedReviewConfirmed);
    ['rxSave', 'rxCopy', 'rxPrint'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = !allowed;
    });
    const review = $('#rxGeneratedReview');
    if (review) {
      review.hidden = !hasResult || !reviewRequired();
      const checkbox = review.querySelector('input');
      if (checkbox) checkbox.checked = state.generatedReviewConfirmed;
    }
  }

  function resultMarkup(result) {
    const normalized = Core.normalizeResult(result);
    const sections = normalized.sections.map(section => `<section class="rx-paper-section">
      <div class="rx-paper-section-title"><h3>${esc(section.title)}</h3>${section.route ? `<span class="rx-route">${esc(section.route)}</span>` : ''}</div>
      <div class="rx-med-lines">${section.medications.map(item => `<div class="rx-med-line"><div><strong>${esc(medicationLine(item))}</strong>${item.dispenseQuantity ? `<div class="rx-individual-signature"><b>Sasia</b><span>${esc(item.dispenseQuantity)}</span></div>` : ''}${item.other ? `<div class="rx-individual-signature"><b>Tjetër</b><span>${esc(item.other)}</span></div>` : ''}${item.individualSignature ? `<div class="rx-individual-signature${item.signatureGenerated ? ' is-ai' : ''}"><b>${item.signatureGenerated ? 'Signatura e propozuar nga Gemini' : 'Signatura'}</b><span>${esc(item.individualSignature)}</span></div>` : ''}</div><small>${esc(item.form || '')}</small></div>`).join('')}</div>
      ${section.sharedSignature ? `<div class="rx-shared-signature${section.sharedSignatureGenerated ? ' is-ai' : ''}"><b>${section.sharedSignatureGenerated ? 'Signatura e përbashkët e propozuar nga Gemini' : 'Signatura e përbashkët'}</b><span>${esc(section.sharedSignature)}</span></div>` : ''}
    </section>`).join('');
    const missing = normalized.missing.length ? `<div class="rx-missing"><strong>Duhet kontrolluar / plotësuar:</strong><ul>${normalized.missing.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>` : '';
    return `<article class="rx-paper"><header class="rx-paper-head"><div><strong>${esc(normalized.title || 'Recetë')}</strong><small>Dr. Diellza Rabushaj · MedIndex</small></div><time>${new Date().toLocaleDateString('sq-AL')}</time></header><div class="rx-paper-meta">${normalized.diagnosis ? `<span>Diagnoza: ${esc(normalized.diagnosis)}</span>` : ''}<span>${normalized.sections.length} grupe</span><span>${normalized.sections.reduce((sum, section) => sum + section.medications.length, 0)} barna</span></div>${sections}${missing}</article>`;
  }

  function showResult(rawResult, source = 'local') {
    const result = Core.normalizeResult(rawResult);
    if (!result) {
      clearResult();
      return;
    }
    state.result = result;
    state.source = source;
    state.generatedReviewConfirmed = false;
    $('#rxPreview').innerHTML = resultMarkup(result);
    const status = $('#rxState');
    status.className = 'rx-state is-ready';
    status.textContent = source === 'gemini' ? 'Gemini' : 'Draft';
    updateActionState();
  }

  function clearResult() {
    state.result = null;
    state.source = '';
    state.generatedReviewConfirmed = false;
    $('#rxPreview').innerHTML = '<div class="rx-preview-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 5h6M9 3h6v4H9V3ZM6 5H4v16h16V5h-2M8 12h8M8 16h6"/></svg><strong>Parapamja shfaqet këtu</strong><span>Zgjidh barnat ose shkruaje recetën. Signaturën mund ta shkruash vetë ose ta propozosh me Gemini.</span></div>';
    const status = $('#rxState');
    status.className = 'rx-state is-draft';
    status.textContent = 'Draft';
    updateActionState();
  }

  function scheduleLocalPreview() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => {
      const result = localParse();
      if (result) showResult(result, 'local');
      else clearResult();
    }, 220);
  }

  async function generateWithGemini() {
    const input = text($('#rxComposer')?.value);
    const diagnosis = text($('#rxDiagnosis')?.value);
    if (!input && !state.selectedDrugs.length) {
      setStatus('Shkruaje recetën ose zgjidh së paku një bar.', 'error');
      $('#rxComposer')?.focus();
      return;
    }

    const button = $('#rxGenerate');
    button.disabled = true;
    button.querySelector('span:last-child').textContent = 'Duke përgatitur…';
    setStatus(diagnosis
      ? 'Gemini po e strukturon recetën dhe po propozon vetëm Signaturat që mungojnë.'
      : 'Gemini po e strukturon recetën. Pa diagnozë, Signaturat që mungojnë lihen bosh.');

    try {
      const response = await fetch('/api/gemini-prescription', {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Content-Type':'application/json', Accept:'application/json' },
        body:JSON.stringify({
          input,
          diagnosis,
          selectedDrugs:state.selectedDrugs,
          generateMissingSignatures:Boolean(diagnosis),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || 'Gemini nuk e përpunoi recetën.'), { code:payload.code });
      const normalized = Core.normalizeResult(payload.data);
      if (!normalized) throw new Error('Gemini ktheu një strukturë të pavlefshme.');
      showResult(normalized, 'gemini');
      setStatus(hasGeneratedSignature(normalized)
        ? `Receta u përgatit me ${payload.model || 'Gemini'}. Konfirmo kontrollin klinik para ruajtjes, kopjimit ose printimit.`
        : `Receta u strukturua me ${payload.model || 'Gemini'} pa ndryshuar Signaturat manuale.`, 'success');
    } catch (error) {
      const fallback = localParse(input);
      if (fallback) showResult(fallback, 'local');
      const messages = {
        GEMINI_NOT_CONFIGURED:'Gemini nuk ka API key të konfiguruar në Vercel. U përdor formatimi lokal.',
        GEMINI_RATE_LIMIT:'Gemini ka arritur limitin e përkohshëm. U përdor formatimi lokal.',
        GEMINI_AUTH:'Gemini API key nuk u pranua. Kontrollo GEMINI_API_KEY në Vercel.',
        GEMINI_MODEL:'Modeli Gemini i konfiguruar nuk u gjet.',
        GEMINI_TIMEOUT:'Gemini zgjati më shumë se kufiri. U përdor formatimi lokal.',
      };
      setStatus(messages[error.code] || `${error.message} U përdor formatimi lokal.`, 'error');
    } finally {
      button.disabled = false;
      button.querySelector('span:last-child').textContent = 'Përgatit me Gemini';
    }
  }

  function formatLocally() {
    const result = localParse();
    if (!result) {
      setStatus('Nuk u identifikua asnjë bar. Shkruaj emrin dhe fortësinë ose zgjidhe nga @bari.', 'error');
      return;
    }
    showResult(result, 'local');
    setStatus('Teksti u formatua lokalisht. Signaturat e pashkruara nuk u plotësuan.', 'success');
  }

  function resultFromProtocol(protocol) {
    if (Array.isArray(protocol?.sections) && protocol.sections.length) {
      return Core.normalizeResult({
        title:text(protocol.name || protocol.title) || 'Recetë',
        diagnosis:text(protocol.indication || protocol.diagnosis),
        sections:protocol.sections,
        notes:Array.isArray(protocol.notes) ? protocol.notes : text(protocol.notes) ? [text(protocol.notes)] : [],
        missing:Array.isArray(protocol.missing) ? protocol.missing : [],
      });
    }

    const items = Array.isArray(protocol?.items) ? protocol.items : [];
    const groupMeta = new Map((protocol?.administrationGroups || []).map(group => [String(group.id), group]));
    const grouped = new Map();
    const sections = [];

    items.forEach(item => {
      const groupId = text(item.administrationGroupId || item.mixtureGroupId || item.mixtureGroup);
      if (!groupId) {
        sections.push({
          title:text(item.route) ? `Administrim ${text(item.route)}` : 'Bar veçmas',
          type:'other',
          route:text(item.route),
          sharedSignature:'',
          sharedSignatureGenerated:false,
          medications:[{
            form:Core.formLabel(item.form || item.prefix),
            name:text(item.substance || item.tradeName),
            dose:text(item.dose || item.strength),
            quantity:'',
            dispenseQuantity:text(item.quantity),
            other:text(item.clinicalNotes),
            individualSignature:text(item.instructions),
            signatureGenerated:false,
          }],
        });
        return;
      }

      if (!grouped.has(groupId)) {
        const meta = groupMeta.get(groupId) || {};
        const section = {
          title:text(meta.title || item.administrationGroupTitle || item.mixtureGroup) || 'Grup administrimi',
          type:text(meta.type || item.administrationGroupType || item.mixtureType) || 'other',
          route:text(meta.route || item.administrationRoute || item.route),
          sharedSignature:text(meta.signature || item.sharedSignature || item.instructions),
          sharedSignatureGenerated:false,
          medications:[],
        };
        grouped.set(groupId, section);
        sections.push(section);
      }

      grouped.get(groupId).medications.push({
        form:Core.formLabel(item.form || item.prefix),
        name:text(item.substance || item.tradeName),
        dose:text(item.dose || item.strength),
        quantity:text(item.mixtureRole === 'base' ? item.quantity : ''),
        dispenseQuantity:text(item.mixtureRole === 'base' ? '' : item.quantity),
        other:text(item.clinicalNotes),
        individualSignature:'',
        signatureGenerated:false,
      });
    });

    return Core.normalizeResult({
      title:text(protocol?.name) || 'Recetë',
      diagnosis:text(protocol?.indication),
      sections,
      notes:text(protocol?.notes) ? [text(protocol.notes)] : [],
      missing:[],
    });
  }

  function protocolFromResult(result) {
    const now = new Date().toISOString();
    const existing = state.editingId ? getSaved().find(item => String(item.id) === String(state.editingId)) : null;
    const normalized = Core.normalizeResult(result);
    const items = normalized.sections.flatMap((section, sectionIndex) => section.medications.map((item, itemIndex) => ({
      drugKey:state.selectedDrugs.find(drug => [drug.substance, drug.tradeName].includes(item.name))?.key || `manual_${sectionIndex}_${itemIndex}_${item.name}`,
      tradeName:'',
      substance:item.name,
      strength:item.dose,
      form:item.form,
      prefix:item.form,
      dose:item.dose,
      quantity:item.dispenseQuantity || item.quantity,
      route:section.route,
      frequency:'',
      duration:'',
      instructions:item.individualSignature || section.sharedSignature,
      clinicalNotes:item.other,
      administrationGroupId:section.medications.length > 1 ? `section_${sectionIndex}` : '',
      administrationGroupType:section.type,
      administrationGroupTitle:section.title,
      administrationRoute:section.route,
      sharedSignature:section.sharedSignature,
      mixtureRole:section.type === 'infusion' && itemIndex === 0 ? 'base' : 'additive',
      qualityStatus:'verified',
    })));

    return {
      id:state.editingId || uid(),
      name:normalized.title || `Recetë – ${new Date().toLocaleDateString('sq-AL')}`,
      indication:normalized.diagnosis || text($('#rxDiagnosis')?.value),
      allergies:'', population:'', patientName:'', birthDate:'', patientId:'', patientType:'adult',
      notes:normalized.notes,
      missing:normalized.missing,
      sections:normalized.sections,
      sourceText:$('#rxComposer')?.value || resultToText(normalized),
      selectedDrugs:state.selectedDrugs,
      formatVersion:3,
      aiStructured:state.source === 'gemini',
      generatedSignatureReviewed:state.generatedReviewConfirmed,
      clinicalReview:false,
      reviewedAt:'',
      createdAt:existing?.createdAt || now,
      updatedAt:now,
      items,
    };
  }

  function ensureActionAllowed() {
    if (!state.result) return false;
    if (reviewRequired() && !state.generatedReviewConfirmed) {
      setStatus('Konfirmo kontrollin klinik të Signaturave të propozuara nga Gemini.', 'error');
      $('#rxGeneratedReview input')?.focus();
      return false;
    }
    return true;
  }

  function saveCurrent() {
    if (!ensureActionAllowed()) return;
    const protocol = protocolFromResult(state.result);
    const all = getSaved();
    const index = all.findIndex(item => String(item.id) === String(protocol.id));
    if (index >= 0) all[index] = protocol;
    else all.unshift(protocol);
    state.editingId = protocol.id;
    setSaved(all);
    toast('Receta u ruajt.');
    setStatus('Receta u ruajt në këtë shfletues.', 'success');
  }

  async function copyCurrent() {
    if (!ensureActionAllowed()) return;
    const value = resultToText(state.result);
    try { await navigator.clipboard.writeText(value); }
    catch {
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast('Receta u kopjua.');
  }

  function printCurrent() {
    if (!ensureActionAllowed()) return;
    const normalized = Core.normalizeResult(state.result);
    const popup = window.open('', '_blank', 'width=920,height=780');
    if (!popup) { toast('Shfletuesi e bllokoi dritaren e printimit.'); return; }
    popup.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(normalized.title || 'Recetë')}</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:32px auto;padding:0 24px;color:#172f31;line-height:1.48}.head{display:flex;justify-content:space-between;border-bottom:3px solid #0d5559;padding-bottom:12px}.head b{font-size:25px}.review{margin:14px 0;padding:8px 10px;background:#fff2db;border-left:4px solid #c77d1f;font-size:12px}.section{padding:16px 0;border-bottom:1px solid #d6dfdc}.med{padding:5px 0;font-weight:700}.qty,.sig,.other{margin-top:6px;padding:8px 10px;background:#f5f7f5}.sig{border-left:4px solid #c77d1f}.sig b,.qty b,.other b{display:block;font-size:10px;text-transform:uppercase;margin-bottom:4px}@media print{body{margin:0}.review,.section{break-inside:avoid}}</style></head><body><div class="head"><div><b>MedIndex</b><div>Dr. Diellza Rabushaj</div></div><div>${new Date().toLocaleDateString('sq-AL')}</div></div><div class="review"><b>KONTROLL KLINIK:</b> Verifiko diagnozën, dozën, rrugën, frekuencën, kohëzgjatjen, alergjitë dhe kompatibilitetin para përdorimit.</div><h1>${esc(normalized.title || 'Recetë')}</h1>${normalized.diagnosis ? `<p><b>Diagnoza:</b> ${esc(normalized.diagnosis)}</p>` : ''}${normalized.sections.map(section => `<section class="section">${section.medications.map(item => `<div class="med">${esc(medicationLine(item))}</div>${item.dispenseQuantity ? `<div class="qty"><b>Sasia</b>${esc(item.dispenseQuantity)}</div>` : ''}${item.other ? `<div class="other"><b>Tjetër</b>${esc(item.other)}</div>` : ''}${item.individualSignature ? `<div class="sig"><b>S (Signatura)</b>${esc(item.individualSignature)}</div>` : ''}`).join('')}${section.sharedSignature ? `<div class="sig"><b>S (Signatura)</b>${esc(section.sharedSignature)}</div>` : ''}</section>`).join('')}<script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  function resetComposer() {
    state.editingId = '';
    state.selectedDrugs = [];
    state.generatedReviewConfirmed = false;
    $('#rxComposer').value = '';
    $('#rxDiagnosis').value = '';
    renderSelectedDrugs();
    clearResult();
    closePopovers();
    setStatus('');
    $('#rxComposer').focus();
  }

  function openSaved(id) {
    const protocol = getSaved().find(item => String(item.id) === String(id));
    if (!protocol) return;
    state.editingId = protocol.id;
    state.selectedDrugs = Array.isArray(protocol.selectedDrugs) ? protocol.selectedDrugs.map(normalizeDrug) : [];
    renderSelectedDrugs();
    const result = resultFromProtocol(protocol);
    $('#rxDiagnosis').value = result?.diagnosis || '';
    $('#rxComposer').value = text(protocol.sourceText) || resultToText(result);
    showResult(result, protocol.aiStructured ? 'gemini' : 'local');
    state.generatedReviewConfirmed = Boolean(protocol.generatedSignatureReviewed && hasGeneratedSignature(result));
    updateActionState();
    window.scrollTo({ top:0, behavior:'smooth' });
    setStatus('Receta e ruajtur u hap për editim.', 'success');
  }

  function duplicateSaved(id) {
    const protocol = getSaved().find(item => String(item.id) === String(id));
    if (!protocol) return;
    const now = new Date().toISOString();
    const copy = {
      ...protocol,
      id:uid(),
      name:`${text(protocol.name) || 'Recetë'} — kopje`,
      createdAt:now,
      updatedAt:now,
      clinicalReview:false,
      reviewedAt:'',
      generatedSignatureReviewed:false,
    };
    setSaved([copy, ...getSaved()]);
    toast('U krijua një kopje.');
  }

  function deleteSaved(id) {
    setSaved(getSaved().filter(item => String(item.id) !== String(id)));
    if (state.editingId === id) state.editingId = '';
    toast('Receta u fshi.');
  }

  function renderSaved() {
    const list = $('#rxSavedList');
    if (!list) return;
    const query = text($('#rxSavedSearch')?.value).toLocaleLowerCase('sq');
    const all = getSaved();
    $('#rxSavedCount').textContent = all.length;
    const filtered = all.filter(protocol => `${protocol.name || ''} ${protocol.indication || ''}`.toLocaleLowerCase('sq').includes(query));
    if (!filtered.length) {
      list.innerHTML = `<div class="rx-saved-empty">${all.length ? 'Nuk u gjet asnjë recetë për këtë kërkim.' : 'Ende nuk ka receta të ruajtura.'}</div>`;
      return;
    }
    list.innerHTML = filtered.map(protocol => {
      const result = resultFromProtocol(protocol);
      const medicationCount = result?.sections.reduce((sum, section) => sum + section.medications.length, 0) || 0;
      return `<article class="rx-saved-card"><div class="rx-saved-card-head"><h3>${esc(result?.title || 'Recetë')}</h3><time>${new Date(protocol.updatedAt || Date.now()).toLocaleDateString('sq-AL')}</time></div><p>${esc(result?.diagnosis || 'Pa diagnozë të shënuar')}</p><div class="rx-saved-tags"><span>${result?.sections.length || 0} grupe</span><span>${medicationCount} barna</span>${protocol.aiStructured ? '<span>Gemini</span>' : ''}</div><div class="rx-saved-actions"><button type="button" data-open-saved="${esc(protocol.id)}">Hape</button><button type="button" data-duplicate-saved="${esc(protocol.id)}">Dupliko</button><button class="danger" type="button" data-delete-saved="${esc(protocol.id)}" aria-label="Fshije">×</button></div></article>`;
    }).join('');
  }

  async function searchDrugs(query) {
    const holder = $('#rxDrugResults');
    const value = text(query);
    if (value.length < 2) {
      holder.innerHTML = '<p>Shkruaj së paku 2 shkronja.</p>';
      return;
    }
    state.searchController?.abort();
    state.searchController = new AbortController();
    holder.innerHTML = '<p>Duke kërkuar…</p>';
    try {
      const response = await fetch(`/api/drug-search?q=${encodeURIComponent(value)}`, {
        credentials:'same-origin',
        signal:state.searchController.signal,
        headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Kërkimi dështoi.');
      holder.innerHTML = payload.results?.length
        ? payload.results.map(drug => `<button class="rx-drug-result" type="button" data-drug-result="${esc(encodeURIComponent(JSON.stringify(drug)))}"><span><strong>${esc(drug.substance || drug.tradeName)}</strong><small>${esc([drug.tradeName, drug.strength, Core.formLabel(drug.form)].filter(Boolean).join(' · '))}</small></span><span>+</span></button>`).join('')
        : '<p>Nuk u gjet asnjë bar.</p>';
    } catch (error) {
      if (error.name !== 'AbortError') holder.innerHTML = `<p>${esc(error.message)}</p>`;
    }
  }

  function bindEvents() {
    document.querySelectorAll('[data-rx-command]').forEach(button => button.addEventListener('click', () => command(button.dataset.rxCommand)));
    $('#rxFormPopover')?.addEventListener('click', event => {
      const button = event.target.closest('[data-form-value]');
      if (!button) return;
      insertAtCursor(`(${Core.formLabel(button.dataset.formValue)}) `);
      closePopovers();
    });
    $('#rxDrugSearch')?.addEventListener('input', event => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => searchDrugs(event.target.value), 170);
    });
    $('#rxDrugResults')?.addEventListener('click', event => {
      const button = event.target.closest('[data-drug-result]');
      if (!button) return;
      try { addSelectedDrug(JSON.parse(decodeURIComponent(button.dataset.drugResult))); } catch {}
      closePopovers();
    });
    $('#rxSelectedDrugs')?.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-drug]');
      if (button) removeSelectedDrug(button.dataset.removeDrug);
    });
    $('#rxComposer')?.addEventListener('input', scheduleLocalPreview, { passive:true });
    $('#rxComposer')?.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        generateWithGemini();
      }
    });
    $('#rxDiagnosis')?.addEventListener('input', scheduleLocalPreview, { passive:true });
    $('#rxGenerate')?.addEventListener('click', generateWithGemini);
    $('#rxFormatLocal')?.addEventListener('click', formatLocally);
    $('#rxClear')?.addEventListener('click', resetComposer);
    $('#rxNew')?.addEventListener('click', resetComposer);
    $('#rxSave')?.addEventListener('click', saveCurrent);
    $('#rxCopy')?.addEventListener('click', copyCurrent);
    $('#rxPrint')?.addEventListener('click', printCurrent);
    $('#rxGeneratedReview input')?.addEventListener('change', event => {
      state.generatedReviewConfirmed = Boolean(event.target.checked);
      updateActionState();
      setStatus(state.generatedReviewConfirmed ? 'Kontrolli klinik u konfirmua.' : 'Konfirmimi u hoq.', state.generatedReviewConfirmed ? 'success' : '');
    });
    $('#rxSavedSearch')?.addEventListener('input', renderSaved, { passive:true });
    $('#rxSavedList')?.addEventListener('click', event => {
      const open = event.target.closest('[data-open-saved]');
      const duplicate = event.target.closest('[data-duplicate-saved]');
      const remove = event.target.closest('[data-delete-saved]');
      if (open) openSaved(open.dataset.openSaved);
      if (duplicate) duplicateSaved(duplicate.dataset.duplicateSaved);
      if (remove) deleteSaved(remove.dataset.deleteSaved);
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.rx-command-bar,.rx-popover')) closePopovers();
    });
  }

  function init() {
    if (!Core) {
      setStatus('Moduli i formatimit të recetës nuk u ngarkua. Rifresko faqen.', 'error');
      return;
    }
    initTheme();
    bindEvents();
    renderSaved();
    loadSelection();
    updateActionState();
    $('#rxComposer')?.focus({ preventScroll:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
