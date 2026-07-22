(async () => {
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
  const body = document.getElementById('tbody');
  if(body) body.innerHTML = '<tr><td colspan="30" class="empty-state">Gabim gjatë ngarkimit të aplikacionit.</td></tr>';
});
