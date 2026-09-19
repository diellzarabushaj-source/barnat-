(() => {
  'use strict';

  /* ICD-10 — një shtresë e vetme mbi `/api/icd`.
     Faqja e vjetër ndante gjendjen mes dhjetë skedarëve runtime dhe
     nëntëmbëdhjetë fletëve stili. Këtu ka një gjendje, një kërkesë për hap, dhe
     të njëjtën guaskë si Barnat e Klasifikimi. */

  const API = '/api/icd';
  const LEVELS = Object.freeze({ chapter:'Kapitull', block:'Bllok', category:'Kategori', subcategory:'Nënkategori' });
  const ICON = body => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const CHEVRON_RIGHT = ICON('<path d="M9.5 5.5 16 12l-6.5 6.5"/>');
  const SEARCH_GLYPH = ICON('<circle cx="11" cy="11" r="6.6"/><path d="m16 16 4.4 4.4"/>');
  const CLINICAL_GROUPS = Object.freeze([
    { id:'core', label:'Kryesore' },
    { id:'urgent', label:'Urgjencat QKMF' },
    { id:'all', label:'Të gjitha' },
    { id:'general', label:'Të përgjithshme' },
    { id:'cardio', label:'Kardio / DM' },
    { id:'resp', label:'Respiratore / ORL' },
    { id:'gastro', label:'Gastro' },
    { id:'neuro', label:'Neuro / MSK' },
    { id:'uro', label:'Uro / Nefro' },
    { id:'derm', label:'Dermatologji' },
    { id:'endo', label:'Endokrin / Hemato' },
    { id:'mental', label:'Shëndet mendor' },
    { id:'peds', label:'Pediatri' },
    { id:'gyn', label:'Gjinekologji' },
  ]);
  const CLINICAL_CORE_CODES = new Set(['I10','E11','J06','R05','R50','R51','R10.4','R42','N39.0','M54']);
  const CLINICAL_GROUP_BY_CODE = Object.freeze({
    R50:'general', R53:'general', R55:'general', R57:'general', 'T50.9':'general',
    I10:'cardio', E11:'cardio', 'R00.2':'cardio', R60:'cardio', I20:'cardio', I21:'cardio', I26:'cardio', I47:'cardio', I48:'cardio', I50:'cardio', J81:'cardio', 'R07.4':'cardio',
    J00:'resp', J06:'resp', R05:'resp', J02:'resp', J01:'resp', J20:'resp', J30:'resp', J45:'resp', J44:'resp', J46:'resp', H66:'resp', 'H92.0':'resp', H10:'resp', 'R06.0':'resp',
    'R19.7':'gastro', R11:'gastro', 'R10.4':'gastro', 'R10.0':'gastro', R12:'gastro', R14:'gastro', K21:'gastro', K29:'gastro', 'K59.0':'gastro', 'K92.2':'gastro', A09:'gastro',
    R51:'neuro', R42:'neuro', G43:'neuro', I63:'neuro', G45:'neuro', 'R56.8':'neuro', 'S06.0':'neuro', M54:'neuro', 'M54.5':'neuro', 'M54.2':'neuro', 'M54.3':'neuro', M47:'neuro', M51:'neuro', 'M25.5':'neuro', M19:'neuro', 'M79.1':'neuro',
    'N39.0':'uro', N23:'uro',
    L30:'derm', B35:'derm',
    D50:'endo', E03:'endo', 'E16.2':'endo', 'E10.1':'endo',
    F41:'mental', F32:'mental', 'G47.0':'mental',
    J18:'resp', J03:'resp', J10:'resp', J11:'resp', H60:'resp', 'H81.1':'neuro',
    J21:'peds', 'B08.4':'peds',
    K30:'gastro', K52:'gastro', K64:'gastro',
    N30:'uro', R31:'uro', N40:'uro',
    N76:'gyn',
    L50:'derm', L03:'derm', L02:'derm', L20:'derm',
    E78:'endo', E66:'endo', R73:'endo',
    I95:'cardio', I83:'cardio', 'I87.2':'cardio',
    M17:'neuro', M75:'neuro', M77:'neuro',
    B37:'derm', L70:'derm', L01:'derm', B00:'derm', B02:'derm',
    J32:'resp', J04:'resp', H00:'resp', H01:'resp', 'H61.2':'resp',
    K58:'gastro', K80:'gastro', 'K76.0':'gastro',
    N20:'uro', N45:'uro',
    N92:'gyn', 'N94.6':'gyn',
    D64:'endo', E05:'endo', E04:'endo',
    M10:'neuro', M06:'neuro', 'M79.7':'neuro',
    'R00.0':'cardio', 'R00.1':'cardio',
    'T78.2':'general',
    'R04.0':'resp',
  });

  const clean = value => String(value ?? '').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const formatNumber = value => Number(value || 0).toLocaleString('sq-XK');
  const levelLabel = level => LEVELS[clean(level)] || clean(level) || '—';

  const el = {};
  const state = {
    chapters: [],
    blocks: [],
    meta: null,
    chapter: '',
    path: [],          // nyjet e hapura nën kapitull
    rows: [],
    query: '',
    searching: false,
    suggestions: [],
    suggestionMeta: null,
    suggestionLoading: false,
    suggestionOpen: false,
    activeSuggestion: -1,
    searchSeed: [],
    searchSeedReady: false,
    hotQuick: [],
    hotSymptoms: [],
    hotSearchReady: false,
    clinicalGuidance: null,
    clinicalGuidanceCode: '',
    clinicalGuidanceLoading: false,
    clinicalGuidanceError: '',
    clinicalIndex: [],
    clinicalIndexLoading: false,
    clinicalIndexError: '',
    clinicalGroup: 'core',
    requestId: 0,
    loading: false,
    reveal: false,     // sill panelin e nyjeve në pamje pasi të mbërrijnë fëmijët (vetëm në celular)
  };

  function loadProfileChrome() {
    if (window.MedIndexProfile) return Promise.resolve(window.MedIndexProfile);
    const existing = document.querySelector('script[data-drx-profile-runtime]');
    if (existing) {
      return new Promise(resolve => {
        if (window.MedIndexProfile) return resolve(window.MedIndexProfile);
        existing.addEventListener('load', () => resolve(window.MedIndexProfile || null), { once:true });
        setTimeout(() => resolve(window.MedIndexProfile || null), 1800);
      });
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = '/medindex-brand-runtime.js?v=drx-brand-v7';
      script.defer = true;
      script.dataset.drxProfileRuntime = '1';
      script.addEventListener('load', () => resolve(window.MedIndexProfile || null), { once:true });
      script.addEventListener('error', () => resolve(null), { once:true });
      document.head.appendChild(script);
    });
  }

  async function syncProfileChrome(payload) {
    await loadProfileChrome();
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    if (document.querySelector('script[data-drx-sidebar-taxonomy]')) return;
    const script = document.createElement('script');
    script.src = '/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v4';
    script.defer = true;
    script.dataset.drxSidebarTaxonomy = '1';
    document.head.appendChild(script);
  }

  function bindElements() {
    [
      'appShell','sidebar','sidebarBackdrop','menuButton','sidebarClose','logoutButton','avatarInitials','sourceStatus','syncText',
      'metricNodes','metricChapters','metricCategories','metricCoverage','metricCoverageNote',
      'icdPath','icdPathItems','icdPathReset','icdSearch','icdSearchBox','icdSearchClear','icdSuggestions','icdStatusText',
      'chapterList','chapterCount','clinicalQuickHub','nodeHero','clinicalActionPanel','nodeList','nodeSectionTitle','nodeCount','nodeKicker','toast',
    ].forEach(id => { el[id] = document.getElementById(id); });
  }

  // --- rrjeti ---------------------------------------------------------------

  async function fetchJson(url, timeoutMs = 9000, externalSignal = null, cacheMode = 'no-store') {
    const controller = new AbortController();
    const abortFromExternal = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', abortFromExternal, { once:true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin', cache:cacheMode, signal:controller.signal,
        headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { redirectToLogin(); throw new Error('Sesioni nuk është aktiv.'); }
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || payload?.detail || `Gabim ${response.status}`);
      return { payload, response };
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.('abort', abortFromExternal);
    }
  }

  function endpoint(view, values = {}) {
    const params = new URLSearchParams({ view, sv:'clinical-workspace-v20' });
    if (view === 'suggest' || view === 'seed' || view === 'hot' || view === 'guidance' || view === 'guidance-list') params.set('advanced', '1');
    Object.entries(values).forEach(([key, value]) => { if (clean(value)) params.set(key, clean(value)); });
    return `${API}?${params}`;
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { payload } = await fetchJson('/api/auth', 4200);
    if (!payload.authenticated) return redirectToLogin();
    const name = clean(payload.user?.fullName || payload.user?.name || payload.user?.email || 'DR');
    el.avatarInitials.textContent = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2)
      .map(part => part[0]?.toUpperCase()).join('') || 'DR';
  }

  // --- paraqitja ------------------------------------------------------------

  function nodeTitle(node) {
    return clean(node?.displayTitle) || clean(node?.albanianDraft) || clean(node?.englishTitle) || clean(node?.code) || '—';
  }

  /* Titujt e kapitujve vijnë si «Neoplazitë (C00-D48)». Intervali është e vetmja
     gjë që i dallon te lista e ngushtë; kur titulli pritej me elips, pikërisht ai
     humbte, dhe poshtë të tetë rreshtave rrinte e njëjta fjalë «Kapitull». */
  const CODE_RANGE = /\s*[(\[]\s*([A-Z]\d{2}(?:\.\d+)?\s*[–—-]\s*[A-Z]?\d{2}(?:\.\d+)?)\s*[)\]]\s*$/;

  function splitRange(node) {
    const title = nodeTitle(node);
    const match = title.match(CODE_RANGE);
    if (!match) return { title, range:'' };
    const stripped = title.slice(0, match.index).trim();
    return stripped ? { title:stripped, range:match[1].replace(/\s+/g, '') } : { title, range:'' };
  }

  function nodeSubtitle(node) {
    const shown = nodeTitle(node);
    const english = clean(node?.englishTitle);
    const latin = clean(node?.latinTitle);
    return [
      english && english !== shown ? `EN · ${english}` : '',
      latin && latin !== shown && latin !== english ? `LA · ${latin}` : '',
    ].filter(Boolean).join(' · ');
  }

  function renderMetrics() {
    const meta = state.meta || {};
    el.metricNodes.textContent = meta.total ? formatNumber(meta.total) : formatNumber(state.chapters.length + state.blocks.length);
    el.metricChapters.textContent = formatNumber(state.chapters.length);
    el.metricCategories.textContent = meta.categories ? formatNumber(meta.categories) : '—';
    const translated = Number(meta.translated || 0);
    const total = Number(meta.total || 0);
    if (total > 0) {
      el.metricCoverage.textContent = `${Math.round((translated / total) * 100)}%`;
      el.metricCoverageNote.textContent = `${formatNumber(translated)} nyje në shqip`;
    } else {
      el.metricCoverage.textContent = '—';
      el.metricCoverageNote.textContent = 'Mbulimi i përkthimit';
    }
  }

  function renderChapters() {
    el.chapterCount.textContent = formatNumber(state.chapters.length);
    if (!state.chapters.length) {
      el.chapterList.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>';
      return;
    }
    el.chapterList.innerHTML = state.chapters.map(node => {
      const code = clean(node.code);
      const active = code === state.chapter;
      const { title, range } = splitRange(node);
      return `<button class="chapter-row ${active ? 'is-active' : ''}" type="button" role="option" aria-selected="${active}" data-chapter="${escapeHtml(code)}">
        <span class="chapter-code">${escapeHtml(code)}</span>
        <span class="chapter-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(range || levelLabel('chapter'))}</small></span>
      </button>`;
    }).join('');
  }

  function currentNode() {
    return state.path.length ? state.path[state.path.length - 1] : (state.chapters.find(c => clean(c.code) === state.chapter) || null);
  }

  function renderHero() {
    const node = currentNode();
    if (!node) { el.nodeHero.hidden = true; return; }
    el.nodeHero.hidden = false;
    const code = clean(node.code);
    const { title, range } = splitRange(node);
    el.nodeHero.innerHTML = `
      <span class="hero-code">${escapeHtml(code)}</span>
      <span class="hero-copy">
        <span class="hero-kicker">${escapeHtml(levelLabel(node.level))}${range ? ` · <b>${escapeHtml(range)}</b>` : ''}</span>
        <h2>${escapeHtml(title)}</h2>
        ${nodeSubtitle(node) ? `<p>${escapeHtml(nodeSubtitle(node))}</p>` : ''}
      </span>
      <span class="hero-actions">
        <a class="button button-secondary" href="/index.html?q=${encodeURIComponent(code)}">Kërko në barna</a>
      </span>`;
  }

  function clinicalGroupForCode(code) {
    return CLINICAL_GROUP_BY_CODE[clean(code).toUpperCase()] || 'general';
  }

  function renderClinicalQuickHub() {
    if (!el.clinicalQuickHub) return;
    const activeCode = clean(state.clinicalGuidanceCode).toUpperCase();
    const selectedGroup = clean(state.clinicalGroup) || 'core';
    const groupsHtml = CLINICAL_GROUPS.map(group =>
      '<button type="button" class="clinical-filter-chip' + (selectedGroup === group.id ? ' is-active' : '') + '" data-clinical-group="' + escapeHtml(group.id) + '" aria-pressed="' + (selectedGroup === group.id ? 'true' : 'false') + '">' + escapeHtml(group.label) + '</button>'
    ).join('');

    if (state.clinicalIndexLoading && !state.clinicalIndex.length) {
      el.clinicalQuickHub.innerHTML = '<div class="clinical-hub-head"><div><span class="clinical-hub-kicker">QKMF · ICD praktik</span><h3>Diagnozat klinike të shpeshta</h3><p>Zgjidh diagnozën dhe hap dokumentimin klinik pa përdorur search bar-in.</p></div></div><div class="clinical-hub-loading"><span></span><span></span><span></span><span></span></div>';
      return;
    }

    if (state.clinicalIndexError && !state.clinicalIndex.length) {
      el.clinicalQuickHub.innerHTML = '<div class="clinical-hub-head"><div><span class="clinical-hub-kicker">QKMF · ICD praktik</span><h3>Diagnozat klinike të shpeshta</h3><p class="clinical-hub-error">Lista klinike nuk u ngarkua. Hierarkia ICD mbetet e përdorshme.</p></div></div>';
      return;
    }

    const visible = state.clinicalIndex.filter(item => {
      const code = clean(item.code).toUpperCase();
      if (selectedGroup === 'all') return true;
      if (selectedGroup === 'core') return CLINICAL_CORE_CODES.has(code);
      if (selectedGroup === 'urgent') return Boolean(item.urgent);
      return clinicalGroupForCode(code) === selectedGroup;
    });
    const cardsHtml = visible.map(item => {
      const code = clean(item.code).toUpperCase();
      const isActive = activeCode === code;
      const isUrgent = Boolean(item.urgent);
      const specialist = clean(item.specialist) || 'Sipas tablosë klinike';
      const meta = isUrgent ? 'URGJENCË · ' + specialist : specialist;
      return '<button type="button" class="clinical-quick-card' + (isActive ? ' is-active' : '') + (isUrgent ? ' is-urgent' : '') + '" data-clinical-quick-code="' + escapeHtml(code) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '">' +
        '<span class="clinical-quick-code">' + escapeHtml(code) + '</span>' +
        '<span class="clinical-quick-copy"><strong>' + escapeHtml(clean(item.title_sq)) + '</strong><small>' + escapeHtml(meta) + '</small></span>' +
        '<span class="clinical-quick-arrow" aria-hidden="true">›</span></button>';
    }).join('');

    el.clinicalQuickHub.innerHTML = '<div class="clinical-hub-head"><div><span class="clinical-hub-kicker">QKMF · ICD praktik</span><h3>Diagnozat klinike të shpeshta</h3><p>Kliko diagnozën → shfaqen referimi, anamneza, ekzaminimet, menaxhimi dhe diagnoza e punës.</p></div><span class="clinical-hub-count">' + formatNumber(state.clinicalIndex.length) + ' diagnoza</span></div>' +
      '<div class="clinical-filter-rail" role="group" aria-label="Filtro diagnozat klinike">' + groupsHtml + '</div>' +
      '<div class="clinical-quick-grid">' + (cardsHtml || '<div class="clinical-hub-empty">Nuk ka diagnoza në këtë grup.</div>') + '</div>';
  }

  async function loadClinicalIndex() {
    if (state.clinicalIndexLoading || state.clinicalIndex.length) return;
    state.clinicalIndexLoading = true;
    state.clinicalIndexError = '';
    renderClinicalQuickHub();
    try {
      const { payload } = await fetchJson(endpoint('guidance-list'), 5000, null, 'default');
      const data = payload.data || {};
      state.clinicalIndex = Array.isArray(data.items) ? data.items : [];
    } catch (error) {
      state.clinicalIndexError = clean(error?.message) || 'Lista klinike nuk u ngarkua.';
    } finally {
      state.clinicalIndexLoading = false;
      renderClinicalQuickHub();
    }
  }
  function listHtml(items) {
    return (Array.isArray(items) ? items : []).filter(Boolean)
      .map(item => `<li>${escapeHtml(item)}</li>`).join('');
  }

  function clinicalCopyText(kind, guidance) {
    if (!guidance) return '';
    if (kind === 'diagnosis') return `Diagnoza e punës: ${clean(guidance.working_diagnosis)}`;
    if (kind === 'anamnesis') return `Anamneza: ${(guidance.anamnesis || []).join('; ')}`;
    if (kind === 'exams') return `Ekzaminimet: ${(guidance.exams || []).join('; ')}`;
    if (kind === 'management') return `Menaxhimi: ${clean(guidance.management)}`;
    if (kind === 'medications') {
      const meds = guidance.medications || {};
      return [
        'Barnat / terapia:',
        ...(meds.first_line || []).map(item => `Linja e parë: ${item}`),
        ...(meds.alternatives || []).map(item => `Alternativë: ${item}`),
        ...(meds.avoid || []).map(item => `Shmang: ${item}`),
        clean(meds.note) ? `Shënim: ${clean(meds.note)}` : '',
        clean(meds.evidence) ? `Referencë: ${clean(meds.evidence)}` : '',
      ].filter(Boolean).join('\n');
    }
    if (kind === 'practical') {
      const practical = guidance.practical || {};
      return [
        'Si vepron praktikisht:',
        ...(practical.steps || []),
        clean(practical.reassess) ? `Rivlerëso: ${clean(practical.reassess)}` : '',
      ].filter(Boolean).join('\n');
    }
    if (kind === 'referral') {
      return [
        `Diagnoza e punës: ${clean(guidance.working_diagnosis)}`,
        `Referim te: ${clean(guidance.referral?.specialist)}`,
        `Qëllimi: ${clean(guidance.referral?.goal)}`,
        `Shënim: ${clean(guidance.referral?.note)}`,
      ].filter(Boolean).join('\n');
    }
    if (kind === 'summary') return `Summary: ${clean(guidance.summary)}`;
    return [
      `Diagnoza e punës: ${clean(guidance.working_diagnosis)}`,
      `Referim te: ${clean(guidance.referral?.specialist)}`,
      `Qëllimi i referimit: ${clean(guidance.referral?.goal)}`,
      `Çka të shënohet: ${clean(guidance.referral?.note)}`,
      `Anamneza: ${(guidance.anamnesis || []).join('; ')}`,
      `Ekzaminimet: ${(guidance.exams || []).join('; ')}`,
      `Menaxhimi: ${clean(guidance.management)}`,
      clinicalCopyText('practical', guidance),
      clinicalCopyText('medications', guidance),
      `Summary: ${clean(guidance.summary)}`,
    ].filter(Boolean).join('\n');
  }

  function renderClinicalAction() {
    if (!el.clinicalActionPanel) return;
    const current = currentNode();
    const currentCode = clean(current?.code);

    const requestedCode = clean(state.clinicalGuidanceCode);
    if (!requestedCode && !currentCode) {
      el.clinicalActionPanel.hidden = true;
      el.clinicalActionPanel.classList.remove('is-urgent');
      el.clinicalActionPanel.innerHTML = '';
      return;
    }
    if (!requestedCode && currentCode) {
      el.clinicalActionPanel.hidden = true;
      el.clinicalActionPanel.innerHTML = '';
      return;
    }

    el.clinicalActionPanel.hidden = false;

    if (state.clinicalGuidanceLoading) {
      el.clinicalActionPanel.innerHTML = `
        <div class="clinical-action-loading">
          <span class="clinical-action-spinner" aria-hidden="true"></span>
          <span><strong>Po përgatis panelin klinik…</strong><small>Anamnezë, ekzaminime, referim dhe menaxhim i shkurtër.</small></span>
        </div>`;
      return;
    }

    const payload = state.clinicalGuidance;
    const guidance = payload?.guidance;
    if (!payload?.available || !guidance) {
      el.clinicalActionPanel.hidden = true;
      el.clinicalActionPanel.classList.remove('is-urgent');
      el.clinicalActionPanel.innerHTML = '';
      return;
    }

    el.clinicalActionPanel.classList.toggle('is-urgent', Boolean(guidance.urgent));

    const inherited = payload.inherited && payload.inheritedFrom
      ? `<span class="clinical-action-inherited">Udhëzim nga ${escapeHtml(payload.inheritedFrom)}</span>`
      : '';
    const actionKicker = guidance.urgent ? 'URGJENCË QKMF · Stabilizim + transfer' : 'QKMF · Clinical Action';
    const practical = guidance.practical || null;
    const practicalCard = practical && Array.isArray(practical.steps) && practical.steps.length ? `
        <article class="clinical-action-card is-practical">
          <div class="clinical-card-head">
            <span class="clinical-card-icon">1→</span>
            <div><span class="clinical-card-label">Si vepron praktikisht</span><strong>Hapat në rend</strong></div>
          </div>
          <ol class="clinical-practical-steps">${practical.steps.map(step => '<li>' + escapeHtml(clean(step).replace(/^\d+\.\s*/, '')) + '</li>').join('')}</ol>
          ${clean(practical.reassess) ? `<div class="clinical-reassess"><span>Rivlerëso</span><p>${escapeHtml(clean(practical.reassess))}</p></div>` : ''}
          <button class="clinical-copy-button" type="button" data-clinical-copy="practical">Kopjo hapat</button>
        </article>
      ` : '';

    const meds = guidance.medications || null;
    const medicationCard = meds && (
      (Array.isArray(meds.first_line) && meds.first_line.length) ||
      (Array.isArray(meds.alternatives) && meds.alternatives.length) ||
      (Array.isArray(meds.avoid) && meds.avoid.length)
    ) ? `
        <article class="clinical-action-card is-medications">
          <div class="clinical-card-head">
            <span class="clinical-card-icon">Rx</span>
            <div><span class="clinical-card-label">Barnat / terapia</span><strong>Çka përdoret konkretisht</strong></div>
          </div>
          ${Array.isArray(meds.first_line) && meds.first_line.length ? `<div class="clinical-medication-block"><span>Linja e parë</span><ul>${listHtml(meds.first_line)}</ul></div>` : ''}
          ${Array.isArray(meds.alternatives) && meds.alternatives.length ? `<div class="clinical-medication-block"><span>Alternativa</span><ul>${listHtml(meds.alternatives)}</ul></div>` : ''}
          ${Array.isArray(meds.avoid) && meds.avoid.length ? `<div class="clinical-medication-block is-avoid"><span>Mos përdor / kujdes</span><ul>${listHtml(meds.avoid)}</ul></div>` : ''}
          ${clean(meds.note) ? `<p class="clinical-medication-note">${escapeHtml(clean(meds.note))}</p>` : ''}
          ${clean(meds.evidence) ? `<small class="clinical-medication-evidence">Burim: ${escapeHtml(clean(meds.evidence))}</small>` : ''}
          <button class="clinical-copy-button" type="button" data-clinical-copy="medications">Kopjo terapinë</button>
        </article>
      ` : '';

    const redFlags = Array.isArray(guidance.red_flags) && guidance.red_flags.length
      ? `<div class="clinical-red-flags">
          <div class="clinical-card-icon is-danger">!</div>
          <div><span class="clinical-card-label">Shenja alarmi</span><ul>${listHtml(guidance.red_flags)}</ul></div>
        </div>`
      : '';

    el.clinicalActionPanel.innerHTML = `
      <div class="clinical-action-head">
        <div>
          <span class="clinical-action-kicker">${escapeHtml(actionKicker)}</span>
          <h3>${escapeHtml(clean(guidance.title_sq) || 'Orientim praktik klinik')}</h3>
          <p>${escapeHtml(payload.disclaimer || '')}</p>
        </div>
        <div class="clinical-action-head-meta">
          ${inherited}
          <span class="clinical-action-code">${escapeHtml(clean(guidance.code))}</span>
          <button class="clinical-head-button" type="button" data-clinical-copy="all">Kopjo komplet</button>
          <button class="clinical-head-button is-muted" type="button" data-clinical-clear>Pastro</button>
        </div>
      </div>

      <div class="clinical-working-diagnosis">
        <span class="clinical-working-label">Diagnoza e punës</span>
        <strong>${escapeHtml(clean(guidance.working_diagnosis))}</strong>
      </div>

      <div class="clinical-action-grid">
        <article class="clinical-action-card is-referral">
          <div class="clinical-card-head">
            <span class="clinical-card-icon">↗</span>
            <div><span class="clinical-card-label">Te cili specialist referohet</span><strong>${escapeHtml(clean(guidance.referral?.specialist) || 'Sipas tablosë klinike')}</strong></div>
          </div>
          <div class="clinical-referral-purpose">
            <span>Qëllimi i referimit</span>
            <p>${escapeHtml(clean(guidance.referral?.goal))}</p>
          </div>
          <div class="clinical-referral-note">
            <span>Çka të shënohet shkurt</span>
            <p>${escapeHtml(clean(guidance.referral?.note))}</p>
          </div>
          <button class="clinical-copy-button" type="button" data-clinical-copy="referral">Kopjo referimin</button>
        </article>

        <article class="clinical-action-card">
          <div class="clinical-card-head">
            <span class="clinical-card-icon">A</span>
            <div><span class="clinical-card-label">Anamneza</span><strong>Pikat kryesore</strong></div>
          </div>
          <ul>${listHtml(guidance.anamnesis)}</ul>
        </article>

        <article class="clinical-action-card">
          <div class="clinical-card-head">
            <span class="clinical-card-icon">E</span>
            <div><span class="clinical-card-label">Ekzaminimet</span><strong>Kryesoret</strong></div>
          </div>
          <ul>${listHtml(guidance.exams)}</ul>
        </article>

        <article class="clinical-action-card is-management">
          <div class="clinical-card-head">
            <span class="clinical-card-icon">M</span>
            <div><span class="clinical-card-label">Menaxhimi</span><strong>Shkurt</strong></div>
          </div>
          <p>${escapeHtml(clean(guidance.management))}</p>
        </article>

        ${practicalCard}
        ${medicationCard}

        <article class="clinical-action-card is-summary">
          <div class="clinical-card-head">
            <span class="clinical-card-icon">Σ</span>
            <div><span class="clinical-card-label">Summary</span><strong>Në një paragraf</strong></div>
          </div>
          <p>${escapeHtml(clean(guidance.summary))}</p>
          <button class="clinical-copy-button" type="button" data-clinical-copy="summary">Kopjo summary</button>
        </article>
      </div>

      ${redFlags}
    `;
  }

  const guidanceCache = new Map();

  async function loadClinicalGuidance(code) {
    const key = clean(code).toUpperCase();
    if (!key || key.length < 3) {
      state.clinicalGuidance = null;
      state.clinicalGuidanceCode = '';
      state.clinicalGuidanceLoading = false;
      state.clinicalGuidanceError = '';
      renderClinicalAction();
      return;
    }

    if (guidanceCache.has(key)) {
      state.clinicalGuidance = guidanceCache.get(key);
      state.clinicalGuidanceCode = key;
      state.clinicalGuidanceLoading = false;
      state.clinicalGuidanceError = '';
      renderClinicalAction();
      renderClinicalQuickHub();
      return;
    }

    state.clinicalGuidanceCode = key;
    state.clinicalGuidanceLoading = true;
    state.clinicalGuidanceError = '';
    renderClinicalAction();
    renderClinicalQuickHub();

    try {
      const { payload } = await fetchJson(endpoint('guidance', { code:key }), 5000, null, 'default');
      if (state.clinicalGuidanceCode !== key) return;
      const data = payload.data || {};
      guidanceCache.set(key, data);
      state.clinicalGuidance = data;
    } catch (error) {
      if (state.clinicalGuidanceCode !== key) return;
      state.clinicalGuidance = null;
      state.clinicalGuidanceError = clean(error?.message) || 'Paneli klinik nuk u ngarkua.';
    } finally {
      if (state.clinicalGuidanceCode === key) {
        state.clinicalGuidanceLoading = false;
        renderClinicalAction();
        renderClinicalQuickHub();
      }
    }
  }

  function clearClinicalGuidance() {
    state.clinicalGuidance = null;
    state.clinicalGuidanceCode = '';
    state.clinicalGuidanceLoading = false;
    state.clinicalGuidanceError = '';
    renderClinicalAction();
    renderClinicalQuickHub();
  }

  function renderPath() {
    const trail = [];
    const chapter = state.chapters.find(c => clean(c.code) === state.chapter);
    if (chapter) trail.push(chapter);
    trail.push(...state.path);
    el.icdPath.hidden = !trail.length;
    el.icdPathItems.innerHTML = trail.map((node, index) => {
      const current = index === trail.length - 1;
      const sep = index ? `<span class="icd-path-sep" aria-hidden="true">${CHEVRON_RIGHT}</span>` : '';
      return `${sep}<button class="icd-path-node ${current ? 'is-current' : ''}" type="button" data-path-index="${index}" title="${escapeHtml(nodeTitle(node))}"><strong>${escapeHtml(clean(node.code))}</strong><span>${escapeHtml(nodeTitle(node))}</span></button>`;
    }).join('');
  }

  function renderRows() {
    el.nodeCount.textContent = formatNumber(state.rows.length);
    if (state.loading) {
      el.nodeList.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>';
      return;
    }
    if (!state.rows.length) {
      el.nodeList.innerHTML = `<div class="icd-empty">
        <div class="icd-empty-icon">${SEARCH_GLYPH}</div>
        <h3>Nuk ka nënndarje</h3>
        <p>Ky është niveli i fundit i kësaj dege.</p>
      </div>`;
      return;
    }
    el.nodeList.innerHTML = state.rows.map(node => {
      const code = clean(node.code);
      const hasChildren = Number(node.childCount || 0) > 0;
      return `<button class="node-row" type="button" data-code="${escapeHtml(code)}" ${hasChildren ? '' : 'data-leaf="true"'}>
        <span class="node-code">${escapeHtml(code)}</span>
        <span class="node-copy"><strong>${escapeHtml(nodeTitle(node))}</strong>${nodeSubtitle(node) ? `<small>${escapeHtml(nodeSubtitle(node))}</small>` : ''}</span>
        <span class="node-meta">
          <span class="node-level">${escapeHtml(levelLabel(node.level))}${hasChildren ? ` · ${formatNumber(node.childCount)}` : ''}</span>
          ${hasChildren ? `<span class="node-open" aria-hidden="true">${CHEVRON_RIGHT}</span>` : ''}
        </span>
      </button>`;
    }).join('');
  }

  function renderSection() {
    const node = currentNode();
    if (!node) {
      el.nodeKicker.textContent = 'Fillo';
      el.nodeSectionTitle.textContent = 'Zgjidh një kapitull';
      return;
    }
    /* Koka e listës thoshte fjalë për fjalë titullin e hero-s dy dhjetëra pikselë
       më lart. Tani thotë çfarë përmban lista, jo se ku ndodhemi. */
    el.nodeKicker.textContent = 'Nënndarjet';
    el.nodeSectionTitle.textContent = childLevelLabel() || nodeTitle(node);
  }

  const LEVEL_PLURALS = Object.freeze({ chapter:'Kapitujt', block:'Blloqet', category:'Kategoritë', subcategory:'Nënkategoritë' });

  function childLevelLabel() {
    if (state.loading || !state.rows.length) return '';
    const levels = [...new Set(state.rows.map(row => clean(row.level)).filter(Boolean))];
    if (levels.length !== 1) return 'Nyjet e nivelit tjetër';
    return LEVEL_PLURALS[levels[0]] || levelLabel(levels[0]);
  }

  function searchNormalize(value) {
    return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function suggestionHaystack(node) {
    return searchNormalize([
      node?.code, node?.displayTitle, node?.albanianDraft, node?.englishTitle, node?.latinTitle,
      node?.searchMatch?.matchedTerm, node?.searchMatch?.expandedTerm,
    ].filter(Boolean).join(' '));
  }

  const suggestionCache = new Map();
  const SUGGESTION_CACHE_LIMIT = 120;
  const SUGGESTION_CACHE_TTL_MS = 5 * 60 * 1000;
  const SEARCH_SEED_STORAGE_KEY = 'medindex.icd.category-seed.v1';
  const SEARCH_SEED_STORAGE_VERSION = 1;
  const HOT_SEARCH_STORAGE_KEY = 'medindex.icd.qkmf-hot.v1';
  const HOT_SEARCH_STORAGE_VERSION = 1;
  const HOT_SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
  const SEARCH_NETWORK_DELAY_MS = 14;

  function cacheSuggestions(query, data) {
    const key = searchNormalize(query);
    if (!key) return;
    if (suggestionCache.has(key)) suggestionCache.delete(key);
    suggestionCache.set(key, { data, at:Date.now() });
    while (suggestionCache.size > SUGGESTION_CACHE_LIMIT) suggestionCache.delete(suggestionCache.keys().next().value);
  }

  function cachedSuggestions(query, { allowExpired = false } = {}) {
    const key = searchNormalize(query);
    if (!key || !suggestionCache.has(key)) return null;
    const entry = suggestionCache.get(key);
    if (!allowExpired && Date.now() - Number(entry?.at || 0) > SUGGESTION_CACHE_TTL_MS) {
      suggestionCache.delete(key);
      return null;
    }
    suggestionCache.delete(key);
    suggestionCache.set(key, entry);
    return entry?.data || null;
  }

  function prepareSeedRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(node => {
      const normalizedFields = [
        clean(node?.code),
        clean(node?.displayTitle),
        clean(node?.albanianDraft),
        clean(node?.englishTitle),
        clean(node?.latinTitle),
      ].map(searchNormalize).filter(Boolean);
      const tokens = [...new Set(normalizedFields.join(' ').split(' ').filter(Boolean))];
      return { ...node, _search:normalizedFields.join(' '), _tokens:tokens };
    });
  }

  function loadStoredSearchSeed() {
    try {
      const stored = JSON.parse(localStorage.getItem(SEARCH_SEED_STORAGE_KEY) || 'null');
      if (stored?.version !== SEARCH_SEED_STORAGE_VERSION || !Array.isArray(stored.rows) || !stored.rows.length) return false;
      state.searchSeed = prepareSeedRows(stored.rows);
      state.searchSeedReady = true;
      return true;
    } catch {
      return false;
    }
  }

  function storeSearchSeed(rows, revision = '') {
    try {
      const compactRows = (rows || []).map(({ _search, _tokens, ...node }) => node);
      localStorage.setItem(SEARCH_SEED_STORAGE_KEY, JSON.stringify({
        version:SEARCH_SEED_STORAGE_VERSION,
        revision:clean(revision),
        savedAt:Date.now(),
        rows:compactRows,
      }));
    } catch {
      // Search still works from memory/server when storage is unavailable or full.
    }
  }

  function boundedTokenDistance(left, right, maxDistance = 2) {
    if (left === right) return 0;
    if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
    const rows = Array.from({ length:left.length + 1 }, () => new Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;
    for (let i = 1; i <= left.length; i += 1) {
      let rowMin = maxDistance + 1;
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        let value = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + cost,
        );
        if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
          value = Math.min(value, rows[i - 2][j - 2] + 1);
        }
        rows[i][j] = value;
        rowMin = Math.min(rowMin, value);
      }
      if (rowMin > maxDistance) return maxDistance + 1;
    }
    return rows[left.length][right.length];
  }

  function tokenSimilarity(left, right) {
    if (left === right) return 1;
    if (!left || !right) return 0;
    if (left.length >= 3 && right.startsWith(left)) return .9;
    if (right.length >= 3 && left.startsWith(right)) return .86;
    if (Math.abs(left.length - right.length) <= 2 && Math.max(left.length, right.length) <= 18) {
      const distance = boundedTokenDistance(left, right, 2);
      if (distance === 1) return .82;
      if (distance === 2 && Math.max(left.length, right.length) >= 6) return .62;
    }
    if (left.length < 3 || right.length < 3) return left[0] === right[0] ? 0.35 : 0;
    const grams = value => {
      const set = new Set();
      for (let index = 0; index <= value.length - 3; index += 1) set.add(value.slice(index, index + 3));
      return set;
    };
    const a = grams(left);
    const b = grams(right);
    let overlap = 0;
    for (const gram of a) if (b.has(gram)) overlap += 1;
    return (2 * overlap) / Math.max(1, a.size + b.size);
  }

  function localCategoryPreview(query, limit = 8) {
    const q = searchNormalize(query);
    if (!q || !state.searchSeed.length) return [];
    const qTokens = q.split(' ').filter(Boolean);
    const codeQuery = clean(query).toUpperCase().replace(/\s+/g, '');
    const rows = [];

    for (const node of state.searchSeed) {
      const code = clean(node.code).toUpperCase();
      const fields = [
        searchNormalize(node.displayTitle),
        searchNormalize(node.albanianDraft),
        searchNormalize(node.englishTitle),
        searchNormalize(node.latinTitle),
      ].filter(Boolean);
      let score = 0;

      if (code === codeQuery) score = 5000;
      else if (codeQuery.length >= 2 && code.startsWith(codeQuery)) score = 4700 - Math.min(100, code.length - codeQuery.length);
      else if (fields.some(field => field === q)) score = 4500;
      else if (fields.some(field => field.startsWith(q))) score = 4200;
      else if (fields.some(field => field.includes(q))) score = 3650;
      else if (qTokens.length && qTokens.every(token => node._search.includes(token))) score = 3300;
      else if (q.length >= 4) {
        let sum = 0;
        let matched = true;
        for (const token of qTokens) {
          let best = 0;
          for (const candidate of node._tokens) {
            if (Math.abs(candidate.length - token.length) > 3) continue;
            best = Math.max(best, tokenSimilarity(token, candidate));
            if (best >= .92) break;
          }
          if (best < .46) { matched = false; break; }
          sum += best;
        }
        if (matched && qTokens.length) score = 2400 + Math.round((sum / qTokens.length) * 500);
      }

      if (!score) continue;
      rows.push({
        ...node,
        searchMatch:{
          type:'local-category',
          field:'local',
          score,
          matchedTerm:node.displayTitle || node.albanianDraft || node.englishTitle || node.code,
          label:'Instant · Kategori',
          group:'suggested',
          groupLabel:'Sugjerime',
        },
      });
    }

    return rows.sort((a, b) => Number(b.searchMatch.score) - Number(a.searchMatch.score)
      || clean(a.code).localeCompare(clean(b.code), 'en', { numeric:true })).slice(0, limit);
  }

  async function warmSearchSeed() {
    loadStoredSearchSeed();
    try {
      const { payload, response } = await fetchJson(endpoint('seed'), 7000, null, 'default');
      const data = payload.data || {};
      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (!rows.length) return;
      state.searchSeed = prepareSeedRows(rows);
      state.searchSeedReady = true;
      storeSearchSeed(rows, response.headers.get('X-MedIndex-ICD-Revision') || data?.meta?.source?.revision || '');
    } catch {
      // Non-blocking optimization only; authoritative server search remains available.
    }
  }

  function scheduleSearchSeedWarmup() {
    const start = () => void warmSearchSeed();
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout:1200 });
    else setTimeout(start, 450);
  }

  function prepareHotQuick(rows) {
    return (Array.isArray(rows) ? rows : []).map(item => {
      const aliases = [item.label_sq, ...(item.aliases || [])].map(searchNormalize).filter(Boolean);
      const node = item.node || {};
      const fields = [
        clean(item.code), item.label_sq, ...(item.aliases || []),
        node.displayTitle, node.albanianDraft, node.englishTitle, node.latinTitle,
      ].map(searchNormalize).filter(Boolean);
      return {
        ...item,
        node,
        _aliases:[...new Set(aliases)],
        _search:[...new Set(fields)].join(' '),
        _tokens:[...new Set(fields.join(' ').split(' ').filter(Boolean))],
      };
    });
  }

  function prepareHotSymptoms(rows) {
    return (Array.isArray(rows) ? rows : []).map(item => {
      const aliases = [item.label_sq, ...(item.aliases || [])].map(searchNormalize).filter(Boolean);
      return {
        ...item,
        _aliases:[...new Set(aliases)],
        _tokens:[...new Set(aliases.join(' ').split(' ').filter(Boolean))],
      };
    });
  }

  function bootstrapDomHotQuick() {
    if (state.hotQuick.length) return;
    const rows = [...document.querySelectorAll('.icd-quick-chip[data-search-example]')].map(button => {
      const code = clean(button.dataset.searchExample);
      const label = clean(button.getAttribute('title')) || clean(button.querySelector('span')?.textContent) || code;
      const categoryLike = /^[A-Z]\d{2}$/.test(code);
      return {
        code,
        label_sq:label,
        aliases:[label],
        urgent:button.classList.contains('is-urgent'),
        node:{
          code,
          level:categoryLike ? 'category' : 'subcategory',
          chapter:code.charAt(0),
          block:'',
          parentCode:categoryLike ? '' : code.slice(0, 3),
          englishTitle:'',
          albanianDraft:label,
          latinTitle:'',
          latinParentTitle:'',
          latinParentCode:'',
          displayTitle:label,
          childCount:0,
          breadcrumb:[],
          searchMatch:null,
          symptomRelation:null,
        },
      };
    }).filter(item => item.code);
    if (!rows.length) return;
    state.hotQuick = prepareHotQuick(rows);
    state.hotSearchReady = true;
  }

  function applyHotPayload(data) {
    state.hotQuick = prepareHotQuick(data?.quick);
    state.hotSymptoms = prepareHotSymptoms(data?.symptoms);
    state.hotSearchReady = Boolean(state.hotQuick.length || state.hotSymptoms.length);
  }

  function loadStoredHotSearch() {
    try {
      const stored = JSON.parse(localStorage.getItem(HOT_SEARCH_STORAGE_KEY) || 'null');
      if (stored?.version !== HOT_SEARCH_STORAGE_VERSION || !stored.data) return false;
      if (Date.now() - Number(stored.savedAt || 0) > HOT_SEARCH_TTL_MS) return false;
      applyHotPayload(stored.data);
      return state.hotSearchReady;
    } catch {
      return false;
    }
  }

  function storeHotSearch(data) {
    try {
      localStorage.setItem(HOT_SEARCH_STORAGE_KEY, JSON.stringify({
        version:HOT_SEARCH_STORAGE_VERSION,
        savedAt:Date.now(),
        data,
      }));
    } catch {
      // One-shot hot cache is an optimization; server search remains authoritative.
    }
  }

  async function warmHotSearch() {
    if (!state.hotSearchReady) loadStoredHotSearch();
    try {
      const { payload } = await fetchJson(endpoint('hot'), 7000, null, 'default');
      const data = payload.data || {};
      if (!Array.isArray(data.quick) && !Array.isArray(data.symptoms)) return;
      applyHotPayload(data);
      storeHotSearch(data);
    } catch {
      // Keep locally stored hot index when refresh is temporarily unavailable.
    }
  }

  function phraseHotScore(query, aliases) {
    if (!query || !aliases?.length) return 0;
    let best = 0;
    for (const alias of aliases) {
      if (alias === query) best = Math.max(best, 1);
      else if (query.length >= 2 && alias.startsWith(query)) best = Math.max(best, .97);
      else if (alias.length >= 3 && query.startsWith(alias)) best = Math.max(best, .93);
      else if (query.length >= 3 && alias.includes(query)) best = Math.max(best, .91);
      else if (alias.length >= 3 && query.includes(alias)) best = Math.max(best, .88);
      else if (Math.abs(alias.length - query.length) <= 3 && Math.max(alias.length, query.length) <= 28) {
        const maxDistance = Math.max(alias.length, query.length) >= 12 ? 3 : 2;
        const distance = boundedTokenDistance(query, alias, maxDistance);
        if (distance <= maxDistance) best = Math.max(best, distance === 1 ? .88 : distance === 2 ? .78 : .70);
      }
    }
    return best;
  }

  function hotSymptomPreview(query) {
    const q = searchNormalize(query);
    if (!q || q.length < 3 || !state.hotSymptoms.length) return null;
    if (/^[a-tv-z][0-9oil]{2}/i.test(clean(query).replace(/\s+/g, ''))) return null;

    const qTokens = q.split(' ').filter(Boolean);
    let best = null;
    for (const concept of state.hotSymptoms) {
      let score = phraseHotScore(q, concept._aliases);
      if (score < .70 && qTokens.length) {
        let sum = 0;
        let matched = 0;
        for (const token of qTokens) {
          let tokenBest = 0;
          for (const candidate of concept._tokens) tokenBest = Math.max(tokenBest, tokenSimilarity(token, candidate));
          if (tokenBest >= .64) matched += 1;
          sum += tokenBest;
        }
        const coverage = matched / qTokens.length;
        if (coverage >= .75) score = Math.max(score, .58 + ((sum / qTokens.length) * .28));
      }
      if (score >= .72 && (!best || score > best.score)) best = { concept, score };
    }
    if (!best) return null;

    const symptom = {
      id:best.concept.id,
      label_sq:best.concept.label_sq,
      symptom_code:best.concept.symptom_code,
      confidence:Number(best.score.toFixed(3)),
      match_type:best.score >= .995 ? 'exact' : best.score >= .90 ? 'prefix' : 'fuzzy-tokens',
      matched_alias:'',
      ambiguous:false,
      alternatives:[],
      diagnosticDecision:false,
      probability:false,
      note_sq:'Këto janë kandidatë për kërkim/diferencial nga një simptomë e vetme; nuk janë diagnozë përfundimtare.',
      localHot:true,
    };
    const rows = (best.concept.candidates || []).map(node => ({
      ...node,
      searchMatch:{
        ...(node.searchMatch || {}),
        type:'symptom-differential',
        field:'symptom',
        label:'Nga simptoma',
        score:Number(node.searchMatch?.score || 980),
        group:'suggested',
        groupLabel:'Sugjerime',
      },
    }));
    return { symptomIntent:symptom, rows };
  }

  function hotQuickPreview(query, limit = 8) {
    const q = searchNormalize(query);
    if (!q || !state.hotQuick.length) return [];
    const qTokens = q.split(' ').filter(Boolean);
    const codeQuery = clean(query).toUpperCase().replace(/\s+/g, '');
    const ranked = [];

    for (const item of state.hotQuick) {
      const node = item.node || {};
      const code = clean(item.code).toUpperCase();
      let score = 0;
      if (code === codeQuery) score = 6000;
      else if (codeQuery.length >= 2 && code.startsWith(codeQuery)) score = 5700 - Math.min(80, code.length - codeQuery.length);
      else {
        const phrase = phraseHotScore(q, item._aliases);
        if (phrase) score = 5000 + Math.round(phrase * 500);
        else if (qTokens.length && qTokens.every(token => item._search.includes(token))) score = 4300;
        else if (q.length >= 4) {
          let sum = 0;
          let matched = true;
          for (const token of qTokens) {
            let best = 0;
            for (const candidate of item._tokens) best = Math.max(best, tokenSimilarity(token, candidate));
            if (best < .60) { matched = false; break; }
            sum += best;
          }
          if (matched && qTokens.length) score = 3600 + Math.round((sum / qTokens.length) * 450);
        }
      }
      if (!score) continue;
      ranked.push({
        ...node,
        searchMatch:{
          type:'hot-local',
          field:'hot',
          score,
          matchedTerm:item.label_sq || node.displayTitle || code,
          label:item.urgent ? 'Instant · Urgjencë' : 'Instant · QKMF',
          group:'suggested',
          groupLabel:'Sugjerime',
        },
      });
    }

    return ranked.sort((a, b) => Number(b.searchMatch.score) - Number(a.searchMatch.score)
      || clean(a.code).localeCompare(clean(b.code), 'en', { numeric:true })).slice(0, limit);
  }

  function mergeInstantRows(...lists) {
    const seen = new Set();
    const rows = [];
    for (const list of lists) {
      for (const row of list || []) {
        const code = clean(row?.code);
        if (!code || seen.has(code)) continue;
        seen.add(code);
        rows.push(row);
        if (rows.length >= 18) return rows;
      }
    }
    return rows;
  }

  function immediatePreview(query) {
    const normalized = searchNormalize(query);
    if (!normalized) return { rows:[], meta:null };
    const direct = cachedSuggestions(query);
    if (direct?.rows?.length) return { rows:direct.rows, meta:direct };

    const symptom = hotSymptomPreview(query);
    const hot = hotQuickPreview(query, 8);
    const local = localCategoryPreview(query, 8);
    const instantRows = mergeInstantRows(symptom?.rows || [], hot, local);
    if (instantRows.length) {
      return {
        rows:instantRows,
        meta:symptom ? { symptomIntent:symptom.symptomIntent, instantHot:true } : { instantHot:true },
      };
    }

    let best = null;
    for (const [key, entry] of [...suggestionCache.entries()].reverse()) {
      const value = entry?.data;
      if (!normalized.startsWith(key) || !value?.rows?.length) continue;
      best = value.rows;
      break;
    }
    const source = best || state.suggestions;
    if (!Array.isArray(source) || !source.length) return { rows:[], meta:null };
    const tokens = normalized.split(' ').filter(Boolean);
    return {
      rows:source.filter(node => {
        const haystack = suggestionHaystack(node);
        return tokens.every(token => haystack.includes(token));
      }).slice(0, 18),
      meta:null,
    };
  }

  function suggestionTranslations(node) {
    const primary = nodeTitle(node);
    const items = [];
    const sq = clean(node?.albanianDraft);
    const en = clean(node?.englishTitle);
    const la = clean(node?.latinTitle);
    const latinParent = clean(node?.latinParentTitle);
    const latinParentCode = clean(node?.latinParentCode);
    if (sq && sq !== primary) items.push({ lang:'SQ', text:sq, kind:'exact' });
    if (en) items.push({ lang:'EN', text:en, kind:'exact' });
    if (la) {
      items.push({ lang:'LA', text:la, kind:'exact' });
    } else if (latinParent) {
      items.push({ lang:`LA (${latinParentCode})`, text:latinParent, kind:'parent' });
    } else {
      items.push({ lang:'LA', text:'—', kind:'missing' });
    }
    return items;
  }

  function normalizedCharMap(value) {
    const original = clean(value);
    let normalized = '';
    const map = [];
    for (let index = 0; index < original.length; index += 1) {
      const folded = original[index].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      for (const char of folded) {
        normalized += /[a-z0-9]/.test(char) ? char : ' ';
        map.push(index);
      }
    }
    return { original, normalized, map };
  }

  function highlightSearchText(value, query) {
    const text = clean(value);
    const tokens = searchNormalize(query).split(' ').filter(token => token.length >= 2).slice(0, 4);
    if (!text || !tokens.length) return escapeHtml(text);

    const folded = normalizedCharMap(text);
    const ranges = [];
    for (const token of tokens) {
      let from = 0;
      while (from < folded.normalized.length) {
        const found = folded.normalized.indexOf(token, from);
        if (found < 0) break;
        const start = folded.map[found];
        const endMapIndex = Math.min(folded.map.length - 1, found + token.length - 1);
        const end = folded.map[endMapIndex] + 1;
        if (Number.isInteger(start) && Number.isInteger(end) && end > start) ranges.push([start, end]);
        from = found + token.length;
      }
    }
    if (!ranges.length) return escapeHtml(text);

    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }

    let html = '';
    let cursor = 0;
    for (const [start, end] of merged) {
      html += escapeHtml(text.slice(cursor, start));
      html += `<mark>${escapeHtml(text.slice(start, end))}</mark>`;
      cursor = end;
    }
    html += escapeHtml(text.slice(cursor));
    return html;
  }

  function matchSourceLabel(node) {
    const field = clean(node?.searchMatch?.field);
    const type = clean(node?.searchMatch?.type);
    const source = field === 'sq' ? 'SQ'
      : field === 'en' ? 'EN'
        : field === 'la' ? 'LA'
          : field === 'code' ? 'Kodi'
            : field === 'hierarchy' ? 'Hierarki'
              : field === 'local' ? 'Instant'
                : field === 'hot' ? 'QKMF'
                  : field === 'symptom' ? 'Simptomë'
                  : field === 'alias' ? 'Term klinik'
                    : '';
    if (!source) return '';
    return type.startsWith('fuzzy-') || type === 'code-fuzzy' ? `Typo · ${source}` : source;
  }

  function suggestionTranslationHtml(node, query) {
    return suggestionTranslations(node).map(item => `
      <small class="icd-suggestion-translation is-${escapeHtml(item.kind)}"
        ${item.kind === 'parent' ? 'title="Latin i kategorisë prind — jo titull specifik i nënkodit"' : ''}>
        <b>${escapeHtml(item.lang)}</b><span>${highlightSearchText(item.text, query)}</span>
      </small>`).join('');
  }

  function renderSuggestions() {
    if (!el.icdSuggestions || !el.icdSearchBox) return;
    const query = clean(el.icdSearch?.value);
    const shouldOpen = state.suggestionOpen && query.length >= 2 && (state.suggestionLoading || state.suggestions.length || state.searching);
    el.icdSearchBox.setAttribute('aria-expanded', String(Boolean(shouldOpen)));
    if (!shouldOpen) {
      el.icdSuggestions.hidden = true;
      el.icdSearch?.removeAttribute('aria-activedescendant');
      return;
    }

    el.icdSuggestions.hidden = false;
    const interpreted = clean(state.suggestionMeta?.interpretedAs);
    const interpretation = interpreted && searchNormalize(interpreted) !== searchNormalize(query)
      ? ` · kuptuar si <strong>${escapeHtml(interpreted)}</strong>`
      : '';
    const head = `<div class="icd-suggestion-head"><span>${state.suggestionLoading ? 'Duke rafinuar…' : `${formatNumber(state.suggestions.length)} sugjerime`}${interpretation}</span><strong>↑ ↓ Enter</strong></div>`;
    const symptom = state.suggestionMeta?.symptomIntent || null;
    const symptomTypo = symptom && ['fuzzy-phrase','fuzzy-tokens'].includes(clean(symptom.match_type));
    const symptomBanner = symptom
      ? `<div class="icd-symptom-intent ${symptom.ambiguous ? 'is-ambiguous' : ''}" role="note">
          <span class="icd-symptom-intent-icon" aria-hidden="true">✦</span>
          <span class="icd-symptom-intent-copy">
            <strong>E kuptova si: ${escapeHtml(clean(symptom.label_sq))}${symptom.symptom_code ? ` · ${escapeHtml(clean(symptom.symptom_code))}` : ''}</strong>
            <small>${symptom.ambiguous
              ? 'Termi është i paqartë; po tregoj kërkimin ICD pa zgjedhur diagnozë.'
              : `${symptomTypo ? 'Typo i korrigjuar · ' : ''}Kandidatët më poshtë janë orientues nga simptoma, jo diagnozë përfundimtare.`}</small>
          </span>
        </div>`
      : '';

    if (!state.suggestions.length) {
      el.icdSuggestions.innerHTML = head + symptomBanner + `<div class="icd-suggestion-empty"><strong>${state.suggestionLoading ? 'Po kërkoj…' : 'Nuk gjeta përputhje të sigurt'}</strong><span>Provo kod, Shqip, English ose Latin — edhe me një typo tjetër.</span></div>`;
      return;
    }

    let previousSection = '';
    const rows = state.suggestions.map((node, index) => {
      const active = index === state.activeSuggestion;
      const isDifferential = clean(node?.searchMatch?.field) === 'symptom';
      const best = index === 0 && !isDifferential;
      const match = clean(node?.searchMatch?.label) || 'Përputhje';
      const source = matchSourceLabel(node);
      const translations = suggestionTranslationHtml(node, query);
      const parent = node.level === 'subcategory' ? clean(node.parentCode) : '';
      const childCount = Number(node?.childCount || 0);
      const relationReason = clean(node?.symptomRelation?.reason_sq);
      const hierarchyHint = parent
        ? `<span class="icd-family-hint"><b>${escapeHtml(parent)}</b><span aria-hidden="true">→</span><strong>${escapeHtml(clean(node.code))}</strong></span>`
        : childCount > 0
          ? `<span class="icd-family-hint"><strong>${formatNumber(childCount)}</strong> nënkode</span>`
          : '';
      const section = isDifferential
        ? 'Nga simptoma · diagnoza të mundshme'
        : node.level === 'category'
          ? 'Kategoritë kryesore'
          : node.level === 'subcategory'
            ? 'Nënkategoritë'
            : 'Konteksti ICD';
      const sectionHead = section !== previousSection
        ? `<div class="icd-suggestion-section ${isDifferential ? 'is-differential' : ''}" role="presentation">${escapeHtml(section)}</div>`
        : '';
      previousSection = section;
      return `${sectionHead}<button class="icd-suggestion-row is-${escapeHtml(clean(node.level))} ${isDifferential ? 'is-differential' : ''} ${best ? 'is-best' : ''} ${active ? 'is-active' : ''}" type="button" role="option"
        id="icd-suggestion-${index}" aria-selected="${active}" data-suggestion-index="${index}" data-code="${escapeHtml(clean(node.code))}">
        <span class="icd-suggestion-code">${highlightSearchText(clean(node.code), query)}</span>
        <span class="icd-suggestion-copy">
          <span class="icd-suggestion-titleline"><strong>${highlightSearchText(nodeTitle(node), query)}</strong>${best ? '<em>Përputhja më e mirë</em>' : isDifferential ? '<em class="is-differential">Kandidat diferencial</em>' : ''}</span>
          ${relationReason ? `<span class="icd-symptom-reason">${escapeHtml(relationReason)}</span>` : ''}
          ${hierarchyHint}
          ${translations}
        </span>
        <span class="icd-suggestion-meta">
          ${source ? `<span class="icd-match-source ${isDifferential ? 'is-symptom' : ''}">${escapeHtml(source)}</span>` : ''}
          <span class="icd-match-chip">${escapeHtml(match)}</span>
          <span class="icd-level-chip">${escapeHtml(levelLabel(node.level))}</span>
        </span>
      </button>`;
    }).join('');
    el.icdSuggestions.innerHTML = head + symptomBanner + rows;
    if (state.activeSuggestion >= 0) {
      el.icdSearch?.setAttribute('aria-activedescendant', `icd-suggestion-${state.activeSuggestion}`);
      el.icdSuggestions.querySelector('.icd-suggestion-row.is-active')?.scrollIntoView({ block:'nearest' });
    } else {
      el.icdSearch?.removeAttribute('aria-activedescendant');
    }
  }

  function render() {
    renderMetrics();
    renderChapters();
    renderClinicalQuickHub();
    renderHero();
    renderClinicalAction();
    renderPath();
    renderSection();
    renderRows();
    renderSuggestions();
  }

  /* Statusi rri në rreshtin e komandës, jo në një brez të vetin, dhe nuk tregon
     më milisekondat e kërkesës: sa zgjati fetch-i është telemetri zhvilluesi,
     jo informacion klinik. Toni thotë vetëm nëse po pritet apo dështoi. */
  function setStatus(text, tone = '') {
    el.icdStatusText.textContent = text;
    el.icdStatusText.classList.toggle('is-busy', tone === 'busy');
    el.icdStatusText.classList.toggle('is-error', tone === 'error');
  }

  // --- të dhënat ------------------------------------------------------------

  async function loadNav() {
    setStatus('Duke ngarkuar hierarkinë ICD-10…', 'busy');
    const { payload, response } = await fetchJson(endpoint('nav'));
    const data = payload.data || {};
    state.chapters = Array.isArray(data.chapters) ? data.chapters : [];
    state.blocks = Array.isArray(data.blocks) ? data.blocks : [];
    state.meta = data.meta || null;
    const source = response.headers.get('X-MedIndex-Data-Source') || 'Supabase';
    el.sourceStatus.textContent = `${source} · aktiv`;
    el.syncText.textContent = source;
    setStatus(`${formatNumber(state.chapters.length)} kapituj të ngarkuar`);
  }

  const childrenCache = new Map();
  const childrenPending = new Map();
  const CHILDREN_CACHE_TTL_MS = 5 * 60 * 1000;

  function cachedChildren(code) {
    const key = clean(code);
    const entry = childrenCache.get(key);
    if (!entry || Date.now() - entry.at > CHILDREN_CACHE_TTL_MS) {
      childrenCache.delete(key);
      return null;
    }
    return entry.rows;
  }

  async function fetchChildrenRows(code) {
    const key = clean(code);
    const cached = cachedChildren(key);
    if (cached) return cached;
    if (childrenPending.has(key)) return childrenPending.get(key);

    const pending = fetchJson(endpoint('children', { parent:key }), 6000, null, 'default')
      .then(({ payload }) => {
        const rows = Array.isArray(payload?.data?.rows) ? payload.data.rows : [];
        childrenCache.set(key, { rows, at:Date.now() });
        return rows;
      })
      .finally(() => childrenPending.delete(key));
    childrenPending.set(key, pending);
    return pending;
  }

  function prefetchChildren(node) {
    const code = clean(node?.code);
    if (!code || Number(node?.childCount || 0) <= 0 || cachedChildren(code) || childrenPending.has(code)) return;
    void fetchChildrenRows(code).catch(() => {});
  }

  async function loadChildren(code) {
    const key = clean(code);
    const instant = cachedChildren(key);
    const requestId = ++state.requestId;
    if (instant) {
      state.rows = instant;
      state.loading = false;
      setStatus(`${formatNumber(instant.length)} nyje nën ${key} · instant`);
      render();
      if (state.reveal) { state.reveal = false; revealNodePanel(); }
      return;
    }

    state.loading = true;
    setStatus(`Duke hapur ${key}…`, 'busy');
    renderRows();
    try {
      const rows = await fetchChildrenRows(key);
      if (requestId !== state.requestId) return;
      state.rows = rows;
      setStatus(`${formatNumber(state.rows.length)} nyje nën ${key}`);
    } catch (error) {
      if (requestId !== state.requestId) return;
      state.rows = [];
      setStatus(error?.message || 'Hierarkia nuk u ngarkua.', 'error');
    } finally {
      if (requestId === state.requestId) {
        state.loading = false;
        render();
        if (state.reveal) { state.reveal = false; revealNodePanel(); }
      }
    }
  }

  let searchAbortController = null;

  function applySuggestionData(query, data, { fromCache = false } = {}) {
    state.searching = true;
    state.query = query;
    state.suggestions = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data?.suggestions) ? data.suggestions : []);
    state.suggestionMeta = data || null;
    state.suggestionOpen = true;
    state.activeSuggestion = state.suggestions.length ? 0 : -1;
    renderSuggestions();

    const top = state.suggestions[0];
    prefetchChildren(top);
    const corrected = top?.searchMatch?.type?.startsWith('fuzzy-') || top?.searchMatch?.type === 'code-fuzzy';
    const suffix = corrected ? ' · typo i korrigjuar' : fromCache ? ' · instant' : '';
    setStatus(`${formatNumber(state.suggestions.length)} sugjerime për «${query}»${suffix}`);
  }

  async function runSearch(query) {
    const value = clean(query);
    if (value.length < 2) return;

    searchAbortController?.abort();
    searchAbortController = null;
    const requestId = ++state.requestId;

    const cached = cachedSuggestions(value);
    if (cached) {
      applySuggestionData(value, cached, { fromCache:true });
      state.suggestionLoading = false;
      return;
    }

    const controller = new AbortController();
    searchAbortController = controller;
    state.searching = true;
    state.query = value;
    state.suggestionOpen = true;
    state.suggestionLoading = true;
    state.suggestionMeta = null;

    const preview = immediatePreview(value);
    if (preview.rows.length) {
      state.suggestions = preview.rows;
      state.suggestionMeta = preview.meta;
      state.activeSuggestion = 0;
      setStatus(`${formatNumber(preview.rows.length)} rezultate instant · duke rafinuar…`, 'busy');
    } else {
      setStatus(`Duke kërkuar «${value}»…`, 'busy');
    }
    renderSuggestions();

    try {
      const { payload } = await fetchJson(endpoint('suggest', { q:value }), 6000, controller.signal, 'default');
      if (requestId !== state.requestId) return;
      const data = payload.data || {};
      cacheSuggestions(value, data);
      applySuggestionData(value, data);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      if (requestId !== state.requestId) return;
      if (!state.suggestions.length) setStatus(error?.message || 'Kërkimi dështoi.', 'error');
    } finally {
      if (searchAbortController === controller) searchAbortController = null;
      if (requestId === state.requestId) {
        state.suggestionLoading = false;
        renderSuggestions();
      }
    }
  }

  function updateSearchClear() {
    if (el.icdSearchClear) el.icdSearchClear.hidden = !clean(el.icdSearch?.value);
  }

  function setActiveSuggestion(index) {
    if (!state.suggestions.length) return;
    const next = ((index % state.suggestions.length) + state.suggestions.length) % state.suggestions.length;
    const previous = state.activeSuggestion;
    state.activeSuggestion = next;
    const oldRow = previous >= 0 ? document.getElementById(`icd-suggestion-${previous}`) : null;
    const newRow = document.getElementById(`icd-suggestion-${next}`);
    oldRow?.classList.remove('is-active');
    oldRow?.setAttribute('aria-selected', 'false');
    newRow?.classList.add('is-active');
    newRow?.setAttribute('aria-selected', 'true');
    el.icdSearch?.setAttribute('aria-activedescendant', `icd-suggestion-${next}`);
    newRow?.scrollIntoView({ block:'nearest' });
    prefetchChildren(state.suggestions[next]);
  }

  function clearSearch({ preserveInput = false } = {}) {
    searchAbortController?.abort();
    searchAbortController = null;
    state.searching = false;
    state.query = '';
    state.suggestions = [];
    state.suggestionMeta = null;
    state.suggestionLoading = false;
    state.suggestionOpen = false;
    state.activeSuggestion = -1;
    if (!preserveInput && el.icdSearch?.value) el.icdSearch.value = '';
    updateSearchClear();
    renderSuggestions();
  }

  // --- lëvizja --------------------------------------------------------------

  /* Nën 940px të dy panelet bien njëri poshtë tjetrit, kështu që pas zgjedhjes
     së kapitullit përmbajtja mbetej një ekran e gjysmë më poshtë, pas tetë
     rreshtave të listës. Zgjedhja e sjell atë vetë në pamje. */
  function revealNodePanel() {
    if (!window.matchMedia('(max-width:940px)').matches) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    requestAnimationFrame(() => el.nodeHero?.scrollIntoView({ block:'start', behavior }));
  }

  function selectChapter(code, options = {}) {
    clearSearch();
    state.chapter = clean(code);
    state.path = [];
    clearClinicalGuidance();
    writeHash(state.chapter);
    render();
    state.reveal = Boolean(options.reveal);
    if (state.chapter) void loadChildren(state.chapter);
    else state.reveal = false;
  }

  async function openNode(code) {
    const node = [...state.suggestions, ...state.rows].find(row => clean(row.code) === clean(code));
    if (!node) return false;

    if (state.searching) {
      // Nga kërkimi hyjmë te dega e vërtetë, jo te një listë e sheshtë.
      clearSearch();
      const chapter = clean(node.chapter) || clean(node.code).charAt(0);
      const known = state.chapters.find(c => clean(c.code) === chapter);
      state.chapter = known ? chapter : state.chapter;
      state.path = [node];
    } else {
      state.path.push(node);
    }

    writeHash(clean(node.code));
    state.reveal = true;
    void loadClinicalGuidance(clean(node.code));

    if (!Number(node.childCount || 0)) {
      state.rows = [];
      state.loading = false;
      setStatus(`${clean(node.code)} · kodi i zgjedhur`);
      render();
      revealNodePanel();
      return true;
    }

    render();
    await loadChildren(clean(node.code));
    return true;
  }

  async function openHashCode(code) {
    const value = clean(code).toUpperCase();
    if (!value) return false;

    const chapter = state.chapters.find(item => clean(item.code).toUpperCase() === value);
    if (chapter) {
      selectChapter(clean(chapter.code));
      return true;
    }

    await runSearch(value);
    const exact = state.suggestions.find(row => clean(row.code).toUpperCase() === value)
      || state.rows.find(row => clean(row.code).toUpperCase() === value);
    if (exact) return openNode(clean(exact.code));

    return false;
  }

  function goToPathIndex(index) {
    const chapterOffset = state.chapters.some(c => clean(c.code) === state.chapter) ? 1 : 0;
    if (index < chapterOffset) { selectChapter(state.chapter); return; }
    state.path = state.path.slice(0, index - chapterOffset + 1);
    const node = state.path[state.path.length - 1];
    writeHash(clean(node?.code) || state.chapter);
    if (node?.code) void loadClinicalGuidance(clean(node.code));
    else clearClinicalGuidance();
    render();
    void loadChildren(clean(node?.code) || state.chapter);
  }

  function writeHash(code) {
    const url = new URL(location.href);
    url.hash = code ? encodeURIComponent(code) : '';
    history.replaceState(code ? { icd:code } : {}, '', url.pathname + url.search + url.hash);
  }

  function readHash() {
    return clean(decodeURIComponent(location.hash.slice(1) || '')).toUpperCase();
  }

  let toastTimer = 0;
  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
  }

  // --- lidhjet --------------------------------------------------------------

  let searchTimer = 0;
  function bindEvents() {
    el.clinicalQuickHub?.addEventListener('click', event => {
      const groupButton = event.target.closest('[data-clinical-group]');
      if (groupButton) {
        state.clinicalGroup = clean(groupButton.dataset.clinicalGroup) || 'core';
        renderClinicalQuickHub();
        return;
      }
      const diagnosisButton = event.target.closest('[data-clinical-quick-code]');
      if (diagnosisButton) {
        const code = clean(diagnosisButton.dataset.clinicalQuickCode).toUpperCase();
        if (!code) return;
        void loadClinicalGuidance(code).then(() => {
          const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
          el.clinicalActionPanel?.scrollIntoView({ block:'start', behavior });
        });
      }
    });

    el.chapterList.addEventListener('click', event => {
      const button = event.target.closest('[data-chapter]');
      if (button) selectChapter(button.dataset.chapter, { reveal:true });
    });

    el.nodeList.addEventListener('click', event => {
      const button = event.target.closest('[data-code]');
      if (button) void openNode(button.dataset.code);
    });

    el.icdPathItems.addEventListener('click', event => {
      const button = event.target.closest('[data-path-index]');
      if (button) goToPathIndex(Number(button.dataset.pathIndex));
    });

    el.icdPathReset?.addEventListener('click', () => {
      clearSearch();
      state.chapter = '';
      state.path = [];
      state.rows = [];
      clearClinicalGuidance();
      writeHash('');
      setStatus(`${formatNumber(state.chapters.length)} kapituj`);
      render();
    });

    el.icdSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const value = clean(el.icdSearch.value);
      if (value.length < 2) {
        clearSearch({ preserveInput:true });
        setStatus(value ? 'Shkruaj edhe një karakter…' : `${formatNumber(state.chapters.length)} kapituj të ngarkuar`);
        return;
      }

      state.searching = true;
      state.query = value;
      state.suggestionOpen = true;
      const preview = immediatePreview(value);
      state.suggestionMeta = preview.meta;
      if (preview.rows.length) {
        state.suggestions = preview.rows;
        state.activeSuggestion = 0;
        renderSuggestions();
        prefetchChildren(preview.rows[0]);
      }
      updateSearchClear();
      searchTimer = setTimeout(() => void runSearch(value), SEARCH_NETWORK_DELAY_MS);
    });

    el.icdSearch.addEventListener('focus', () => {
      if (!state.hotSearchReady) void warmHotSearch();
      if (!state.searchSeedReady) void warmSearchSeed();
      if (clean(el.icdSearch.value).length >= 2) {
        state.suggestionOpen = true;
        renderSuggestions();
      }
    });

    el.icdSearch.addEventListener('keydown', event => {
      if (!state.suggestionOpen || !state.suggestions.length) {
        if (event.key === 'Enter' && clean(el.icdSearch.value).length >= 2) {
          event.preventDefault();
          void runSearch(clean(el.icdSearch.value));
          return;
        }
        if (event.key === 'Escape') { clearSearch({ preserveInput:true }); el.icdSearch.blur(); }
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveSuggestion(state.activeSuggestion + direction);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const index = state.activeSuggestion >= 0 ? state.activeSuggestion : 0;
        const node = state.suggestions[index];
        if (node) void openNode(clean(node.code));
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        state.suggestionOpen = false;
        renderSuggestions();
      }
    });

    el.icdSearchClear?.addEventListener('click', () => {
      clearTimeout(searchTimer);
      clearSearch();
      el.icdSearch.focus();
      setStatus(`${formatNumber(state.chapters.length)} kapituj të ngarkuar`);
    });

    el.icdSuggestions?.addEventListener('mousedown', event => event.preventDefault());
    el.icdSuggestions?.addEventListener('pointerover', event => {
      const button = event.target.closest('[data-suggestion-index]');
      if (!button) return;
      prefetchChildren(state.suggestions[Number(button.dataset.suggestionIndex)]);
    });
    el.icdSuggestions?.addEventListener('click', event => {
      const button = event.target.closest('[data-suggestion-index]');
      if (!button) return;
      const node = state.suggestions[Number(button.dataset.suggestionIndex)];
      if (node) void openNode(clean(node.code));
    });

    el.clinicalActionPanel?.addEventListener('click', async event => {
      const clearButton = event.target.closest('[data-clinical-clear]');
      if (clearButton) { clearClinicalGuidance(); return; }
      const button = event.target.closest('[data-clinical-copy]');
      if (!button || !state.clinicalGuidance?.guidance) return;
      const textValue = clinicalCopyText(clean(button.dataset.clinicalCopy), state.clinicalGuidance.guidance);
      if (!textValue) return;
      try {
        await navigator.clipboard.writeText(textValue);
        showToast('U kopjua në clipboard.');
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = textValue;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        showToast('U kopjua në clipboard.');
      }
    });

    document.querySelectorAll('[data-search-example]').forEach(button => {
      button.addEventListener('click', () => {
        const value = clean(button.dataset.searchExample);
        el.icdSearch.value = value;
        el.icdSearch.focus();
        state.suggestionOpen = true;
        void runSearch(value);
      });
    });

    document.addEventListener('pointerdown', event => {
      if (event.target.closest('#icdSearchBox') || event.target.closest('#icdSuggestions')) return;
      state.suggestionOpen = false;
      renderSuggestions();
    });

    document.addEventListener('keydown', event => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const slash = event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (commandK || slash) {
        event.preventDefault();
        el.icdSearch.focus();
        el.icdSearch.select();
        if (clean(el.icdSearch.value).length >= 2) { state.suggestionOpen = true; renderSuggestions(); }
      }
    });

    el.menuButton?.addEventListener('click', () => { el.sidebar.classList.add('is-open'); el.sidebarBackdrop.hidden = false; });
    const closeSidebar = () => { el.sidebar.classList.remove('is-open'); el.sidebarBackdrop.hidden = true; };
    el.sidebarClose?.addEventListener('click', closeSidebar);
    el.sidebarBackdrop?.addEventListener('click', closeSidebar);

    el.logoutButton?.addEventListener('click', async () => {
      el.logoutButton.disabled = true;
      try {
        const response = await fetch('/api/auth', { method:'DELETE', credentials:'same-origin', headers:{ Accept:'application/json' } });
        if (!response.ok) throw new Error('Logout failed');
        location.replace('/landing.html');
      } catch {
        el.logoutButton.disabled = false;
        showToast('Dalja nuk u krye. Provo përsëri.');
      }
    });

    window.addEventListener('hashchange', () => {
      const code = readHash();
      if (!code) return;
      void openHashCode(code);
    });
  }

  async function boot() {
    loadSharedSidebarTaxonomy();
    bindElements();
    bindEvents();
    bootstrapDomHotQuick();
    loadStoredHotSearch();
    render();
    try {
      const authPayload = await ensureAuth();
      void warmHotSearch();
      await syncProfileChrome(authPayload);
      await loadNav();
      void loadClinicalIndex();
      scheduleSearchSeedWarmup();
      render();
      const hash = readHash();
      const opened = hash ? await openHashCode(hash) : false;
      if (!opened && state.chapters.length) selectChapter(clean(state.chapters[0].code));
    } catch (error) {
      setStatus(error?.message || 'ICD-10 nuk u ngarkua.', 'error');
      el.sourceStatus.textContent = 'I palidhur';
    } finally {
      el.appShell.setAttribute('aria-busy', 'false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
