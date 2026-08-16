(() => {
  'use strict';

  const grid = document.getElementById('blogGrid');
  const searchInput = document.getElementById('blogSearchInput');
  const filterList = document.getElementById('blogFilterList');
  const visibleCount = document.getElementById('blogVisibleCount');
  const totalReading = document.getElementById('blogTotalReading');
  const topicCount = document.getElementById('blogTopicCount');
  const publishedCount = document.getElementById('blogPublishedCount');
  const emptyState = document.getElementById('blogFilterEmpty');

  if (!grid || !searchInput || !filterList) return;

  let activeFilter = 'all';
  let initialized = false;

  const normalize = (value) => String(value || '')
    .toLocaleLowerCase('sq-AL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  function cards() {
    return Array.from(grid.querySelectorAll('.blog-card'));
  }

  function categoryOf(card) {
    return card.querySelector('.blog-card__category')?.textContent?.trim() || 'Blog';
  }

  function searchableText(card) {
    return normalize([
      card.querySelector('h2')?.textContent,
      card.querySelector('.blog-card__excerpt')?.textContent,
      categoryOf(card),
      card.querySelector('.blog-card__author-name')?.textContent,
    ].filter(Boolean).join(' '));
  }

  function readingMinutes(card) {
    const text = card.querySelector('.blog-card__time')?.textContent || '';
    const match = text.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function buildFilters(items) {
    const categories = [...new Set(items.map(categoryOf).filter(Boolean))];
    filterList.innerHTML = '';

    const makeButton = (label, value, pressed = false) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'blog-filter';
      button.dataset.blogFilter = value;
      button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      button.textContent = label;
      button.addEventListener('click', () => {
        activeFilter = value;
        filterList.querySelectorAll('.blog-filter').forEach((item) => {
          item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
        });
        applyFilters();
      });
      return button;
    };

    filterList.appendChild(makeButton('Të gjitha', 'all', true));
    categories.forEach((category) => {
      filterList.appendChild(makeButton(category, normalize(category)));
    });

    if (topicCount) topicCount.textContent = String(categories.length);
  }

  function updatePulse(items) {
    if (publishedCount) publishedCount.textContent = String(items.length);
    if (totalReading) {
      const total = items.reduce((sum, card) => sum + readingMinutes(card), 0);
      totalReading.textContent = total ? `${total} min` : '—';
    }
  }

  function applyFilters() {
    const query = normalize(searchInput.value);
    const items = cards();
    let shown = 0;

    items.forEach((card) => {
      const matchesSearch = !query || searchableText(card).includes(query);
      const matchesCategory = activeFilter === 'all' || normalize(categoryOf(card)) === activeFilter;
      const visible = matchesSearch && matchesCategory;
      card.classList.toggle('is-filtered-out', !visible);
      card.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if (visible) shown += 1;
    });

    if (visibleCount) visibleCount.textContent = String(shown);
    if (emptyState) emptyState.hidden = shown !== 0;
  }

  function revealCards(items) {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach((card) => card.classList.add('is-revealed'));
      return;
    }

    items.forEach((card) => card.classList.add('is-reveal-pending'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('is-reveal-pending');
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '40px 0px -20px' });
    items.forEach((card) => observer.observe(card));
  }

  function initialize() {
    const items = cards();
    if (!items.length || initialized) return false;
    initialized = true;
    buildFilters(items);
    updatePulse(items);
    applyFilters();
    revealCards(items);
    return true;
  }

  searchInput.addEventListener('input', applyFilters);
  searchInput.addEventListener('search', applyFilters);

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'k') {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (event.key === 'Escape' && document.activeElement === searchInput && searchInput.value) {
      searchInput.value = '';
      applyFilters();
    }
  });

  if (!initialize()) {
    const observer = new MutationObserver(() => {
      if (initialize()) observer.disconnect();
    });
    observer.observe(grid, { childList: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }
})();
