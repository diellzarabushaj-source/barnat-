(() => {
  'use strict';

  const HUB_API = '/api/medical-hub';

  const state = {
    items: [],
    filtered: [],
    selectedId: '',
    term: '',
    category: '',
    backendResults: null,
    searching: false,
    searchSequence: 0,
  };

  const detailCache = new Map();
  const detailRequests = new Map();
  const searchIndex = new Map();
  let searchTimer = 0;

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  async function authJson(url = '/api/auth', options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin',
        cache:'no-store',
        ...options,
        signal:controller.signal,
        headers:{ Accept:'application/json', ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally {
      clearTimeout(timer);
    }
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { response, payload } = await authJson();
    const explicitlySignedOut = response.status === 401
      || response.status === 403
      || (response.ok && payload.authenticated === false);

    if (explicitlySignedOut) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if (!response.ok) throw new Error('Sesioni nuk mund të verifikohet për momentin. Provo përsëri.');
    if (payload.authenticated !== true) throw new Error('Gjendja e sesionit nuk u konfirmua. Provo përsëri.');
    return payload;
  }

  function loadRuntime(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) {
      return new Promise(resolve => {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once:true });
        setTimeout(resolve, 1800);
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute(marker, '1');
      script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve();
      }, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  async function syncProfileChrome(payload) {
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v5', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    void loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v3', 'data-drx-sidebar-taxonomy');
  }

  async function hubApi(params = {}, { timeout = 12000 } = {}) {
    const url = new URL(HUB_API, location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== '' && value != null) url.searchParams.set(key, String(value));
    });

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url.pathname + url.search, {
        credentials:'same-origin',
        headers:{ Accept:'application/json' },
        cache:'no-store',
        signal:controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        throw new Error('Sesioni nuk është aktiv.');
      }
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error || `Medical Hub API ${response.status}`);
      }
      return payload;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = false;
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = true;
  }

  async function logout() {
    const button = $('#logoutButton');
    if (button) button.disabled = true;
    try {
      const { response } = await authJson('/api/auth', { method:'DELETE' });
      if (!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    } catch {
      if (button) button.disabled = false;
    }
  }

  function bindShell() {
    $('#menuButton')?.addEventListener('click', openSidebar);
    $('#sidebarClose')?.addEventListener('click', closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('#logoutButton')?.addEventListener('click', logout);

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (document.activeElement === $('#learningSearch') && state.term) {
          event.preventDefault();
          clearSearch();
          return;
        }
        closeSidebar();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#learningSearch')?.focus();
      }
    });
  }

  function currentItem() {
    return state.items.find(item => item._id === state.selectedId) || null;
  }

  function chapterNumberFromId(id) {
    const match = String(id || '').match(/^medicalhub-dod-ch(\d{2})(?:-sub(\d+))?$/);
    return match ? Number(match[1]) : null;
  }

  function lessonNumberFromId(id) {
    const match = String(id || '').match(/^medicalhub-dod-ch\d{2}-sub(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function chapterKey(item) {
    const number = Number(item?.chapterNumber) || chapterNumberFromId(item?._id);
    return number ? String(number).padStart(2, '0') : '';
  }

  function isChapter(item) {
    return item?.contentKind === 'chapter'
      || /^medicalhub-dod-ch\d{2}$/.test(String(item?._id || ''));
  }

  function chapterLessons(key) {
    return state.items
      .filter(item => !isChapter(item) && chapterKey(item) === key)
      .sort((a,b) => topicOrder(a) - topicOrder(b));
  }

  function preferredChapterItem(key) {
    const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === key) || null;
    const lessons = chapterLessons(key);
    return lessons.length === 1 ? lessons[0] : chapter;
  }

  function topicOrder(item) {
    const chapter = chapterNumberFromId(item?._id) || Number(item?.chapterNumber) || 999;
    const lesson = lessonNumberFromId(item?._id);
    return chapter * 1000 + (lesson == null ? 0 : lesson);
  }

  function procedureEntries(item) {
    return (item?.procedureCodes || []).map(entry => {
      if (typeof entry === 'string') return { code:entry, system:'ICHI' };
      return { system:'ICHI', ...(entry || {}) };
    }).filter(entry => entry.code);
  }

  function codeSuffix(item) {
    const parts = [];
    const icd = (item?.icdCodes || []).filter(Boolean);
    const procedures = procedureEntries(item);
    if (icd.length) parts.push(`ICD‑10 ${icd.join(' · ')}`);
    if (procedures.length) {
      const grouped = procedures.map(entry => `${entry.system || 'ICHI'} ${entry.code}`);
      parts.push(grouped.join(' · '));
    }
    return parts.length ? ` · ${parts.join(' · ')}` : '';
  }

  function codedTitle(item) {
    return `${clean(item?.title || item?.question || '')}${codeSuffix(item)}`;
  }

  function itemSearchText(item) {
    if (!item?._id) return '';
    if (searchIndex.has(item._id)) return searchIndex.get(item._id);
    const procedureText = procedureEntries(item)
      .flatMap(entry => [entry.code, entry.system, entry.label])
      .filter(Boolean);
    const value = normalize([
      item.question,
      item.title,
      item.summary,
      ...(item.keywords || []),
      ...(item.icdCodes || []),
      ...procedureText,
    ].join(' '));
    searchIndex.set(item._id, value);
    return value;
  }

  function applyFilterState() {
    const term = normalize(state.term);
    const source = term && Array.isArray(state.backendResults) ? state.backendResults : state.items;
    state.filtered = source.filter(item => {
      const chapter = chapterKey(item);
      const localTermMatch = !term || Array.isArray(state.backendResults) || itemSearchText(item).includes(term);
      return localTermMatch && (!state.category || chapter === state.category);
    }).sort((a, b) => topicOrder(a) - topicOrder(b) || clean(a.title).localeCompare(clean(b.title), 'sq'));

    if (!state.filtered.some(item => item._id === state.selectedId)) {
      const preferred = state.filtered.find(isChapter) || state.filtered[0];
      state.selectedId = preferred?._id || '';
    }
  }

  function syncUrl() {
    try {
      const url = new URL(window.location.href);
      const item = currentItem() || state.filtered.find(candidate => candidate._id === state.selectedId);
      if (state.category) url.searchParams.set('chapter', state.category);
      else url.searchParams.delete('chapter');
      if (item?.slug) url.searchParams.set('topic', item.slug);
      else url.searchParams.delete('topic');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  function restoreUrl() {
    try {
      const url = new URL(window.location.href);
      const slug = url.searchParams.get('topic') || '';
      const chapter = url.searchParams.get('chapter') || '';
      const item = state.items.find(candidate => candidate.slug === slug);
      if (item) {
        state.selectedId = item._id;
        state.category = chapterKey(item);
        return;
      }
      if (/^\d{1,2}$/.test(chapter)) state.category = String(Number(chapter)).padStart(2, '0');
    } catch {}
  }

  function reviewMeta(status) {
    const value = clean(status).toLowerCase();
    if (value === 'verified') return { className:'is-verified', label:'I verifikuar' };
    if (value === 'review') return { className:'is-review', label:'Në rishikim' };
    if (value === 'draft') return { className:'is-draft', label:'Draft' };
    return { className:'', label:value || 'Pa status' };
  }

  function richText(value) {
    let html = esc(clean(value));
    html = html
      .replace(/\*\*(.+?)\*\*/g, '<strong class="ck-inline-bold">$1</strong>')
      .replace(/==(.+?)==/g, '<mark class="ck-inline-mark">$1</mark>')
      .replace(/\n/g, '<br>');
    return html;
  }

  function stepStyleClass(step) {
    const token = normalize(step?.priority || '');
    if (token === 'highlight') return 'is-source-highlight';
    if (token === 'note') return 'is-source-note';
    if (token === 'table') return 'is-source-table';
    if (token === 'warning') return 'is-source-warning';
    return '';
  }

  function chip(label, className = '') {
    return `<span class="ck-chip ${className}">${esc(label)}</span>`;
  }

  function icdChip(code) {
    const value = clean(code);
    if (!value) return '';
    return `<a class="ck-chip ck-code-chip" href="/icd.html#${encodeURIComponent(value)}" title="Hap ${esc(value)} në ICD-10">ICD‑10 ${esc(value)}</a>`;
  }

  function procedureChip(entry) {
    const code = clean(entry?.code);
    if (!code) return '';
    const system = clean(entry?.system || 'Procedurë');
    const label = clean(entry?.label);
    const title = [system, label].filter(Boolean).join(' — ');
    return `<span class="ck-chip ck-procedure-chip" title="${esc(title)}">${esc(system)} ${esc(code)}</span>`;
  }

  function figureMarkup(figure, index) {
    const url = clean(figure?.url);
    if (!url) return '';
    const alt = clean(figure?.alt || figure?.title || `Figura ${index + 1}`);
    const caption = clean(figure?.caption || figure?.title);
    const sourceUrl = clean(figure?.sourceUrl);
    const credit = clean(figure?.credit);
    return `
      <figure class="ck-figure">
        <a class="ck-figure-media" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Hap figurën në rezolucion të plotë">
          <img data-hub-figure-image src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">
          <span class="ck-figure-fallback" data-hub-figure-fallback hidden>
            <strong>Figura nuk u ngarkua.</strong>
            <small>Kliko për ta hapur burimin e figurës.</small>
          </span>
          <span class="ck-figure-zoom" aria-hidden="true">↗</span>
        </a>
        ${caption || credit || sourceUrl ? `
          <figcaption>
            ${caption ? `<strong>${esc(caption)}</strong>` : ''}
            ${credit ? `<span>${esc(credit)}</span>` : ''}
            ${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Burimi / licenca ↗</a>` : ''}
          </figcaption>
        ` : ''}
      </figure>`;
  }

  function hasSourceRx(item) {
    return (item?.steps || []).some(step => normalize(step?.priority) === 'rx-source');
  }

  function sourceRxStepMarkup(step, index) {
    const lines = String(step?.action || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    return `
      <div class="ck-book-rx-group">
        <span class="ck-book-rx-number">${index + 1}.</span>
        <div class="ck-book-rx-copy">
          ${step?.title ? `<strong>${richText(step.title)}</strong>` : ''}
          <div class="ck-book-rx-lines">
            ${lines.map(line => {
              const match = line.match(/^(OR|OSE)\b\s*(.*)$/i);
              if (match) {
                return `<div class="ck-book-rx-alternative"><span>OR</span><div>${richText(match[2] || '')}</div></div>`;
              }
              return `<div class="ck-book-rx-line">${richText(line)}</div>`;
            }).join('')}
          </div>
          ${step?.note ? `<small class="ck-book-rx-note">${richText(step.note)}</small>` : ''}
        </div>
      </div>`;
  }

  function sourceRxMarkup(item) {
    const steps = (item?.steps || []).filter(step => normalize(step?.priority) === 'rx-source');
    return `
      <article class="ck-book-rx">
        <div class="ck-book-rx-head">
          <span>Rx</span>
          <strong>TRAJTIM KONSERVATIV</strong>
        </div>
        <div class="ck-book-rx-body">
          ${steps.map(sourceRxStepMarkup).join('')}
        </div>
      </article>`;
  }

  function lessonBodyLabel(item) {
    const title = normalize(item?.title);
    if (/trajtim|menaxhim/.test(title)) return 'Trajtimi hap pas hapi';
    if (/procedur|kanulim|venepunksion|intubim|kateteriz|punksion|paracentez|toracentez|transfuzion|injeksion|aspirim|artrocentez/.test(title)) return 'Procedura hap pas hapi';
    return 'Pikat dhe hapat kryesorë';
  }

  function bulletMarkup(items) {
    return `<ul class="ck-bullets">${(items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
  }

  function isSingleLessonChapter(item) {
    return /mësim(?:i)? i vetëm|1 mësim/i.test(clean(item?.question))
      || ((Number(item?.chapterNumber) === 1 || Number(item?.chapterNumber) === 2) && (item?.steps?.length || 0) > 10);
  }

  function splitSectionAction(action) {
    const value = clean(action);
    if (!value) return { lead:'', bullets:[] };
    const parts = value.split(' — ');
    if (parts.length === 1) return { lead:value, bullets:[] };
    const lead = parts.shift();
    const rest = parts.join(' — ');
    return { lead, bullets:rest.split(' • ').map(clean).filter(Boolean) };
  }

  function singleLessonSectionMarkup(step, index) {
    const parsed = splitSectionAction(step?.action);
    const title = clean(step?.title || `Seksioni ${index + 1}`);
    const codeMatch = title.match(/ICD[-‑–— ]?10\s*([A-Z]\d{2}(?:\.\d+)?)|ICD[-‑–— ]?10\s*([A-Z]\d{2})/i);
    const code = codeMatch ? (codeMatch[1] || codeMatch[2]) : '';
    return `
      <section class="ck-master-section" id="hub-master-${index + 1}">
        <div class="ck-master-section-head">
          <span class="ck-master-section-no">${String(index + 1).padStart(2, '0')}</span>
          <span class="ck-master-section-heading">
            <strong>${esc(title.replace(/^\d+\.\s*/, ''))}</strong>
            ${parsed.lead ? `<small>${esc(parsed.lead)}</small>` : ''}
          </span>
          <span class="ck-master-section-side">
            ${code ? icdChip(code) : ''}
          </span>
        </div>
        <div class="ck-master-section-body">
          ${parsed.bullets.length ? `
            <ul class="ck-master-bullets">
              ${parsed.bullets.map(item => {
                const cut = item.indexOf(':');
                if (cut > 0 && cut < 90) {
                  return `<li><strong>${esc(item.slice(0,cut))}</strong><span>${esc(item.slice(cut+1).trim())}</span></li>`;
                }
                return `<li><span>${esc(item)}</span></li>`;
              }).join('')}
            </ul>
          ` : (parsed.lead ? '' : `<p>${esc(step?.action || '')}</p>`)}
          ${step?.why ? `<div class="ck-step-why"><span>Pse</span><p>${esc(step.why)}</p></div>` : ''}
        </div>
      </section>`;
  }

  function stepMarkup(step, index) {
    const styleClass = stepStyleClass(step);
    const meta = [step.setting].filter(Boolean);
    return `
      <article class="ck-step ${styleClass}">
        <span class="ck-step-number">${String(index + 1).padStart(2, '0')}</span>
        <div class="ck-step-copy">
          <div class="ck-step-title">
            <strong>${richText(step.title || 'Hapi')}</strong>
            ${meta.length ? `<small>${esc(meta.join(' · '))}</small>` : ''}
          </div>
          <p>${richText(step.action || '')}</p>
          ${step.why ? `<div class="ck-step-why"><span>Pse</span><p>${richText(step.why)}</p></div>` : ''}
          ${step.note ? `<small class="ck-step-note">${richText(step.note)}</small>` : ''}
        </div>
      </article>`;
  }

  function activeSubstanceName(rx) {
    return clean(rx?.genericName || rx?.medicine || 'Substancë aktive');
  }

  function prescriptionFormLabel(form) {
    const raw = clean(form);
    const token = normalize(raw);
    if (!raw) return '';
    if (/^tablet|tabletë|tab\.?$/.test(token)) return 'Tab.';
    if (/^capsule|kapsul|cap\.?$/.test(token)) return 'Cap.';
    if (/^syrup|shurup|syp\.?$/.test(token)) return 'Syp.';
    if (/^injection|injeksion|inj\.?$/.test(token)) return 'Inj.';
    if (/^ampoule|ampul|amp\.?$/.test(token)) return 'Amp.';
    if (/^drops|pika|gtt\.?$/.test(token)) return 'Gtt.';
    if (/^cream|krem/.test(token)) return 'Crm.';
    return raw;
  }

  function rxRelation(rx) {
    const instruction = clean(rx?.instructions);
    return /^(OR|OSE)$/i.test(instruction) ? 'OR' : '';
  }

  function rxSignature(rx) {
    const instruction = clean(rx?.instructions);
    const extraInstruction = instruction && !/^(OR|OSE)$/i.test(instruction) ? instruction : '';
    const parts = [];
    if (rx?.dose) parts.push(clean(rx.dose));
    if (rx?.frequency) parts.push(clean(rx.frequency));
    if (rx?.duration) parts.push(`për ${clean(rx.duration)}`);
    if (rx?.route && normalize(rx.route) !== 'po') parts.push(clean(rx.route));
    if (extraInstruction) parts.push(extraInstruction);
    return parts.join(' · ');
  }

  function rxLineMarkup(rx, index) {
    const form = prescriptionFormLabel(rx?.form);
    const name = activeSubstanceName(rx);
    const strength = clean(rx?.strength);
    const relation = rxRelation(rx);
    const signature = rxSignature(rx);
    return `
      ${relation ? '<div class="ck-rx-or" aria-label="alternativë">OR</div>' : ''}
      <div class="ck-rx-line">
        <span class="ck-rx-line-no">${index + 1}.</span>
        <div class="ck-rx-line-copy">
          <div class="ck-rx-drug-line">
            ${form ? `<span>${esc(form)}</span>` : ''}
            <strong>${esc(name)}</strong>
            ${strength ? `<span>à ${esc(strength)}</span>` : ''}
          </div>
          ${signature ? `<p class="ck-rx-signature"><strong>S.</strong> ${esc(signature)}</p>` : ''}
          ${rx?.quantity ? `<p class="ck-rx-quantity">No. ${esc(rx.quantity)}</p>` : ''}
          ${rx?.clinicalNote ? `<small class="ck-rx-note">${esc(rx.clinicalNote)}</small>` : ''}
        </div>
      </div>`;
  }

  function rxGroupMarkup(prescriptions) {
    const items = (prescriptions || []).filter(Boolean);
    if (!items.length) return '';
    return `
      <article class="ck-rx-sheet">
        <div class="ck-rx-sheet-head">
          <span>Rx</span>
          <div>
            <strong>Receta / skema e përshkrimit</strong>
            <small>Shfaqen vetëm substancat aktive; alternativat OR ruhen sipas burimit.</small>
          </div>
        </div>
        <div class="ck-rx-lines">
          ${items.map(rxLineMarkup).join('')}
        </div>
      </article>`;
  }

  function sectionEntries(item) {
    const entries = [];
    if (item.redFlags?.length && !isSingleLessonChapter(item)) entries.push({ id:'hub-red-flags', label:'Red flags' });
    if (item.relatedTopics?.length) entries.push({ id:'hub-internal-sections', label:'Seksionet e mësimit' });
    if (item.steps?.length) entries.push({ id:'hub-content', label:hasSourceRx(item) ? 'Trajtimi konservativ' : (isSingleLessonChapter(item) ? `${item.steps.length} seksione` : lessonBodyLabel(item)) });
    if (item.figures?.length) entries.push({ id:'hub-figures', label:'Figura dhe ilustrime' });
    if (item.prescriptions?.length && !hasSourceRx(item)) entries.push({ id:'hub-prescriptions', label:'Receta' });
    if (item.whenToRefer) entries.push({ id:'hub-referral', label:'Referimi' });
    if (item.relatedProtocols?.length) entries.push({ id:'hub-protocols', label:'Protokolle të lidhura' });
    if (item.sources?.length) entries.push({ id:'hub-sources', label:'Burimet' });
    return entries;
  }

  function scrollReaderToTop() {
    const root = $('#learningDetail');
    if (!root) return;
    root.scrollIntoView({
      block:'start',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  function bindFigureFallbacks(detail) {
    detail.querySelectorAll('[data-hub-figure-image]').forEach(image => {
      const fallback = image.parentElement?.querySelector('[data-hub-figure-fallback]');
      const fail = () => {
        image.hidden = true;
        if (fallback) fallback.hidden = false;
        image.parentElement?.classList.add('has-error');
      };
      image.addEventListener('error', fail, { once:true });
      if (image.complete && image.naturalWidth === 0) fail();
    });
  }

  function bindDetailNavigation(detail) {
    bindFigureFallbacks(detail);
    detail.querySelectorAll('[data-hub-section]').forEach(button => {
      button.addEventListener('click', () => {
        document.getElementById(button.dataset.hubSection)?.scrollIntoView({
          block:'start',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      });
    });

    detail.querySelectorAll('[data-master-section]').forEach(button => {
      button.addEventListener('click', () => {
        const sections = detail.querySelectorAll('.ck-master-section');
        const target = sections[Number(button.dataset.masterSection)];
        if (!target) return;
        target.scrollIntoView({
          block:'start',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      });
    });

    detail.querySelectorAll('[data-topic-jump]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.topicJump;
        if (!state.filtered.some(item => item._id === id)) {
          const target = state.items.find(item => item._id === id);
          if (target) {
            state.category = chapterKey(target);
            const category = $('#learningCategory');
            if (category) category.value = state.category;
            applyFilterState();
          }
        }
        selectTopic(id, { scroll:true });
      });
    });
  }

  function renderChapterDetail(item) {
    const detail = $('#learningDetail');
    if (!detail) return;
    const review = reviewMeta(item.reviewStatus);
    const children = (item.relatedTopics || []).slice().sort((a, b) => topicOrder(a) - topicOrder(b));
    const icdLessons = children.filter(child => child.icdCodes?.length).length;
    const procedureLessons = children.filter(child => procedureEntries(child).length).length;
    const populated = children.filter(child => clean(child.summary)).length;

    detail.innerHTML = `
      <div class="ck-document-inner ck-chapter-document">
        <header class="ck-detail-head">
          <div class="ck-detail-title-row">
            <div>
              <p class="ck-kicker">${esc(item.question || 'Kapitull')}</p>
              <h2>${esc(codedTitle(item))}</h2>
            </div>
            <span class="ck-review-badge ${review.className}">
              <span class="ck-review-dot" aria-hidden="true"></span>
              <strong>${esc(review.label)}</strong>
            </span>
          </div>
          <div class="ck-meta">
            ${chip(children.length === 1 ? '1 mësim' : `${children.length} mësime`)}
            ${icdLessons ? chip(`${icdLessons} me ICD‑10`, 'is-code-count') : ''}
            ${procedureLessons ? chip(`${procedureLessons} procedura`, 'is-procedure-count') : ''}
            ${item.version ? chip(item.version) : ''}
          </div>
          ${item.summary ? `<div class="ck-quick-summary"><span>Përmbledhja e kapitullit</span><p>${esc(item.summary)}</p></div>` : ''}
        </header>

        ${item.steps?.length ? `
          <section class="ck-section ck-chapter-overview">
            <div class="ck-section-heading"><span>Fokus</span><h3>Çfarë përfshin ky kapitull</h3></div>
            <div class="ck-chapter-focus-grid">
              ${item.steps.map((step, index) => `
                <article class="ck-chapter-focus-card">
                  <span>${String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>${esc(step.title || 'Pjesa')}</strong>
                    <p>${esc(step.action || '')}</p>
                  </div>
                </article>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <section class="ck-section ck-chapter-section">
          <div class="ck-section-heading"><span>Indeks</span><h3>${children.length === 1 ? 'Mësimi i këtij kapitulli' : 'Mësimet e këtij kapitulli'}</h3></div>
          <div class="ck-chapter-progress">
            <span><strong>${populated}</strong> / ${children.length} me përmbajtje të plotësuar</span>
            <span>${icdLessons} të lidhur me ICD‑10</span>
          </div>
          <div class="ck-chapter-lessons">
            ${children.map((child, index) => {
              const childReview = reviewMeta(child.reviewStatus);
              return `
                <button type="button" class="ck-chapter-lesson" data-topic-jump="${esc(child._id)}">
                  <span class="ck-chapter-lesson-no">${String(index + 1).padStart(2, '0')}</span>
                  <span class="ck-chapter-lesson-copy">
                    <strong>${esc(codedTitle(child))}</strong>
                    ${child.summary ? `<small>${esc(child.summary)}</small>` : '<small>Përmbajtja do të plotësohet nga burimi.</small>'}
                    <span class="ck-chapter-lesson-meta">
                      ${(child.icdCodes || []).map(icdChip).join('')}
                      ${procedureEntries(child).map(procedureChip).join('')}
                      <span class="ck-mini-status ${childReview.className}"><i></i>${esc(childReview.label)}</span>
                    </span>
                  </span>
                  <span class="ck-chapter-lesson-arrow" aria-hidden="true">→</span>
                </button>`;
            }).join('') || '<p class="ck-status">Nuk ka mësime të lidhura.</p>'}
          </div>
        </section>
      </div>`;
    bindDetailNavigation(detail);
  }

  function nestedSectionMarkup(section, index) {
    const title = clean(section?.title || section?.question || `Seksioni ${index + 1}`).replace(/^\d+(?:\.\d+)?\s*[—-]\s*/, '');
    const review = reviewMeta(section?.reviewStatus);
    const procedures = procedureEntries(section);
    return `
      <section class="ck-internal-section" id="hub-internal-${index + 1}">
        <div class="ck-internal-section-head">
          <span class="ck-internal-section-no">${String(index + 1).padStart(2, '0')}</span>
          <span class="ck-internal-section-title">
            <strong>${esc(title)}</strong>
            <small>${esc(section?.summary || 'Seksion i brendshëm i këtij mësimi.')}</small>
          </span>
          <span class="ck-internal-section-meta">
            ${(section.icdCodes || []).map(icdChip).join('')}
            ${procedures.map(procedureChip).join('')}
            <span class="ck-mini-status ${review.className}"><i></i>${esc(review.label)}</span>
          </span>
        </div>
        <div class="ck-internal-section-body">
          ${section.redFlags?.length ? `
            <div class="ck-internal-alert">
              <strong>Red flags</strong>
              ${bulletMarkup(section.redFlags)}
            </div>
          ` : ''}
          ${section.steps?.length ? `<div class="ck-steps">${section.steps.map(stepMarkup).join('')}</div>` : ''}
          ${section.figures?.length ? `
            <div class="ck-figure-grid">${section.figures.slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(figureMarkup).join('')}</div>
          ` : ''}
          ${section.prescriptions?.length ? `
            <div class="ck-rx-section ck-rx-section-nested">
              <div class="ck-section-heading"><span>Rx</span><h3>Receta / skema e përshkrimit</h3></div>
              ${rxGroupMarkup(section.prescriptions)}
            </div>
          ` : ''}
          ${section.whenToRefer ? `<div class="ck-internal-referral"><strong>Kur të referohet</strong><p>${esc(section.whenToRefer)}</p></div>` : ''}
        </div>
      </section>`;
  }

  function renderLessonDetail(item) {
    const detail = $('#learningDetail');
    if (!detail) return;
    const review = reviewMeta(item.reviewStatus);
    const sections = sectionEntries(item);
    const currentIndex = state.filtered.findIndex(candidate => candidate._id === item._id);
    const previous = currentIndex > 0 ? state.filtered[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < state.filtered.length - 1 ? state.filtered[currentIndex + 1] : null;
    const procedures = procedureEntries(item);

    detail.innerHTML = `
      <div class="ck-document-inner">
        <header class="ck-detail-head">
          <div class="ck-detail-title-row">
            <div>
              <p class="ck-kicker">${esc(item.question || 'Mësim klinik')}</p>
              <h2>${esc(codedTitle(item))}</h2>
            </div>
            <span class="ck-review-badge ${review.className}">
              <span class="ck-review-dot" aria-hidden="true"></span>
              <strong>${esc(review.label)}</strong>
            </span>
          </div>
          <div class="ck-meta">
            ${(item.icdCodes || []).map(icdChip).join('')}
            ${procedures.map(procedureChip).join('')}
            ${item.version ? chip(item.version) : ''}
            ${item.reviewedBy ? chip(item.reviewedBy) : ''}
          </div>
          ${item.summary ? `<div class="ck-quick-summary"><span>Në 20 sekonda</span><p>${esc(item.summary)}</p></div>` : ''}
        </header>

        ${sections.length > 1 ? `
          <nav class="ck-section-index" aria-label="Përmbajtja e këtij mësimi">
            <div class="ck-section-index-head"><span>Në këtë mësim</span><small>${sections.length} pjesë</small></div>
            <div class="ck-section-index-list">
              ${sections.map((section, index) => `
                <button type="button" data-hub-section="${section.id}">
                  <span>${String(index + 1).padStart(2, '0')}</span>
                  <strong>${esc(section.label)}</strong>
                </button>
              `).join('')}
            </div>
          </nav>
        ` : ''}

        <div class="ck-sections">
          ${item.relatedTopics?.length ? `
            <section class="ck-section" id="hub-internal-sections">
              <div class="ck-section-heading"><span>Struktura</span><h3>Seksionet e mësimit</h3></div>
              <div class="ck-internal-sections">
                ${item.relatedTopics
                  .slice()
                  .sort((a,b)=>(a.sectionNumber||0)-(b.sectionNumber||0))
                  .map(nestedSectionMarkup)
                  .join('')}
              </div>
            </section>
          ` : ''}

          ${item.redFlags?.length && !isSingleLessonChapter(item) ? `
            <section class="ck-section ck-referral" id="hub-red-flags">
              <div class="ck-section-heading"><span>Urgjencë</span><h3>Red flags — ndalo dhe vlerëso urgjent</h3></div>
              ${bulletMarkup(item.redFlags)}
            </section>
          ` : ''}

          ${item.steps?.length ? `
            <section class="ck-section" id="hub-content">
              <div class="ck-section-heading">
                <span>${hasSourceRx(item) ? 'Rx' : 'Përmbajtje'}</span>
                <h3>${esc(hasSourceRx(item) ? 'Trajtimi konservativ' : (isSingleLessonChapter(item) ? `${item.steps.length} seksionet e mësimit` : lessonBodyLabel(item)))}</h3>
              </div>
              ${hasSourceRx(item) ? sourceRxMarkup(item) : (isSingleLessonChapter(item) ? `
                <div class="ck-master-section-index">
                  ${item.steps.map((step,index)=>`<button type="button" data-master-section="${index}"><span>${String(index+1).padStart(2,'0')}</span><strong>${esc(clean(step.title).replace(/^\d+\.\s*/,''))}</strong></button>`).join('')}
                </div>
                <div class="ck-master-sections">${item.steps.map(singleLessonSectionMarkup).join('')}</div>
              ` : `<div class="ck-steps">${item.steps.map(stepMarkup).join('')}</div>`)}
            </section>
          ` : ''}

          ${item.redFlags?.length && isSingleLessonChapter(item) ? `
            <section class="ck-section ck-referral" id="hub-red-flags">
              <div class="ck-section-heading"><span>Urgjencë</span><h3>Shenjat alarmuese në shembullin klinik</h3></div>
              ${bulletMarkup(item.redFlags)}
            </section>
          ` : ''}

          ${item.figures?.length ? `
            <section class="ck-section" id="hub-figures">
              <div class="ck-section-heading"><span>Figura</span><h3>Figura dhe ilustrime</h3></div>
              <div class="ck-figure-grid">${item.figures.slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(figureMarkup).join('')}</div>
            </section>
          ` : ''}

          ${item.prescriptions?.length && !hasSourceRx(item) ? `
            <section class="ck-section ck-rx-section" id="hub-prescriptions">
              <div class="ck-section-heading"><span>Rx</span><h3>Receta / skema e përshkrimit</h3></div>
              ${rxGroupMarkup(item.prescriptions)}
            </section>
          ` : ''}

          ${item.whenToRefer ? `
            <section class="ck-section ck-referral ck-referral-neutral" id="hub-referral">
              <div class="ck-section-heading"><span>Referim</span><h3>Kur të referohet</h3></div>
              <p class="ck-summary">${esc(item.whenToRefer)}</p>
            </section>
          ` : ''}

          ${item.relatedProtocols?.length ? `
            <section class="ck-section" id="hub-protocols">
              <div class="ck-section-heading"><span>Burime</span><h3>Protokolle të lidhura</h3></div>
              <div class="ck-protocol-list">
                ${item.relatedProtocols.map(protocol => `
                  <a href="/protokollet.html" class="ck-protocol-link">
                    <span>${esc(protocol.title)}</span>
                    <small>${esc(protocol.summary || 'Hap protokollet klinike')}</small>
                    <strong>Hap →</strong>
                  </a>
                `).join('')}
              </div>
            </section>
          ` : ''}

          ${item.sources?.length ? `
            <section class="ck-section" id="hub-sources">
              <div class="ck-section-heading"><span>Burime</span><h3>Burimet dhe referencat</h3></div>
              <div class="ck-source-list">
                ${item.sources.map(source => `
                  <article class="ck-source-card">
                    <div>
                      <strong>${esc(source.title || source.organization || 'Burim')}</strong>
                      ${source.organization ? `<span>${esc(source.organization)}</span>` : ''}
                    </div>
                    ${source.note ? `<p>${esc(source.note)}</p>` : ''}
                    ${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Hap burimin ↗</a>` : ''}
                  </article>
                `).join('')}
              </div>
            </section>
          ` : ''}
        </div>

        ${item.lastReviewedAt ? `
          <div class="ck-source-meta">
            <span>Rishikuar: ${esc(new Date(item.lastReviewedAt).toLocaleDateString('sq-AL'))}</span>
          </div>
        ` : ''}

        ${previous || next ? `
          <nav class="ck-document-pagination" aria-label="Navigimi mes mësimeve">
            ${previous ? `
              <button type="button" class="ck-document-page" data-topic-jump="${esc(previous._id)}">
                <span>← Mësimi i kaluar</span>
                <strong>${esc(codedTitle(previous))}</strong>
              </button>
            ` : '<span></span>'}
            ${next ? `
              <button type="button" class="ck-document-page ck-document-page-next" data-topic-jump="${esc(next._id)}">
                <span>Mësimi tjetër →</span>
                <strong>${esc(codedTitle(next))}</strong>
              </button>
            ` : '<span></span>'}
          </nav>
        ` : ''}
      </div>`;

    bindDetailNavigation(detail);
  }

  function renderTopicDetail(item) {
    if (isChapter(item)) renderChapterDetail(item);
    else renderLessonDetail(item);
  }

  function renderEmptyState() {
    const detail = $('#learningDetail');
    if (!detail) return;
    const term = clean(state.term);
    const hasFilter = Boolean(term || state.category);

    detail.innerHTML = `
      <div class="ck-empty">
        <strong>${hasFilter ? 'Asnjë temë nuk u gjet.' : 'Nuk ka tema të disponueshme.'}</strong>
        <span>${hasFilter ? 'Ndrysho filtrat ose pastro kërkimin.' : 'Përmbajtja e Medical Hub do të shfaqet këtu.'}</span>
        ${hasFilter ? '<button class="ck-retry" type="button" data-clear-hub-filters>Pastro filtrat</button>' : ''}
      </div>`;

    detail.querySelector('[data-clear-hub-filters]')?.addEventListener('click', () => clearFilters());
  }

  async function ensureTopicDetail(id) {
    if (!id) return null;
    if (detailCache.has(id)) return detailCache.get(id);
    if (detailRequests.has(id)) return detailRequests.get(id);

    const request = hubApi({ id }, { timeout:12000 })
      .then(payload => {
        const item = payload?.item || null;
        if (item) detailCache.set(id, item);
        return item;
      })
      .finally(() => detailRequests.delete(id));

    detailRequests.set(id, request);
    return request;
  }

  async function renderSelectedDetail() {
    const id = state.selectedId;
    const detail = $('#learningDetail');
    if (!detail) return;

    if (!id) {
      renderEmptyState();
      return;
    }

    if (detailCache.has(id)) {
      renderTopicDetail(detailCache.get(id));
      return;
    }

    const indexItem = state.items.find(item => item._id === id);
    detail.innerHTML = `
      <div class="ck-empty ck-loading">
        <span class="ck-loading-spinner" aria-hidden="true"></span>
        <strong>${esc(indexItem?.title || 'Po ngarkohet tema…')}</strong>
        <span>Po merret përmbajtja e kësaj teme nga backend-i i Medical Hub / Sanity.</span>
      </div>`;

    try {
      const item = await ensureTopicDetail(id);
      if (state.selectedId !== id) return;
      if (!item) {
        renderEmptyState();
        return;
      }
      renderTopicDetail(item);
    } catch (error) {
      console.error('[Medical Hub v2] Detail:', error);
      if (state.selectedId !== id) return;
      detail.innerHTML = `
        <div class="ck-empty">
          <strong>Tema nuk u ngarkua.</strong>
          <span>Provo përsëri pa humbur filtrat.</span>
          <button class="ck-retry" type="button" data-topic-retry>Provo përsëri</button>
        </div>`;
      detail.querySelector('[data-topic-retry]')?.addEventListener('click', () => {
        detailCache.delete(id);
        void renderSelectedDetail();
      });
    }
  }

  function renderList() {
    const select = $('#learningTopic');
    if (!select) return;

    const term = clean(state.term);
    const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === state.category);
    let options = '';

    if (!term && chapter) {
      const lessons = state.items
        .filter(item => !isChapter(item) && chapterKey(item) === state.category)
        .sort((a,b) => topicOrder(a) - topicOrder(b));
      if (lessons.length === 1) {
        options = lessons.map(item => `<option value="${esc(item._id)}">${esc(codedTitle(item))}</option>`).join('');
      } else {
        options = `<option value="${esc(chapter._id)}">Përmbledhja e kapitullit · ${esc(codedTitle(chapter))}</option>`
          + lessons.map(item => `<option value="${esc(item._id)}">${esc(codedTitle(item))}</option>`).join('');
      }
    } else {
      const grouped = new Map();
      state.filtered.forEach(item => {
        const key = chapterKey(item) || '00';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(item);
      });
      options = Array.from(grouped.entries()).map(([key, items]) => {
        const chapterItem = state.items.find(item => isChapter(item) && chapterKey(item) === key);
        const label = chapterItem ? codedTitle(chapterItem) : `Kapitulli ${key}`;
        return `<optgroup label="${esc(label)}">${items.map(item => {
          const prefix = isChapter(item) ? 'Përmbledhja · ' : '';
          return `<option value="${esc(item._id)}">${prefix}${esc(codedTitle(item))}</option>`;
        }).join('')}</optgroup>`;
      }).join('');
    }

    select.innerHTML = options || '<option value="">Asnjë mësim</option>';
    select.value = state.selectedId;
    select.disabled = !options;
  }

  function renderReaderNavigation() {
    const index = state.filtered.findIndex(item => item._id === state.selectedId);
    const searchField = $('#learningSearchField');
    const result = $('#learningResultStatus');
    const position = $('#learningTopicPosition');
    const previous = $('#previousTopicButton');
    const next = $('#nextTopicButton');
    const term = clean(state.term);
    const chapterCount = state.items.filter(isChapter).length;
    const lessonCount = state.items.length - chapterCount;

    searchField?.classList.toggle('has-value', Boolean(term));
    searchField?.classList.toggle('is-searching', state.searching);

    if (result) {
      if (state.searching) result.textContent = `Duke kërkuar në backend për “${term}”…`;
      else if (term) result.textContent = `${state.filtered.length} rezultate për “${term}” · Sanity backend`;
      else if (state.category) {
        const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === state.category);
        const lessonTotal = state.items.filter(item => !isChapter(item) && chapterKey(item) === state.category).length;
        result.textContent = chapter ? `${lessonTotal} mësime në ${chapter.question || chapter.title}` : `${state.filtered.length} rezultate`;
      } else result.textContent = `${chapterCount} kapituj · ${lessonCount} mësime · Sanity backend`;
    }

    if (position) position.textContent = index >= 0 ? `${index + 1} / ${state.filtered.length}` : `0 / ${state.filtered.length}`;
    if (previous) previous.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= state.filtered.length - 1;

    const headingStatus = $('#learningStatus');
    if (headingStatus) headingStatus.textContent = `${chapterCount} kapituj · ${lessonCount} mësime`;
  }

  function selectTopic(id, { scroll = false } = {}) {
    if (!id) return;
    const item = state.items.find(candidate => candidate._id === id)
      || state.filtered.find(candidate => candidate._id === id);
    if (!item) return;

    state.selectedId = id;
    const key = chapterKey(item);
    if (key) {
      state.category = key;
      const category = $('#learningCategory');
      if (category) category.value = key;
    }
    applyFilterState();
    renderList();
    renderReaderNavigation();
    syncUrl();
    void renderSelectedDetail();
    if (scroll) requestAnimationFrame(scrollReaderToTop);
  }

  function selectAdjacentTopic(delta) {
    const index = state.filtered.findIndex(item => item._id === state.selectedId);
    const item = state.filtered[index + delta];
    if (item) selectTopic(item._id, { scroll:true });
  }

  function applyFilters() {
    applyFilterState();
    renderList();
    renderReaderNavigation();
    syncUrl();
    void renderSelectedDetail();
  }

  async function runBackendSearch(sequence) {
    const term = clean(state.term);
    if (!term) {
      state.backendResults = null;
      state.searching = false;
      applyFilters();
      return;
    }

    state.searching = true;
    renderReaderNavigation();
    try {
      const payload = await hubApi({
        mode:'search',
        q:term,
        chapter:state.category ? Number(state.category) : '',
      }, { timeout:12000 });
      if (sequence !== state.searchSequence) return;
      state.backendResults = Array.isArray(payload.items) ? payload.items : [];
    } catch (error) {
      if (sequence !== state.searchSequence) return;
      console.error('[Medical Hub search]', error);
      state.backendResults = null;
    } finally {
      if (sequence !== state.searchSequence) return;
      state.searching = false;
      applyFilters();
    }
  }

  function scheduleSearch(value) {
    state.term = value || '';
    state.searchSequence += 1;
    const sequence = state.searchSequence;
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    state.backendResults = null;
    state.searching = Boolean(clean(state.term));

    // Show immediate matches from the lightweight backend index while deep search runs.
    applyFilters();
    if (!state.searching) return;

    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      void runBackendSearch(sequence);
    }, 180);
  }

  function clearSearch({ focus = true } = {}) {
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    state.searchSequence += 1;
    state.term = '';
    state.backendResults = null;
    state.searching = false;
    const input = $('#learningSearch');
    if (input) input.value = '';
    applyFilters();
    if (focus) input?.focus();
  }

  function clearFilters() {
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    state.searchSequence += 1;
    state.term = '';
    state.backendResults = null;
    state.searching = false;
    const firstChapter = state.items.find(isChapter) || null;
    state.category = '';
    state.selectedId = firstChapter?._id || state.items[0]?._id || '';
    const input = $('#learningSearch');
    const category = $('#learningCategory');
    if (input) input.value = '';
    if (category) category.value = '';
    applyFilters();
    input?.focus();
  }

  async function init() {
    loadSharedSidebarTaxonomy();
    bindShell();

    try {
      const authPayload = await ensureAuth();
      await syncProfileChrome(authPayload);

      const indexPayload = await hubApi({ mode:'index' }, { timeout:15000 });
      state.items = Array.isArray(indexPayload.items) ? indexPayload.items : [];
      state.items.sort((a, b) => topicOrder(a) - topicOrder(b) || clean(a.title).localeCompare(clean(b.title), 'sq'));

      const chapters = state.items.filter(isChapter);
      const category = $('#learningCategory');
      if (category) {
        category.innerHTML = '<option value="">Të gjithë kapitujt</option>'
          + chapters.map(chapter => {
            const number = chapterKey(chapter);
            const title = clean(chapter.title).replace(/^\d+\s*[—-]\s*/, '');
            return `<option value="${number}">Kapitulli ${Number(number)} — ${esc(title)}</option>`;
          }).join('');
      }

      state.category = chapters[0] ? chapterKey(chapters[0]) : '';
      state.selectedId = preferredChapterItem(state.category)?._id || chapters[0]?._id || state.items[0]?._id || '';
      restoreUrl();
      if (category) category.value = state.category;
      applyFilterState();

      $('#learningSearch')?.addEventListener('input', event => scheduleSearch(event.target.value));
      $('#learningSearchClear')?.addEventListener('click', () => clearSearch());
      category?.addEventListener('change', event => {
        state.category = event.target.value || '';
        const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === state.category);
        if (!clean(state.term)) {
          state.backendResults = null;
          const preferred = preferredChapterItem(state.category);
          if (preferred) state.selectedId = preferred._id;
          else if (chapter) state.selectedId = chapter._id;
          applyFilters();
          return;
        }
        state.searchSequence += 1;
        const sequence = state.searchSequence;
        window.clearTimeout(searchTimer);
        searchTimer = 0;
        state.backendResults = null;
        state.searching = true;
        applyFilters();
        searchTimer = window.setTimeout(() => {
          searchTimer = 0;
          void runBackendSearch(sequence);
        }, 80);
      });
      $('#learningTopic')?.addEventListener('change', event => selectTopic(event.target.value));
      $('#previousTopicButton')?.addEventListener('click', () => selectAdjacentTopic(-1));
      $('#nextTopicButton')?.addEventListener('click', () => selectAdjacentTopic(1));

      if ($('#syncText')) $('#syncText').textContent = 'Sanity · Backend';

      renderList();
      renderReaderNavigation();
      syncUrl();
      await renderSelectedDetail();
      $('#appShell')?.setAttribute('aria-busy','false');
    } catch (error) {
      console.error('[Medical Hub v2]', error);
      if ($('#learningStatus')) $('#learningStatus').textContent = 'Temat nuk u ngarkuan.';
      if ($('#learningResultStatus')) $('#learningResultStatus').textContent = 'Gabim në lidhjen me backend.';
      if ($('#learningTopic')) $('#learningTopic').innerHTML = '<option>Gabim në ngarkim</option>';
      if ($('#learningDetail')) {
        $('#learningDetail').innerHTML = `
          <div class="ck-empty">
            <strong>Medical Hub nuk u ngarkua.</strong>
            <span>Backend-i ose Sanity nuk u përgjigj. Provo përsëri pa humbur sesionin.</span>
            <button class="ck-retry" type="button" data-hub-retry>Provo përsëri</button>
          </div>`;
        $('#learningDetail').querySelector('[data-hub-retry]')?.addEventListener('click', () => window.location.reload());
      }
      $('#appShell')?.setAttribute('aria-busy','false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
