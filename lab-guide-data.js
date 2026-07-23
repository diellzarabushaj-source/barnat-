(() => {
  'use strict';
  async function decode() {
    if (typeof DecompressionStream !== 'function') throw new Error('Shfletuesi nuk e mbështet dekompresimin e dataset-it laboratorik.');
    const encoded = (window.__MEDINDEX_LAB_GUIDE_CHUNKS || []).join('');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const data = JSON.parse(await new Response(stream).text());
    window.MEDINDEX_LAB_GUIDE = data;
    delete window.__MEDINDEX_LAB_GUIDE_CHUNKS;
    return data;
  }
  window.MEDINDEX_LAB_GUIDE_READY = decode();
})();
