(() => {
  'use strict';

  const ID = 'upk-03';
  const DATA_URL = '/data/protocol-elaborations-upk03.json';
  const MANIFEST_URL = '/data/protocols.json';
  const TRANSFER_KEY = 'medindexPrescriptionProtocolDraft';
  const WHO_URL = 'https://www.who.int/publications/i/item/9789240024168';
  const K = {
    checks:'mi_upk03_checks_v1',
    syndrome:'mi_upk03_syndrome_v1',
    rx:'mi_upk03_rx_v1',
    mode:'mi_upk03_mode_v1',
  };

  let pending = null;
  let scheduled = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (value, max = 1200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));

  function routeId() {
    try { return new URL(window.location.href).searchParams.get('protocol') || ''; }
    catch { return ''; }
  }

  function readState(key) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }

  function saveState(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function readString(key, fallback = '') {
    try { return sessionStorage.getItem(key) || fallback; }
    catch { return fallback; }
  }

  function saveString(key, value) {
    try { sessionStorage.setItem(key, value); } catch {}
  }

  function toneClass(tone) {
    return ['danger', 'warning', 'info', 'primary'].includes(tone) ? ` is-${tone}` : '';
  }

  async function loadPayload() {
    if (pending) return pending;
    pending = Promise.all([
      fetch(DATA_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
      fetch(MANIFEST_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
    ]).then(async ([dataResponse, manifestResponse]) => {
      if (!dataResponse.ok || !manifestResponse.ok) throw new Error('Të dhënat e protokollit nr. 3 nuk u ngarkuan.');
      const [data, manifest] = await Promise.all([dataResponse.json(), manifestResponse.json()]);
      const entry = data?.entry;
      const documentRecord = Array.isArray(manifest?.documents) ? manifest.documents.find(item => item?.id === ID) : null;
      if (!entry?.primaryCare || !documentRecord || entry.protocolId !== ID) throw new Error('Pamja interaktive nuk është konfiguruar.');
      const sourceHash = clean(entry.sourceHash, 64).toLowerCase();
      const currentHash = clean(documentRecord.contentSha256, 64).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(sourceHash) || sourceHash !== currentHash) {
        throw new Error('Versioni i burimit MSH ka ndryshuar. Pamja interaktive është ndalur.');
      }
      return { entry, documentRecord, sourceHash };
    }).catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  }

  function officialLink(documentRecord, label = 'Hap Udhërrëfyesin e MSH') {
    const url = clean(documentRecord?.officialUrl, 1200);
    if (!url) return '';
    return `<a class="pc-source-chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer external">${esc(label)}</a>`;
  }

  function supportLinks(documentRecord) {
    return `<div class="p3-source-pair">${officialLink(documentRecord, 'MSH · dokumenti zyrtar')}<a class="pc-source-chip p3-who" href="${WHO_URL}" target="_blank" rel="noopener noreferrer external">WHO 2021 · mbështetje e strukturës</a></div>`;
  }

  function todayMarkup(pc) {
    return `<section class="pc-panel pc-today" id="p3-today" aria-labelledby="p3TodayTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Sot në vizitë</span>
        <h2 id="p3TodayTitle">4 gjërat që s'duhet t'i humbësh</h2>
        <p>Fillimisht siguria, pastaj sindroma. Mos nis nga emri i mikrobit me hamendje.</p>
      </div>
      <div class="pc-today-grid">
        ${pc.todayActions.map(item => `<article class="pc-today-card${toneClass(item.tone)}">
          <div class="pc-today-number">${esc(item.number)}</div>
          <div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></div>
        </article>`).join('')}
      </div>
    </section>`;
  }

  function checksMarkup(pc) {
    const saved = readState(K.checks);
    return `<section class="pc-panel pc-quick" id="p3-checks" aria-labelledby="p3ChecksTitle">
      <div class="pc-section-head pc-section-head-split">
        <div>
          <span class="pc-kicker">Kontroll interaktiv</span>
          <h2 id="p3ChecksTitle">Kontrollo në 60 sekonda</h2>
          <p>Shëno vetëm çka vlen. Kur del shenjë alarmi, paneli ta ndryshon menjëherë fokusin.</p>
        </div>
        <div class="pc-progress-wrap" aria-live="polite"><strong data-p3-count>0/${pc.quickChecks.length}</strong><span>të shënuara</span></div>
      </div>
      <div class="pc-progress" aria-hidden="true"><span data-p3-bar></span></div>
      <div class="pc-check-grid">
        ${pc.quickChecks.map(item => `<label class="pc-check${toneClass(item.tone)}">
          <input type="checkbox" data-p3-check="${esc(item.id)}" ${saved[item.id] ? 'checked' : ''}>
          <span class="pc-check-box" aria-hidden="true"></span>
          <span class="pc-check-copy">${esc(item.label)}</span>
        </label>`).join('')}
      </div>
      <div class="pc-context-alerts" data-p3-alerts aria-live="polite"></div>
      <button class="pc-text-button" type="button" data-p3-reset>Rivendos kontrollin</button>
    </section>`;
  }

  function syndromeDetailMarkup(item) {
    if (!item) return `<div class="p3-syndrome-empty"><strong>Zgjidh një sindromë</strong><span>Do të shfaqen vetëm hapat që kanë rëndësi për atë paraqitje.</span></div>`;
    return `<article class="p3-syndrome-detail" data-p3-detail-id="${esc(item.id)}">
      <header><span>Pyetja kryesore</span><h3>${esc(item.prompt)}</h3></header>
      <div class="p3-detail-grid">
        <section><strong>Çka kontrollon</strong><ol>${item.assessment.map(value => `<li>${esc(value)}</li>`).join('')}</ol></section>
        <section class="is-decision"><strong>Vendimi</strong><p>${esc(item.decision)}</p></section>
        <section class="is-follow"><strong>Follow-up / kur eskalon</strong><p>${esc(item.followUp)}</p></section>
      </div>
      <button class="p3-use-syndrome" type="button" data-p3-use-diagnosis="${esc(item.rxDiagnosis)}">Përdore këtë sindromë te Rp.</button>
    </article>`;
  }

  function syndromesMarkup(pc) {
    const savedId = readString(K.syndrome, '');
    const initial = pc.syndromes.find(item => item.id === savedId) || null;
    return `<section class="pc-panel p3-syndromes" id="p3-syndromes" aria-labelledby="p3SyndromesTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Hapi kryesor</span>
        <h2 id="p3SyndromesTitle">Cilën sindromë po e sheh?</h2>
        <p>Zgjidh vetëm paraqitjen që dominon. Nëse ka dy sindroma, vlerësoji të dyja klinikisht.</p>
      </div>
      <div class="p3-syndrome-grid" role="list">
        ${pc.syndromes.map(item => `<button type="button" class="p3-syndrome-card${initial?.id === item.id ? ' is-active' : ''}" data-p3-syndrome="${esc(item.id)}" aria-pressed="${initial?.id === item.id ? 'true' : 'false'}">
          <span>${esc(item.short)}</span><strong>${esc(item.title)}</strong>
        </button>`).join('')}
      </div>
      <div data-p3-syndrome-detail>${syndromeDetailMarkup(initial)}</div>
    </section>`;
  }

  function alwaysDoMarkup(pc, documentRecord) {
    return `<section class="pc-panel pc-deep p3-always" id="p3-always" aria-labelledby="p3AlwaysTitle">
      <div class="pc-section-head"><span class="pc-kicker">Në çdo sindromë</span><h2 id="p3AlwaysTitle">Mos i lër këto jashtë vizitës</h2></div>
      <div class="pc-follow-grid">${pc.alwaysDo.map(item => `<div><span aria-hidden="true">✓</span><p>${esc(item)}</p></div>`).join('')}</div>
      ${supportLinks(documentRecord)}
    </section>`;
  }

  function rxFieldMarkup(field, saved) {
    const value = clean(saved[field.id] || '', field.id === 'instructions' ? 1200 : 400);
    const wide = ['diagnosis', 'instructions'].includes(field.id);
    const textArea = field.id === 'instructions';
    return `<label class="${wide ? 'is-wide' : ''}"><span>${esc(field.label)}</span>${textArea
      ? `<textarea rows="2" data-p3-field="${esc(field.id)}" placeholder="${esc(field.placeholder)}">${esc(value)}</textarea>`
      : `<input type="text" data-p3-field="${esc(field.id)}" value="${esc(value)}" placeholder="${esc(field.placeholder)}" autocomplete="off">`}</label>`;
  }

  function rxMarkup(pc) {
    const rx = pc.rx;
    const saved = readState(K.rx);
    return `<section class="pc-panel pc-rx-section" id="p3-rx" aria-labelledby="p3RxTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Receta</span>
        <h2 id="p3RxTitle">Rp. në një katror — pa shpikur regjimin</h2>
        <p>${esc(rx.subtitle)}</p>
      </div>
      <div class="p3-rx-warning"><strong>Regjimi lokal duhet verifikuar</strong><span>MedIndex nuk e para-mbush antibiotikun/dozën për protokollin nr. 3 derisa Udhërrëfyesi MSH të auditohet faqe-për-faqe.</span></div>
      <div class="pc-rx-editor p3-rx-editor">
        <div class="pc-rx-editor-head"><div><span>Rp.</span><strong>${esc(rx.title)}</strong></div><span>Plotësohet nga mjeku</span></div>
        <div class="pc-rx-fields">${rx.fields.map(field => rxFieldMarkup(field, saved)).join('')}</div>
        <div class="pc-rx-editor-actions">
          <button class="pc-copy-button is-primary" type="button" data-p3-copy>Kopjo draftin</button>
          <button class="pc-copy-button pc-rx-handoff" type="button" data-p3-handoff>Vazhdo te Recetat</button>
          <button class="pc-text-button" type="button" data-p3-clear>Pastro</button>
        </div>
        <p class="pc-copy-status" data-p3-rx-status role="status" aria-live="polite"></p>
      </div>
    </section>`;
  }

  function referralMarkup(pc) {
    const referral = pc.referral;
    return `<section class="pc-panel pc-referral" id="p3-referral" aria-labelledby="p3ReferralTitle">
      <div class="pc-section-head"><span class="pc-kicker">Referimi</span><h2 id="p3ReferralTitle">${esc(referral.title)}</h2><p>Kjo ndarje e mban të dukshme atë që s'duhet të humbet në QKMF.</p></div>
      <div class="pc-referral-grid">
        <div class="pc-referral-box is-planned"><strong>Referim / testim i planifikuar</strong><ul>${referral.planned.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
        <div class="pc-referral-box is-urgent"><strong>Vlerësim urgjent</strong><ul>${referral.urgent.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
      </div>
    </section>`;
  }

  function mainMarkup(entry, documentRecord) {
    const pc = entry.primaryCare;
    const mode = readString(K.mode, 'quick') === 'full' ? 'full' : 'quick';
    return `<article class="protocol-reader-main protocol-primary-care p3-root" data-p3-root data-pc-mode="${mode}" aria-labelledby="p3Title">
      <header class="pc-hero">
        <div>
          <div class="pc-hero-meta"><span>${esc(pc.eyebrow)}</span><span class="pc-review-badge">${esc(pc.statusLabel)}</span></div>
          <h2 id="p3Title">${esc(pc.title)}</h2>
          <p>${esc(pc.subtitle)}</p>
        </div>
        <div class="pc-hero-tools">
          <div class="pc-mode-toggle" role="group" aria-label="Pamja e protokollit">
            <button type="button" data-p3-mode="quick">Shpejt</button>
            <button type="button" data-p3-mode="full">Më shumë</button>
          </div>
          <div class="pc-hero-source"><span>Burimi zyrtar</span><strong>MSH · ${esc(documentRecord.publishedAt || '')}</strong></div>
        </div>
      </header>
      <nav class="pc-jump-nav" aria-label="Shko te seksioni">
        <a href="#p3-today">Sot</a><a href="#p3-syndromes">Sindroma</a><a href="#p3-rx">Rp.</a><a href="#p3-referral">Referimi</a><a class="pc-deep" href="#p3-always">Gjithmonë</a>
      </nav>
      ${todayMarkup(pc)}
      ${checksMarkup(pc)}
      ${syndromesMarkup(pc)}
      ${rxMarkup(pc)}
      ${alwaysDoMarkup(pc, documentRecord)}
      ${referralMarkup(pc)}
      <aside class="pc-safety-note p3-integrity-note"><strong>Gjurmueshmëri klinike</strong><p>Identiteti dhe SHA-256 i dokumentit MSH verifikohen para se të hapet kjo pamje. Struktura sindromike është mbështetur edhe në WHO 2021; regjimet farmakologjike lokale nuk auto-publikohen pa audit të Udhërrëfyesit MSH.</p>${supportLinks(documentRecord)}</aside>
    </article>`;
  }

  function updateChecks(root, pc) {
    const boxes = qa('[data-p3-check]', root);
    const checked = boxes.filter(box => box.checked);
    const count = q('[data-p3-count]', root);
    const bar = q('[data-p3-bar]', root);
    const alerts = q('[data-p3-alerts]', root);
    if (count) count.textContent = `${checked.length}/${boxes.length}`;
    if (bar) bar.style.width = boxes.length ? `${Math.round((checked.length / boxes.length) * 100)}%` : '0%';
    if (alerts) {
      alerts.innerHTML = checked.map(box => pc.quickChecks.find(item => item.id === box.dataset.p3Check)).filter(Boolean)
        .map(item => `<div class="pc-context-alert${toneClass(item.tone)}"><strong>${esc(item.label)}</strong><span>${esc(item.response)}</span></div>`).join('');
    }
  }

  function setMode(root, value) {
    const mode = value === 'full' ? 'full' : 'quick';
    root.dataset.pcMode = mode;
    saveString(K.mode, mode);
    qa('[data-p3-mode]', root).forEach(button => button.setAttribute('aria-pressed', String(button.dataset.p3Mode === mode)));
  }

  function rxValues(root) {
    return Object.fromEntries(qa('[data-p3-field]', root).map(field => [field.dataset.p3Field, clean(field.value, field.dataset.p3Field === 'instructions' ? 1200 : 400)]));
  }

  function rxText(values) {
    if (!values.medicine) return '';
    const medicine = [values.medicine, values.strength].filter(Boolean).join(' ');
    const signature = [
      values.dose && `Doza: ${values.dose}`,
      values.frequency && `Shpeshtësia: ${values.frequency}`,
      values.duration && `Kohëzgjatja: ${values.duration}`,
      values.instructions,
    ].filter(Boolean).join(' · ');
    return [
      values.diagnosis && `Indikacioni: ${values.diagnosis}`,
      'Rp:',
      medicine,
      values.quantity && `Sasia: ${values.quantity}`,
      signature && `S (Signatura): ${signature}`,
    ].filter(Boolean).join('\n');
  }

  function useSyndrome(root, pc, id) {
    const item = pc.syndromes.find(candidate => candidate.id === id);
    if (!item) return;
    saveString(K.syndrome, item.id);
    qa('[data-p3-syndrome]', root).forEach(button => {
      const active = button.dataset.p3Syndrome === item.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const detail = q('[data-p3-syndrome-detail]', root);
    if (detail) detail.innerHTML = syndromeDetailMarkup(item);
  }

  function applyDiagnosisToRx(root, diagnosis) {
    const field = q('[data-p3-field="diagnosis"]', root);
    if (!field) return;
    field.value = clean(diagnosis, 400);
    saveState(K.rx, rxValues(root));
    q('#p3-rx', root)?.scrollIntoView({ behavior:'smooth', block:'center' });
    field.focus({ preventScroll:true });
  }

  function bind(root, entry, documentRecord, sourceHash) {
    if (root.dataset.p3Ready === 'true') return;
    root.dataset.p3Ready = 'true';
    const pc = entry.primaryCare;

    qa('[data-p3-check]', root).forEach(box => box.addEventListener('change', () => {
      const saved = readState(K.checks);
      saved[box.dataset.p3Check] = box.checked;
      saveState(K.checks, saved);
      updateChecks(root, pc);
    }));

    q('[data-p3-reset]', root)?.addEventListener('click', () => {
      qa('[data-p3-check]', root).forEach(box => { box.checked = false; });
      try { sessionStorage.removeItem(K.checks); } catch {}
      updateChecks(root, pc);
    });

    qa('[data-p3-mode]', root).forEach(button => button.addEventListener('click', () => setMode(root, button.dataset.p3Mode)));

    root.addEventListener('click', event => {
      const syndrome = event.target.closest?.('[data-p3-syndrome]');
      if (syndrome) {
        useSyndrome(root, pc, syndrome.dataset.p3Syndrome);
        return;
      }
      const use = event.target.closest?.('[data-p3-use-diagnosis]');
      if (use) applyDiagnosisToRx(root, use.dataset.p3UseDiagnosis);
    });

    qa('[data-p3-field]', root).forEach(field => field.addEventListener('input', () => saveState(K.rx, rxValues(root))));

    q('[data-p3-copy]', root)?.addEventListener('click', async () => {
      const status = q('[data-p3-rx-status]', root);
      const value = rxText(rxValues(root));
      if (!value) {
        if (status) status.textContent = 'Plotëso barin / preparatin vetëm pasi të kesh verifikuar regjimin lokal.';
        q('[data-p3-field="medicine"]', root)?.focus();
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        if (status) status.textContent = 'Drafti u kopjua. Verifiko regjimin klinik para përdorimit.';
      } catch {
        if (status) status.textContent = 'Shfletuesi nuk lejoi kopjimin automatik.';
      }
    });

    q('[data-p3-clear]', root)?.addEventListener('click', () => {
      qa('[data-p3-field]', root).forEach(field => { field.value = ''; });
      try { sessionStorage.removeItem(K.rx); } catch {}
      const status = q('[data-p3-rx-status]', root);
      if (status) status.textContent = 'Drafti u pastrua.';
    });

    q('[data-p3-handoff]', root)?.addEventListener('click', () => {
      const values = rxValues(root);
      const composer = rxText(values);
      const status = q('[data-p3-rx-status]', root);
      if (!values.diagnosis) {
        if (status) status.textContent = 'Zgjidh sindromën ose plotëso indikacionin para vazhdimit.';
        q('[data-p3-field="diagnosis"]', root)?.focus();
        return;
      }
      const transfer = {
        version:1,
        protocolId:ID,
        sourceHash,
        protocolTitle:clean(documentRecord.title, 200),
        diagnosis:values.diagnosis,
        composer,
        createdAt:new Date().toISOString(),
      };
      try {
        sessionStorage.setItem(TRANSFER_KEY, JSON.stringify(transfer));
        window.location.href = 'recetat.html';
      } catch {
        if (status) status.textContent = 'Drafti nuk mund të bartet në këtë shfletues.';
      }
    });

    setMode(root, readString(K.mode, 'quick'));
    updateChecks(root, pc);
  }

  async function enhance() {
    scheduled = false;
    if (routeId() !== ID) return;
    const reader = q('#protocolReader:not([hidden])');
    const layout = reader?.querySelector('.protocol-reader-layout');
    if (!reader || !layout || reader.querySelector('[data-p3-root]')) return;

    try {
      const { entry, documentRecord, sourceHash } = await loadPayload();
      if (routeId() !== ID) return;
      const latestReader = q('#protocolReader:not([hidden])');
      const latestLayout = latestReader?.querySelector('.protocol-reader-layout');
      if (!latestReader || !latestLayout || latestReader.querySelector('[data-p3-root]')) return;

      latestReader.querySelector('[data-protocol-workspace]')?.remove();
      const replaceTarget = latestLayout.querySelector('.protocol-source-only, .protocol-reader-main:not(.protocol-primary-care)');
      if (!replaceTarget) return;
      replaceTarget.outerHTML = mainMarkup(entry, documentRecord);

      const enhanced = latestReader.querySelector('[data-p3-root]');
      const integrity = latestReader.querySelector('.protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-review');
        integrity.innerHTML = '<span class="protocol-integrity-mark" aria-hidden="true"></span><div><strong>Burimi MSH i lidhur; përmbajtja në rishikim</strong>SHA-256 përputhet me dokumentin aktual. Struktura e sindromave mbështetet nga WHO 2021; dozat lokale nuk auto-plotësohen pa audit faqe-për-faqe të Udhërrëfyesit.</div>';
      }
      if (enhanced) bind(enhanced, entry, documentRecord, sourceHash);
    } catch (error) {
      const integrity = reader.querySelector('.protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-warning');
        const target = integrity.querySelector('div');
        if (target) target.textContent = clean(error?.message) || 'Pamja interaktive nuk u ngarkua.';
      }
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => window.setTimeout(enhance, 0));
  }

  function init() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule, { passive:true });
    document.addEventListener('click', event => {
      if (event.target.closest?.('[data-protocol-open], [data-protocol-back]')) schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
