(() => {
  'use strict';

  const TARGET_PROTOCOL = 'upk-01';
  const DATA_URL = '/data/protocol-elaborations.json';
  const MANIFEST_URL = '/data/protocols.json';
  const STORAGE_KEY = 'medindex_protocol_upk01_visit_checks_v1';
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

  function savedChecks() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveChecks(value) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
  }

  function toneClass(tone) {
    return ['danger', 'warning', 'info'].includes(tone) ? ` is-${tone}` : '';
  }

  function quickChecksMarkup(items) {
    const stored = savedChecks();
    return `<section class="pc-panel pc-quick" aria-labelledby="pcQuickTitle">
      <div class="pc-section-head pc-section-head-split">
        <div>
          <span class="pc-kicker">Vizita e shpejtë</span>
          <h2 id="pcQuickTitle">Çka me kontrollu në 60 sekonda</h2>
          <p>Kliko pikat gjatë vizitës. Progresi ruhet vetëm për këtë sesion të shfletuesit.</p>
        </div>
        <div class="pc-progress-wrap" aria-live="polite">
          <strong id="pcProgressText">0/${items.length}</strong>
          <span>të kontrolluara</span>
        </div>
      </div>
      <div class="pc-progress" aria-hidden="true"><span id="pcProgressBar"></span></div>
      <div class="pc-check-grid">
        ${items.map(item => `<label class="pc-check${toneClass(item.tone)}">
          <input type="checkbox" data-pc-check="${esc(item.id)}" ${stored[item.id] ? 'checked' : ''}>
          <span class="pc-check-box" aria-hidden="true"></span>
          <span>${esc(item.label)}</span>
        </label>`).join('')}
      </div>
      <button class="pc-text-button" type="button" data-pc-reset>Rivendos kontrollin</button>
    </section>`;
  }

  function workflowMarkup(items) {
    return `<section class="pc-panel" id="pc-workflow" aria-labelledby="pcWorkflowTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Hap pas hapi</span>
        <h2 id="pcWorkflowTitle">Çka bën mjeku familjar?</h2>
        <p>Hap vetëm pjesën që të duhet; statusi në të djathtë tregon ku kryhet hapi.</p>
      </div>
      <div class="pc-steps">
        ${items.map((item, index) => `<details class="pc-step" ${index < 2 ? 'open' : ''}>
          <summary>
            <span class="pc-step-number">${esc(item.number)}</span>
            <span class="pc-step-title">${esc(item.title)}</span>
            <span class="pc-step-setting">${esc(item.setting)}</span>
            <span class="pc-step-chevron" aria-hidden="true">⌄</span>
          </summary>
          <p>${esc(item.body)}</p>
        </details>`).join('')}
      </div>
    </section>`;
  }

  function labsMarkup(labs) {
    const list = (items, className = '') => `<ul class="pc-pill-list ${className}">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
    return `<section class="pc-panel" id="pc-labs" aria-labelledby="pcLabsTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Hetimet</span>
        <h2 id="pcLabsTitle">Analizat — ndajini në bazë dhe sipas indikacionit</h2>
        <p>Kjo e mban panelin praktik dhe shmang kërkimin automatik të analizave të zgjeruara te çdo pacient.</p>
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

  function diagnosisMarkup(box) {
    return `<section class="pc-diagnosis" id="pc-dxa" aria-labelledby="pcDxaTitle">
      <div class="pc-diagnosis-mark">${esc(box?.label || 'DXA')}</div>
      <div>
        <span class="pc-kicker">Pika kryesore</span>
        <h2 id="pcDxaTitle">${esc(box?.title)}</h2>
        <p>${esc(box?.body)}</p>
      </div>
    </section>`;
  }

  function rxMarkup(rx) {
    const lines = Array.isArray(rx?.lines) ? rx.lines : [];
    const specialist = Array.isArray(rx?.specialist) ? rx.specialist : [];
    const checks = Array.isArray(rx?.checksBeforeRx) ? rx.checksBeforeRx : [];
    return `<section class="pc-panel" id="pc-rx" aria-labelledby="pcRxTitle">
      <div class="pc-section-head pc-section-head-split">
        <div>
          <span class="pc-kicker">Terapia</span>
          <h2 id="pcRxTitle">Receta në një katror — e qartë dhe e përdorshme</h2>
          <p>${esc(rx?.subtitle)}</p>
        </div>
        <button class="pc-copy-button" type="button" data-pc-copy-rx>Kopjo kornizën</button>
      </div>
      <div class="pc-rx-card" aria-label="Korniza e recetës">
        <div class="pc-rx-topline">
          <div><span>Rp.</span><strong>${esc(rx?.title || 'Receta / terapia')}</strong></div>
          <span class="pc-rx-badge">Jo recetë automatike</span>
        </div>
        <div class="pc-rx-lines">
          ${lines.map((line, index) => `<div class="pc-rx-line">
            <span class="pc-rx-index">${index + 1}</span>
            <div><strong>${esc(line.medicine)}</strong><p>${esc(line.details)}</p></div>
          </div>`).join('')}
        </div>
        ${specialist.length ? `<div class="pc-rx-specialist"><strong>Kur hyn specialisti / terapia parenterale</strong>${specialist.map(item => `<p>${esc(item)}</p>`).join('')}</div>` : ''}
        ${checks.length ? `<div class="pc-rx-checks"><strong>Para se ta mbyllësh planin</strong><div>${checks.map(item => `<span>✓ ${esc(item)}</span>`).join('')}</div></div>` : ''}
        <div class="pc-rx-footer">Plotëso preparatin, dozën, kohëzgjatjen dhe udhëzimin vetëm pasi të jetë bërë vlerësimi individual i pacientit.</div>
      </div>
      <p class="pc-copy-status" data-pc-copy-status aria-live="polite"></p>
    </section>`;
  }

  function referralMarkup(referral) {
    const items = Array.isArray(referral?.items) ? referral.items : [];
    return `<section class="pc-panel pc-referral" id="pc-referral" aria-labelledby="pcReferralTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Referimi</span>
        <h2 id="pcReferralTitle">${esc(referral?.title || 'Kur referohet?')}</h2>
        <p><strong>Destinacioni:</strong> ${esc(referral?.destination)}</p>
      </div>
      <ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
    </section>`;
  }

  function mainMarkup(entry, documentRecord) {
    const pc = entry.primaryCare || {};
    const checks = Array.isArray(pc.quickChecks) ? pc.quickChecks : [];
    const workflow = Array.isArray(pc.workflow) ? pc.workflow : [];
    return `<article class="protocol-reader-main protocol-primary-care" aria-labelledby="pcProtocolHeading">
      <header class="pc-hero">
        <div>
          <div class="pc-hero-meta"><span>${esc(pc.eyebrow || 'Për mjekun familjar')}</span><span class="pc-review-badge">${esc(pc.statusLabel || 'Në rishikim')}</span></div>
          <h2 id="pcProtocolHeading">${esc(pc.title)}</h2>
          <p>${esc(pc.subtitle)}</p>
        </div>
        <div class="pc-hero-source"><span>Burimi</span><strong>MSH · ${esc(documentRecord.publishedAt || '')}</strong></div>
      </header>

      <nav class="pc-jump-nav" aria-label="Shko te seksioni">
        <a href="#pc-workflow">Hapat</a>
        <a href="#pc-labs">Analizat</a>
        <a href="#pc-dxa">DXA</a>
        <a href="#pc-rx">Receta</a>
        <a href="#pc-referral">Referimi</a>
      </nav>

      ${quickChecksMarkup(checks)}
      ${workflowMarkup(workflow)}
      ${diagnosisMarkup(pc.diagnosisBox || {})}
      ${labsMarkup(pc.labs || {})}
      ${rxMarkup(pc.rxBox || {})}
      ${referralMarkup(pc.referral || {})}

      <aside class="pc-safety-note">
        <strong>Gjurmueshmëri klinike</strong>
        <p>Kjo pamje shfaqet vetëm kur SHA-256 i përmbledhjes përputhet me kopjen aktuale të dokumentit zyrtar. Statusi mbetet “në rishikim klinik”; burimi zyrtar ka përparësi nëse ka paqartësi.</p>
      </aside>
    </article>`;
  }

  function updateProgress(root) {
    const boxes = [...root.querySelectorAll('[data-pc-check]')];
    const checked = boxes.filter(box => box.checked).length;
    const textNode = root.querySelector('#pcProgressText');
    const bar = root.querySelector('#pcProgressBar');
    if (textNode) textNode.textContent = `${checked}/${boxes.length}`;
    if (bar) bar.style.width = boxes.length ? `${Math.round((checked / boxes.length) * 100)}%` : '0%';
  }

  function rxClipboardText(entry) {
    const rx = entry?.primaryCare?.rxBox || {};
    const lines = Array.isArray(rx.lines) ? rx.lines : [];
    const specialist = Array.isArray(rx.specialist) ? rx.specialist : [];
    return [
      'Rp. — KORNIZË KLINIKE (jo recetë automatike)',
      ...lines.map((line, index) => `${index + 1}. ${clean(line.medicine)} — ${clean(line.details)}`),
      specialist.length ? `Specialist / parenterale: ${specialist.map(clean).join(' | ')}` : '',
      'Plotëso preparatin, dozën, kohëzgjatjen dhe udhëzimin pas vlerësimit individual të pacientit.',
    ].filter(Boolean).join('\n');
  }

  function bindInteractiveEvents(root, entry) {
    root.querySelectorAll('[data-pc-check]').forEach(box => {
      box.addEventListener('change', () => {
        const state = savedChecks();
        state[box.dataset.pcCheck] = box.checked;
        saveChecks(state);
        updateProgress(root);
      });
    });
    root.querySelector('[data-pc-reset]')?.addEventListener('click', () => {
      root.querySelectorAll('[data-pc-check]').forEach(box => { box.checked = false; });
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      updateProgress(root);
    });
    root.querySelector('[data-pc-copy-rx]')?.addEventListener('click', async event => {
      const status = root.querySelector('[data-pc-copy-status]');
      const value = rxClipboardText(entry);
      try {
        await navigator.clipboard.writeText(value);
        event.currentTarget.textContent = 'U kopjua';
        if (status) status.textContent = 'Korniza u kopjua. Plotëso detajet vetëm pas vlerësimit individual.';
      } catch {
        if (status) status.textContent = 'Kopjimi automatik nuk u lejua nga shfletuesi.';
      }
      window.setTimeout(() => { if (event.currentTarget) event.currentTarget.textContent = 'Kopjo kornizën'; }, 1800);
    });
    updateProgress(root);
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
      const integrity = reader.querySelector('.protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-warning');
        integrity.querySelector('div')?.replaceChildren(document.createTextNode(clean(error?.message) || 'Pamja interaktive nuk u ngarkua.'));
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
