(async () => {
  const hasRegistryData = () =>
    Array.isArray(window.DRUG_DATA_PARTS) && window.DRUG_DATA_PARTS.length > 0;

  async function loadGoogleDriveFallback() {
    const registryResponse = await fetch('/api/registry?fallback=1&version=20260722-4', {
      cache: 'no-store',
    });

    if(!registryResponse.ok){
      throw new Error('Fallback-i i Google Drive dështoi (' + registryResponse.status + ')');
    }

    const registryCode = await registryResponse.text();
    window.DRUG_DATA_PARTS = [];
    window.REGISTRY_LOAD_ERROR = '';
    (0, eval)(registryCode);

    if(!hasRegistryData()){
      throw new Error(window.REGISTRY_LOAD_ERROR || 'Google Drive nuk ktheu të dhënat e barnave.');
    }

    window.REGISTRY_DATA_SOURCE = 'google-drive-fallback';
  }

  // Rruga primare: data/registry-data.js ngarkohet direkt nga Vercel CDN në index.html.
  // Vetëm kur skedari statik mungon ose është i dëmtuar përdoret Google Drive.
  if(hasRegistryData()){
    window.REGISTRY_DATA_SOURCE = 'static-cdn';
  } else {
    console.warn('Databaza statike mungon; po përdoret Google Drive si fallback.');
    await loadGoogleDriveFallback();
  }

  const files = [
    './app-parts/part-01.txt?v=20260722-4',
    './app-parts/part-02.txt?v=20260722-4',
    './app-parts/part-03.txt?v=20260722-4',
    './app-parts/part-04.txt?v=20260722-4',
    './app-parts/part-05.txt?v=20260722-4',
    './app-parts/part-06.txt?v=20260722-4',
    './app-parts/part-07.txt?v=20260722-4',
  ];

  // Këto janë skedarë statikë dhe duhen marrë nga cache/CDN për hapje më të shpejtë.
  const responses = await Promise.all(files.map(file => fetch(file, { cache: 'force-cache' })));
  responses.forEach((response, index) => {
    if(!response.ok) throw new Error('Nuk u ngarkua ' + files[index] + ' (' + response.status + ')');
  });

  const code = (await Promise.all(responses.map(response => response.text()))).join('');
  (0, eval)(code);
})().catch(error => {
  console.error(error);
  const count = document.getElementById('countBadge');
  if(count) count.textContent = 'Gabim në databazë';
  const body = document.getElementById('tbody');
  if(body) body.innerHTML = '<tr><td colspan="30" class="empty-state">Databaza e barnave nuk u ngarkua. Provo rifreskimin e faqes pas pak.</td></tr>';
});
