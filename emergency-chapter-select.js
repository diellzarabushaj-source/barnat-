(() => {
  'use strict';

  const chapterSelect = document.getElementById('emergencyChapterSelect');
  const subchapterSelect = document.getElementById('emergencySubchapterSelect');
  const chapterNav = document.getElementById('emergencyChapterNav');
  const subchapterNav = document.getElementById('emergencySubchapterNav');
  const reset = document.getElementById('emergencyChapterReset');
  const subchapterWrap = document.getElementById('emergencySubchapterWrap');

  if (!chapterSelect || !subchapterSelect || !chapterNav || !subchapterNav || !reset || !subchapterWrap) return;

  let syncFrame = 0;
  let changing = false;

  const buttons = (root, selector) => [...root.querySelectorAll(selector)];

  function cleanButtonLabel(button) {
    const clone = button.cloneNode(true);
    clone.querySelectorAll('b').forEach(node => node.remove());
    return String(clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function countLabel(button) {
    const count = String(button.querySelector('b')?.textContent || '').trim();
    return count ? ` (${count})` : '';
  }

  function syncChapterSelect() {
    const rows = buttons(chapterNav, '[data-ck-chapter]');
    const active = rows.find(button => button.getAttribute('aria-pressed') === 'true');
    const options = rows.map(button => {
      const value = button.dataset.ckChapter || '';
      const order = String(button.querySelector(':scope > span')?.textContent || '').trim();
      const title = String(button.querySelector('strong')?.textContent || cleanButtonLabel(button)).trim();
      const prefix = order && order !== '•' ? `${order} · ` : '';
      return `<option value="${escapeHtml(value)}">${escapeHtml(`${prefix}${title}${countLabel(button)}`)}</option>`;
    }).join('');

    chapterSelect.innerHTML = `<option value="">Të gjithë kapitujt</option>${options}`;
    chapterSelect.value = active?.dataset.ckChapter || '';
    chapterSelect.disabled = rows.length === 0;
  }

  function syncSubchapterSelect() {
    const rows = buttons(subchapterNav, '[data-ck-subchapter]');
    const active = rows.find(button => button.getAttribute('aria-pressed') === 'true');
    const chapterChosen = Boolean(chapterSelect.value);

    const options = rows
      .filter(button => (button.dataset.ckSubchapter || '') !== '')
      .map(button => {
        const value = button.dataset.ckSubchapter || '';
        return `<option value="${escapeHtml(value)}">${escapeHtml(`${cleanButtonLabel(button)}${countLabel(button)}`)}</option>`;
      })
      .join('');

    subchapterSelect.innerHTML = `<option value="">Të gjithë nënkapitujt</option>${options}`;
    subchapterSelect.value = active?.dataset.ckSubchapter || '';
    subchapterSelect.disabled = !chapterChosen || rows.length <= 1;
    subchapterWrap.hidden = !chapterChosen;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function sync() {
    cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(() => {
      syncChapterSelect();
      syncSubchapterSelect();
    });
  }

  function clickChapter(value) {
    if (!value) {
      reset.click();
      return;
    }
    const button = buttons(chapterNav, '[data-ck-chapter]')
      .find(candidate => (candidate.dataset.ckChapter || '') === value);
    button?.click();
  }

  function clickSubchapter(value) {
    const button = buttons(subchapterNav, '[data-ck-subchapter]')
      .find(candidate => (candidate.dataset.ckSubchapter || '') === value);
    button?.click();
  }

  chapterSelect.addEventListener('change', () => {
    if (changing) return;
    changing = true;
    clickChapter(chapterSelect.value);
    requestAnimationFrame(() => {
      changing = false;
      sync();
      chapterSelect.focus({preventScroll: true});
    });
  });

  subchapterSelect.addEventListener('change', () => {
    if (changing) return;
    changing = true;
    clickSubchapter(subchapterSelect.value);
    requestAnimationFrame(() => {
      changing = false;
      sync();
      subchapterSelect.focus({preventScroll: true});
    });
  });

  const observer = new MutationObserver(sync);
  observer.observe(chapterNav, {childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed']});
  observer.observe(subchapterNav, {childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed']});

  sync();
})();
