(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  const search = document.getElementById('emergencySearch');
  const toolbar = document.querySelector('.ck-toolbar');
  if (!detail || !search) return;

  const TOKEN_LABELS = new Map([
    ['critical', 'Kritike'],
    ['urgent', 'Urgjente'],
    ['immediate', 'Menjëherë'],
    ['minutes', 'Brenda minutave'],
    ['after-stabilization', 'Pas stabilizimit'],
    ['primary', 'Kujdes parësor'],
    ['secondary', 'Kujdes sekondar'],
    ['transport', 'Transferim'],
    ['high', 'Prioritet i lartë'],
    ['medium', 'Prioritet mesatar'],
    ['low', 'Prioritet i ulët'],
  ]);

  const normalize = value => String(value || '')
    .trim()
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  function text(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function compact(value, limit = 155) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) return clean;
    return `${clean.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
  }

  function humanValue(value) {
    const clean = String(value || '').trim();
    return TOKEN_LABELS.get(normalize(clean)) || clean;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    }[char]));
  }

  function findSection(fragment) {
    const needle = normalize(fragment);
    return [...detail.querySelectorAll('.ck-section')].find(section =>
      normalize(section.querySelector('h3')?.textContent).includes(needle)
    ) || null;
  }

  function summaryValue(section, label) {
    if (!section) return '';
    const needle = normalize(label);
    const row = [...section.querySelectorAll('.ck-summary')].find(node =>
      normalize(node.textContent).startsWith(needle)
    );
    if (!row) return '';
    const strong = row.querySelector('strong');
    if (!strong) return text(row);
    const clone = row.cloneNode(true);
    clone.querySelector('strong')?.remove();
    return text(clone).replace(/^[:\s]+/, '');
  }

  function infoTexts(section) {
    if (!section) return [];
    return [...section.querySelectorAll('.ck-info-card')]
      .map(card => text(card.querySelectorAll('span')[1] || card))
      .filter(Boolean);
  }

  function translateVisibleTokens() {
    detail.querySelectorAll('.ck-step-footer em').forEach(node => {
      const key = normalize(node.textContent);
      const label = TOKEN_LABELS.get(key);
      if (!label) return;
      node.textContent = label;
      node.dataset.ckDoctorTranslated = '1';
      if (key === 'immediate' || key === 'critical' || key === 'urgent') {
        node.classList.add('ck-doctor-urgent-label');
      } else if (key === 'minutes') {
        node.classList.add('ck-doctor-minute-label');
      }
    });

    detail.querySelectorAll('.ck-chip').forEach(node => {
      const key = normalize(node.textContent);
      const label = TOKEN_LABELS.get(key);
      if (label) node.textContent = label;
    });
  }

  function assignSectionIds() {
    const sections = [
      ['Hapat në kujdes parësor', 'ck-doctor-now'],
      ['Shenjat alarmuese', 'ck-doctor-redflags'],
      ['Referimi', 'ck-doctor-referral'],
      ['Çfarë të mos bëhet', 'ck-doctor-donotdo'],
      ['Kujdesi sekondar', 'ck-doctor-secondary'],
    ];
    sections.forEach(([title, id]) => {
      const section = findSection(title);
      if (section) section.id = id;
    });
  }

  function triageLabel() {
    const chip = [...detail.querySelectorAll('.ck-meta .ck-chip')].find(node =>
      /kritik|critical|urgent|urgjent/i.test(text(node))
    );
    return chip ? text(chip) : 'Sipas protokollit';
  }

  function reviewState() {
    const reviewButton = detail.querySelector('.ck-review-button');
    const reviewDate = text(reviewButton?.querySelector('small'));
    if (detail.querySelector('.ck-meta .ck-chip.is-verified')) {
      return {verified:true, label:'E verifikuar', date:reviewDate};
    }
    const reviewChip = detail.querySelector('.ck-meta .ck-chip.is-review');
    return {verified:false, label:text(reviewChip) || 'Për verifikim', date:reviewDate};
  }

  function navButton(section, label) {
    if (!section?.id) return '';
    return `<button type="button" data-ck-doctor-target="${escapeHtml(section.id)}">${escapeHtml(label)}</button>`;
  }

  function redFlagPreview(items) {
    if (!items.length) return '<p class="ck-doctor-emptyline">Nuk ka red flags të listuara.</p>';
    return `<ul class="ck-doctor-redflag-preview">${items.slice(0, 2).map(item => `<li>${escapeHtml(compact(item, 105))}</li>`).join('')}</ul>`;
  }

  async function copyText(value) {
    const clean = String(value || '').trim();
    if (!clean) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(clean);
        return true;
      }
    } catch {}
    try {
      const textarea = document.createElement('textarea');
      textarea.value = clean;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }

  function buildDoctorConsole() {
    detail.querySelector('.ck-doctor-console')?.remove();

    const head = detail.querySelector('.ck-detail-head');
    const summary = head?.querySelector('.ck-summary');
    const title = head?.querySelector('h2');
    if (!head || !summary || !title) return;

    const primary = findSection('Hapat në kujdes parësor');
    const alerts = findSection('Shenjat alarmuese');
    const referral = findSection('Referimi');
    const safety = findSection('Çfarë të mos bëhet');
    const secondary = findSection('Kujdesi sekondar');
    const review = reviewState();

    const primaryActions = [...(primary?.querySelectorAll('.ck-step-action') || [])]
      .map(node => text(node)).filter(Boolean);
    const firstAction = primaryActions[0] || 'Shiko hapat e kujdesit parësor.';
    const nextAction = primaryActions[1] || '';
    const redFlags = infoTexts(alerts);
    const referralUrgency = summaryValue(referral, 'Urgjenca') || summaryValue(referral, 'Kur referohet');
    const referralDestination = summaryValue(referral, 'Destinacioni');
    const referralWhen = summaryValue(referral, 'Kur referohet');
    const handover = summaryValue(referral, 'Handover');
    const beforeTransfer = infoTexts(referral);

    const consoleEl = document.createElement('section');
    consoleEl.className = 'ck-doctor-console';
    consoleEl.setAttribute('aria-label', 'Pamja e shpejtë për mjekun');
    consoleEl.innerHTML = `
      <div class="ck-doctor-console-head">
        <div>
          <strong>Pamja e mjekut · 10 sekonda</strong>
          <span>Veprimi, red flags dhe referimi pa humbur kohë.</span>
        </div>
        <div class="ck-doctor-head-badges">
          <span class="ck-doctor-review-pill ${review.verified ? 'is-verified' : 'is-review'}">${escapeHtml(review.label)}</span>
          <span class="ck-doctor-triage">Triazh · ${escapeHtml(triageLabel())}</span>
        </div>
      </div>
      ${review.verified ? '' : `
        <div class="ck-doctor-review-warning" role="note">
          <strong>${escapeHtml(review.label)}</strong>
          <span>Ky dokument nuk ka ende status “Verifikuar”. Kontrollo burimin dhe statusin klinik para përdorimit në vendimmarrje.</span>
        </div>`}
      <div class="ck-doctor-console-grid">
        <article class="ck-doctor-glance is-now">
          <small>01 · Tani</small>
          <strong>${escapeHtml(compact(firstAction, 190))}</strong>
          ${nextAction ? `<p><b>Pastaj:</b> ${escapeHtml(compact(nextAction, 125))}</p>` : '<p>Hap seksionin për rendin e plotë të hapave.</p>'}
        </article>
        <article class="ck-doctor-glance is-alert">
          <small>02 · Red flags · ${redFlags.length}</small>
          ${redFlagPreview(redFlags)}
        </article>
        <article class="ck-doctor-glance is-referral">
          <small>03 · Referimi</small>
          <strong>${escapeHtml(compact(humanValue(referralUrgency) || 'Shiko kriteret e referimit', 105))}</strong>
          <p>${escapeHtml(compact(referralDestination || referralWhen || 'Destinacioni sipas protokollit.', 130))}</p>
        </article>
      </div>
      ${(beforeTransfer.length || handover) ? `
        <div class="ck-doctor-transfer-strip">
          <div>
            <small>Para transferimit</small>
            <strong>${escapeHtml(compact(beforeTransfer[0] || 'Përgatit transferimin sipas protokollit.', 150))}</strong>
          </div>
          ${handover ? `<div class="ck-doctor-handover">
            <small>Handover</small>
            <span>${escapeHtml(compact(handover, 165))}</span>
            <button type="button" data-ck-copy-handover>Kopjo handover</button>
          </div>` : ''}
        </div>` : ''}
      <div class="ck-doctor-console-foot">
        <nav class="ck-doctor-nav" aria-label="Shko te seksioni klinik">
          ${navButton(primary, 'Veprimi tani')}
          ${navButton(alerts, 'Red flags')}
          ${navButton(referral, 'Referimi')}
          ${navButton(safety, 'Mos bëj')}
          ${navButton(secondary, 'Sekondar')}
        </nav>
        <div class="ck-doctor-source-actions">
          ${review.date ? `<span>${escapeHtml(review.date)}</span>` : ''}
          <button type="button" data-ck-review-open>Burimi & verifikimi</button>
          <span class="ck-doctor-copy-status" aria-live="polite"></span>
        </div>
      </div>`;

    summary.insertAdjacentElement('afterend', consoleEl);

    consoleEl.querySelectorAll('[data-ck-doctor-target]').forEach(button => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.ckDoctorTarget);
        if (!target) return;
        target.scrollIntoView({behavior:'smooth', block:'start'});
        target.setAttribute('tabindex', '-1');
        window.setTimeout(() => target.focus({preventScroll:true}), 280);
      });
    });

    consoleEl.querySelector('[data-ck-review-open]')?.addEventListener('click', () => {
      detail.querySelector('[data-ck-review]')?.click();
    });

    consoleEl.querySelector('[data-ck-copy-handover]')?.addEventListener('click', async event => {
      const ok = await copyText(handover);
      const status = consoleEl.querySelector('.ck-doctor-copy-status');
      if (status) status.textContent = ok ? 'Handover u kopjua.' : 'Kopjimi dështoi.';
      event.currentTarget.textContent = ok ? 'U kopjua ✓' : 'Provo përsëri';
      window.setTimeout(() => {
        if (status) status.textContent = '';
        if (event.currentTarget?.isConnected) event.currentTarget.textContent = 'Kopjo handover';
      }, 2200);
    });
  }

  function enhanceDetail() {
    if (!detail.querySelector('.ck-detail-head')) return;
    translateVisibleTokens();
    assignSectionIds();
    buildDoctorConsole();
  }

  function addPageHints() {
    if (!document.querySelector('.ck-doctor-flow')) {
      const heroCopy = document.querySelector('.ck-hero > div');
      heroCopy?.insertAdjacentHTML('beforeend', `
        <div class="ck-doctor-flow" aria-label="Rrjedha e shpejtë klinike">
          <span><b>1</b> Stabilizo</span>
          <span><b>2</b> Kontrollo red flags</span>
          <span><b>3</b> Vendos referimin</span>
          <span><b>4</b> Jep handover</span>
        </div>`);
    }

    if (toolbar && !document.querySelector('.ck-doctor-hint')) {
      toolbar.insertAdjacentHTML('afterend', `
        <p class="ck-doctor-hint">
          <span>Kërko me emër, ICD ose sinonim klinik.</span>
          <span><kbd>/</kbd> kërko · <kbd>Esc</kbd> pastro</span>
        </p>`);
    }

    search.placeholder = 'Kërko p.sh. “edemë pulmonare”, “J81.0”, “dispne”…';
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.activeElement === search && search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', {bubbles:true}));
      return;
    }
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    event.preventDefault();
    search.focus({preventScroll:false});
    search.select();
  });

  const observer = new MutationObserver(mutations => {
    const coreChanged = mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('.ck-detail-head,.ck-sections,.ck-empty')
        || node.querySelector?.('.ck-detail-head,.ck-sections')
      )
    ));
    if (coreChanged) requestAnimationFrame(enhanceDetail);
  });

  addPageHints();
  observer.observe(detail, {childList:true, subtree:false});
  requestAnimationFrame(enhanceDetail);
})();
