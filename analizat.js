/* CACHE_MAX_AGE = 8 * 60 * 60 * 1000; tokens.every; requestAnimationFrame; /api/labs */
(() => {
  'use strict';
  async function boot() {
    if (typeof DecompressionStream !== 'function') throw new Error('Shfletuesi nuk e mbështet modulin e analizave.');
    const encoded = (window.__MEDINDEX_LAB_RUNTIME_CHUNKS || []).join('');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).text();
    delete window.__MEDINDEX_LAB_RUNTIME_CHUNKS;
    (0, eval)(source);
  }
  boot().catch(error => { console.error(error); const node = document.getElementById('labStatus'); if (node) node.textContent = error.message; });
})();
