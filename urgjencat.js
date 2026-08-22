(() => {
  'use strict';

  const QUERY = `*[_type == "emergencyProtocol" && reviewStatus != "archived"] | order(title asc){
    _id,title,"slug":slug.current,icdCodes,aliases,category,triageLevel,summary,
    chapterKey,chapterTitle,chapterOrder,subchapterKey,subchapterTitle,subchapterOrder,
    primaryCareSteps[]{_key,title,action,why,setting,priority,note},
    redFlags,doNotDo,
    referral{when,destination,urgency,beforeTransfer,handover,secondaryCareOverview},
    secondaryCareSteps[]{_key,title,action,why,setting,priority,note},
    sources[]{_key,label,title,organization,url,year,note},
    clinicalSources[]{_key,label,title,organization,url,year,note},
    references[]{_key,label,title,organization,url,year,note},
    reviewStatus,reviewedBy,lastReviewedAt,reviewDueAt,version
  }`;

  const MODE_KEY = 'medindex_emergency_mode_v1';
  const SIM_PREFIX = 'medindex_emergency_sim_v1:';
  const TRIAGE_RANK = {critical: 0, 'very-urgent': 1, urgent: 2};
  const state = {
    items: [],
    filtered: [],
    selectedId: '',
    chapterKey: '',
    subchapterKey: '',
    mode: readMode(),
    detailEntries: new Map(),
    lastFocus: null,
  };

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  function readMode() {
    try {
      const saved = sessionStorage.getItem(MODE_KEY);
      return ['summary', 'learn', 'simulation'].includes(saved) ? saved : 'summary';
    } catch {
      return 'summary';
    }
  }

  function saveMode(mode) {
    try { sessionStorage.setItem(MODE_KEY, mode); } catch {}
  }

  function simulationKey(itemId) {
    return `${SIM_PREFIX}${itemId || 'unknown'}`;
  }

  function readSimulation(itemId) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(simulationKey(itemId)) || '[]');
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function saveSimulation(itemId, values) {
    try { sessionStorage.setItem(simulationKey(itemId), JSON.stringify([...values])); } catch {}
  }

  function fallbackTaxonomy(item) {
    const category = String(item?.category || '').trim();
    const [root, ...rest] = category.split('/').map(part => part.trim()).filter(Boolean);
    const chapterTitle = item?.chapterTitle || root || 'Urgjenca të tjera';
    const subchapterTitle = item?.subchapterTitle || rest.join(' / ') || item?.title || 'Tjetër';
    const slugify = value => normalize(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pa-kategori';
    return {
      chapterKey: item?.chapterKey || slugify(chapterTitle),
      chapterOrder: Number.isFinite(Number(item?.chapterOrder)) ? Number(item.chapterOrder) : 99,
      chapterTitle,
      chapterShortTitle: chapterTitle,
      subchapterKey: item?.subchapterKey || slugify(subchapterTitle),
      subchapterOrder: Number.isFinite(Number(item?.subchapterOrder)) ? Number(item.subchapterOrder) : 99,
      subchapterTitle,
    };
  }

  function taxonomyFor(item) {
    if (item?.__taxonomy) return item.__taxonomy;
    try {
      return window.MedIndexEmergencyTaxonomy?.resolve?.(item) || fallbackTaxonomy(item);
    } catch {
      return fallbackTaxonomy(item);
    }
  }

  function chapterInventory(items = state.items) {
    try {
      const summary = window.MedIndexEmergencyTaxonomy?.summarize?.(items);
      if (Array.isArray(summary)) return summary;
    } catch {}

    const chapters = new Map();
    items.forEach(item => {
      const taxonomy = taxonomyFor(item);
      let chapter = chapters.get(taxonomy.chapterKey);
      if (!chapter) {
        chapter = {
          key: taxonomy.chapterKey,
          order: taxonomy.chapterOrder,
          title: taxonomy.chapterTitle,
          shortTitle: taxonomy.chapterShortTitle,
          count: 0,
          subchapters: new Map(),
        };
        chapters.set(chapter.key, chapter);
      }
      chapter.count += 1;
      let subchapter = chapter.subchapters.get(taxonomy.subchapterKey);
      if (!subchapter) {
        subchapter = {
          key: taxonomy.subchapterKey,
          order: taxonomy.subchapterOrder,
          title: taxonomy.subchapterTitle,
          count: 0,
        };
        chapter.subchapters.set(subchapter.key, subchapter);
      }
      subchapter.count += 1;
    });

    return [...chapters.values()].map(chapter => ({
      ...chapter,
      subchapters: [...chapter.subchapters.values()].sort((a, b) =>
        a.order - b.order || a.title.localeCompare(b.title, 'sq')
      ),
    })).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'sq'));
  }

  function chip(label, className = '') {
    return `<span class="ck-chip ${className}">${esc(label)}</span>`;
  }

  function reviewChip(status) {
    const labels = {draft:'Draft',review:'Për verifikim',verified:'Verifikuar',archived:'Arkivuar'};
    return chip(labels[status] || status || 'Pa status', status === 'verified' ? 'is-verified' : 'is-review');
  }

  function statusLabel(status) {
    return ({draft:'Draft',review:'Për verifikim',verified:'Verifikuar',archived:'Arkivuar'})[status]
      || status
      || 'Pa status';
  }

  function dateLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat('sq-AL', {day:'2-digit', month:'short', year:'numeric'}).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''), window.location.origin);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function itemSources(item) {
    const merged = [
      ...(Array.isArray(item?.sources) ? item.sources : []),
      ...(Array.isArray(item?.clinicalSources) ? item.clinicalSources : []),
      ...(Array.isArray(item?.references) ? item.references : []),
    ];
    const seen = new Set();
    return merged.filter(source => {
      const url = safeUrl(source?.url);
      const signature = `${source?.title || source?.label || ''}|${url}`;
      if (!signature.replace('|', '').trim() || seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  function sourceMarkup(item) {
    const sources = itemSources(item);
    const links = sources.map(source => {
      const href = safeUrl(source.url);
      const title = source.title || source.label || source.organization || 'Burimi klinik';
      const meta = [source.organization, source.year].filter(Boolean).join(' · ');
      return `<li>
        ${href
          ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer external">${esc(title)} <span aria-hidden="true">↗</span></a>`
          : `<span>${esc(title)}</span>`}
        ${meta ? `<small>${esc(meta)}</small>` : ''}
        ${source.note ? `<small>${esc(source.note)}</small>` : ''}
      </li>`;
    }).join('');

    const review = [
      item?.reviewedBy ? `<span><b>Rishikuar nga</b>${esc(item.reviewedBy)}</span>` : '',
      item?.lastReviewedAt ? `<span><b>Rishikimi</b>${esc(dateLabel(item.lastReviewedAt))}</span>` : '',
      item?.reviewDueAt ? `<span><b>Rishikimi i ardhshëm</b>${esc(dateLabel(item.reviewDueAt))}</span>` : '',
      item?.version ? `<span><b>Versioni</b>${esc(item.version)}</span>` : '',
    ].filter(Boolean).join('');

    return `<section class="ck-drawer-source" aria-label="Burimi dhe verifikimi">
      <h3>Burimi &amp; verifikimi</h3>
      <div class="ck-drawer-review">
        <span><b>Statusi</b>${esc(statusLabel(item?.reviewStatus))}</span>
        ${review}
      </div>
      ${links
        ? `<ul class="ck-source-list">${links}</ul>`
        : `<p class="ck-source-missing">Burimi klinik nuk është vendosur ende si link në këtë dokument të Sanity.</p>`}
    </section>`;
  }

  function registerDetail(entry) {
    state.detailEntries.set(entry.id, entry);
    return entry.id;
  }

  function detailId(item, type, key) {
    return `${item?._id || 'item'}:${type}:${key || Math.random().toString(36).slice(2)}`;
  }

  function priorityClass(priority) {
    const value = normalize(priority);
    if (/(urgent|critical|kritik|menjeher|immediate|high|larte)/.test(value)) return ' is-critical';
    if (/(medium|mesme|moderate)/.test(value)) return ' is-warning';
    return '';
  }

  function stepMarkup(item, step, context, index, simDone) {
    const id = registerDetail({
      id: detailId(item, context === 'secondary' ? 'secondary-step' : 'primary-step', step._key || index),
      kind: context === 'secondary' ? 'Kujdesi sekondar' : 'Hapi klinik',
      title: step.title || `Hapi ${index + 1}`,
      action: step.action || '',
      why: step.why || '',
      setting: step.setting || '',
      priority: step.priority || '',
      note: step.note || '',
      item,
    });
    const done = simDone.has(id);
    return `<article class="ck-step-card${priorityClass(step.priority)}${done ? ' is-done' : ''}">
      <span class="ck-step-number" aria-hidden="true">${index + 1}</span>
      <button class="ck-step-open" type="button" data-ck-detail="${esc(id)}" aria-label="Shiko më shumë: ${esc(step.title || `Hapi ${index + 1}`)}">
        <span class="ck-step-copy">
          <strong>${esc(step.title || `Hapi ${index + 1}`)}</strong>
          <span class="ck-step-action">${esc(step.action || '')}</span>
          ${step.why ? `<small class="ck-step-why">${esc(step.why)}</small>` : ''}
          <span class="ck-step-footer">
            ${step.setting ? `<em>${esc(step.setting)}</em>` : ''}
            ${step.priority ? `<em>${esc(step.priority)}</em>` : ''}
            <b>Shiko më shumë <span aria-hidden="true">→</span></b>
          </span>
        </span>
      </button>
      <button class="ck-sim-check" type="button" data-ck-sim="${esc(id)}" aria-pressed="${done ? 'true' : 'false'}">
        <span aria-hidden="true">${done ? '✓' : '○'}</span>${done ? 'E kryer' : 'Shëno si kryer'}
      </button>
    </article>`;
  }

  function infoCard(item, kind, text, index, tone = '') {
    const id = registerDetail({
      id: detailId(item, kind, index),
      kind,
      title: kind,
      action: text,
      item,
      tone,
    });
    return `<button class="ck-info-card${tone ? ` is-${tone}` : ''}" type="button" data-ck-detail="${esc(id)}">
      <span class="ck-info-dot" aria-hidden="true"></span>
      <span>${esc(text)}</span>
      <b aria-hidden="true">→</b>
    </button>`;
  }

  function bulletCards(item, kind, items, tone = '') {
    return `<div class="ck-info-grid">${(items || []).map((text, index) => infoCard(item, kind, text, index, tone)).join('')}</div>`;
  }

  function referralMarkup(item, referral) {
    const lines = [
      referral.when ? ['Kur referohet', referral.when] : null,
      referral.destination ? ['Destinacioni', referral.destination] : null,
      referral.urgency ? ['Urgjenca', referral.urgency] : null,
      referral.handover ? ['Handover', referral.handover] : null,
    ].filter(Boolean);
    const id = registerDetail({
      id: detailId(item, 'referral', 'main'),
      kind: 'Referimi',
      title: 'Referimi & transferimi',
      action: referral.when || '',
      destination: referral.destination || '',
      urgency: referral.urgency || '',
      handover: referral.handover || '',
      beforeTransfer: referral.beforeTransfer || [],
      item,
      tone: 'danger',
    });

    return `<section class="ck-section ck-referral">
      <div class="ck-section-title">
        <div><span class="ck-section-kicker">Transferimi</span><h3>Referimi</h3></div>
        <button class="ck-section-more" type="button" data-ck-detail="${esc(id)}">Detajet <span aria-hidden="true">→</span></button>
      </div>
      ${lines.map(([label, value]) => `<p class="ck-summary"><strong>${esc(label)}:</strong> ${esc(value)}</p>`).join('')}
      ${referral.beforeTransfer?.length ? `<h4>Para transferimit</h4>${bulletCards(item, 'Para transferimit', referral.beforeTransfer, 'warning')}` : ''}
    </section>`;
  }

  function modeMarkup() {
    const modes = [
      ['summary', 'Përmbledhje', 'Lexim i shpejtë'],
      ['learn', 'Mëso', 'Me arsyetim klinik'],
      ['simulation', 'Simulim', 'Praktiko rendin e hapave'],
    ];
    return `<div class="ck-mode-wrap">
      <div class="ck-mode-toggle" role="group" aria-label="Mënyra e shfaqjes">
        ${modes.map(([value, label]) => `<button type="button" data-ck-mode="${value}" aria-pressed="${state.mode === value ? 'true' : 'false'}">${label}</button>`).join('')}
      </div>
      <span class="ck-mode-caption">${esc(modes.find(([value]) => value === state.mode)?.[2] || '')}</span>
    </div>`;
  }

  function simulationProgressMarkup(item, stepIds) {
    const done = readSimulation(item._id);
    const completed = stepIds.filter(id => done.has(id)).length;
    const total = stepIds.length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return `<div class="ck-sim-progress" data-ck-sim-progress>
      <div>
        <span>Simulim i rendit të hapave</span>
        <strong>${completed}/${total}</strong>
      </div>
      <div class="ck-sim-track" aria-hidden="true"><span style="width:${percent}%"></span></div>
      <small>Ky modalitet organizon ushtrimin; nuk zëvendëson vlerësimin ose vendimmarrjen klinike.</small>
      ${completed ? `<button type="button" data-ck-sim-reset>Rivendos simulimin</button>` : ''}
    </div>`;
  }

  function breadcrumbMarkup(item) {
    const taxonomy = taxonomyFor(item);
    const chapterNumber = taxonomy.chapterOrder < 99 ? `Kapitulli ${taxonomy.chapterOrder}` : 'Kapitulli';
    return `<nav class="ck-emergency-breadcrumb" aria-label="Pozicioni në strukturën e urgjencave">
      <span>${esc(chapterNumber)}</span>
      <span class="is-chapter"><b>${esc(taxonomy.chapterTitle)}</b></span>
      <span><b>${esc(taxonomy.subchapterTitle)}</b></span>
    </nav>`;
  }

  function renderDetail(item) {
    const detail = $('#emergencyDetail');
    state.detailEntries.clear();
    if (!item) {
      detail.innerHTML = '<div class="ck-empty">Nuk u gjet urgjenca.</div>';
      return;
    }

    const referral = item.referral || {};
    const simDone = readSimulation(item._id);
    const primaryStepIds = [];
    const primaryMarkup = (item.primaryCareSteps || []).map((step, index) => {
      const markup = stepMarkup(item, step, 'primary', index, simDone);
      const id = [...state.detailEntries.keys()].at(-1);
      if (id) primaryStepIds.push(id);
      return markup;
    }).join('');
    const secondaryMarkup = (item.secondaryCareSteps || []).map((step, index) =>
      stepMarkup(item, step, 'secondary', index, simDone)
    ).join('');

    detail.dataset.ckMode = state.mode;
    detail.innerHTML = `
      <header class="ck-detail-head">
        <div>
          ${breadcrumbMarkup(item)}
          <div class="ck-title-row">
            <div>
              <h2>${esc(item.title)}</h2>
              <div class="ck-meta">
                ${(item.icdCodes || []).map(code => chip(code)).join('')}
                ${item.category ? chip(item.category) : ''}
                ${item.triageLevel ? chip(item.triageLevel, 'is-critical') : ''}
                ${reviewChip(item.reviewStatus)}
                ${item.version ? chip(`v${item.version}`) : ''}
              </div>
            </div>
            <button class="ck-review-button" type="button" data-ck-review aria-label="Shiko burimin dhe statusin e rishikimit">
              <span aria-hidden="true">✓</span>
              <span>${item.reviewStatus === 'verified' ? 'E verifikuar' : 'Statusi klinik'}<small>${item.lastReviewedAt ? `Rishikuar ${esc(dateLabel(item.lastReviewedAt))}` : 'Shiko detajet'}</small></span>
            </button>
          </div>
          <p class="ck-summary">${esc(item.summary || '')}</p>
          ${modeMarkup()}
          ${simulationProgressMarkup(item, primaryStepIds)}
        </div>
      </header>
      <div class="ck-sections">
        <section class="ck-section ck-primary-section">
          <div class="ck-section-title">
            <div><span class="ck-section-kicker">Veprimi</span><h3>Hapat në kujdes parësor</h3></div>
            <span class="ck-section-count">${(item.primaryCareSteps || []).length} hapa</span>
          </div>
          <div class="ck-steps">${primaryMarkup || '<p class="ck-status">Ende pa hapa.</p>'}</div>
        </section>

        ${item.redFlags?.length ? `<section class="ck-section ck-alert-section">
          <div class="ck-section-title">
            <div><span class="ck-section-kicker">Alarm</span><h3>Shenjat alarmuese</h3></div>
            <span class="ck-section-count">${item.redFlags.length}</span>
          </div>
          ${bulletCards(item, 'Shenjë alarmuese', item.redFlags, 'danger')}
        </section>` : ''}

        ${referral.when || referral.destination || referral.beforeTransfer?.length || referral.handover ? referralMarkup(item, referral) : ''}

        ${(item.secondaryCareSteps?.length || referral.secondaryCareOverview?.length) ? `<section class="ck-section ck-deep-section">
          <div class="ck-section-title">
            <div><span class="ck-section-kicker">Vazhdimi</span><h3>Kujdesi sekondar</h3></div>
            <span class="ck-section-count">${(item.secondaryCareSteps || []).length || ''}</span>
          </div>
          <div class="ck-steps">${secondaryMarkup}</div>
          ${referral.secondaryCareOverview?.length ? bulletCards(item, 'Kujdesi sekondar', referral.secondaryCareOverview) : ''}
        </section>` : ''}

        ${item.doNotDo?.length ? `<section class="ck-section ck-safety-section">
          <div class="ck-section-title">
            <div><span class="ck-section-kicker">Siguria</span><h3>Çfarë të mos bëhet</h3></div>
            <span class="ck-section-count">${item.doNotDo.length}</span>
          </div>
          ${bulletCards(item, 'Çfarë të mos bëhet', item.doNotDo, 'danger')}
        </section>` : ''}
      </div>`;

    bindDetailInteractions(item);
  }

  function drawerSection(title, body, className = '') {
    if (!body && body !== 0) return '';
    return `<section class="ck-drawer-section ${className}"><h3>${esc(title)}</h3><p>${esc(body)}</p></section>`;
  }

  function listSection(title, items, className = '') {
    if (!Array.isArray(items) || !items.length) return '';
    return `<section class="ck-drawer-section ${className}"><h3>${esc(title)}</h3><ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>`;
  }

  function drawerBody(entry) {
    const blocks = [];
    if (entry.kind === 'Referimi') {
      blocks.push(drawerSection('Kur?', entry.action));
      blocks.push(drawerSection('Ku?', entry.destination));
      blocks.push(drawerSection('Urgjenca', entry.urgency, 'is-warning'));
      blocks.push(listSection('Para transferimit', entry.beforeTransfer));
      blocks.push(drawerSection('Handover', entry.handover));
    } else {
      blocks.push(drawerSection(entry.kind === 'Hapi klinik' || entry.kind === 'Kujdesi sekondar' ? 'Çka bëj tani?' : 'Shpjegimi', entry.action));
      blocks.push(drawerSection('Pse ka rëndësi?', entry.why));
      if (entry.setting || entry.priority) {
        blocks.push(`<section class="ck-drawer-section"><h3>Konteksti</h3><div class="ck-drawer-pills">
          ${entry.setting ? chip(entry.setting) : ''}
          ${entry.priority ? chip(entry.priority, priorityClass(entry.priority).includes('critical') ? 'is-critical' : '') : ''}
        </div></section>`);
      }
      blocks.push(drawerSection('Kujdes / shënim klinik', entry.note, entry.tone === 'danger' ? 'is-danger' : ''));
    }
    blocks.push(sourceMarkup(entry.item));
    return blocks.filter(Boolean).join('');
  }

  function ensureDrawer() {
    let root = $('#ckDetailOverlay');
    if (root) return root;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="ck-drawer-overlay" id="ckDetailOverlay" hidden>
        <button class="ck-drawer-backdrop" type="button" data-ck-close aria-label="Mbyll panelin"></button>
        <aside class="ck-drawer" role="dialog" aria-modal="true" aria-labelledby="ckDrawerTitle" tabindex="-1">
          <div class="ck-drawer-handle" aria-hidden="true"></div>
          <header class="ck-drawer-head">
            <div><span id="ckDrawerKind"></span><h2 id="ckDrawerTitle"></h2></div>
            <button class="ck-drawer-close" type="button" data-ck-close aria-label="Mbyll">×</button>
          </header>
          <div class="ck-drawer-body" id="ckDrawerBody"></div>
        </aside>
      </div>`);
    root = $('#ckDetailOverlay');
    root.querySelectorAll('[data-ck-close]').forEach(button => button.addEventListener('click', closeDrawer));
    root.addEventListener('keydown', trapDrawerFocus);
    return root;
  }

  function openDrawer(id, trigger) {
    const entry = state.detailEntries.get(id);
    if (!entry) return;
    const root = ensureDrawer();
    state.lastFocus = trigger || document.activeElement;
    $('#ckDrawerKind').textContent = entry.kind || 'Detaj klinik';
    $('#ckDrawerTitle').textContent = entry.title || 'Më shumë';
    $('#ckDrawerBody').innerHTML = drawerBody(entry);
    root.hidden = false;
    document.documentElement.classList.add('ck-drawer-open');
    requestAnimationFrame(() => {
      root.classList.add('is-open');
      root.querySelector('.ck-drawer')?.focus({preventScroll:true});
    });
  }

  function closeDrawer() {
    const root = $('#ckDetailOverlay');
    if (!root || root.hidden) return;
    root.classList.remove('is-open');
    document.documentElement.classList.remove('ck-drawer-open');
    window.setTimeout(() => { root.hidden = true; }, 180);
    if (state.lastFocus?.focus) state.lastFocus.focus({preventScroll:true});
  }

  function trapDrawerFocus(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = $('#ckDetailOverlay');
    const focusable = [...root.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(node => !node.hidden && node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateSimulation(item, id) {
    const done = readSimulation(item._id);
    if (done.has(id)) done.delete(id);
    else done.add(id);
    saveSimulation(item._id, done);
    renderDetail(item);
  }

  function bindDetailInteractions(item) {
    const detail = $('#emergencyDetail');
    detail.querySelectorAll('[data-ck-detail]').forEach(button => {
      button.addEventListener('click', () => openDrawer(button.dataset.ckDetail, button));
    });

    detail.querySelector('[data-ck-review]')?.addEventListener('click', event => {
      const id = registerDetail({
        id: detailId(item, 'review', 'status'),
        kind: 'Verifikimi klinik',
        title: item.title,
        action: item.summary || '',
        item,
      });
      openDrawer(id, event.currentTarget);
    });

    detail.querySelectorAll('[data-ck-mode]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.dataset.ckMode;
        if (!['summary', 'learn', 'simulation'].includes(mode) || mode === state.mode) return;
        state.mode = mode;
        saveMode(mode);
        renderDetail(item);
      });
    });

    detail.querySelectorAll('[data-ck-sim]').forEach(button => {
      button.addEventListener('click', () => updateSimulation(item, button.dataset.ckSim));
    });

    detail.querySelector('[data-ck-sim-reset]')?.addEventListener('click', () => {
      try { sessionStorage.removeItem(simulationKey(item._id)); } catch {}
      renderDetail(item);
    });
  }

  function compareItems(a, b) {
    const at = taxonomyFor(a);
    const bt = taxonomyFor(b);
    return at.chapterOrder - bt.chapterOrder
      || at.subchapterOrder - bt.subchapterOrder
      || (TRIAGE_RANK[a.triageLevel] ?? 99) - (TRIAGE_RANK[b.triageLevel] ?? 99)
      || String(a.title || '').localeCompare(String(b.title || ''), 'sq');
  }

  function groupFilteredItems() {
    const chapters = new Map();
    [...state.filtered].sort(compareItems).forEach(item => {
      const taxonomy = taxonomyFor(item);
      let chapter = chapters.get(taxonomy.chapterKey);
      if (!chapter) {
        chapter = {
          key: taxonomy.chapterKey,
          order: taxonomy.chapterOrder,
          title: taxonomy.chapterTitle,
          count: 0,
          subchapters: new Map(),
        };
        chapters.set(chapter.key, chapter);
      }
      chapter.count += 1;
      let subchapter = chapter.subchapters.get(taxonomy.subchapterKey);
      if (!subchapter) {
        subchapter = {
          key: taxonomy.subchapterKey,
          order: taxonomy.subchapterOrder,
          title: taxonomy.subchapterTitle,
          items: [],
        };
        chapter.subchapters.set(subchapter.key, subchapter);
      }
      subchapter.items.push(item);
    });

    return [...chapters.values()].map(chapter => ({
      ...chapter,
      subchapters: [...chapter.subchapters.values()].sort((a, b) =>
        a.order - b.order || a.title.localeCompare(b.title, 'sq')
      ),
    })).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'sq'));
  }

  function listButtonMarkup(item) {
    const taxonomy = taxonomyFor(item);
    return `<button class="ck-list-button${item._id === state.selectedId ? ' is-active' : ''}" type="button"
      data-id="${esc(item._id)}" data-chapter-key="${esc(taxonomy.chapterKey)}" data-subchapter-key="${esc(taxonomy.subchapterKey)}"
      aria-pressed="${item._id === state.selectedId ? 'true' : 'false'}">
      <strong>${esc(item.title)}</strong>
      <span>${esc((item.icdCodes || []).join(' · '))}${item.category ? ` · ${esc(item.category)}` : ''}</span>
    </button>`;
  }

  function renderList() {
    const list = $('#emergencyList');
    const groups = groupFilteredItems();
    list.innerHTML = groups.map(chapter => `
      <section class="ck-directory-chapter" data-ck-chapter-group="${esc(chapter.key)}">
        <header class="ck-directory-chapter-head">
          <div>
            <span>${chapter.order < 99 ? `Kapitulli ${String(chapter.order).padStart(2, '0')}` : 'Kapitulli'}</span>
            <strong>${esc(chapter.title)}</strong>
          </div>
          <b>${chapter.count}</b>
        </header>
        ${chapter.subchapters.map(subchapter => `
          <div class="ck-directory-subchapter" data-ck-subchapter-group="${esc(subchapter.key)}">
            <div class="ck-directory-subchapter-title">${esc(subchapter.title)}</div>
            ${subchapter.items.map(listButtonMarkup).join('')}
          </div>`).join('')}
      </section>`).join('') || '<p class="ck-status">Nuk u gjet asnjë urgjencë.</p>';

    list.querySelectorAll('[data-id]').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedId = button.dataset.id;
        renderList();
        const item = state.items.find(candidate => candidate._id === state.selectedId);
        renderDetail(item);
        syncUrlState(item);
        if (matchMedia('(max-width: 900px)').matches) {
          $('#emergencyDetail')?.scrollIntoView({behavior:'smooth', block:'start'});
        }
      });
    });
  }

  function chapterByKey(key) {
    return chapterInventory().find(chapter => chapter.key === key) || null;
  }

  function renderChapterNavigation() {
    const explorer = $('#emergencyChapterExplorer');
    const chapterNav = $('#emergencyChapterNav');
    const subchapterWrap = $('#emergencySubchapterWrap');
    const subchapterNav = $('#emergencySubchapterNav');
    const summary = $('#emergencyChapterSummary');
    if (!explorer || !chapterNav || !subchapterWrap || !subchapterNav || !summary) return;

    const chapters = chapterInventory();
    explorer.hidden = !chapters.length;
    summary.textContent = `${chapters.length} ${chapters.length === 1 ? 'kapitull aktiv' : 'kapituj aktivë'} · ${state.items.length} ${state.items.length === 1 ? 'protokoll' : 'protokolle'}`;

    chapterNav.innerHTML = chapters.map(chapter => `
      <button type="button" data-ck-chapter="${esc(chapter.key)}" aria-pressed="${state.chapterKey === chapter.key ? 'true' : 'false'}">
        <span>${chapter.order < 99 ? String(chapter.order).padStart(2, '0') : '•'}</span>
        <strong>${esc(chapter.shortTitle || chapter.title)}</strong>
        <b>${chapter.count}</b>
      </button>`).join('');

    const active = chapterByKey(state.chapterKey);
    if (!active) {
      subchapterWrap.hidden = true;
      subchapterNav.innerHTML = '';
      return;
    }

    subchapterWrap.hidden = false;
    subchapterNav.innerHTML = `
      <button type="button" data-ck-subchapter="" aria-pressed="${state.subchapterKey ? 'false' : 'true'}">Të gjitha <b>${active.count}</b></button>
      ${active.subchapters.map(subchapter => `
        <button type="button" data-ck-subchapter="${esc(subchapter.key)}" aria-pressed="${state.subchapterKey === subchapter.key ? 'true' : 'false'}">
          ${esc(subchapter.title)} <b>${subchapter.count}</b>
        </button>`).join('')}`;
  }

  function activeFilterLabel() {
    const chapter = chapterByKey(state.chapterKey);
    if (!chapter) return '';
    const subchapter = chapter.subchapters.find(item => item.key === state.subchapterKey);
    return subchapter ? `${chapter.shortTitle || chapter.title} · ${subchapter.title}` : (chapter.shortTitle || chapter.title);
  }

  function syncUrlState(item) {
    try {
      const url = new URL(window.location.href);
      if (state.chapterKey) url.searchParams.set('chapter', state.chapterKey);
      else url.searchParams.delete('chapter');
      if (state.subchapterKey) url.searchParams.set('subchapter', state.subchapterKey);
      else url.searchParams.delete('subchapter');
      if (item?.slug) url.searchParams.set('emergency', item.slug);
      else url.searchParams.delete('emergency');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  function restoreUrlState() {
    try {
      const url = new URL(window.location.href);
      const chapterKey = url.searchParams.get('chapter') || '';
      const subchapterKey = url.searchParams.get('subchapter') || '';
      const emergencySlug = url.searchParams.get('emergency') || '';
      const chapters = chapterInventory();
      const chapter = chapters.find(item => item.key === chapterKey);
      state.chapterKey = chapter ? chapter.key : '';
      state.subchapterKey = chapter?.subchapters.some(item => item.key === subchapterKey) ? subchapterKey : '';
      const item = state.items.find(candidate => candidate.slug === emergencySlug);
      if (item) state.selectedId = item._id;
    } catch {}
  }

  function applyFilters({syncUrl = true} = {}) {
    const term = normalize($('#emergencySearch').value);
    const category = $('#emergencyCategory').value;
    state.filtered = state.items.filter(item => {
      const taxonomy = taxonomyFor(item);
      const haystack = normalize([
        item.title,item.summary,item.category,taxonomy.chapterTitle,taxonomy.subchapterTitle,
        ...(item.icdCodes || []),...(item.aliases || []),
      ].join(' '));
      return (!term || haystack.includes(term))
        && (!category || item.category === category)
        && (!state.chapterKey || taxonomy.chapterKey === state.chapterKey)
        && (!state.subchapterKey || taxonomy.subchapterKey === state.subchapterKey);
    }).sort(compareItems);

    if (!state.filtered.some(item => item._id === state.selectedId)) state.selectedId = state.filtered[0]?._id || '';
    renderChapterNavigation();
    renderList();
    const item = state.items.find(candidate => candidate._id === state.selectedId);
    renderDetail(item);

    const status = $('#emergencyStatus');
    const filterLabel = activeFilterLabel();
    status.textContent = `${state.filtered.length} ${state.filtered.length === 1 ? 'urgjencë' : 'urgjenca'}${filterLabel ? ` · ${filterLabel}` : ''}`;
    status.dataset.ckFiltered = state.chapterKey || state.subchapterKey || term ? 'true' : 'false';
    if (syncUrl) syncUrlState(item);
  }

  function setChapterFilter(chapterKey) {
    state.chapterKey = chapterKey || '';
    state.subchapterKey = '';
    applyFilters();
    requestAnimationFrame(() => {
      const selector = state.chapterKey
        ? `[data-ck-chapter="${CSS.escape(state.chapterKey)}"]`
        : '#emergencyChapterReset';
      $(selector)?.focus({preventScroll:true});
    });
  }

  function setSubchapterFilter(subchapterKey) {
    state.subchapterKey = subchapterKey || '';
    applyFilters();
    requestAnimationFrame(() => {
      const escaped = CSS.escape(state.subchapterKey);
      $(`[data-ck-subchapter="${escaped}"]`)?.focus({preventScroll:true});
    });
  }

  function moveFilterFocus(event, selector) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const current = event.target.closest(selector);
    if (!current) return;
    const root = current.parentElement;
    const buttons = [...root.querySelectorAll(selector)];
    if (!buttons.length) return;
    event.preventDefault();
    let index = buttons.indexOf(current);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus({preventScroll:true});
  }

  function bindChapterNavigation() {
    $('#emergencyChapterNav')?.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-chapter]');
      if (!button) return;
      setChapterFilter(button.dataset.ckChapter || '');
    });
    $('#emergencyChapterNav')?.addEventListener('keydown', event => moveFilterFocus(event, '[data-ck-chapter]'));

    $('#emergencySubchapterNav')?.addEventListener('click', event => {
      const button = event.target.closest('[data-ck-subchapter]');
      if (!button) return;
      setSubchapterFilter(button.dataset.ckSubchapter || '');
    });
    $('#emergencySubchapterNav')?.addEventListener('keydown', event => moveFilterFocus(event, '[data-ck-subchapter]'));

    $('#emergencyChapterReset')?.addEventListener('click', () => {
      state.chapterKey = '';
      state.subchapterKey = '';
      applyFilters();
      requestAnimationFrame(() => $('#emergencyChapterReset')?.focus({preventScroll:true}));
    });
  }

  async function init() {
    try {
      ensureDrawer();
      const rows = await window.MedIndexSanity.query(QUERY);
      state.items = (Array.isArray(rows) ? rows : []).map(item => ({
        ...item,
        __taxonomy: taxonomyFor(item),
      }));

      const categories = [...new Set(state.items.map(item => item.category).filter(Boolean))]
        .sort((a,b) => a.localeCompare(b,'sq'));
      $('#emergencyCategory').insertAdjacentHTML(
        'beforeend',
        categories.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join('')
      );

      state.selectedId = state.items[0]?._id || '';
      restoreUrlState();
      bindChapterNavigation();
      $('#emergencySearch').addEventListener('input', () => applyFilters());
      $('#emergencyCategory').addEventListener('change', () => applyFilters());
      applyFilters({syncUrl:false});
    } catch (error) {
      console.error(error);
      $('#emergencyStatus').textContent = 'Urgjencat nuk u ngarkuan.';
      $('#emergencyDetail').innerHTML = '<div class="ck-empty">Kontrollo lidhjen me Sanity ose publiko dokumentet.</div>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
