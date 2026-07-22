(() => {
  function notify(message) {
    if (window.showProtocolToast) window.showProtocolToast(message);
    else console.warn(message);
  }

  function activeDrugRow() {
    return document.querySelector('.drug-actions-trigger[aria-expanded="true"]')?.closest('tr') || null;
  }

  document.addEventListener('click', event => {
    const action = event.target.closest('[data-drug-action="protocol"]');
    if (!action) return;
    const row = activeDrugRow();
    if (!row?.classList.contains('quality-blocked')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notify('Ky rresht është bllokuar nga kontrolli i cilësisë dhe nuk mund të shtohet në recetë pa verifikim.');
  }, true);

  document.addEventListener('change', event => {
    const checkbox = event.target.closest('.drug-select');
    if (!checkbox || !checkbox.closest('tr')?.classList.contains('quality-blocked')) return;
    checkbox.checked = false;
    event.preventDefault();
    event.stopImmediatePropagation();
    notify('Ky rresht është bllokuar nga kontrolli i cilësisë.');
  }, true);

  if (!document.querySelector('script[data-dosage-autoapply]')) {
    const script = document.createElement('script');
    script.src = './dosage-autoapply.js?v=20260722-1';
    script.dataset.dosageAutoapply = '1';
    script.defer = true;
    document.head.appendChild(script);
  }
})();
