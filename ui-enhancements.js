(() => {
  const CHECK_ICON = '<span aria-hidden="true"><svg viewBox="0 0 12 10" height="10" width="12"><polyline points="1.5 6 4.5 9 10.5 1"></polyline></svg></span>';
  const DELETE_ICON = '<svg viewBox="0 0 448 512" class="deleteIcon" aria-hidden="true"><path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"></path></svg>';
  const ARROW_ICON = '<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path fill="#fff" d="M13.4697 17.9697C13.1768 18.2626 13.1768 18.7374 13.4697 19.0303C13.7626 19.3232 14.2374 19.3232 14.5303 19.0303L20.3232 13.2374C21.0066 12.554 21.0066 11.446 20.3232 10.7626L14.5303 4.96967C14.2374 4.67678 13.7626 4.67678 13.4697 4.96967C13.1768 5.26256 13.1768 5.73744 13.4697 6.03033L18.6893 11.25H4C3.58579 11.25 3.25 11.5858 3.25 12C3.25 12.4142 3.58579 12.75 4 12.75H18.6893L13.4697 17.9697Z"></path></svg>';

  let checkboxSequence = 0;
  let scheduled = false;

  function ensureDashboardStyles() {
    if (document.getElementById('protocolDashboardStyles')) return;

    const style = document.createElement('style');
    style.id = 'protocolDashboardStyles';
    style.textContent = `
      body.has-app-nav { padding-left: 92px; }

      .app-menu {
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 45;
        width: 92px;
        padding: 18px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: var(--teal-dark, #0d3d40);
        border-right: 4px solid var(--amber, #c77d1f);
        box-shadow: 10px 0 30px rgba(0,0,0,.08);
      }
      .app-menu .app-menu-link {
        min-width: 0;
        padding: 10px 6px;
        border: 0;
        border-radius: 12px;
        background: transparent;
        color: #dfe9e6;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        transition: .2s ease;
      }
      .app-menu .app-menu-link:hover,
      .app-menu .app-menu-link.active {
        color: #fff;
        background: rgba(255,255,255,.12);
        transform: translateY(-1px);
      }
      .app-menu .app-menu-link.is-future { opacity: .68; }
      .app-menu .app-menu-icon { width: 34px; height: 34px; display: grid; place-items: center; }
      .app-menu .app-menu-icon svg { width: 26px; height: 26px; }
      .app-menu .app-menu-title { font-size: .7rem; line-height: 1.15; font-weight: 750; text-align: center; }

      .saved-dashboard-head {
        display: flex;
        align-items: end;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 14px;
        margin-bottom: 18px;
      }
      .saved-dashboard-copy h3 {
        margin: 0 0 4px;
        font-family: var(--serif, Georgia, serif);
        color: var(--teal-dark, #0d3d40);
        font-size: 1.3rem;
      }
      .saved-dashboard-copy p { margin: 0; color: #6b777b; font-size: .8rem; }
      .saved-dashboard-tools { display: flex; gap: 10px; flex: 1 1 320px; justify-content: flex-end; }
      .saved-dashboard-search {
        width: min(360px, 100%);
        border: 1.5px solid var(--line, #d7dcd6);
        border-radius: 12px;
        padding: 10px 12px;
        background: #fff;
        color: var(--ink, #12222a);
        outline: none;
      }
      .saved-dashboard-search:focus { border-color: var(--teal, #155e63); box-shadow: 0 0 0 3px rgba(21,94,99,.12); }

      .protocol-gradient-btn {
        align-items: center;
        background-image: linear-gradient(144deg, var(--amber, #c77d1f), var(--teal, #155e63) 52%, #1fa2a9);
        border: 0;
        border-radius: 9px;
        box-shadow: rgba(21,94,99,.18) 0 12px 24px -8px;
        color: #fff;
        display: flex;
        justify-content: center;
        min-width: 142px;
        padding: 3px;
        cursor: pointer;
        transition: .25s ease;
      }
      .protocol-gradient-btn > span {
        width: 100%;
        padding: 10px 14px;
        border-radius: 7px;
        background: var(--teal-dark, #0d3d40);
        color: #fff;
        font-weight: 750;
        transition: .25s ease;
      }
      .protocol-gradient-btn:hover > span { background: transparent; }
      .protocol-gradient-btn:active { transform: scale(.96); }

      #savedProtocolsList.protocol-card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
        gap: 16px;
      }
      #savedProtocolsList.protocol-card-grid > .protocol-empty { grid-column: 1 / -1; }
      .saved-protocol.protocol-dashboard-card {
        --border-radius: .85rem;
        --primary-color: var(--teal, #155e63);
        min-height: 228px;
        margin: 0;
        padding: 1rem 1rem 4.4rem;
        cursor: pointer;
        border-radius: var(--border-radius);
        border: 1px solid var(--line, #d7dcd6);
        background: #fff;
        box-shadow: 0 10px 24px rgba(13,61,64,.08);
        position: relative;
        overflow: hidden;
        transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
      }
      .saved-protocol.protocol-dashboard-card:hover,
      .saved-protocol.protocol-dashboard-card:focus-visible {
        transform: translateY(-3px);
        border-color: rgba(21,94,99,.45);
        box-shadow: 0 18px 38px rgba(13,61,64,.14);
        outline: none;
      }
      .protocol-dashboard-card .protocol-card-tag {
        display: inline-flex;
        max-width: 100%;
        padding: 4px 9px;
        border-radius: 999px;
        background: var(--amber-soft, #f4e3cb);
        color: #75460f;
        font-size: .7rem;
        font-weight: 750;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .protocol-dashboard-card h3.protocol-card-title {
        margin: 14px 0 0;
        padding: 0;
        color: var(--teal-dark, #0d3d40);
        font-family: var(--serif, Georgia, serif);
        font-size: 1.22rem;
        line-height: 1.22;
        transition: .2s ease;
      }
      .protocol-dashboard-card:hover h3.protocol-card-title { color: var(--teal, #155e63); text-decoration: underline; }
      .protocol-dashboard-card .protocol-card-content {
        margin: 13px 0 0;
        color: #3c4a4e;
        font-size: .83rem;
        line-height: 1.48;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .protocol-dashboard-card .protocol-card-date {
        margin-top: 13px;
        color: #6e777b;
        font-size: .74rem;
      }
      .protocol-dashboard-card .protocol-card-arrow {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 42px;
        height: 42px;
        padding: .65rem;
        border-top-left-radius: var(--border-radius);
        background: var(--primary-color);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: .2s ease;
      }
      .protocol-dashboard-card .protocol-card-arrow svg { width: 17px; height: 17px; transition: .2s ease; }
      .protocol-dashboard-card:hover .protocol-card-arrow { background: #111; }
      .protocol-dashboard-card:hover .protocol-card-arrow svg { transform: translateX(3px); }
      .protocol-dashboard-card .saved-meta { display: none; }
      .protocol-dashboard-card .saved-actions.card-quick-actions {
        position: absolute;
        left: 1rem;
        right: 50px;
        bottom: 12px;
        display: flex;
        flex-wrap: nowrap;
        gap: 5px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .protocol-dashboard-card .saved-actions.card-quick-actions::-webkit-scrollbar { display: none; }
      .protocol-dashboard-card .saved-actions.card-quick-actions button {
        flex: 0 0 auto;
        min-width: 0;
        padding: 6px 8px;
        font-size: .7rem;
      }
      .protocol-dashboard-card .saved-actions.card-quick-actions [data-load-protocol] { display: none; }
      .protocol-dashboard-card .saved-actions.card-quick-actions .deleteButton { width: 30px; height: 30px; flex-basis: 30px; }
      .protocol-dashboard-card .saved-actions.card-quick-actions .deleteButton:hover { width: 86px; }

      @media (max-width: 720px) {
        body.has-app-nav { padding-left: 0; padding-bottom: 76px; }
        .app-menu {
          inset: auto 0 0 0;
          width: auto;
          height: 76px;
          padding: 8px 10px;
          flex-direction: row;
          justify-content: space-around;
          border-right: 0;
          border-top: 3px solid var(--amber, #c77d1f);
        }
        .app-menu .app-menu-link { flex: 1; padding: 5px 3px; }
        .app-menu .app-menu-icon { width: 28px; height: 28px; }
        .app-menu .app-menu-icon svg { width: 22px; height: 22px; }
        .saved-dashboard-tools { justify-content: stretch; }
        .saved-dashboard-search { width: 100%; }
        #savedProtocolsList.protocol-card-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function setActiveNav(name) {
    document.querySelectorAll('.app-menu-link').forEach(link => {
      link.classList.toggle('active', link.dataset.nav === name);
    });
  }

  function closeProtocolsSafely() {
    const overlay = document.getElementById('protocolOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function openSavedProtocols() {
    const mainButton = document.getElementById('protocolsBtn');
    if (mainButton) mainButton.click();
    window.setTimeout(() => {
      const savedTab = document.querySelector('.protocol-tab[data-tab="saved"]');
      if (savedTab) savedTab.click();
    }, 0);
    setActiveNav('protocols');
  }

  function showFutureMessage() {
    if (typeof window.showProtocolToast === 'function') {
      window.showProtocolToast('Favoritet do të shtohen në hapin e ardhshëm.');
      return;
    }
    const toast = document.getElementById('protocolToast');
    if (toast) {
      toast.textContent = 'Favoritet do të shtohen në hapin e ardhshëm.';
      toast.classList.add('show');
      window.setTimeout(() => toast.classList.remove('show'), 2200);
    }
  }

  function ensureAppMenu() {
    if (document.getElementById('appMenu')) return;

    const menu = document.createElement('nav');
    menu.id = 'appMenu';
    menu.className = 'app-menu';
    menu.setAttribute('aria-label', 'Navigimi kryesor');
    menu.innerHTML = `
      <button class="app-menu-link active" type="button" data-nav="home" aria-label="Barnat">
        <span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><path d="M213 110 133 37a8 8 0 0 0-11 0l-79 73a8 8 0 0 0-3 6v92a8 8 0 0 0 8 8h160a8 8 0 0 0 8-8v-92a8 8 0 0 0-3-6Z" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="app-menu-title">Barnat</span>
      </button>
      <button class="app-menu-link" type="button" data-nav="protocols" aria-label="Protokollet">
        <span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><path d="M64 40h128a16 16 0 0 1 16 16v160H48V56a16 16 0 0 1 16-16Z" stroke="currentColor" stroke-width="16"/><path d="M80 88h96M80 128h96M80 168h64" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg></span>
        <span class="app-menu-title">Protokollet</span>
      </button>
      <button class="app-menu-link is-future" type="button" data-nav="favorites" aria-label="Favoritet — së shpejti">
        <span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><path d="m128 24 31 63 69 10-50 49 12 69-62-33-62 33 12-69-50-49 69-10 31-63Z" stroke="currentColor" stroke-width="16" stroke-linejoin="round"/></svg></span>
        <span class="app-menu-title">Favoritet</span>
      </button>
      <button class="app-menu-link" type="button" data-nav="search" aria-label="Kërko barna">
        <span class="app-menu-icon"><svg fill="none" viewBox="0 0 256 256"><circle cx="116" cy="116" r="76" stroke="currentColor" stroke-width="16"/><path d="m171 171 53 53" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg></span>
        <span class="app-menu-title">Kërko</span>
      </button>
    `;

    menu.addEventListener('click', event => {
      const link = event.target.closest('.app-menu-link');
      if (!link) return;

      const destination = link.dataset.nav;
      if (destination === 'home') {
        closeProtocolsSafely();
        setActiveNav('home');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (destination === 'protocols') {
        openSavedProtocols();
      } else if (destination === 'favorites') {
        showFutureMessage();
      } else if (destination === 'search') {
        closeProtocolsSafely();
        setActiveNav('search');
        const search = document.getElementById('search');
        if (search) {
          search.scrollIntoView({ behavior: 'smooth', block: 'center' });
          window.setTimeout(() => search.focus(), 250);
        }
      }
    });

    document.body.prepend(menu);
    document.body.classList.add('has-app-nav');
  }

  function nextCheckboxId() {
    checkboxSequence += 1;
    return 'styled-cbx-' + checkboxSequence;
  }

  function createCheckboxLabel(input, text = '') {
    if (!input.id) input.id = nextCheckboxId();
    input.classList.add('inp-cbx');

    const label = document.createElement('label');
    label.className = 'cbx';
    label.htmlFor = input.id;
    label.innerHTML = CHECK_ICON + (text ? '<span class="cbx-text">' + text + '</span>' : '');
    return label;
  }

  function decorateTableCheckbox(input) {
    if (input.closest('.checkbox-wrapper-46')) return;
    const parent = input.parentElement;
    if (!parent) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'checkbox-wrapper-46';
    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(createCheckboxLabel(input));
  }

  function decorateColumnCheckbox(input) {
    if (input.closest('.checkbox-wrapper-46')) return;
    const oldLabel = input.parentElement;
    if (!oldLabel || oldLabel.tagName !== 'LABEL') return;

    const textNode = oldLabel.querySelector('span');
    const text = textNode ? textNode.innerHTML : oldLabel.textContent.trim();
    const wrapper = document.createElement('div');
    wrapper.className = 'checkbox-wrapper-46';

    oldLabel.replaceWith(wrapper);
    wrapper.appendChild(input);
    const label = createCheckboxLabel(input);
    if (text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'cbx-text';
      textSpan.innerHTML = text;
      label.appendChild(textSpan);
    }
    wrapper.appendChild(label);
  }

  function decorateCheckboxes() {
    document.querySelectorAll('th.select-col input[type="checkbox"], td.select-col input[type="checkbox"]').forEach(decorateTableCheckbox);
    document.querySelectorAll('#colPanel > label > input[type="checkbox"]').forEach(decorateColumnCheckbox);
  }

  function decorateFloatingFields() {
    document.querySelectorAll('.protocol-drug-fields .protocol-field').forEach(field => {
      if (field.classList.contains('floating-field')) return;
      const control = field.querySelector('input, textarea');
      const label = field.querySelector('label');
      if (!control || !label) return;

      const example = control.getAttribute('placeholder') || '';
      control.setAttribute('placeholder', ' ');
      field.classList.add('floating-field');
      control.insertAdjacentElement('afterend', label);

      if (example && example.trim()) {
        const hint = document.createElement('span');
        hint.className = 'floating-hint';
        hint.textContent = example;
        field.appendChild(hint);
      }
    });
  }

  function decorateDeleteButton(button, label) {
    if (button.classList.contains('deleteButton')) return;
    button.classList.remove('btn-danger', 'protocol-remove');
    button.classList.add('deleteButton');
    button.dataset.label = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = DELETE_ICON;
  }

  function decorateDeleteButtons() {
    document.querySelectorAll('[data-remove-index]').forEach(button => decorateDeleteButton(button, 'Hiqe'));
    document.querySelectorAll('[data-delete-protocol]').forEach(button => decorateDeleteButton(button, 'Fshije'));
  }

  function readProtocols() {
    try {
      const value = JSON.parse(localStorage.getItem('regjistriBarnave_protokollet_v1') || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function formatProtocolDate(value) {
    if (!value) return 'Pa datë';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('sq-AL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function ensureSavedDashboardHeader() {
    const pane = document.getElementById('protocolPaneSaved');
    const list = document.getElementById('savedProtocolsList');
    if (!pane || !list || pane.querySelector('.saved-dashboard-head')) return;

    const header = document.createElement('div');
    header.className = 'saved-dashboard-head';

    const copy = document.createElement('div');
    copy.className = 'saved-dashboard-copy';
    const title = document.createElement('h3');
    title.textContent = 'Protokollet e ruajtura';
    const subtitle = document.createElement('p');
    subtitle.innerHTML = '<span id="savedDashboardCount">0 protokolle</span> · Kliko kartelën për ta hapur të plotë.';
    copy.append(title, subtitle);

    const tools = document.createElement('div');
    tools.className = 'saved-dashboard-tools';
    const search = document.createElement('input');
    search.id = 'savedProtocolSearch';
    search.className = 'saved-dashboard-search';
    search.type = 'search';
    search.placeholder = 'Kërko protokollin, diagnozën ose barin...';
    search.setAttribute('aria-label', 'Kërko protokollet');

    const newButton = document.createElement('button');
    newButton.className = 'protocol-gradient-btn';
    newButton.type = 'button';
    newButton.innerHTML = '<span>+ Protokoll i ri</span>';
    newButton.addEventListener('click', () => {
      const builderTab = document.querySelector('.protocol-tab[data-tab="builder"]');
      if (builderTab) builderTab.click();
      const reset = document.getElementById('newProtocolBtn');
      if (reset) reset.click();
      const name = document.getElementById('protocolName');
      if (name) window.setTimeout(() => name.focus(), 50);
    });

    search.addEventListener('input', () => filterProtocolCards(search.value));
    tools.append(search, newButton);
    header.append(copy, tools);
    pane.insertBefore(header, list);
  }

  function filterProtocolCards(query) {
    const normalized = String(query || '').trim().toLocaleLowerCase('sq');
    const cards = Array.from(document.querySelectorAll('#savedProtocolsList .protocol-dashboard-card'));
    let visible = 0;

    cards.forEach(card => {
      const match = !normalized || String(card.dataset.searchText || '').includes(normalized);
      card.style.display = match ? '' : 'none';
      if (match) visible += 1;
    });

    const count = document.getElementById('savedDashboardCount');
    if (count) count.textContent = visible + (visible === 1 ? ' protokoll' : ' protokolle');

    let empty = document.getElementById('savedSearchEmpty');
    if (!visible && cards.length) {
      if (!empty) {
        empty = document.createElement('div');
        empty.id = 'savedSearchEmpty';
        empty.className = 'protocol-empty';
        empty.textContent = 'Nuk u gjet asnjë protokoll për këtë kërkim.';
        document.getElementById('savedProtocolsList').appendChild(empty);
      }
      empty.hidden = false;
    } else if (empty) {
      empty.hidden = true;
    }
  }

  function sortProtocolCards(list, protocols) {
    const order = new Map(
      [...protocols]
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
        .map((protocol, index) => [String(protocol.id), index])
    );
    const cards = Array.from(list.querySelectorAll('.protocol-dashboard-card'));
    const sorted = [...cards].sort((a, b) => {
      return (order.get(a.dataset.protocolId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.dataset.protocolId) ?? Number.MAX_SAFE_INTEGER);
    });
    const current = cards.map(card => card.dataset.protocolId).join('|');
    const desired = sorted.map(card => card.dataset.protocolId).join('|');
    if (current !== desired) sorted.forEach(card => list.appendChild(card));
  }

  function decorateSavedProtocols() {
    const list = document.getElementById('savedProtocolsList');
    if (!list) return;
    list.classList.add('protocol-card-grid');
    ensureSavedDashboardHeader();

    const protocols = readProtocols();
    const protocolById = new Map(protocols.map(protocol => [String(protocol.id), protocol]));

    list.querySelectorAll('.saved-protocol').forEach(card => {
      const openButton = card.querySelector('[data-load-protocol]');
      if (!openButton) return;
      const id = String(openButton.dataset.loadProtocol || '');
      const protocol = protocolById.get(id) || {};

      if (!card.dataset.dashboardReady) {
        card.dataset.dashboardReady = 'true';
        card.dataset.protocolId = id;
        card.classList.add('protocol-dashboard-card');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', 'Hape protokollin ' + (protocol.name || ''));

        const title = card.querySelector('h3');
        if (title) title.classList.add('protocol-card-title');

        const tag = document.createElement('span');
        tag.className = 'protocol-card-tag';
        tag.textContent = protocol.indication || 'Protokoll personal';
        card.insertBefore(tag, title || card.firstChild);

        const content = document.createElement('p');
        content.className = 'protocol-card-content';
        const itemCount = Array.isArray(protocol.items) ? protocol.items.length : 0;
        content.textContent = protocol.population || protocol.notes || (itemCount + (itemCount === 1 ? ' bar i përfshirë.' : ' barna të përfshira.'));
        if (title) title.insertAdjacentElement('afterend', content);
        else card.appendChild(content);

        const date = document.createElement('div');
        date.className = 'protocol-card-date';
        date.textContent = 'Përditësuar: ' + formatProtocolDate(protocol.updatedAt);
        content.insertAdjacentElement('afterend', date);

        const arrow = document.createElement('div');
        arrow.className = 'protocol-card-arrow';
        arrow.innerHTML = ARROW_ICON;
        card.appendChild(arrow);

        const actions = card.querySelector('.saved-actions');
        if (actions) actions.classList.add('card-quick-actions');

        card.addEventListener('click', event => {
          if (event.target.closest('button')) return;
          openButton.click();
          setActiveNav('protocols');
        });
        card.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          if (event.target.closest('button')) return;
          event.preventDefault();
          openButton.click();
          setActiveNav('protocols');
        });
      }

      const searchableItems = Array.isArray(protocol.items)
        ? protocol.items.map(item => [item.tradeName, item.substance, item.strength, item.form].filter(Boolean).join(' ')).join(' ')
        : '';
      card.dataset.searchText = [protocol.name, protocol.indication, protocol.population, protocol.notes, searchableItems]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('sq');
    });

    sortProtocolCards(list, protocols);
    const search = document.getElementById('savedProtocolSearch');
    filterProtocolCards(search ? search.value : '');
  }

  function decorateAll() {
    scheduled = false;
    ensureDashboardStyles();
    ensureAppMenu();
    decorateCheckboxes();
    decorateFloatingFields();
    decorateDeleteButtons();
    decorateSavedProtocols();
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorateAll);
  }

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorateAll, { once: true });
  } else {
    decorateAll();
  }
})();