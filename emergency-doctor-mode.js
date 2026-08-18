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
    if (detail.querySelector('.ck-meta .ck-chip.is-verified')) {
      return {verified:true, label:'E verifikuar'};
    }
    const reviewChip = detail.querySelector('.ck-meta .ck-chip.is-review');
    return {verified:false, label:text(reviewChip) || 'Për verifikim'};
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

    const firstAction = text(primary?.querySelector('.ck-step-action')) || 'Shiko hapat e kujdesit parësor.';
    const redFlagCount = alerts?.querySelectorAll('.ck-info-card').length || 0;
    const referralUrgency = summaryValue(referral, 'Urgjenca') || summaryValue(referral, 'Kur referohet');
    const referralDestination = summaryValue(referral, 'Destinacioni');

    const consoleEl = document.createElement('section');
    consoleEl.className = 'ck-doctor-console';
    consoleEl.setAttribute('aria-label', 'Pamja e shpejtë për mjekun');
    consoleEl.innerHTML = `
      <div class="ck-doctor-console-head">
        <div>
          <strong>Pamja e mjekut · 10 sekonda</strong>
          <span>Veprimi i parë, alarmi dhe referimi në një vend.</span>
        </div>
        <span class="ck-doctor-triage">Triazh · ${escapeHtml(triageLabel())}</span>
      </div>
      ${review.verified ? '' : `
        <div class="ck-doctor-review-warning" role="note">
          <strong>${escapeHtml(review.label)}</strong>
          <span>Ky dokument nuk ka ende status “Verifikuar”. Kontrollo burimin dhe statusin klinik para përdorimit në vendimmarrje.</span>
        </div>`}
      <div class="ck-doctor-console-grid">
        <article class="ck-doctor-glance">
          <small>01 · Çfarë bëj tani?</small>
          <strong>${escapeHtml(compact(firstAction, 190))}</strong>
          <p>Hap “Veprimi tani” për rendin e plotë të hapave.</p>
        </article>
        <article class="ck-doctor-glance is-alert">
          <small>02 · Red flags</small>
          <strong>${redFlagCount ? `${redFlagCount} shenja alarmuese` : 'Pa red flags të listuara'}</strong>
          <p>${redFlagCount ? 'Kontrolloji para se të vazhdosh.' : 'Kontrollo dokumentin e plotë klinik.'}</p>
        </article>
        <article class="ck-doctor-glance is-referral">
          <small>03 · Referimi</small>
          <strong>${escapeHtml(compact(referralUrgency || 'Shiko kriteret e referimit', 95))}</strong>
          <p>${escapeHtml(compact(referralDestination || 'Destinacioni sipas protokollit.', 120))}</p>
        </article>
      </div>
      <nav class="ck-doctor-nav" aria-label="Shko te seksioni klinik">
        ${navButton(primary, 'Veprimi tani')}
        ${navButton(alerts, 'Red flags')}
        ${navButton(referral, 'Referimi')}
        ${navButton(safety, 'Mos bëj')}
        ${navButton(secondary, 'Sekondar')}
      </nav>`;

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
  }

  function navButton(section, label) {
    if (!section?.id) return '';
    return `<button type="button" data-ck-doctor-target="${escapeHtml(section.id)}">${escapeHtml(label)}</button>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    }[char]));
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
          <span><kbd>/</kbd> fokuson kërkimin</span>
        </p>`);
    }

    search.placeholder = 'Kërko p.sh. “edemë pulmonare”, “J81.0”, “dispne”…';
  }

  document.addEventListener('keydown', event => {
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
