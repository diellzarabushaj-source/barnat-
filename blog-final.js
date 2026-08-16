(() => {
  'use strict';

  const body = document.body;
  const grid = document.getElementById('blogGrid');
  if (!body) return;

  const params = new URLSearchParams(window.location.search);
  const isDetail = Boolean(params.get('slug'));
  body.classList.toggle('blog-detail-mode', isDetail);

  if (!grid || isDetail) return;

  function applyEditorialDensity() {
    const cards = Array.from(grid.querySelectorAll('.blog-card'));
    if (!cards.length) return false;

    body.classList.toggle('blog-compact-library', cards.length <= 3);
    body.classList.toggle('blog-has-two-stories', cards.length === 2);

    cards.forEach((card, index) => {
      card.dataset.articleIndex = String(index + 1).padStart(2, '0');
    });
    return true;
  }

  if (!applyEditorialDensity()) {
    const observer = new MutationObserver(() => {
      if (applyEditorialDensity()) observer.disconnect();
    });
    observer.observe(grid, { childList: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }
})();
