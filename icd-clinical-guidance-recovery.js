(function bootstrapIcdClinicalGuidanceRecovery(root) {
  'use strict';

  if (!root?.document) return;
  const VERSION = 'icd-clinical-guidance-recovery-v5';
  const API_PATH = '/api/icd';
  const SPREADSHEET_PATTERN = /^[A-Za-z0-9_-]{20,}$/;
  let observer = null;
  let clickBound = false;
  let retryPromise = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function ensureRetryControl() {
    const document = root.document;
    const state = document.getElementById('icdClinicalGuidanceState');
    const empty = document.getElementById('icdClinicalGuidanceEmpty');
    if (!state || !empty) return;

    let button = empty.querySelector('[data-mi-icd-clinical-retry-visible]');
    const failed = state.dataset.tone === 'error';
    if (!failed) {
      button?.remove();
      return;
    }

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'icd-tree-action';
      button.dataset.miIcdClinicalRetryVisible = '';
      button.textContent = 'Riprovo listën klinike';
      button.style.marginTop = '12px';
      const content = empty.querySelector('div') || empty;
      content.appendChild(button);
    }
  }

  function setButtonBusy(button, busy) {
    if (!button?.isConnected) return;
    button.disabled = busy;
    button.toggleAttribute('aria-busy', busy);
    button.textContent = busy ? 'Duke u rilidhur…' : 'Riprovo listën klinike';
  }

  function replaceList(host, values) {
    host.replaceChildren();
    if (!values.length) return;
    const list = root.document.createElement('ul');
    values.forEach(value => {
      const item = root.document.createElement('li');
      item.textContent = value;
      list.appendChild(item);
    });
    host.appendChild(list);
  }

  function renderOfficial(host, api, entry) {
    host.replaceChildren();
    const official = api.officialCodingSections(entry);
    if (!official.available) {
      const message = root.document.createElement('p');
      message.className = 'is-unavailable';
      const strong = root.document.createElement('strong');
      strong.textContent = 'Nuk janë të disponueshme në burimin aktual. ';
      message.append(strong, root.document.createTextNode('MedIndex nuk fabrikon shënime “Përfshin”, “Përjashton”, “Kodifiko së pari” ose “Përdor kod shtesë”. Kontrollo burimin zyrtar para kodimit përfundimtar.'));
      host.appendChild(message);
      return;
    }
    official.sections.filter(section => section.items.length).forEach(section => {
      const wrapper = root.document.createElement('section');
      const title = root.document.createElement('strong');
      title.textContent = section.label;
      wrapper.appendChild(title);
      replaceList(wrapper, section.items);
      host.appendChild(wrapper);
    });
  }

  function renderRecovered(context, api, metadata) {
    const document = root.document;
    const entry = context.entry;
    const empty = document.getElementById('icdClinicalGuidanceEmpty');
    const content = document.getElementById('icdClinicalGuidanceContent');
    const host = document.getElementById('icdClinicalGuidance');
    if (!empty || !content || !host || !entry) throw new Error('Paneli klinik nuk ishte gati për rikthim.');

    empty.hidden = true;
    content.hidden = false;

    const inheritance = document.getElementById('icdClinicalGuidanceInheritance');
    inheritance.replaceChildren();
    inheritance.hidden = !context.inherited;
    if (context.inherited) {
      const strong = document.createElement('strong');
      strong.textContent = `Kontekst i trashëguar nga ${context.sourceCode}`;
      const note = document.createElement('span');
      note.textContent = `${context.requestedCode} nuk ka rresht të veçantë në listën e përzgjedhur; përdoren vetëm të dhënat e kategorisë.`;
      inheritance.append(strong, note);
    }

    document.getElementById('icdClinicalGuidanceFamily').textContent = entry.primaryCare || '—';
    const emergency = document.getElementById('icdClinicalGuidanceEmergency');
    emergency.textContent = entry.emergency || '—';
    emergency.dataset.tone = api.urgencyTone(entry);
    const priority = document.getElementById('icdClinicalGuidancePriority');
    priority.textContent = entry.priority || '—';
    priority.dataset.tone = api.urgencyTone(entry);

    const warning = document.getElementById('icdClinicalGuidanceWarning');
    warning.hidden = !entry.warning;
    warning.dataset.tone = api.urgencyTone(entry);
    document.getElementById('icdClinicalGuidanceWarningTitle').textContent = entry.isCritical ? 'Gjendje potencialisht kritike' : 'Vëmendje klinike';
    document.getElementById('icdClinicalGuidanceWarningText').textContent = entry.warning || '';

    const usage = document.getElementById('icdClinicalGuidanceUse');
    usage.hidden = !entry.summary;
    usage.querySelector('p').textContent = entry.summary || '';

    const codingNotes = [...(entry.codingNotes || [])];
    if (context.inherited) codingNotes.unshift(`Konteksti klinik vjen nga kategoria ${context.sourceCode}; verifiko nënkodin ${context.requestedCode} në hierarkinë e plotë.`);
    if (!codingNotes.length) codingNotes.push('Kontrollo nivelin më specifik të mbështetur nga dokumentacioni klinik para kodimit përfundimtar.');
    replaceList(document.getElementById('icdClinicalGuidanceCodingNotes'), codingNotes);
    renderOfficial(document.getElementById('icdClinicalGuidanceOfficialContent'), api, entry);

    const keywords = document.getElementById('icdClinicalGuidanceKeywords');
    keywords.replaceChildren();
    keywords.hidden = !(entry.keywords || []).length;
    (entry.keywords || []).forEach(keyword => {
      const tag = document.createElement('span');
      tag.textContent = keyword;
      keywords.appendChild(tag);
    });

    document.getElementById('icdClinicalGuidanceSource').textContent = api.sourceLabel(metadata);
    const sourceLink = document.getElementById('icdClinicalGuidanceSourceLink');
    const spreadsheetId = clean(metadata.sourceSpreadsheetId).slice(0, 100);
    sourceLink.hidden = !SPREADSHEET_PATTERN.test(spreadsheetId);
    sourceLink.href = sourceLink.hidden ? '#' : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;

    const tone = api.urgencyTone(entry);
    host.dataset.tone = tone;
    host.dataset.context = context.inherited ? 'inherited' : 'exact';
    const state = document.getElementById('icdClinicalGuidanceState');
    state.textContent = `${context.requestedCode} · ${entry.emergency || entry.primaryCare || 'kontekst klinik'}`;
    state.dataset.tone = tone;
    const internalRetry = host.querySelector('[data-mi-icd-clinical-retry]');
    if (internalRetry) internalRetry.hidden = true;
    const status = document.getElementById('icdClinicalGuidanceStatus');
    if (status) status.textContent = `Konteksti klinik për ${context.requestedCode} u rikthye.`;
  }

  async function retry(button) {
    if (retryPromise) return retryPromise;
    const api = root.MedIndexIcdClinicalGuidance;
    if (!api?.normalizeCode || !api?.buildIndex || !api?.resolveClinicalContext) {
      throw new Error('Moduli klinik ICD nuk ishte gati.');
    }
    const code = api.normalizeCode(root.document.getElementById('icdCodingWorkspaceCode')?.textContent);
    if (!code) throw new Error('Nuk u gjet kodi aktiv ICD.');

    setButtonBusy(button, true);
    retryPromise = (async () => {
      const response = await root.fetch(API_PATH, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) throw new Error(`Lista klinike ktheu statusin ${response.status}.`);
      const payload = await response.json();
      const entries = payload?.data?.entries;
      if (!payload?.ok || !Array.isArray(entries)) throw new Error('Lista klinike nuk kishte strukturën e pritur.');
      const index = api.buildIndex(entries);
      const context = api.resolveClinicalContext(code, index);
      if (!context) throw new Error(`${code} nuk gjendet në listën klinike të përzgjedhur.`);
      renderRecovered(context, api, {
        dataSource:response.headers.get('X-MedIndex-Data-Source') || '',
        sourceSpreadsheetId:payload.data.sourceSpreadsheetId || '',
      });
      button.remove();
    })().catch(error => {
      setButtonBusy(button, false);
      const status = root.document.getElementById('icdClinicalGuidanceStatus');
      if (status) status.textContent = clean(error?.message || error);
      throw error;
    }).finally(() => {
      retryPromise = null;
    });
    return retryPromise;
  }

  function bindControlledRetry() {
    if (clickBound) return;
    clickBound = true;
    root.document.addEventListener('click', event => {
      const button = event.target.closest('[data-mi-icd-clinical-retry-visible]');
      if (!button) return;
      event.preventDefault();
      void retry(button).catch(() => {});
    });
  }

  function init() {
    const state = root.document.getElementById('icdClinicalGuidanceState');
    if (!state) return false;
    ensureRetryControl();
    bindControlledRetry();
    observer?.disconnect();
    observer = new MutationObserver(ensureRetryControl);
    observer.observe(state, {
      attributes:true,
      attributeFilter:['data-tone'],
      childList:true,
      characterData:true,
      subtree:true,
    });
    root.document.documentElement.dataset.miIcdClinicalGuidanceRecovery = VERSION;
    return true;
  }

  const start = () => {
    if (init()) return;
    let attempts = 0;
    const timer = root.setInterval(() => {
      attempts += 1;
      if (init() || attempts >= 40) root.clearInterval(timer);
    }, 100);
  };

  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null);
