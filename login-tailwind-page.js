(() => {
  'use strict';

  const body = document.body;
  const panel = document.getElementById('loginPanel');
  const openButton = document.getElementById('openLoginPanel');
  const closeButton = document.getElementById('closeLoginPanel');
  const backdrop = document.getElementById('loginBackdrop');
  let returnFocus = null;

  if (!body || !panel || !openButton || !closeButton || !backdrop) return;

  function openPanel() {
    returnFocus = document.activeElement;
    body.classList.add('mi-login-panel-open');
    panel.setAttribute('aria-hidden', 'false');
    openButton.setAttribute('aria-expanded', 'true');
    window.setTimeout(() => closeButton.focus(), 30);
  }

  function closePanel() {
    body.classList.remove('mi-login-panel-open');
    panel.setAttribute('aria-hidden', 'true');
    openButton.setAttribute('aria-expanded', 'false');
    const target = returnFocus instanceof HTMLElement ? returnFocus : openButton;
    window.setTimeout(() => target.focus(), 30);
  }

  openButton.addEventListener('click', openPanel);
  closeButton.addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && body.classList.contains('mi-login-panel-open')) closePanel();
  });

  if (new URLSearchParams(location.search).get('fallback') === '1' || location.hash === '#hyr') {
    window.setTimeout(openPanel, 60);
  }
})();
