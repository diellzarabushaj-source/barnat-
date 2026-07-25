(() => {
  'use strict';

  const GRID_ID = 'chapterGrid';
  const DECORATED = 'premiumIcdCard';

  const THEMES = [
    ['#065f5b','#0f9b8e','#38d6c1'], ['#5b21b6','#8b5cf6','#c084fc'],
    ['#9f1239','#e11d48','#fb7185'], ['#92400e','#f59e0b','#fcd34d'],
    ['#4338ca','#6366f1','#a5b4fc'], ['#164e63','#0891b2','#67e8f9'],
    ['#9d174d','#db2777','#f9a8d4'], ['#7c2d12','#ea580c','#fdba74'],
    ['#991b1b','#dc2626','#f87171'], ['#075985','#0284c7','#7dd3fc'],
    ['#166534','#22c55e','#86efac'], ['#831843','#be185d','#f9a8d4'],
    ['#3730a3','#4f46e5','#a5b4fc'], ['#115e59','#14b8a6','#5eead4'],
    ['#86198f','#c026d3','#e879f9'], ['#9a3412','#f97316','#fdba74'],
    ['#4c1d95','#7c3aed','#c4b5fd'], ['#334155','#64748b','#cbd5e1'],
    ['#7f1d1d','#ef4444','#fb923c'], ['#713f12','#d97706','#fbbf24'],
    ['#14532d','#16a34a','#86efac'], ['#1e293b','#475569','#94a3b8'],
  ];

  const ICONS = [
    'parasite','oncology','blood','endocrine','brain','nervous','eye','ear','heart','lungs','digestive',
    'skin','bone','kidney','pregnancy','baby','dna','stethoscope','injury','external','shield','code'
  ];

  const CUSTOM_ICONS = {
    nervous:'<path d="M9 4a3 3 0 0 0-3 3v2a3 3 0 0 0-2 3 3 3 0 0 0 2 3v2a3 3 0 0 0 3 3h2V4H9Z"/><path d="M15 4a3 3 0 0 1 3 3v2a3 3 0 0 1 2 3 3 3 0 0 1-2 3v2a3 3 0 0 1-3 3h-2V4h2Z"/><path d="M8 9h3M13 8h3M8 15h3M13 16h3"/>',
  };

  const text = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[character]));

  function iconSvg(name) {
    if (CUSTOM_ICONS[name]) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CUSTOM_ICONS[name]}</svg>`;
    }
    if (window.MedIndexIcons?.svg) return window.MedIndexIcons.svg(name, 'icd-aura-icon-svg');
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-5"/></svg>';
  }

  function themeStyle(index) {
    const [deep, accent, glow] = THEMES[index % THEMES.length];
    return `--icd-deep:${deep};--icd-accent:${accent};--icd-glow:${glow}`;
  }

  function parseCard(card, index) {
    const roman = text(card.querySelector('.icd-roman')?.textContent) || String(index + 1);
    const range = text(card.querySelector('.med-card-code')?.textContent);
    const title = text(card.querySelector('h3')?.textContent);
    const chips = [...card.querySelectorAll('.med-chip')].map(node => text(node.textContent));
    const count = chips.find(value => /kode/i.test(value)) || '';
    return { roman, range, title, count };
  }

  function decorateCard(card, index) {
    if (!(card instanceof HTMLElement) || card.dataset[DECORATED] === '1') return;
    const data = parseCard(card, index);
    if (!data.title) return;

    card.dataset[DECORATED] = '1';
    card.classList.add('icd-aura-card');
    card.style.cssText += `;${themeStyle(index)}`;
    card.setAttribute('aria-label', `Hap kapitullin ${data.roman}: ${data.title}${data.range ? `, ${data.range}` : ''}`);

    const icon = ICONS[index % ICONS.length];
    card.innerHTML = `
      <span class="icd-aura-light" aria-hidden="true"></span>
      <span class="icd-aura-orb icd-aura-orb-one" aria-hidden="true"></span>
      <span class="icd-aura-orb icd-aura-orb-two" aria-hidden="true"></span>
      <span class="icd-aura-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="icd-aura-topline">
        <span class="icd-aura-icon">${iconSvg(icon)}</span>
        <span class="icd-aura-roman"><small>Kapitulli</small><strong>${esc(data.roman)}</strong></span>
      </span>
      <span class="icd-aura-copy">
        <span class="icd-aura-kicker">ICD-10 · ${esc(data.range || 'Kapitull')}</span>
        <span class="icd-aura-title">${esc(data.title)}</span>
      </span>
      <span class="icd-aura-meta">
        ${data.range ? `<span class="icd-aura-range">${esc(data.range)}</span>` : ''}
        ${data.count ? `<span class="icd-aura-count">${esc(data.count)}</span>` : ''}
      </span>
      <span class="icd-aura-action">
        <span>Hap kapitullin</span>
        <span class="icd-aura-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </span>`;
  }

  function decorateGrid() {
    const grid = document.getElementById(GRID_ID);
    if (!grid) return;
    [...grid.querySelectorAll('.icd-chapter-card')].forEach(decorateCard);
  }

  function init() {
    const grid = document.getElementById(GRID_ID);
    if (!grid) return;
    decorateGrid();
    const observer = new MutationObserver(() => requestAnimationFrame(decorateGrid));
    observer.observe(grid, { childList:true });
    window.addEventListener('pageshow', decorateGrid, { passive:true });
    window.dispatchEvent(new CustomEvent('medindex:icd-premium-cards-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
