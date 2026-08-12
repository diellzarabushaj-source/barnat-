(() => {
  'use strict';

  const TARGET_PROTOCOL = 'upk-01';
  const DATA_URL = '/data/protocol-elaborations.json';
  const MANIFEST_URL = '/data/protocols.json';
  const CHECK_STORAGE_KEY = 'medindex_protocol_upk01_visit_checks_v2';
  const RISK_STORAGE_KEY = 'medindex_protocol_upk01_risk_profile_v1';
  const RX_STORAGE_KEY = 'medindex_protocol_upk01_rx_draft_v1';
  const MODE_STORAGE_KEY = 'medindex_protocol_upk01_mode_v1';
  let payloadPromise = null;
  let renderToken = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const routeId = () => {
    try { return new URL(window.location.href).searchParams.get('protocol') || ''; }
    catch { return ''; }
  };

  function safeSessionGet(key, fallback = {}) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || '');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function safeSessionSet(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function safeSessionRemove(key) {
    try { sessionStorage.removeItem(key); } catch {}
  }

  function savedMode() {
    try {
      const value = sessionStorage.getItem(MODE_STORAGE_KEY);
      return value === 'full' ? 'full' : 'quick';
    } catch {
      return 'quick';
    }
  }

  async function loadPayload() {
    if (payloadPromise) return payloadPromise;
    payloadPromise = Promise.all([
      fetch(DATA_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
      fetch(MANIFEST_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
    ]).then(async ([dataResponse, manifestResponse]) => {
      if (!dataResponse.ok || !manifestResponse.ok) throw new Error('Të dhënat e protokollit nuk u ngarkuan.');
      const [data, manifest] = await Promise.all([dataResponse.json(), manifestResponse.json()]);
      const entry = Array.isArray(data?.entries) ? data.entries.find(item => item?.protocolId === TARGET_PROTOCOL) : null;
      const documentRecord = Array.isArray(manifest?.documents) ? manifest.documents.find(item => item?.id === TARGET_PROTOCOL) : null;
      if (!entry?.primaryCare || !documentRecord) throw new Error('Protokolli interaktiv nuk është konfiguruar.');
      const sourceHash = clean(entry.sourceHash).toLowerCase();
      const currentHash = clean(documentRecord.contentSha256).toLowerCase();
      if (!sourceHash || sourceHash !== currentHash) throw new Error('Versioni i burimit ka ndryshuar. Pamja interaktive është ndalur.');
      return { entry, documentRecord };
    }).catch(error => {
      payloadPromise = null;
      throw error;
    });
    return payloadPromise;
  }

  function toneClass(tone) {
    return ['danger', 'warning', 'info', 'primary'].includes(tone) ? ` is-${tone}` : '';
  }

  function officialPageUrl(documentRecord, page) {
    const source = clean(documentRecord?.officialUrl);
    const pageNumber = Number(page);
    if (!source || !Number.isInteger(pageNumber) || pageNumber < 1) return '';
    try {
      const url = new URL(source);
      url.hash = `page=${pageNumber}`;
      return url.href;
    } catch {
      return '';
    }
  }

  function sourceChipMarkup(documentRecord, page, label = '') {
    const url = officialPageUrl(documentRecord, page);
    if (!url) return '';
    return `<a class="pc-source-chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer external" aria-label="Hap burimin zyrtar në faqen ${esc(page)}">${esc(label || `Burimi · f. ${page}`)}</a>`;
  }

  function sourcePagesMarkup(documentRecord, pages) {
    const values = [...new Set((Array.isArray(pages) ? pages : [pages]).map(Number).filter(Number.isInteger))];
    if (!values.length) return '';
    return `<div class="pc-source-row">${values.map(page => sourceChipMarkup(documentRecord, page)).join('')}</div>`;
  }

  function modeToggleMarkup(pc) {
    const labels = pc?.modeLabels || {};
    return `<div class="pc-mode-toggle" role="group" aria-label="Pamja e protokollit">
      <button type="button" data-pc-mode="quick" aria-pressed="false">${esc(labels.quick || 'Shpejt')}</button>
      <button type="button" data-pc-mode="full" aria-pressed="false">${esc(labels.full || 'E plotë')}</button>
    </div>`;
  }

  function todayActionsMarkup(items, documentRecord) {
    if (!items.length) return '';
    return `<section class="pc-panel pc-today" id="pc-today" aria-labelledby="pcTodayTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Sot në vizitë</span>
        <h2 id="pcTodayTitle">4 gjërat kryesore para se të vazhdosh</h2>
        <p>Lexoji nga e majta në të djathtë. Secila pikë lidhet me faqen përkatëse të burimit zyrtar.</p>
      </div>
      <div class="pc-today-grid">
        ${items.map(item => `<article class="pc-today-card${toneClass(item.tone)}">
          <div class="pc-today-number">${esc(item.number)}</div>
          <div>
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.body)}</p>
            ${sourceChipMarkup(documentRecord, item.sourcePage)}
          </div>
        </article>`).join('')}
      </div>
    </section>`;
  }

  function quickChecksMarkup(items, documentRecord) {
    const stored = safeSessionGet(CHECK_STORAGE_KEY);
    return `<section class="pc-panel pc-quick" aria-labelledby="pcQuickTitle">
      <div class="pc-section-head pc-section-head-split">
        <div>
          <span class="pc-kicker">Kontroll i shpejtë</span>
          <h2 id="pcQuickTitle">Çka me kontrollu në 60 sekonda</h2>
          <p>Kliko vetëm ato që vlejnë për pacientin. MedIndex nuk vendos diagnozë; paneli vetëm ta organizon vizitën.</p>
        </div>
        <div class="pc-progress-wrap" aria-live="polite">
          <strong id="pcProgressText">0/${items.length}</strong>
          <span>të shënuara</span>
        </div>
      </div>
      <div class="pc-progress" aria-hidden="true"><span id="pcProgressBar"></span></div>
      <div class="pc-check-grid">
        ${items.map(item => `<label class="pc-check${toneClass(item.tone)}">
          <input type="checkbox" data-pc-check="${esc(item.id)}" ${stored[item.id] ? 'checked' : ''}>
          <span class="pc-check-box" aria-hidden="true"></span>
          <span class="pc-check-copy">${esc(item.label)}${sourceChipMarkup(documentRecord, item.sourcePage, `f. ${item.sourcePage}`)}</span>
        </label>`).join('')}
      </div>
      <div class="pc-context-alerts" data-pc-context-alerts aria-live="polite"></div>
      <button class="pc-text-button" type="button" data-pc-reset>Rivendos kontrollin</button>
    </section>`;
  }

  function riskProfileMarkup(profile, documentRecord) {
    const items = Array.isArray(profile?.items) ? profile.items : [];
    const stored = safeSessionGet(RISK_STORAGE_KEY);
    if (!items.length) return '';
    return `<section class="pc-panel pc-deep pc-risk" id="pc-risk" aria-labelledby="pcRiskTitle">
      <div class="pc-section-head pc-section-head-split">
        <div>
          <span class="pc-kicker">FRAX / faktorët e rrezikut</span>
          <h2 id="pcRiskTitle">${esc(profile.title)}</h2>
          <p>${esc(profile.helper)}</p>
        </div>
        <div class="pc-risk-count" aria-live="polite"><strong data-pc-risk-count>0</strong><span>faktorë të shënuar</span></div>
      </div>
      <div class="pc-risk-grid">
        ${items.map(item => `<label class="pc-risk-item">
          <input type="checkbox" data-pc-risk="${esc(item.id)}" ${stored[item.id] ? 'checked' : ''}>
          <span aria-hidden="true"></span>
          <b>${esc(item.label)}</b>
        </label>`).join('')}
      </div>
      <div class="pc-risk-summary" data-pc-risk-summary>Asnjë faktor nuk është shënuar në këtë panel.</div>
      ${sourcePagesMarkup(documentRecord, profile.sourcePage)}
    </section>`;
  }

  function workflowMarkup(items, documentRecord) {
    return `<section class="pc-panel pc-deep" id="pc-workflow" aria-labelledby="pcWorkflowTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Hap pas hapi</span>
        <h2 id="pcWorkflowTitle">Çka bën mjeku familjar?</h2>
        <p>Hap vetëm hapin që të duhet. “QKMF”, “referim” dhe “specialist” tregojnë ku kryhet pjesa kryesore e hapit.</p>
      </div>
      <div class="pc-steps">
        ${items.map((item, index) => `<details class="pc-step" ${index === 0 ? 'open' : ''}>
          <summary>
            <span class="pc-step-number">${esc(item.number)}</span>
            <span class="pc-step-title">${esc(item.title)}</span>
            <span class="pc-step-setting">${esc(item.setting)}</span>
            <span class="pc-step-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div class="pc-step-body"><p>${esc(item.body)}</p>${sourceChipMarkup(documentRecord, item.sourcePage)}</div>
        </details>`).join('')}
      </div>
    </section>`;
  }

  function diagnosisMarkup(box, documentRecord) {
    return `<section class="pc-diagnosis" id="pc-dxa" aria-labelledby="pcDxaTitle">
      <div class="pc-diagnosis-mark">${esc(box?.label || 'DXA')}</div>
      <div>
        <span class="pc-kicker">Pika kryesore</span>
        <h2 id="pcDxaTitle">${esc(box?.title)}</h2>
        <p>${esc(box?.body)}</p>
        ${sourcePagesMarkup(documentRecord, box?.sourcePage)}
      </div>
    </section>`;
  }

  function labsMarkup(labs, documentRecord) {
    const list = (items, className = '') => `<ul class="pc-pill-list ${className}">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
    return `<section class="pc-panel pc-deep" id="pc-labs" aria-labelledby="pcLabsTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Hetimet</span>
        <h2 id="pcLabsTitle">Analizat — bazë vs. vetëm sipas indikacionit</h2>
        <p>Paneli bazë është i ndarë nga testet e zgjeruara që varen nga dyshimi klinik.</p>
        ${sourcePagesMarkup(documentRecord, labs?.sourcePage)}
      </div>
      <div class="pc-lab-grid">
        <div class="pc-lab-card">
          <div class="pc-lab-label">Bazë</div>
          ${list(Array.isArray(labs?.essential) ? labs.essential : [])}
        </div>
        <div class="pc-lab-card is-secondary">
          <div class="pc-lab-label">Vetëm kur indikohet</div>
          ${list(Array.isArray(labs?.whenIndicated) ? labs.whenIndicated : [], 'is-muted')}
        </div>
      </div>
    </section>`;
  }

  function treatmentMarkup(treatment, documentRecord) {
    const cards = Array.isArray(treatment?.cards) ? treatment.cards : [];
    if (!cards.length) return '';
    return `<section class="pc-panel pc-deep" id="pc-treatment" aria-labelledby="pcTreatmentTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Terapia — orientimi praktik</span>
        <h2 id="pcTreatmentTitle">Çka është në QKMF dhe çka kalon te specialisti?</h2>
        <p>Ky seksion paraqet rrugën e protokollit; nuk zgjedh preparatin ose dozën në vend të mjekut.</p>
        ${sourcePagesMarkup(documentRecord, treatment?.sourcePages)}
      </div>
      <div class="pc-treatment-grid">
        ${cards.map(card => `<article class="pc-treatment-card${toneClass(card.tone)}">
          <span>${esc(card.label)}</span>
          <h3>${esc(card.title)}</h3>
          <p>${esc(card.body)}</p>
        </article>`).join('')}
      </div>
    </section>`;
  }

  function rxEditorMarkup(rx) {
    const fields = Array.isArray(rx?.editableFields) ? rx.editableFields : [];
    const saved = safeSessionGet(RX_STORAGE_KEY);
    return `<div class="pc-rx-editor" aria-labelledby="pcRxDraftTitle">
      <div class="pc-rx-editor-head">
        <div><span>Rp.</span><strong id="pcRxDraftTitle">Receta e punës</strong></div>
        <span>Plotësohet nga mjeku</span>
      </div>
      <div class="pc-rx-fields">
        ${fields.map(field => {
          const value = clean(saved[field.id] || '');
          const isInstructions = field.id === 'instructions';
          return `<label class="${isInstructions ? 'is-wide' : ''}">
            <span>${esc(field.label)}</span>
            ${isInstructions
              ? `<textarea rows="2" data-pc-rx-field="${esc(field.id)}" placeholder="${esc(field.placeholder)}">${esc(value)}</textarea>`
              : `<input type="text" data-pc-rx-field="${esc(field.id)}" value="${esc(value)}" placeholder="${esc(field.placeholder)}" autocomplete="off">`}
          </label>`;
        }).join('')}
      </div>
      <div class="pc-rx-editor-actions">
        <button class="pc-copy-button is-primary" type="button" data-pc-copy-rx>Kopjo recetën e punës</button>
        <button class="pc-text-button" type="button" data-pc-clear-rx>Pastro fushat</button>
      </div>
      <p class="pc-copy-status" data-pc-copy-status aria-live="polite"></p>
    </div>`;
  }

  function rxMarkup(rx, documentRecord) {
    const lines = Array.isArray(rx?.lines) ? rx.lines : [];
    const specialist = Array.isArray(rx?.specialist) ? rx.specialist : [];
    const checks = Array.isArray(rx?.checksBeforeRx) ? rx.checksBeforeRx : [];
    return `<section class="pc-panel pc-rx-section" id="pc-rx" aria-labelledby="pcRxTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Terapia / receta</span>
        <h2 id="pcRxTitle">Receta në një katror — por vendimi mbetet klinik</h2>
        <p>${esc(rx?.subtitle)}</p>
        ${sourcePagesMarkup(documentRecord, rx?.sourcePages)}
      </div>
      <div class="pc-rx-layout">
        <div class="pc-rx-card" aria-label="Korniza e terapisë nga protokolli">
          <div class="pc-rx-topline">
            <div><span>Rx</span><strong>${esc(rx?.title || 'Terapia')}</strong></div>
            <span class="pc-rx-badge">Nga protokolli</span>
          </div>
          <div class="pc-rx-lines">
            ${lines.map((line, index) => `<div class="pc-rx-line">
              <span class="pc-rx-index">${index + 1}</span>
              <div><strong>${esc(line.medicine)}</strong><p>${esc(line.details)}</p><button type="button" class="pc-rx-seed" data-pc-rx-seed="${esc(line.medicine)}">Përdor si bazë</button></div>
            </div>`).join('')}
          </div>
          ${specialist.length ? `<div class="pc-rx-specialist"><strong>Specialisti / terapia parenterale</strong>${specialist.map(item => `<p>${esc(item)}</p>`).join('')}</div>` : ''}
          ${checks.length ? `<div class="pc-rx-checks"><strong>Para përshkrimit, kontrollo</strong><div>${checks.map(item => `<span>✓ ${esc(item)}</span>`).join('')}</div></div>` : ''}
          <div class="pc-rx-footer">Kjo anë përmbledh rrugën e protokollit. Ana tjetër është drafti që plotësohet nga mjeku.</div>
        </div>
        ${rxEditorMarkup(rx)}
      </div>
    </section>`;
  }

  function monitoringMarkup(monitoring, documentRecord) {
    const items = Array.isArray(monitoring?.items) ? monitoring.items : [];
    if (!items.length) return '';
    return `<section class="pc-panel pc-deep" id="pc-monitoring" aria-labelledby="pcMonitoringTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Follow-up</span>
        <h2 id="pcMonitoringTitle">${esc(monitoring.title)}</h2>
        <p>Një checklistë e shkurtër për kontrollin pasues.</p>
        ${sourcePagesMarkup(documentRecord, monitoring.sourcePage)}
      </div>
      <div class="pc-follow-grid">${items.map(item => `<div><span aria-hidden="true">✓</span><p>${esc(item)}</p></div>`).join('')}</div>
    </section>`;
  }

  function safetyMarkup(safety, documentRecord) {
    const items = Array.isArray(safety?.items) ? safety.items : [];
    if (!items.length) return '';
    return `<section class="pc-panel pc-deep pc-safety" id="pc-safety" aria-labelledby="pcSafetyTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Siguria</span>
        <h2 id="pcSafetyTitle">${esc(safety.title)}</h2>
        <p>Këto janë pika të veçuara në seksionin e menaxhimit të efekteve anësore të protokollit.</p>
        ${sourcePagesMarkup(documentRecord, safety.sourcePage)}
      </div>
      <div class="pc-safety-grid">
        ${items.map(item => `<article><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join('')}
      </div>
    </section>`;
  }

  function educationMarkup(education, documentRecord) {
    const items = Array.isArray(education?.items) ? education.items : [];
    if (!items.length) return '';
    return `<section class="pc-panel pc-deep pc-education" id="pc-education" aria-labelledby="pcEducationTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Në fund të vizitës</span>
        <h2 id="pcEducationTitle">${esc(education.title)}</h2>
        ${sourcePagesMarkup(documentRecord, education.sourcePages)}
      </div>
      <ol>${items.map((item, index) => `<li><span>${index + 1}</span><p>${esc(item)}</p></li>`).join('')}</ol>
    </section>`;
  }

  function referralMarkup(referral, documentRecord) {
    const planned = Array.isArray(referral?.planned) ? referral.planned : [];
    const urgent = Array.isArray(referral?.urgent) ? referral.urgent : [];
    return `<section class="pc-panel pc-referral" id="pc-referral" aria-labelledby="pcReferralTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Referimi</span>
        <h2 id="pcReferralTitle">${esc(referral?.title || 'Kur referohet?')}</h2>
        <p><strong>Destinacioni:</strong> ${esc(referral?.destination)}</p>
        ${sourcePagesMarkup(documentRecord, referral?.sourcePage)}
      </div>
      <div class="pc-referral-grid">
        <div class="pc-referral-box is-planned"><strong>${esc(referral?.plannedLabel || 'Referim i planifikuar')}</strong><ul>${planned.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
        <div class="pc-referral-box is-urgent"><strong>${esc(referral?.urgentLabel || 'Vlerësim specialistik')}</strong><ul>${urgent.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
      </div>
    </section>`;
  }

  function mainMarkup(entry, documentRecord) {
    const pc = entry.primaryCare || {};
    const checks = Array.isArray(pc.quickChecks) ? pc.quickChecks : [];
    const workflow = Array.isArray(pc.workflow) ? pc.workflow : [];
    const todayActions = Array.isArray(pc.todayActions) ? pc.todayActions : [];
    return `<article class="protocol-reader-main protocol-primary-care" data-pc-mode="${esc(savedMode())}" aria-labelledby="pcProtocolHeading">
      <header class="pc-hero">
        <div>
          <div class="pc-hero-meta"><span>${esc(pc.eyebrow || 'Për mjekun familjar')}</span><span class="pc-review-badge">${esc(pc.statusLabel || 'Në rishikim')}</span></div>
          <h2 id="pcProtocolHeading">${esc(pc.title)}</h2>
          <p>${esc(pc.subtitle)}</p>
        </div>
        <div class="pc-hero-tools">
          ${modeToggleMarkup(pc)}
          <div class="pc-hero-source"><span>Burimi</span><strong>MSH · ${esc(documentRecord.publishedAt || '')}</strong></div>
        </div>
      </header>

      <nav class="pc-jump-nav" aria-label="Shko te seksioni">
        <a href="#pc-today">Sot</a>
        <a href="#pc-dxa">DXA</a>
        <a href="#pc-rx">Receta</a>
        <a href="#pc-referral">Referimi</a>
        <a class="pc-nav-deep pc-deep" href="#pc-labs">Analizat</a>
        <a class="pc-nav-deep pc-deep" href="#pc-monitoring">Follow-up</a>
      </nav>

      ${todayActionsMarkup(todayActions, documentRecord)}
      ${quickChecksMarkup(checks, documentRecord)}
      ${riskProfileMarkup(pc.riskProfile || {}, documentRecord)}
      ${workflowMarkup(workflow, documentRecord)}
      ${diagnosisMarkup(pc.diagnosisBox || {}, documentRecord)}
      ${labsMarkup(pc.labs || {}, documentRecord)}
      ${treatmentMarkup(pc.treatmentOptions || {}, documentRecord)}
      ${rxMarkup(pc.rxBox || {}, documentRecord)}
      ${monitoringMarkup(pc.monitoring || {}, documentRecord)}
      ${safetyMarkup(pc.safety || {}, documentRecord)}
      ${educationMarkup(pc.patientEducation || {}, documentRecord)}
      ${referralMarkup(pc.referral || {}, documentRecord)}

      <aside class="pc-safety-note">
        <strong>Gjurmueshmëri klinike</strong>
        <p>Kjo pamje shfaqet vetëm kur SHA-256 përputhet me kopjen aktuale të dokumentit zyrtar. Statusi mbetet “në rishikim klinik”; burimi zyrtar ka përparësi nëse ka paqartësi.</p>
      </aside>
    </article>`;
  }

  function updateProgress(root, entry) {
    const boxes = [...root.querySelectorAll('[data-pc-check]')];
    const checked = boxes.filter(box => box.checked);
    const textNode = root.querySelector('#pcProgressText');
    const bar = root.querySelector('#pcProgressBar');
    if (textNode) textNode.textContent = `${checked.length}/${boxes.length}`;
    if (bar) bar.style.width = boxes.length ? `${Math.round((checked.length / boxes.length) * 100)}%` : '0%';

    const alerts = root.querySelector('[data-pc-context-alerts]');
    if (!alerts) return;
    const items = Array.isArray(entry?.primaryCare?.quickChecks) ? entry.primaryCare.quickChecks : [];
    const active = checked.map(box => items.find(item => item.id === box.dataset.pcCheck)).filter(Boolean);
    alerts.innerHTML = active.map(item => `<div class="pc-context-alert${toneClass(item.tone)}"><strong>${esc(item.label)}</strong><span>${esc(item.response || '')}</span></div>`).join('');
  }

  function updateRiskSummary(root) {
    const boxes = [...root.querySelectorAll('[data-pc-risk]')];
    const checked = boxes.filter(box => box.checked);
    const count = root.querySelector('[data-pc-risk-count]');
    const summary = root.querySelector('[data-pc-risk-summary]');
    if (count) count.textContent = String(checked.length);
    if (summary) {
      summary.textContent = checked.length
        ? `${checked.length} faktorë janë shënuar. Vazhdo me vlerësimin klinik dhe FRAX; ky numër nuk është kategori rreziku.`
        : 'Asnjë faktor nuk është shënuar në këtë panel.';
    }
  }

  function updateMode(root, mode) {
    const next = mode === 'full' ? 'full' : 'quick';
    root.dataset.pcMode = next;
    try { sessionStorage.setItem(MODE_STORAGE_KEY, next); } catch {}
    root.querySelectorAll('[data-pc-mode]').forEach(button => {
      button.setAttribute('aria-pressed', button.dataset.pcMode === next ? 'true' : 'false');
    });
  }

  function rxValues(root) {
    return Object.fromEntries([...root.querySelectorAll('[data-pc-rx-field]')].map(field => [field.dataset.pcRxField, clean(field.value)]));
  }

  function rxClipboardText(root) {
    const values = rxValues(root);
    if (!values.medicine) return '';
    const labels = {
      medicine:'Rp.', strength:'Fortësia', dose:'Doza', frequency:'Shpeshtësia',
      duration:'Kohëzgjatja', quantity:'Sasia', instructions:'Udhëzimi',
    };
    return Object.entries(labels)
      .map(([key, label]) => values[key] ? `${label}: ${values[key]}` : '')
      .filter(Boolean)
      .concat(['— Draft i plotësuar nga mjeku; verifiko para përdorimit.'])
      .join('\n');
  }

  function bindInteractiveEvents(root, entry) {
    root.querySelectorAll('[data-pc-check]').forEach(box => {
      box.addEventListener('change', () => {
        const state = safeSessionGet(CHECK_STORAGE_KEY);
        state[box.dataset.pcCheck] = box.checked;
        safeSessionSet(CHECK_STORAGE_KEY, state);
        updateProgress(root, entry);
      });
    });

    root.querySelector('[data-pc-reset]')?.addEventListener('click', () => {
      root.querySelectorAll('[data-pc-check]').forEach(box => { box.checked = false; });
      safeSessionRemove(CHECK_STORAGE_KEY);
      updateProgress(root, entry);
    });

    root.querySelectorAll('[data-pc-risk]').forEach(box => {
      box.addEventListener('change', () => {
        const state = safeSessionGet(RISK_STORAGE_KEY);
        state[box.dataset.pcRisk] = box.checked;
        safeSessionSet(RISK_STORAGE_KEY, state);
        updateRiskSummary(root);
      });
    });

    root.querySelectorAll('[data-pc-mode]').forEach(button => {
      button.addEventListener('click', () => updateMode(root, button.dataset.pcMode));
    });

    root.querySelectorAll('[data-pc-rx-field]').forEach(field => {
      field.addEventListener('input', () => safeSessionSet(RX_STORAGE_KEY, rxValues(root)));
    });

    root.querySelectorAll('[data-pc-rx-seed]').forEach(button => {
      button.addEventListener('click', () => {
        const field = root.querySelector('[data-pc-rx-field="medicine"]');
        if (!field) return;
        field.value = clean(button.dataset.pcRxSeed);
        safeSessionSet(RX_STORAGE_KEY, rxValues(root));
        field.focus({ preventScroll:true });
        root.querySelector('.pc-rx-editor')?.scrollIntoView({ behavior:'smooth', block:'center' });
      });
    });

    root.querySelector('[data-pc-copy-rx]')?.addEventListener('click', async event => {
      const status = root.querySelector('[data-pc-copy-status]');
      const value = rxClipboardText(root);
      if (!value) {
        if (status) status.textContent = 'Plotëso së paku barin / preparatin para kopjimit.';
        root.querySelector('[data-pc-rx-field="medicine"]')?.focus();
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        event.currentTarget.textContent = 'U kopjua';
        if (status) status.textContent = 'Drafti u kopjua. Verifiko të gjitha fushat para përdorimit.';
      } catch {
        if (status) status.textContent = 'Kopjimi automatik nuk u lejua nga shfletuesi.';
      }
      window.setTimeout(() => { if (event.currentTarget) event.currentTarget.textContent = 'Kopjo recetën e punës'; }, 1800);
    });

    root.querySelector('[data-pc-clear-rx]')?.addEventListener('click', () => {
      root.querySelectorAll('[data-pc-rx-field]').forEach(field => { field.value = ''; });
      safeSessionRemove(RX_STORAGE_KEY);
      const status = root.querySelector('[data-pc-copy-status]');
      if (status) status.textContent = 'Fushat e recetës së punës u pastruan.';
    });

    updateMode(root, savedMode());
    updateProgress(root, entry);
    updateRiskSummary(root);
  }

  async function tryRender() {
    const token = ++renderToken;
    if (routeId() !== TARGET_PROTOCOL) return;
    const reader = document.querySelector('#protocolReader:not([hidden])');
    const currentMain = reader?.querySelector('.protocol-reader-main');
    if (!reader || !currentMain || currentMain.classList.contains('protocol-primary-care')) return;
    try {
      const { entry, documentRecord } = await loadPayload();
      if (token !== renderToken || routeId() !== TARGET_PROTOCOL) return;
      const latestReader = document.querySelector('#protocolReader:not([hidden])');
      const latestMain = latestReader?.querySelector('.protocol-reader-main');
      if (!latestReader || !latestMain || latestMain.classList.contains('protocol-primary-care')) return;
      latestMain.outerHTML = mainMarkup(entry, documentRecord);
      const enhanced = latestReader.querySelector('.protocol-primary-care');
      const integrity = latestReader.querySelector('.protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-review');
        integrity.innerHTML = '<span class="protocol-integrity-mark" aria-hidden="true"></span><div><strong>Pamje praktike e lidhur me burimin</strong>SHA-256 përputhet me dokumentin aktual. Përmbajtja është e strukturuar për kujdesin parësor dhe statusi klinik mbetet në rishikim.</div>';
      }
      if (enhanced) bindInteractiveEvents(enhanced, entry);
    } catch (error) {
      const integrity = reader?.querySelector('.protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-warning');
        const target = integrity.querySelector('div');
        if (target) target.textContent = clean(error?.message) || 'Pamja interaktive nuk u ngarkua.';
      }
    }
  }

  function scheduleRender() {
    window.requestAnimationFrame(() => window.setTimeout(tryRender, 0));
  }

  function init() {
    const observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', scheduleRender);
    document.addEventListener('click', event => {
      if (event.target.closest?.('[data-protocol-open], [data-protocol-back]')) scheduleRender();
    });
    scheduleRender();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();