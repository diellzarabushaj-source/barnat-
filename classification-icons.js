(() => {
  'use strict';

  const ICONS = {
    A:'digestive', B:'blood', C:'heart', D:'skin', G:'reproductive', H:'endocrine',
    J:'bacteria', L:'oncology', M:'bone', N:'brain', P:'parasite', R:'lungs', S:'eye', V:'medicine'
  };
  let frame = 0;

  function addStyles() {
    if (document.getElementById('atcMedicalIconStyles')) return;
    const style = document.createElement('style');
    style.id = 'atcMedicalIconStyles';
    style.textContent = `
      .atc-card{isolation:isolate}.atc-card h3{padding-right:76px;min-height:48px}.atc-card::before{right:78px!important;top:19px!important;z-index:3}
      .atc-medical-icon{position:absolute;top:14px;right:14px;width:60px;height:60px;display:grid;place-items:center;border:1px solid rgba(21,94,99,.16);border-radius:16px;background:linear-gradient(145deg,#fff,#edf5f2);color:#0d6266;box-shadow:0 8px 20px rgba(13,61,64,.08);pointer-events:none;z-index:2}
      .atc-medical-icon svg{width:35px;height:35px}.atc-medical-icon b{font:850 1.1rem var(--mono);opacity:.55}
      html[data-theme=dark] .atc-medical-icon{background:linear-gradient(145deg,#1c2c2f,#122023);border-color:#385053;color:#83cbcd;box-shadow:0 8px 22px rgba(0,0,0,.25)}
      @media(max-width:650px){.atc-medical-icon{width:54px;height:54px;top:13px;right:13px}.atc-card h3{padding-right:66px}.atc-card::before{right:70px!important;top:17px!important}}
    `;
    document.head.appendChild(style);
  }

  function decorateCard(card) {
    if (card.querySelector('.atc-medical-icon')) return;
    const group = String(card.dataset.code || '').charAt(0).toUpperCase();
    const holder = document.createElement('span');
    holder.className = 'atc-medical-icon';
    holder.setAttribute('aria-hidden', 'true');
    holder.innerHTML = window.MedIndexIcons?.svg(ICONS[group]) || `<b>${group}</b>`;
    card.appendChild(holder);
  }

  function decorate() {
    frame = 0;
    addStyles();
    document.querySelectorAll('#cardGrid .atc-card').forEach(decorateCard);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(decorate);
  }

  function init() {
    decorate();
    const grid = document.getElementById('cardGrid');
    if (grid) new MutationObserver(schedule).observe(grid, { childList:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
