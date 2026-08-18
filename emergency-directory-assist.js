(() => {
  'use strict';

  const list = document.getElementById('emergencyList');
  const search = document.getElementById('emergencySearch');
  const detail = document.getElementById('emergencyDetail');
  if (!list || !search || !detail) return;

  const text = node => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[ch]));

  function splitMeta(raw) {
    const parts = String(raw || '').split('·').map(part => part.trim()).filter(Boolean);
    const codes = parts.filter(part => /^[A-Z][0-9]/i.test(part));
    const labels = parts.filter(part => !codes.includes(part));
    return {codes, labels};
  }

  function decorateDirectory() {
    const buttons = [...list.querySelectorAll('.ck-list-button[data-id]')];
    if (!buttons.length) return;

    list.setAttribute('aria-label', 'Urgjencat e disponueshme');

    buttons.forEach(button => {
      const isActive = button.classList.contains('is-active');
      if (isActive) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');

      if (!button.querySelector('.ck-directory-tags')) {
        const metaLine = [...button.children].find(node =>
          node.tagName === 'SPAN'
          && !node.classList.contains('ck-directory-tags')
          && !node.classList.contains('ck-directory-active')
        );
        if (metaLine) {
          const {codes, labels} = splitMeta(text(metaLine));
          const tags = document.createElement('span');
          tags.className = 'ck-directory-tags';
          tags.innerHTML = [
            ...codes.map(code => `<span class="ck-directory-tag is-icd">${esc(code)}</span>`),
            ...labels.map(label => `<span class="ck-directory-tag">${esc(label)}</span>`),
          ].join('');
          metaLine.hidden = true;
          button.appendChild(tags);
        }
      }

      const activeLabel = button.querySelector('.ck-directory-active');
      if (isActive && !activeLabel) {
        button.insertAdjacentHTML('beforeend', '<span class="ck-directory-active">Hapur</span>');
      } else if (!isActive && activeLabel) {
        activeLabel.remove();
      }
    });
  }

  function visibleButtons() {
    return [...list.querySelectorAll('.ck-list-button[data-id]')]
      .filter(button => !button.hidden && button.offsetParent !== null);
  }

  function moveDirectoryFocus(current, delta) {
    const buttons = visibleButtons();
    if (!buttons.length) return;
    const index = Math.max(0, buttons.indexOf(current));
    const next = buttons[(index + delta + buttons.length) % buttons.length];
    next?.focus({preventScroll:true});
    next?.scrollIntoView({block:'nearest'});
  }

  list.addEventListener('keydown', event => {
    const button = event.target.closest('.ck-list-button[data-id]');
    if (!button) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveDirectoryFocus(button, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveDirectoryFocus(button, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      visibleButtons()[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      visibleButtons().at(-1)?.focus();
    }
  });

  search.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    const first = visibleButtons()[0];
    if (!first) return;
    event.preventDefault();
    first.focus();
  });

  function protocolSummary() {
    const title = text(detail.querySelector('.ck-detail-head h2'));
    const summary = text(detail.querySelector('.ck-detail-head > div > .ck-summary')) || text(detail.querySelector('.ck-detail-head .ck-summary'));
    const firstActions = [...detail.querySelectorAll('#ck-doctor-now .ck-step-action')].map(text).filter(Boolean);
    const redFlags = [...detail.querySelectorAll('#ck-doctor-redflags .ck-info-card')]
      .map(card => text(card.querySelectorAll('span')[1] || card)).filter(Boolean);
    const referralRows = [...detail.querySelectorAll('#ck-doctor-referral .ck-summary')].map(text).filter(Boolean);
    const doNotDo = [...detail.querySelectorAll('#ck-doctor-donotdo .ck-info-card')]
      .map(card => text(card.querySelectorAll('span')[1] || card)).filter(Boolean);

    const blocks = [
      title ? `PROTOKOLLI: ${title}` : '',
      summary ? `Përmbledhje: ${summary}` : '',
      firstActions.length ? `\nVEPRIMI TANI\n${firstActions.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '',
      redFlags.length ? `\nRED FLAGS\n${redFlags.map(item => `• ${item}`).join('\n')}` : '',
      referralRows.length ? `\nREFERIMI\n${referralRows.join('\n')}` : '',
      doNotDo.length ? `\nMOS BËJ\n${doNotDo.map(item => `• ${item}`).join('\n')}` : '',
      '\n— Përmbledhje e protokollit, jo handover specifik i pacientit.',
    ].filter(Boolean);
    return blocks.join('\n');
  }

  async function copyProtocol(button, status) {
    const value = protocolSummary();
    if (!value.trim()) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand('copy');
        area.remove();
      } catch {}
    }
    button.textContent = ok ? 'U kopjua ✓' : 'Kopjimi dështoi';
    if (status) status.textContent = ok ? 'Përmbledhja e protokollit u kopjua.' : 'Nuk u kopjua.';
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = 'Kopjo protokollin';
      if (status?.isConnected) status.textContent = '';
    }, 2200);
  }

  function installCopyAction() {
    const consoleEl = detail.querySelector('.ck-doctor-console');
    const actions = consoleEl?.querySelector('.ck-doctor-source-actions');
    if (!actions || actions.querySelector('[data-ck-copy-protocol]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.ckCopyProtocol = '1';
    button.textContent = 'Kopjo protokollin';
    button.title = 'Kopjon vetëm përmbledhjen e protokollit; jo të dhëna të pacientit.';
    const status = actions.querySelector('.ck-doctor-copy-status');
    actions.insertBefore(button, status || null);
    button.addEventListener('click', () => copyProtocol(button, status));
  }

  let listFrame = 0;
  const listObserver = new MutationObserver(() => {
    cancelAnimationFrame(listFrame);
    listFrame = requestAnimationFrame(decorateDirectory);
  });
  listObserver.observe(list, {childList:true, subtree:true});

  let detailFrame = 0;
  const detailObserver = new MutationObserver(() => {
    cancelAnimationFrame(detailFrame);
    detailFrame = requestAnimationFrame(installCopyAction);
  });
  detailObserver.observe(detail, {childList:true, subtree:false});

  decorateDirectory();
  installCopyAction();
})();
