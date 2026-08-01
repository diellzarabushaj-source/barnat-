(() => {
  'use strict';

  function redirectToRegistry() {
    const target = new URL('/index.html', location.origin);
    const incoming = new URLSearchParams(location.search);
    incoming.forEach((value, key) => target.searchParams.set(key, value));

    const legacyHash = decodeURIComponent(location.hash.slice(1) || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    if (/^[A-Z]\d{2}/.test(legacyHash)) {
      target.searchParams.set('atc', legacyHash.slice(0, 3));
    } else if (/^[A-Z]$/.test(legacyHash)) {
      target.searchParams.set('atc', legacyHash);
    }

    target.searchParams.delete('classification');
    location.replace(`${target.pathname}${target.search}`);
  }

  if (document.readyState === 'complete') redirectToRegistry();
  else window.addEventListener('load', redirectToRegistry, { once:true });
})();
