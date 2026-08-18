(() => {
  'use strict';

  const list = document.getElementById('emergencyList');
  if (!list) return;

  const QUERY = `*[_type == "emergencyProtocol" && reviewStatus != "archived"]{
    _id,triageLevel
  }`;
  const rank = new Map();
  const TRIAGE_RANK = {critical: 0, 'very-urgent': 1, urgent: 2};

  function currentIds() {
    return [...list.querySelectorAll('.ck-list-button[data-id]')].map(button => button.dataset.id || '');
  }

  function sortDirectory() {
    const buttons = [...list.querySelectorAll('.ck-list-button[data-id]')];
    if (buttons.length < 2 || !rank.size) return;

    const sorted = [...buttons].sort((a, b) => {
      const ar = rank.get(a.dataset.id) ?? 99;
      const br = rank.get(b.dataset.id) ?? 99;
      if (ar !== br) return ar - br;
      return String(a.querySelector('strong')?.textContent || '')
        .localeCompare(String(b.querySelector('strong')?.textContent || ''), 'sq');
    });

    const before = currentIds();
    const after = sorted.map(button => button.dataset.id || '');
    if (before.every((id, index) => id === after[index])) return;

    const fragment = document.createDocumentFragment();
    sorted.forEach(button => fragment.appendChild(button));
    list.appendChild(fragment);
  }

  async function loadPriority() {
    try {
      if (!window.MedIndexSanity?.query) return;
      const rows = await window.MedIndexSanity.query(QUERY);
      if (!Array.isArray(rows)) return;
      rows.forEach(row => {
        if (!row?._id) return;
        rank.set(row._id, TRIAGE_RANK[row.triageLevel] ?? 99);
      });
      sortDirectory();
    } catch (error) {
      console.warn('Urgjencat: renditja sipas triazhit nuk u ngarkua.', error);
    }
  }

  let frame = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(sortDirectory);
  });
  observer.observe(list, {childList:true});

  loadPriority();
})();
