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

  function updateAutoApplyCopy() {
    const info = document.querySelector('.protocol-info');
    if (info && info.dataset.autoApplyCopy !== '1') {
      info.dataset.autoApplyCopy = '1';
      info.innerHTML = 'MedIndex plotëson parashtesën dhe, kur ekziston vetëm <strong>një skemë e verifikuar që përputhet saktë</strong> me substancën, ATC-në, formën dhe fortësinë, plotëson vetë dozën, rrugën, frekuencën, kohëzgjatjen, <strong>D. No</strong> dhe <strong>S.</strong> Kur ka disa skema, ti e zgjedh manualisht. Çdo fushë mbetet e editueshme.';
    }

    const state = document.getElementById('dosageApiState');
    if (state && state.textContent.includes('Skema aplikohet vetëm pas konfirmimit tënd.')) {
      state.innerHTML = state.innerHTML.replace(
        'Skema aplikohet vetëm pas konfirmimit tënd.',
        'Përputhja e vetme dhe e saktë aplikohet automatikisht; kur ka disa skema, zgjedhja mbetet manuale.'
      );
    }
  }

  if (!document.querySelector('script[data-dosage-autoapply]')) {
    const script = document.createElement('script');
    script.src = './dosage-autoapply.js?v=20260722-2';
    script.dataset.dosageAutoapply = '1';
    script.defer = true;
    document.head.appendChild(script);
  }

  const observer = new MutationObserver(updateAutoApplyCopy);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateAutoApplyCopy, { once: true });
  else updateAutoApplyCopy();
})();
