(() => {
  let scheduled = false;

  function ensureStyles() {
    if (document.getElementById('nameDisplayStyles')) return;
    const style = document.createElement('style');
    style.id = 'nameDisplayStyles';
    style.textContent = `
      td.name { min-width: 300px; max-width: 340px; }
      .drug-name-layout {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
      }
      .drug-name-text {
        min-width: 0;
        width: 100%;
        padding: 2px 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: inherit;
        line-height: 1.35;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: zoom-in;
      }
      .drug-name-text:focus-visible {
        outline: 2px solid var(--amber, #c77d1f);
        outline-offset: 3px;
        border-radius: 3px;
      }
      td.name.name-expanded {
        max-width: 470px;
      }
      td.name.name-expanded .drug-name-layout {
        min-width: 390px;
        max-width: 470px;
        align-items: start;
      }
      td.name.name-expanded .drug-name-text {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        cursor: zoom-out;
      }
      .app-menu-link[data-nav="classification"] .app-menu-icon svg {
        width: 27px;
        height: 27px;
      }
      @media (max-width: 720px) {
        td.name { min-width: 255px; max-width: 285px; }
        td.name.name-expanded,
        td.name.name-expanded .drug-name-layout { min-width: 300px; max-width: 360px; }
      }
    `;
    document.head.appendChild(style);
  }

  function fullDrugName(cell) {
    const row = cell.closest('tr');
    if (row?.dataset.drugName) return row.dataset.drugName;
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.favorite-marker, .drug-actions-trigger, .drug-name-text').forEach(node => node.remove());
    return (cell.getAttribute('title') || clone.textContent || '').trim();
  }

  function decorateNameCell(cell) {
    if (cell.querySelector('.drug-name-layout')) return;
    const fullName = fullDrugName(cell);
    if (!fullName) return;

    const marker = cell.querySelector('.favorite-marker');
    const trigger = cell.querySelector('.drug-actions-trigger');
    const layout = document.createElement('div');
    layout.className = 'drug-name-layout';

    const nameButton = document.createElement('button');
    nameButton.type = 'button';
    nameButton.className = 'drug-name-text';
    nameButton.textContent = fullName;
    nameButton.title = fullName;
    nameButton.setAttribute('aria-label', 'Shfaq emrin e plotë: ' + fullName);
    nameButton.setAttribute('aria-expanded', 'false');
    nameButton.addEventListener('click', event => {
      event.stopPropagation();
      const expanded = cell.classList.toggle('name-expanded');
      nameButton.setAttribute('aria-expanded', String(expanded));
    });

    cell.replaceChildren();
    if (marker) layout.appendChild(marker);
    else {
      const spacer = document.createElement('span');
      spacer.className = 'favorite-marker';
      spacer.hidden = true;
      spacer.textContent = '★';
      layout.appendChild(spacer);
    }
    layout.appendChild(nameButton);
    if (trigger) layout.appendChild(trigger);
    cell.appendChild(layout);
    cell.title = fullName;
  }

  function decorateNames() {
    document.querySelectorAll('#tbody td.name').forEach(decorateNameCell);
  }

  function addClassificationNav() {
    const menu = document.getElementById('appMenu');
    if (!menu || menu.querySelector('[data-nav="classification"]')) return;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'app-menu-link';
    item.dataset.nav = 'classification';
    item.innerHTML = `
      <span class="app-menu-icon">
        <svg fill="none" viewBox="0 0 256 256" aria-hidden="true">
          <rect x="36" y="36" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/>
          <rect x="144" y="36" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/>
          <rect x="36" y="144" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/>
          <rect x="144" y="144" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/>
        </svg>
      </span>
      <span class="app-menu-title">Klasifikimi</span>`;
    item.addEventListener('click', () => { window.location.href = 'klasifikimi.html'; });
    const protocols = menu.querySelector('[data-nav="protocols"]');
    if (protocols) protocols.before(item); else menu.appendChild(item);
  }

  function decorate() {
    scheduled = false;
    ensureStyles();
    addClassificationNav();
    decorateNames();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate, { once: true });
  else decorate();
})();
