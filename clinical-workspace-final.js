(() => {
  'use strict';

  const ROOT = document.documentElement;
  const VERSION = 'clinical-workspace-final-20260801-1';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scheduled = false;
  let protocolObserver = null;
  let revealObserver = null;
  let activeTrigger = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  function safeHref(value) {
    try {
      const url = new URL(String(value || ''), location.href);
      if (!['https:', 'http:'].includes(url.protocol) || url.origin === 'null') return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function markRoot() {
    ROOT.classList.add('medindex-workspace-final');
    ROOT.dataset.medindexWorkspace = VERSION;
  }

  function decorateScrollableTables() {
    document.querySelectorAll('.table-wrap').forEach(wrapper => {
      if (wrapper.dataset.mwScrollBound !== '1') {
        wrapper.dataset.mwScrollBound = '1';
        wrapper.addEventListener('scroll', () => {
          wrapper.dataset.mwScrolled = String(wrapper.scrollLeft > 2);
        }, { passive:true });
      }
      wrapper.dataset.mwScrolled = String(wrapper.scrollLeft > 2);
      const table = wrapper.querySelector('table');
      if (table) {
        table.setAttribute('role', 'table');
        if (!table.getAttribute('aria-label')) table.setAttribute('aria-label', 'Të dhënat klinike të MedIndex');
      }
    });
  }

  function ensureRevealObserver() {
    if (reducedMotion || revealObserver || !('IntersectionObserver' in window)) return;
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin:'70px 0px', threshold:0.04 });
  }

  function reveal(node) {
    if (!node || node.dataset.mwReveal === '1') return;
    node.dataset.mwReveal = '1';
    if (reducedMotion || !('IntersectionObserver' in window)) {
      node.classList.add('is-visible');
      return;
    }
    ensureRevealObserver();
    node.classList.add('mw-reveal');
    revealObserver?.observe(node);
  }

  function ensureProtocolDialog() {
    let dialog = document.getElementById('mwProtocolDialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'mwProtocolDialog';
    dialog.className = 'mw-protocol-dialog';
    dialog.innerHTML = `
      <div class="mw-protocol-dialog-shell" role="document">
        <header class="mw-protocol-dialog-header">
          <div><span class="mw-protocol-dialog-kicker">MedIndex · Protokoll zyrtar</span><h2 id="mwProtocolDialogTitle">Protokolli</h2></div>
          <button class="mw-protocol-dialog-close" type="button" aria-label="Mbyll panelin">×</button>
        </header>
        <div class="mw-protocol-dialog-body">
          <div class="mw-protocol-meta-grid" id="mwProtocolMeta"></div>
          <h3 class="mw-protocol-section-title">Rrjedha e sigurt e përdorimit</h3>
          <ol class="mw-protocol-timeline">
            <li class="mw-protocol-step"><span class="mw-protocol-step-number">1</span><div class="mw-protocol-step-copy"><strong>Verifiko dokumentin</strong><p>Kontrollo titullin, kategorinë, formatin dhe nëse dokumenti është aktual apo arkivor para përdorimit klinik.</p></div></li>
            <li class="mw-protocol-step"><span class="mw-protocol-step-number">2</span><div class="mw-protocol-step-copy"><strong>Lexo algoritmin zyrtar</strong><p>Hape burimin zyrtar dhe lexo kriteret, përjashtimet, algoritmet, dozimin dhe monitorimin drejtpërdrejt në dokument.</p></div></li>
            <li class="mw-protocol-step"><span class="mw-protocol-step-number">3</span><div class="mw-protocol-step-copy"><strong>Apliko dhe dokumento</strong><p>Përshtate vendimin me pacientin, kundërindikacionet dhe gjykimin klinik; dokumento burimin dhe arsyetimin në kartelë.</p></div></li>
          </ol>
          <p class="mw-protocol-source-note"><strong>Burimi autoritativ:</strong> Ministria e Shëndetësisë e Republikës së Kosovës. MedIndex e organizon dokumentin për lexim më të qartë, por nuk e zëvendëson dhe nuk shpik rekomandime klinike.</p>
        </div>
        <footer class="mw-protocol-dialog-footer" id="mwProtocolDialogActions"></footer>
      </div>`;
    document.body.appendChild(dialog);

    const close = () => {
      dialog.close();
      activeTrigger?.focus?.({ preventScroll:true });
      activeTrigger = null;
    };
    dialog.querySelector('.mw-protocol-dialog-close')?.addEventListener('click', close);
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    return dialog;
  }

  function protocolData(article) {
    const title = clean(article.querySelector('h2')?.textContent).replace(/^\d+\.\s*/, '');
    const chips = [...article.querySelectorAll('.clinical-chip')].map(node => clean(node.textContent)).filter(Boolean);
    const category = chips.find(value => !/^(PDF|DOCX|HTML|TXT|Arkivore)$/i.test(value)) || 'Pa kategori';
    const format = chips.find(value => /^(PDF|DOCX|HTML|TXT)$/i.test(value)) || 'Dokument';
    const archived = chips.some(value => /arkivore/i.test(value));
    const links = [...article.querySelectorAll('.clinical-actions a[href]')];
    const official = links.find(link => /burimi/i.test(clean(link.textContent)));
    const documentLink = links.find(link => !/burimi/i.test(clean(link.textContent)));
    return {
      title,
      category,
      format,
      status:archived ? 'Arkivor' : 'Aktual',
      officialHref:safeHref(official?.href),
      documentHref:safeHref(documentLink?.href),
    };
  }

  function openProtocolPlan(article, trigger) {
    const data = protocolData(article);
    const dialog = ensureProtocolDialog();
    activeTrigger = trigger;
    dialog.querySelector('#mwProtocolDialogTitle').textContent = data.title || 'Protokolli';
    dialog.querySelector('#mwProtocolMeta').innerHTML = `
      <div><span>Kategoria</span><strong>${escapeHtml(data.category)}</strong></div>
      <div><span>Formati</span><strong>${escapeHtml(data.format)}</strong></div>
      <div><span>Statusi</span><strong>${escapeHtml(data.status)}</strong></div>`;
    const actions = [];
    if (data.officialHref) actions.push(`<a href="${escapeHtml(data.officialHref)}" target="_blank" rel="noopener noreferrer external">Shiko burimin zyrtar</a>`);
    if (data.documentHref) actions.push(`<a class="primary" href="${escapeHtml(data.documentHref)}" target="_blank" rel="noopener">Lexo dokumentin</a>`);
    dialog.querySelector('#mwProtocolDialogActions').innerHTML = actions.join('') || '<span>Dokumenti nuk ka lidhje aktive.</span>';
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('.mw-protocol-dialog-close')?.focus({ preventScroll:true }));
  }

  function enhanceProtocolArticle(article) {
    if (!article || article.dataset.mwProtocol === '1') return;
    article.dataset.mwProtocol = '1';
    article.classList.add('mw-protocol-card');

    const official = [...article.querySelectorAll('.clinical-actions a')].find(link => /burimi/i.test(clean(link.textContent)));
    if (official) official.textContent = 'Shiko burimin zyrtar';
    const primary = article.querySelector('.clinical-actions .primary');
    if (primary && !primary.disabled) primary.textContent = 'Lexo dokumentin';

    const copy = article.firstElementChild;
    if (copy && !copy.querySelector('.mw-protocol-trust')) {
      const trust = document.createElement('div');
      trust.className = 'mw-protocol-trust';
      trust.textContent = 'I indeksuar nga regjistri zyrtar i Ministrisë së Shëndetësisë';
      copy.appendChild(trust);
    }

    const actions = article.querySelector('.clinical-actions');
    if (actions && !actions.querySelector('.mw-protocol-plan-button')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mw-protocol-plan-button';
      button.textContent = 'Shiko planin hap pas hapi';
      button.addEventListener('click', () => openProtocolPlan(article, button));
      actions.prepend(button);
    }
    reveal(article);
  }

  function enhanceProtocols() {
    const list = document.getElementById('protocolList');
    if (!list) return;
    list.querySelectorAll('.clinical-row').forEach(enhanceProtocolArticle);
    if (!protocolObserver) {
      protocolObserver = new MutationObserver(() => schedule());
      protocolObserver.observe(list, { childList:true });
    }
  }

  function decorateCards() {
    const selectors = [
      '.clinical-list > .clinical-row',
      '.med-grid > article',
      '.lab-grid > article',
      '.icd-grid > article',
      '.atc-grid > article',
      '.rx-grid > article',
    ];
    document.querySelectorAll(selectors.join(',')).forEach(reveal);
  }

  function audit() {
    scheduled = false;
    markRoot();
    decorateScrollableTables();
    decorateCards();
    enhanceProtocols();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(audit);
  }

  function init() {
    audit();
    window.addEventListener('resize', schedule, { passive:true });
    window.addEventListener('medindex:registry-ready', schedule);
    window.addEventListener('medindex:registry-data-ready', schedule);
    document.addEventListener('medindex:tailadmin-ready', schedule);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
