(function installIcdClinicalRetryController(root) {
  'use strict';

  if (!root?.document || !root.MedIndexIcdClinicalGuidance) return;

  const base = root.MedIndexIcdClinicalGuidance;
  const VERSION = 'icd-clinical-retry-controller-v2';
  const API_PATH = '/api/icd';
  const SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function setDiagnostic(result = '', reason = '', code = '') {
    const html = root.document.documentElement;
    if (result) html.dataset.miIcdClinicalRecoveryResult = result;
    else delete html.dataset.miIcdClinicalRecoveryResult;
    if (reason) html.dataset.miIcdClinicalRecoveryError = clean(reason).slice(0, 180);
    else delete html.dataset.miIcdClinicalRecoveryError;
    if (code) html.dataset.miIcdClinicalRecoveryCode = code;
  }

  function setState(text, tone) {
    const state = root.document.getElementById('icdClinicalGuidanceState');
    if (!state) return;
    state.textContent = text;
    state.dataset.tone = tone;
  }

  function setEmpty(title, text, tone) {
    const empty = root.document.getElementById('icdClinicalGuidanceEmpty');
    const content = root.document.getElementById('icdClinicalGuidanceContent');
    if (!empty || !content) return;
    empty.hidden = false;
    content.hidden = true;
    empty.dataset.tone = tone;
    const heading = empty.querySelector('strong');
    const paragraph = empty.querySelector('p');
    if (heading) heading.textContent = title;
    if (paragraph) paragraph.textContent = text;
  }

  function replaceList(host, values) {
    if (!host) return;
    host.replaceChildren();
    const list = root.document.createElement('ul');
    values.forEach(value => {
      const item = root.document.createElement('li');
      item.textContent = value;
      list.appendChild(item);
    });
    host.appendChild(list);
  }

  function renderOfficial(host, entry) {
    if (!host) return;
    host.replaceChildren();
    const official = base.officialCodingSections(entry);
    if (!official.available) {
      const paragraph = root.document.createElement('p');
      paragraph.className = 'is-unavailable';
      const strong = root.document.createElement('strong');
      strong.textContent = 'Nuk janë të disponueshme në burimin aktual. ';
      paragraph.append(
        strong,
        root.document.createTextNode('MedIndex nuk fabrikon shënime “Përfshin”, “Përjashton”, “Kodifiko së pari” ose “Përdor kod shtesë”. Kontrollo burimin zyrtar para kodimit përfundimtar.'),
      );
      host.appendChild(paragraph);
      return;
    }

    official.sections.filter(section => section.items.length).forEach(section => {
      const wrapper = root.document.createElement('section');
      const title = root.document.createElement('strong');
      title.textContent = section.label;
      wrapper.appendChild(title);
      const list = root.document.createElement('ul');
      section.items.forEach(value => {
        const item = root.document.createElement('li');
        item.textContent = value;
        list.appendChild(item);
      });
      wrapper.appendChild(list);
      host.appendChild(wrapper);
    });
  }

  function renderContext(context, metadata) {
    const document = root.document;
    const entry = base.normalizeEntry(context?.entry);
    const host = document.getElementById('icdClinicalGuidance');
    const empty = document.getElementById('icdClinicalGuidanceEmpty');
    const content = document.getElementById('icdClinicalGuidanceContent');
    if (!entry || !host || !empty || !content) throw new Error('Paneli klinik ICD nuk ishte gati për rikthim.');

    empty.hidden = true;
    content.hidden = false;

    const inheritance = document.getElementById('icdClinicalGuidanceInheritance');
    if (inheritance) {
      inheritance.replaceChildren();
      inheritance.hidden = !context.inherited;
      if (context.inherited) {
        const strong = document.createElement('strong');
        strong.textContent = `Kontekst i trashëguar nga ${context.sourceCode}`;
        const note = document.createElement('span');
        note.textContent = `${context.requestedCode} nuk ka rresht të veçantë në listën e përzgjedhur; përdoren vetëm të dhënat e kategorisë.`;
        inheritance.append(strong, note);
      }
    }

    const family = document.getElementById('icdClinicalGuidanceFamily');
    const emergency = document.getElementById('icdClinicalGuidanceEmergency');
    const priority = document.getElementById('icdClinicalGuidancePriority');
    if (family) family.textContent = entry.primaryCare || '—';
    if (emergency) {
      emergency.textContent = entry.emergency || '—';
      emergency.dataset.tone = base.urgencyTone(entry);
    }
    if (priority) {
      priority.textContent = entry.priority || '—';
      priority.dataset.tone = base.urgencyTone(entry);
    }

    const warning = document.getElementById('icdClinicalGuidanceWarning');
    if (warning) {
      warning.hidden = !entry.warning;
      warning.dataset.tone = base.urgencyTone(entry);
    }
    const warningTitle = document.getElementById('icdClinicalGuidanceWarningTitle');
    const warningText = document.getElementById('icdClinicalGuidanceWarningText');
    if (warningTitle) warningTitle.textContent = entry.isCritical ? 'Gjendje potencialisht kritike' : 'Vëmendje klinike';
    if (warningText) warningText.textContent = entry.warning || '';

    const usage = document.getElementById('icdClinicalGuidanceUse');
    if (usage) {
      usage.hidden = !entry.summary;
      const paragraph = usage.querySelector('p');
      if (paragraph) paragraph.textContent = entry.summary || '';
    }

    const notes = [...entry.codingNotes];
    if (context.inherited) notes.unshift(`Konteksti klinik vjen nga kategoria ${context.sourceCode}; verifiko nënkodin ${context.requestedCode} në hierarkinë e plotë.`);
    if (!notes.length) notes.push('Kontrollo nivelin më specifik të mbështetur nga dokumentacioni klinik para kodimit përfundimtar.');
    replaceList(document.getElementById('icdClinicalGuidanceCodingNotes'), notes);
    renderOfficial(document.getElementById('icdClinicalGuidanceOfficialContent'), entry);

    const keywords = document.getElementById('icdClinicalGuidanceKeywords');
    if (keywords) {
      keywords.replaceChildren();
      keywords.hidden = !entry.keywords.length;
      entry.keywords.forEach(keyword => {
        const tag = document.createElement('span');
        tag.textContent = keyword;
        keywords.appendChild(tag);
      });
    }

    const source = document.getElementById('icdClinicalGuidanceSource');
    if (source) source.textContent = base.sourceLabel(metadata);
    const sourceLink = document.getElementById('icdClinicalGuidanceSourceLink');
    if (sourceLink) {
      const spreadsheetId = clean(metadata.sourceSpreadsheetId).slice(0, 100);
      sourceLink.hidden = !SHEET_ID_PATTERN.test(spreadsheetId);
      sourceLink.href = sourceLink.hidden ? '#' : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
    }

    const tone = base.urgencyTone(entry);
    host.dataset.tone = tone;
    host.dataset.context = context.inherited ? 'inherited' : 'exact';
    setState(`${context.requestedCode} · ${entry.emergency || entry.primaryCare || 'kontekst klinik'}`, tone);
    const hiddenRetry = host.querySelector('[data-mi-icd-clinical-retry]');
    if (hiddenRetry) hiddenRetry.hidden = true;
    const status = document.getElementById('icdClinicalGuidanceStatus');
    if (status) status.textContent = `Konteksti klinik për ${context.requestedCode} u rikthye.`;
  }

  async function retry(codeValue) {
    const code = base.normalizeCode(codeValue || root.document.getElementById('icdCodingWorkspaceCode')?.textContent);
    setDiagnostic('', '', code);
    if (!code) {
      setDiagnostic('error', 'Nuk u gjet kodi aktiv ICD.', '');
      return false;
    }
    if (!root.document.documentElement.classList.contains('auth-ready')) {
      setDiagnostic('error', 'Sesioni klinik nuk ishte gati.', code);
      return false;
    }

    setEmpty('Po ringarkohet lista klinike…', `Po kërkohet sërish konteksti MF dhe urgjencë për ${code}.`, 'loading');
    setState('Duke u rilidhur…', 'loading');

    try {
      const fetchClinical = typeof root.MedIndexNativeFetch === 'function'
        ? root.MedIndexNativeFetch
        : root.fetch.bind(root);
      const response = await fetchClinical(API_PATH, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json', 'X-MedIndex-Retry':'1' },
      });
      if (!response.ok) throw new Error(`Lista klinike ktheu statusin ${response.status}.`);
      const payload = await response.json();
      const entries = payload?.data?.entries;
      if (!payload?.ok || !Array.isArray(entries)) throw new Error('Lista klinike nuk kishte strukturën e pritur.');
      const index = base.buildIndex(entries);
      const context = base.resolveClinicalContext(code, index);
      if (!context) throw new Error(`${code} nuk gjendet në listën klinike të përzgjedhur.`);
      renderContext(context, {
        dataSource:response.headers.get('X-MedIndex-Data-Source') || '',
        sourceSpreadsheetId:payload.data.sourceSpreadsheetId || '',
      });
      setDiagnostic('success', '', code);
      root.dispatchEvent(new root.CustomEvent('medindex:icd-clinical-recovered', { detail:{ code } }));
      return true;
    } catch (error) {
      const reason = clean(error?.message || error).slice(0, 180) || 'Rikthimi klinik dështoi.';
      setEmpty('Konteksti klinik nuk u ngarkua', reason, 'error');
      setState('Burimi klinik i padisponueshëm', 'error');
      setDiagnostic('error', reason, code);
      return false;
    }
  }

  root.MedIndexIcdClinicalGuidance = Object.freeze({ ...base, retry });
  root.document.documentElement.dataset.miIcdClinicalRetryController = VERSION;
})(typeof window !== 'undefined' ? window : null);
