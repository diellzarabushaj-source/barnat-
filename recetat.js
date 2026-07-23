(() => {
  'use strict';

  const STORAGE_KEY = 'regjistriBarnave_protokollet_v1';
  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const FORM_PREFIXES = {
    tablet:'Tab.', capsule:'Caps.', ampoule:'Amp.', injection:'Amp.', infusion:'Inf.',
    ointment:'Ung.', cream:'Ung.', solution:'Sol.', syrup:'Sir.', suppository:'Sup.',
    drops:'Gtt.', inhalation:'Inh.', spray:'Inh.', vial:'Fl.'
  };
  const state = {
    selectedDrugs: [],
    result: null,
    editingId: '',
    source: '',
    searchTimer: 0,
    searchController: null,
    renderTimer: 0,
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
    return {
      key: text(item?.key || item?.drugKey || `${item?.pdid || ''}|${item?.tradeName || ''}|${item?.strength || ''}`),
      tradeName: text(item?.tradeName),
      substance: text(item?.substance),
      strength: text(item?.strength || item?.dose),
      form: text(item?.form),
      atc: text(item?.atc),
      pdid: text(item?.pdid),
    };
  }

  function formPrefix(form) {
    const normalized = text(form).toLocaleLowerCase('en');
    const match = Object.entries(FORM_PREFIXES).find(([needle]) => normalized.includes(needle));
    return match?.[1] || '';
  }

  function addSelectedDrug(raw, { insert = true } = {}) {
    const drug = normalizeDrug(raw);
    if (!drug.substance && !drug.tradeName) return;
    const key = drug.key || `${drug.substance}|${drug.tradeName}|${drug.strength}`;
    if (!state.selectedDrugs.some(item => item.key === key)) state.selectedDrugs.push({ ...drug, key });
    renderSelectedDrugs();
    if (insert) {
      const prefix = formPrefix(drug.form);
      insertAtCursor([prefix, drug.substance || drug.tradeName, drug.strength].filter(Boolean).join(' ') + '\n');
    }
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
      ? `<span class="rx-selected-label">Nga regjistri:</span>${state.selectedDrugs.map(drug => `<span class="rx-drug-chip"><span>${esc(drug.substance || drug.tradeName)}${drug.strength ? ` · ${esc(drug.strength)}` : ''}</span><button type="button" data-remove-drug="${esc(drug.key)}" aria-label="Hiqe ${esc(drug.substance || drug.tradeName)}">×</button></span>`).join('')}`
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
        composer.value = items.map(item => {
          const drug = normalizeDrug(item);
          return [formPrefix(drug.form), drug.substance || drug.tradeName, drug.strength].filter(Boolean).join(' ');
        }).filter(Boolean).join('\n');
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

  function command(command) {
    if (command === 'form') {
      const node = $('#rxFormPopover');
      closePopovers('rxFormPopover');
      if (node) node.hidden = !node.hidden;
      return;
    }
    if (command === 'drug') {
      const node = $('#rxDrugPopover');
      closePopovers('rxDrugPopover');
      if (node) {
        node.hidden = !node.hidden;
        if (!node.hidden) setTimeout(() => $('#rxDrugSearch')?.focus(), 0);
      }
      return;
    }
    closePopovers();
    if (command === 'dose') insertAtCursor('Doza: ');
    if (command === 'other') insertAtCursor('Tjetër: ');
    if (command === 'signature') insertAtCursor('\nS: ');
  }

  function localMedication(line) {
    const match = line.match(/^(Tab\.?|Caps\.?|Amp\.?|Inf\.?|Ung\.?|Sol\.?|Sir\.?|Sup\.?|Gtt\.?|Inh\.?|Inj\.?|Fl\.?|Vial\.?)\s+(.+)$/i);
    if (!match) return null;
    const form = match[1].endsWith('.') ? match[1] : `${match[1]}.`;
    let rest = text(match[2]);
    let quantity = '';
    const quantityMatch = rest.match(/\s+a\s+([\d.,]+\s*(?:ml|mL|l|L|g|tableta?|kapsula?|ampula?))\s*$/i);
    if (quantityMatch) {
      quantity = `a ${quantityMatch[1]}`;
      rest = text(rest.slice(0, quantityMatch.index));
    }
    const doseMatches = [...rest.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ug|ml|mL|IU|UI|NJ|%)(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:ml|mL|g))?/gi)];
    const doseMatch = doseMatches.at(-1);
    const dose = doseMatch ? text(doseMatch[0]) : '';
    const name = doseMatch ? text(`${rest.slice(0, doseMatch.index)} ${rest.slice((doseMatch.index || 0) + doseMatch[0].length)}`) : rest;
    return { form, name:name || rest, dose, quantity, other:'', individualSignature:'' };
  }

  function inferType(medications, signature) {
    const forms = medications.map(item => item.form.toLocaleLowerCase('sq'));
    const sign = text(signature).toLocaleLowerCase('sq');
    if (forms.some(form => form.startsWith('inf')) || /infuzion|përzi|perzi|tretës|tretes/.test(sign)) return 'infusion';
    if (forms.every(form => /^(amp|inj|fl|vial)/.test(form))) return 'injection';
    if (forms.every(form => /^(tab|caps|sir|sol|gtt)/.test(form))) return 'oral';
    if (forms.some(form => /^(ung)/.test(form))) return 'topical';
    if (forms.some(form => /^(inh)/.test(form))) return 'inhalation';
    return 'other';
  }

  function inferRoute(type, signature, lines) {
    const value = `${signature} ${lines.join(' ')}`.toUpperCase();
    for (const route of ['IV', 'IM', 'SC', 'PO', 'PR', 'INH']) {
      if (new RegExp(`\\b${route}\\b`).test(value)) return route;
    }
    if (type === 'infusion') return 'IV';
    if (type === 'oral') return 'PO';
    return '';
  }

  function blockToSection(lines, index, missing) {
    const medications = [];
    const signatureParts = [];
    let readingSignature = false;
    lines.forEach(raw => {
      const line = text(raw).replace(/^Rp\s*:\s*/i, '');
      if (!line) return;
      const signatureMatch = line.match(/^(?:S\.?|Signatura)\s*:\s*(.*)$/i);
      if (signatureMatch) {
        readingSignature = true;
        if (signatureMatch[1]) signatureParts.push(signatureMatch[1]);
        return;
      }
      const medication = localMedication(line);
      if (medication) {
        readingSignature = false;
        medications.push(medication);
        return;
      }
      if (readingSignature) signatureParts.push(line);
      else if (medications.length) medications[medications.length - 1].other = [medications.at(-1).other, line].filter(Boolean).join(' · ');
    });
    if (!medications.length) return null;
    const signature = text(signatureParts.join(' '));
    const type = inferType(medications, signature);
    const route = inferRoute(type, signature, lines);
    if (!signature) missing.push(`Grupi ${index + 1}: mungon Signatura.`);
    medications.forEach((item, medicationIndex) => {
      if (!item.dose) missing.push(`${item.name || `Bari ${medicationIndex + 1}`}: mungon doza/fortësia.`);
    });
    if (medications.length === 1) medications[0].individualSignature = signature;
    const titles = { infusion:'Infuzion', injection:'Injeksione', oral:'Barna orale', topical:'Përdorim lokal', inhalation:'Inhalim', other:'Administrim' };
    return {
      title: `${titles[type]}${route ? ` ${route}` : ''}`,
      type,
      route,
      sharedSignature: medications.length > 1 ? signature : '',
      medications,
    };
  }

  function localParse(input = $('#rxComposer')?.value || '') {
    const raw = String(input || '').replace(/\r/g, '').trim();
    const missing = [];
    if (!raw) return null;
    const blocks = raw.split(/\n\s*\n+|(?=^\s*Rp\s*:)/gim).map(block => block.split('\n')).filter(block => block.some(line => text(line)));
    const sections = blocks.map((block, index) => blockToSection(block, index, missing)).filter(Boolean);
    if (!sections.length) {
      const fallback = blockToSection(raw.split('\n'), 0, missing);
      if (fallback) sections.push(fallback);
    }
    if (!sections.length) return null;
    return {
      title: text($('#rxDiagnosis')?.value) ? `Recetë – ${text($('#rxDiagnosis').value)}` : `Recetë – ${new Date().toLocaleDateString('sq-AL')}`,
      diagnosis: text($('#rxDiagnosis')?.value),
      sections,
      notes: [],
      missing: [...new Set(missing)],
    };
  }

  function medicationLine(item) {
    return [item.form, item.name, item.dose, item.quantity].filter(Boolean).join(' ');
  }

  function resultToText(result) {
    const lines = ['Rp:'];
    (result?.sections || []).forEach((section, sectionIndex) => {
      if (sectionIndex) lines.push('', 'Rp:');
      section.medications.forEach(item => {
        lines.push(medicationLine(item));
        if (item.other) lines.push(`Tjetër: ${item.other}`);
        if (item.individualSignature) lines.push(`S: ${item.individualSignature}`);
      });
      if (section.sharedSignature) lines.push(`S: ${section.sharedSignature}`);
    });
    if (result?.notes?.length) {
      lines.push('');
      result.notes.forEach(note => lines.push(`Shënim: ${note}`));
    }
    return lines.join('\n');
  }

  function resultMarkup(result) {
    const sections = (result.sections || []).map(section => `<section class="rx-paper-section">
      <div class="rx-paper-section-title"><h3>${esc(section.title)}</h3>${section.route ? `<span class="rx-route">${esc(section.route)}</span>` : ''}</div>
      <div class="rx-med-lines">${section.medications.map(item => `<div class="rx-med-line"><div><strong>${esc(medicationLine(item))}</strong>${item.other ? `<div class="rx-individual-signature"><b>Tjetër</b><span>${esc(item.other)}</span></div>` : ''}${item.individualSignature ? `<div class="rx-individual-signature"><b>Signatura</b><span>${esc(item.individualSignature)}</span></div>` : ''}</div><small>${esc(item.form || '')}</small></div>`).join('')}</div>
      ${section.sharedSignature ? `<div class="rx-shared-signature"><b>Signatura e përbashkët</b><span>${esc(section.sharedSignature)}</span></div>` : ''}
    </section>`).join('');
    const missing = result.missing?.length ? `<div class="rx-missing"><strong>Duhet kontrolluar / plotësuar:</strong><ul>${result.missing.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>` : '';
    return `<article class="rx-paper"><header class="rx-paper-head"><div><strong>${esc(result.title || 'Recetë')}</strong><small>Dr. Diellza Rabushaj · MedIndex</small></div><time>${new Date().toLocaleDateString('sq-AL')}</time></header><div class="rx-paper-meta">${result.diagnosis ? `<span>Diagnoza: ${esc(result.diagnosis)}</span>` : ''}<span>${(result.sections || []).length} grupe</span><span>${(result.sections || []).reduce((sum, section) => sum + section.medications.length, 0)} barna</span></div>${sections}${missing}</article>`;
  }

  function showResult(result, source = 'local') {
    state.result = result;
    state.source = source;
    $('#rxPreview').innerHTML = resultMarkup(result);
    const status = $('#rxState');
    status.className = 'rx-state is-ready';
    status.textContent = source === 'gemini' ? 'Gemini' : 'Draft';
    ['rxSave', 'rxCopy', 'rxPrint'].forEach(id => { const button = document.getElementById(id); if (button) button.disabled = false; });
  }

  function clearResult() {
    state.result = null;
    state.source = '';
    $('#rxPreview').innerHTML = '<div class="rx-preview-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 5h6M9 3h6v4H9V3ZM6 5H4v16h16V5h-2M8 12h8M8 16h6"/></svg><strong>Parapamja shfaqet këtu</strong><span>Shkruaje ose ngjite recetën dhe kliko “Strukturo me Gemini”.</span></div>';
    const status = $('#rxState');
    status.className = 'rx-state is-draft';
    status.textContent = 'Draft';
    ['rxSave', 'rxCopy', 'rxPrint'].forEach(id => { const button = document.getElementById(id); if (button) button.disabled = true; });
  }

  function scheduleLocalPreview() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => {
      const result = localParse();
      if (result) showResult(result, 'local');
      else clearResult();
    }, 240);
  }

  async function generateWithGemini() {
    const input = text($('#rxComposer')?.value);
    if (!input && !state.selectedDrugs.length) {
      setStatus('Shkruaje recetën ose zgjidh së paku një bar.', 'error');
      $('#rxComposer')?.focus();
      return;
    }
    const button = $('#rxGenerate');
    button.disabled = true;
    button.querySelector('span:last-child').textContent = 'Duke strukturuar…';
    setStatus('Gemini po e strukturon tekstin pa shtuar të dhëna të reja.');
    try {
      const response = await fetch('/api/gemini-prescription', {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Content-Type':'application/json', Accept:'application/json' },
        body:JSON.stringify({ input, diagnosis:text($('#rxDiagnosis')?.value), selectedDrugs:state.selectedDrugs }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || 'Gemini nuk e përpunoi recetën.'), { code:payload.code });
      showResult(payload.data, 'gemini');
      setStatus(`Receta u strukturua me ${payload.model || 'Gemini'}. Kontrolloje para përdorimit.`, 'success');
    } catch (error) {
      const fallback = localParse(input);
      if (fallback) showResult(fallback, 'local');
      const configured = error.code !== 'GEMINI_NOT_CONFIGURED';
      setStatus(configured ? `${error.message} U përdor formatimi lokal.` : 'Gemini nuk është konfiguruar ende; u përdor formatimi lokal.', configured ? 'error' : '');
    } finally {
      button.disabled = false;
      button.querySelector('span:last-child').textContent = 'Strukturo me Gemini';
    }
  }

  function formatLocally() {
    const result = localParse();
    if (!result) {
      setStatus('Nuk u identifikua asnjë rresht që fillon me formë si Amp., Inf., Tab. ose Caps.', 'error');
      return;
    }
    showResult(result, 'local');
    setStatus('Teksti u formatua lokalisht. Kontrolloje dhe plotëso fushat që mungojnë.', 'success');
  }

  function resultFromProtocol(protocol) {
    if (Array.isArray(protocol?.sections) && protocol.sections.length) {
      return {
        title:text(protocol.name || protocol.title) || 'Recetë',
        diagnosis:text(protocol.indication || protocol.diagnosis),
        sections:protocol.sections,
        notes:Array.isArray(protocol.notes) ? protocol.notes : text(protocol.notes) ? [text(protocol.notes)] : [],
        missing:Array.isArray(protocol.missing) ? protocol.missing : [],
      };
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
          type:inferType([{ form:text(item.prefix || item.form) }], item.instructions),
          route:text(item.route),
          sharedSignature:'',
          medications:[{ form:text(item.prefix), name:text(item.substance || item.tradeName), dose:text(item.dose || item.strength), quantity:text(item.quantity), other:text(item.clinicalNotes), individualSignature:text(item.instructions) }],
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
          medications:[],
        };
        grouped.set(groupId, section);
        sections.push(section);
      }
      grouped.get(groupId).medications.push({ form:text(item.prefix), name:text(item.substance || item.tradeName), dose:text(item.dose || item.strength), quantity:text(item.quantity), other:text(item.clinicalNotes), individualSignature:'' });
    });
    return {
      title:text(protocol?.name) || 'Recetë',
      diagnosis:text(protocol?.indication),
      sections,
      notes:text(protocol?.notes) ? [text(protocol.notes)] : [],
      missing:[],
    };
  }

  function protocolFromResult(result) {
    const now = new Date().toISOString();
    const existing = state.editingId ? getSaved().find(item => String(item.id) === String(state.editingId)) : null;
    const items = result.sections.flatMap((section, sectionIndex) => section.medications.map((item, itemIndex) => ({
      drugKey:state.selectedDrugs.find(drug => [drug.substance, drug.tradeName].includes(item.name))?.key || `manual_${sectionIndex}_${itemIndex}_${item.name}`,
      tradeName:'', substance:item.name, strength:item.dose, form:item.form, prefix:item.form, dose:item.dose,
      quantity:item.quantity, route:section.route, frequency:'', duration:'', instructions:item.individualSignature || section.sharedSignature,
      clinicalNotes:item.other, administrationGroupId:section.medications.length > 1 ? `section_${sectionIndex}` : '',
      administrationGroupType:section.type, administrationGroupTitle:section.title, administrationRoute:section.route,
      sharedSignature:section.sharedSignature, mixtureRole:section.type === 'infusion' && itemIndex === 0 ? 'base' : 'additive',
      qualityStatus:'verified',
    })));
    return {
      id:state.editingId || uid(),
      name:result.title || `Recetë – ${new Date().toLocaleDateString('sq-AL')}`,
      indication:result.diagnosis || text($('#rxDiagnosis')?.value),
      allergies:'', population:'', patientName:'', birthDate:'', patientId:'', patientType:'adult',
      notes:result.notes || [], missing:result.missing || [], sections:result.sections,
      sourceText:$('#rxComposer')?.value || resultToText(result), selectedDrugs:state.selectedDrugs,
      formatVersion:2, aiStructured:state.source === 'gemini', clinicalReview:false, reviewedAt:'',
      createdAt:existing?.createdAt || now, updatedAt:now, items,
    };
  }

  function saveCurrent() {
    if (!state.result) return;
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
    if (!state.result) return;
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
    if (!state.result) return;
    const popup = window.open('', '_blank', 'width=920,height=780');
    if (!popup) { toast('Shfletuesi e bllokoi dritaren e printimit.'); return; }
    popup.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(state.result.title || 'Recetë')}</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:32px auto;padding:0 24px;color:#172f31}.head{display:flex;justify-content:space-between;border-bottom:3px solid #0d5559;padding-bottom:12px}.head b{font:700 25px Georgia}.draft{margin:14px 0;padding:8px 10px;background:#fff2db;border-left:4px solid #c77d1f;font-size:12px}.section{padding:16px 0;border-bottom:1px solid #d6dfdc}.section h2{margin:0 0 9px;font:700 18px Georgia}.med{padding:5px 0;font-weight:700}.sig{margin-top:9px;padding:10px;border-left:4px solid #c77d1f;background:#f5f7f5;white-space:pre-line}.sig b{display:block;font-size:10px;text-transform:uppercase;margin-bottom:4px}@media print{body{margin:0}.draft{break-inside:avoid}}</style></head><body><div class="head"><div><b>MedIndex</b><div>Dr. Diellza Rabushaj</div></div><div>${new Date().toLocaleDateString('sq-AL')}</div></div><div class="draft"><b>KONTROLL KLINIK:</b> Verifiko dozën, rrugën, frekuencën dhe kompatibilitetin para përdorimit.</div><h1>${esc(state.result.title || 'Recetë')}</h1>${state.result.diagnosis ? `<p><b>Diagnoza:</b> ${esc(state.result.diagnosis)}</p>` : ''}${state.result.sections.map(section => `<section class="section"><h2>Rp. · ${esc(section.title)}${section.route ? ` · ${esc(section.route)}` : ''}</h2>${section.medications.map(item => `<div class="med">${esc(medicationLine(item))}</div>${item.other ? `<div>${esc(item.other)}</div>` : ''}${item.individualSignature ? `<div class="sig"><b>Signatura</b>${esc(item.individualSignature)}</div>` : ''}`).join('')}${section.sharedSignature ? `<div class="sig"><b>Signatura e përbashkët</b>${esc(section.sharedSignature)}</div>` : ''}</section>`).join('')}<script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  function resetComposer() {
    state.editingId = '';
    state.selectedDrugs = [];
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
    $('#rxDiagnosis').value = result.diagnosis || '';
    $('#rxComposer').value = text(protocol.sourceText) || resultToText(result);
    showResult(result, protocol.aiStructured ? 'gemini' : 'local');
    window.scrollTo({ top:0, behavior:'smooth' });
    setStatus('Receta e ruajtur u hap për editim.', 'success');
  }

  function duplicateSaved(id) {
    const protocol = getSaved().find(item => String(item.id) === String(id));
    if (!protocol) return;
    const now = new Date().toISOString();
    const copy = { ...protocol, id:uid(), name:`${text(protocol.name) || 'Recetë'} — kopje`, createdAt:now, updatedAt:now, clinicalReview:false, reviewedAt:'' };
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
      const medicationCount = result.sections.reduce((sum, section) => sum + section.medications.length, 0);
      return `<article class="rx-saved-card"><div class="rx-saved-card-head"><h3>${esc(result.title)}</h3><time>${new Date(protocol.updatedAt || Date.now()).toLocaleDateString('sq-AL')}</time></div><p>${esc(result.diagnosis || 'Pa diagnozë të shënuar')}</p><div class="rx-saved-tags"><span>${result.sections.length} grupe</span><span>${medicationCount} barna</span>${protocol.aiStructured ? '<span>Gemini</span>' : ''}</div><div class="rx-saved-actions"><button type="button" data-open-saved="${esc(protocol.id)}">Hape</button><button type="button" data-duplicate-saved="${esc(protocol.id)}">Dupliko</button><button class="danger" type="button" data-delete-saved="${esc(protocol.id)}" aria-label="Fshije">×</button></div></article>`;
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
      const response = await fetch(`/api/drug-search?q=${encodeURIComponent(value)}`, { credentials:'same-origin', signal:state.searchController.signal, headers:{ Accept:'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Kërkimi dështoi.');
      holder.innerHTML = payload.results?.length
        ? payload.results.map(drug => `<button class="rx-drug-result" type="button" data-drug-result="${esc(encodeURIComponent(JSON.stringify(drug)))}"><span><strong>${esc(drug.substance || drug.tradeName)}</strong><small>${esc([drug.tradeName, drug.strength, drug.form].filter(Boolean).join(' · '))}</small></span><span>+</span></button>`).join('')
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
      insertAtCursor(button.dataset.formValue + ' ');
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
    initTheme();
    bindEvents();
    renderSaved();
    loadSelection();
    $('#rxComposer')?.focus({ preventScroll:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
