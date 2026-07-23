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
  const FORM_LABELS = {
    'tab':'Tableta', 'tablet':'Tableta', 'tableta':'Tableta',
    'caps':'Kapsula', 'capsule':'Kapsula', 'kapsula':'Kapsula',
    'amp':'Ampulë', 'ampoule':'Ampulë', 'injection':'Ampulë', 'inj':'Ampulë',
    'inf':'Infuzion', 'infusion':'Infuzion',
    'ung':'Unguentum', 'ointment':'Unguentum', 'cream':'Krem',
    'sol':'Solucion', 'solution':'Solucion',
    'sir':'Sirup', 'syrup':'Sirup',
    'sup':'Supozitor', 'suppository':'Supozitor',
    'gtt':'Pika', 'drops':'Pika',
    'inh':'Inhalacion', 'inhalation':'Inhalacion', 'spray':'Spray',
    'fl':'Flakon', 'vial':'Flakon'
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

  function formLabel(form) {
    const raw = text(form).replace(/[().]/g, '').toLocaleLowerCase('sq');
    if (!raw) return '';
    const direct = Object.entries(FORM_LABELS).find(([needle]) => raw === needle || raw.includes(needle));
    return direct?.[1] || text(form).replace(/[().]/g, '');
  }

  function selectedDrugLine(drug) {
    const name = drug.substance || drug.tradeName;
    const main = [name, drug.strength].filter(Boolean).join(' ');
    const label = formLabel(drug.form);
    return `${main}${label ? ` (${label})` : ''}`;
  }

  function addSelectedDrug(raw, { insert = true } = {}) {
    const drug = normalizeDrug(raw);
    if (!drug.substance && !drug.tradeName) return;
    const key = drug.key || `${drug.substance}|${drug.tradeName}|${drug.strength}`;
    if (!state.selectedDrugs.some(item => item.key === key)) state.selectedDrugs.push({ ...drug, key });
    renderSelectedDrugs();
    if (insert) insertAtCursor(`${selectedDrugLine(drug)}\n`);
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
        composer.value = items.map(item => selectedDrugLine(normalizeDrug(item))).filter(Boolean).join('\n\n');
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

  function normalizePrefix(value) {
    const raw = text(value).replace(/\.$/, '').toLocaleLowerCase('sq');
    const map = { tab:'Tableta', caps:'Kapsula', amp:'Ampulë', inj:'Ampulë', inf:'Infuzion', ung:'Unguentum', sol:'Solucion', sir:'Sirup', sup:'Supozitor', gtt:'Pika', inh:'Inhalacion', fl:'Flakon', vial:'Flakon' };
    return map[raw] || text(value).replace(/\.$/, '');
  }

  function parseMedicationLine(rawLine) {
    let line = text(rawLine).replace(/^Rp\s*:\s*/i, '');
    if (!line || /^(?:Sasia|Doza|Tjetër|S(?:\s*\(Signatura\))?\.?|Signatura)\s*:/i.test(line)) return null;

    let prefix = '';
    const prefixMatch = line.match(/^(Tab\.?|Caps\.?|Amp\.?|Inf\.?|Ung\.?|Sol\.?|Sir\.?|Sup\.?|Gtt\.?|Inh\.?|Inj\.?|Fl\.?|Vial\.?)\s+(.+)$/i);
    if (prefixMatch) {
      prefix = normalizePrefix(prefixMatch[1]);
      line = text(prefixMatch[2]);
    }

    let parentheticalForm = '';
    const formMatch = line.match(/\s*\(([^()]*(?:tablet|kapsul|ampul|infuz|unguent|krem|solucion|sirup|supoz|pika|inhal|spray|flakon)[^()]*)\)\s*$/i);
    if (formMatch) {
      parentheticalForm = text(formMatch[1]);
      line = text(line.slice(0, formMatch.index));
    }

    let inlineQuantity = '';
    const inlineMatch = line.match(/\s+a\s+([\d.,]+\s*(?:ml|mL|l|L|g|tableta?|kapsula?|ampula?))\s*$/i);
    if (inlineMatch) {
      inlineQuantity = `a ${inlineMatch[1]}`;
      line = text(line.slice(0, inlineMatch.index));
    }

    const doseMatch = line.match(/\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ug|ml|mL|IU|UI|NJ|%)/i);
    const dose = doseMatch ? text(line.slice(doseMatch.index)) : '';
    const name = doseMatch ? text(line.slice(0, doseMatch.index)) : line;
    if (!name) return null;

    return {
      form: formLabel(parentheticalForm || prefix),
      name,
      dose,
      quantity: inlineQuantity,
      dispenseQuantity: '',
      other: '',
      individualSignature: '',
      signatureGenerated: false,
    };
  }

  function inferType(medications, signature) {
    const forms = medications.map(item => text(item.form).toLocaleLowerCase('sq'));
    const sign = text(signature).toLocaleLowerCase('sq');
    if (forms.some(form => form.includes('infuz')) || /infuzion|përzi|perzi|tretës|tretes/.test(sign)) return 'infusion';
    if (forms.length && forms.every(form => /ampul|flakon|inj/.test(form))) return 'injection';
    if (forms.length && forms.every(form => /tablet|kapsul|sirup|solucion|pika/.test(form))) return 'oral';
    if (forms.some(form => /unguent|krem/.test(form))) return 'topical';
    if (forms.some(form => /inhal|spray/.test(form))) return 'inhalation';
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

      const quantityMatch = line.match(/^Sasia\s*:\s*(.*)$/i);
      if (quantityMatch) {
        if (medications.length) medications.at(-1).dispenseQuantity = text(quantityMatch[1]);
        else missing.push(`Grupi ${index + 1}: Sasia nuk është lidhur me asnjë bar.`);
        readingSignature = false;
        return;
      }

      const signatureMatch = line.match(/^(?:S(?:\s*\(Signatura\))?\.?|Signatura)\s*:\s*(.*)$/i);
      if (signatureMatch) {
        readingSignature = true;
        if (signatureMatch[1]) signatureParts.push(signatureMatch[1]);
        return;
      }

      const otherMatch = line.match(/^Tjetër\s*:\s*(.*)$/i);
      if (otherMatch) {
        if (medications.length) medications.at(-1).other = text(otherMatch[1]);
        readingSignature = false;
        return;
      }

      const medication = parseMedicationLine(line);
      if (medication) {
        readingSignature = false;
        medications.push(medication);
        return;
      }

      if (readingSignature) signatureParts.push(line);
      else if (medications.length) medications.at(-1).other = [medications.at(-1).other, line].filter(Boolean).join(' · ');
    });

    if (!medications.length) return null;
    const signature = text(signatureParts.join(' '));
    const type = inferType(medications, signature);
    const route = inferRoute(type, signature, lines);

    if (!signature) missing.push(`Grupi ${index + 1}: mungon Signatura; Gemini mund ta propozojë kur diagnoza është e plotësuar.`);
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
      sharedSignatureGenerated: false,
      medications,
    };
  }

  function localParse(input = $('#rxComposer')?.value || '') {
    const raw = String(input || '').replace(/\r/g, '').trim();
    const missing = [];
    if (!raw) return null;

    const blocks = raw
      .split(/\n\s*\n+|(?=^\s*Rp\s*:)/gim)
      .map(block => block.split('\n'))
      .filter(block => block.some(line => text(line).replace(/^Rp\s*:\s*/i, '')));

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
    const main = [item.name, item.dose].filter(Boolean).join(' ');
    const form = formLabel(item.form);
    const inline = item.quantity ? ` ${item.quantity}` : '';
    return `${main}${inline}${form ? ` (${form})` : ''}`.trim();
  }

  function resultToText(result) {
    const lines = ['Rp:'];
    (result?.sections || []).forEach((section, sectionIndex) => {
      if (sectionIndex) lines.push('');
      section.medications.forEach((item, itemIndex) => {
        if (itemIndex && item.individualSignature) lines.push('');
        lines.push(medicationLine(item));
        if (item.dispenseQuantity) lines.push(`Sasia: ${item.dispenseQuantity}`);
        if (item.other) lines.push(`Tjetër: ${item.other}`);
        if (item.individualSignature) lines.push(`S (Signatura): ${item.individualSignature}`);
      });
      if (section.sharedSignature) lines.push(`S (Signatura): ${section.sharedSignature}`);
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
      <div class="rx-med-lines">${section.medications.map(item => `<div class="rx-med-line"><div><strong>${esc(medicationLine(item))}</strong>${item.dispenseQuantity ? `<div class="rx-individual-signature"><b>Sasia</b><span>${esc(item.dispenseQuantity)}</span></div>` : ''}${item.other ? `<div class="rx-individual-signature"><b>Tjetër</b><span>${esc(item.other)}</span></div>` : ''}${item.individualSignature ? `<div class="rx-individual-signature"><b>${item.signatureGenerated ? 'Signatura e propozuar nga Gemini' : 'Signatura'}</b><span>${esc(item.individualSignature)}</span></div>` : ''}</div><small>${esc(item.form || '')}</small></div>`).join('')}</div>
      ${section.sharedSignature ? `<div class="rx-shared-signature"><b>${section.sharedSignatureGenerated ? 'Signatura e përbashkët e propozuar nga Gemini' : 'Signatura e përbashkët'}</b><span>${esc(section.sharedSignature)}</span></div>` : ''}
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
    ['rxSave', 'rxCopy', 'rxPrint'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = false;
    });
  }

  function clearResult() {
    state.result = null;
    state.source = '';
    $('#rxPreview').innerHTML = '<div class="rx-preview-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 5h6M9 3h6v4H9V3ZM6 5H4v16h16V5h-2M8 12h8M8 16h6"/></svg><strong>Parapamja shfaqet këtu</strong><span>Zgjidh barnat ose shkruaje recetën. Signaturën mund ta shkruash vetë ose ta propozosh me Gemini.</span></div>';
    const status = $('#rxState');
    status.className = 'rx-state is-draft';
    status.textContent = 'Draft';
    ['rxSave', 'rxCopy', 'rxPrint'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = true;
    });
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
      : 'Gemini po e strukturon recetën. Pa diagnozë, Signaturat që mungojnë lihen për plotësim.');

    try {
      const response = await fetch('/api/gemini-prescription', {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Content-Type':'application/json', Accept:'application/json' },
        body:JSON.stringify({
          input,
          diagnosis,
          selectedDrugs:state.selectedDrugs,
          generateMissingSignatures:true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || 'Gemini nuk e përpunoi recetën.'), { code:payload.code });
      showResult(payload.data, 'gemini');
      setStatus(`Receta u përgatit me ${payload.model || 'Gemini'}. Signaturat e propozuara duhet të kontrollohen klinikisht.`, 'success');
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
      return {
        title:text(protocol.name || protocol.title) || 'Recetë',
        diagnosis:text(protocol.indication || protocol.diagnosis),
        sections:protocol.sections,
        notes:Array.isArray(protocol.notes) ? protocol.notes : text(protocol.notes) ? [text(protocol.notes)] : [],
        missing:Array.isArray(protocol.missing) ? protocol.missing : [],
      };
    }

    const items = Array.isArray(protocol?.items) ? protocol.items : [];
    const sections = items.map(item => ({
      title:text(item.route) ? `Administrim ${text(item.route)}` : 'Bar veçmas',
      type:inferType([{ form:text(item.prefix || item.form) }], item.instructions),
      route:text(item.route),
      sharedSignature:'',
      sharedSignatureGenerated:false,
      medications:[{
        form:formLabel(item.form || item.prefix),
        name:text(item.substance || item.tradeName),
        dose:text(item.dose || item.strength),
        quantity:'',
        dispenseQuantity:text(item.dispenseQuantity || item.quantity),
        other:text(item.clinicalNotes),
        individualSignature:text(item.instructions),
        signatureGenerated:false,
      }],
    }));
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
      tradeName:'',
      substance:item.name,
      strength:item.dose,
      form:item.form,
      prefix:formPrefix(item.form),
      dose:item.dose,
      quantity:item.quantity,
      dispenseQuantity:item.dispenseQuantity,
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
      name:result.title || `Recetë – ${new Date().toLocaleDateString('sq-AL')}`,
      indication:result.diagnosis || text($('#rxDiagnosis')?.value),
      allergies:'',
      population:'',
      patientName:'',
      birthDate:'',
      patientId:'',
      patientType:'adult',
      notes:result.notes || [],
      missing:result.missing || [],
      sections:result.sections,
      sourceText:$('#rxComposer')?.value || resultToText(result),
      selectedDrugs:state.selectedDrugs,
      formatVersion:3,
      aiStructured:state.source === 'gemini',
      clinicalReview:false,
      reviewedAt:'',
      createdAt:existing?.createdAt || now,
      updatedAt:now,
      items,
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
    try {
      await navigator.clipboard.writeText(value);
    } catch {
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
    if (!popup) {
      toast('Shfletuesi e bllokoi dritaren e printimit.');
      return;
    }
    const content = esc(resultToText(state.result)).replace(/\n/g, '<br>');
    popup.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(state.result.title || 'Recetë')}</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:32px auto;padding:0 24px;color:#172f31;line-height:1.65}.head{display:flex;justify-content:space-between;border-bottom:3px solid #0d5559;padding-bottom:12px}.head b{font-size:24px}.draft{margin:14px 0;padding:8px 10px;background:#fff2db;border-left:4px solid #c77d1f;font-size:12px}.rx{font-size:15px;white-space:normal}@media print{body{margin:0}}</style></head><body><div class="head"><div><b>MedIndex</b><div>Dr. Diellza Rabushaj</div></div><div>${new Date().toLocaleDateString('sq-AL')}</div></div><div class="draft"><b>KONTROLL KLINIK:</b> Verifiko diagnozën, dozën, Signaturën dhe kundërindikacionet para përdorimit.</div><h1>${esc(state.result.title || 'Recetë')}</h1>${state.result.diagnosis ? `<p><b>Diagnoza:</b> ${esc(state.result.diagnosis)}</p>` : ''}<div class="rx">${content}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
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
    const copy = {
      ...protocol,
      id:uid(),
      name:`${text(protocol.name) || 'Recetë'} — kopje`,
      createdAt:now,
      updatedAt:now,
      clinicalReview:false,
      reviewedAt:'',
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
      const response = await fetch(`/api/drug-search?q=${encodeURIComponent(value)}`, {
        credentials:'same-origin',
        signal:state.searchController.signal,
        headers:{ Accept:'application/json' },
      });
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
      insertAtCursor(`${button.dataset.formValue} `);
      closePopovers();
    });

    $('#rxDrugSearch')?.addEventListener('input', event => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => searchDrugs(event.target.value), 160);
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
