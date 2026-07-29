(() => {
  'use strict';

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function showRange(result) {
    const range = text(result?.calculatedDoseRange);
    if (!range) return;
    setTimeout(() => {
      const status = document.getElementById('rxStatus');
      if (status) {
        status.textContent = `Kalkulatori pediatrik: ${range}. Ky është diapazon i verifikuar; zgjidh dozën përfundimtare sipas indikacionit dhe protokollit.`;
        status.className = 'rx-status is-error';
      }
      const chip = document.querySelector('#rxSelectedDrugs .rx-drug-chip:last-child > span');
      if (chip && !chip.querySelector('.rx-calculated-range')) {
        const marker = document.createElement('small');
        marker.className = 'rx-calculated-range';
        marker.textContent = `Kalkulator: ${range} · kërkon zgjedhje klinike`;
        chip.appendChild(marker);
      }
    }, 0);
  }

  function install() {
    const engine = window.MedIndexDosageEngine;
    if (!engine || engine.__rangeFeedback) return;
    const original = engine.prescriptionTransfer.bind(engine);
    engine.prescriptionTransfer = (...args) => {
      const result = original(...args);
      showRange(result);
      return result;
    };
    engine.__rangeFeedback = true;

    const style = document.createElement('style');
    style.textContent = '.rx-drug-chip>span{display:grid;gap:2px}.rx-calculated-range{display:block;color:#9a4b08;font-size:10px;font-weight:750;line-height:1.35}';
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();