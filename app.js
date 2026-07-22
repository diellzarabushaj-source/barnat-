(async () => {
  // Ngarko databazën e plotë nga API-ja e Vercel-it. Kjo e zëvendëson
  // automatikisht çdo pjesë statike të vjetër ose të paplotë të regjistrit.
  const registryResponse = await fetch('/api/registry?version=20260722-2', {
    cache: 'no-store',
  });

  if(!registryResponse.ok){
    throw new Error('Databaza e barnave nuk u ngarkua (' + registryResponse.status + ')');
  }

  const registryCode = await registryResponse.text();
  (0, eval)(registryCode);

  if(!Array.isArray(window.DRUG_DATA_PARTS) || window.DRUG_DATA_PARTS.length === 0){
    throw new Error(window.REGISTRY_LOAD_ERROR || 'API-ja nuk ktheu të dhënat e barnave.');
  }

  const files = [
    './app-parts/part-01.txt',
    './app-parts/part-02.txt',
    './app-parts/part-03.txt',
    './app-parts/part-04.txt',
    './app-parts/part-05.txt',
    './app-parts/part-06.txt',
    './app-parts/part-07.txt',
  ];

  const responses = await Promise.all(files.map(file => fetch(file, { cache: 'no-store' })));
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
