(() => {
  'use strict';
  const panel = document.getElementById('lunaPanel');
  const form = document.getElementById('lunaSearchForm');
  const input = document.getElementById('lunaQuestion');
  const submit = document.getElementById('lunaSubmit');
  const status = document.getElementById('lunaStatus');
  const list = document.getElementById('lunaResults');
  if (!panel || !form || !input || !submit || !status || !list) return;

  let controller = null;
  const setStatus = message => { status.textContent = message; };
  function text(tag, value, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = String(value || '');
    return el;
  }
  function showInRegistry(drug) {
    const registryInput = document.getElementById('searchInput');
    if (!registryInput) return;
    registryInput.value = drug.tradeName || drug.activeSubstance || drug.pdid || '';
    registryInput.dispatchEvent(new Event('input', { bubbles:true }));
    registryInput.scrollIntoView({ behavior:'smooth', block:'center' });
    registryInput.focus({ preventScroll:true });
  }
  function render(data) {
    list.replaceChildren();
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
      setStatus('Nuk u gjet bar i publikuar për këtë kërkesë. Provo një emër ose substancë më specifike.');
      return;
    }
    setStatus(`${results.length} rezultate të verifikuara në regjistrin DRx. Luna nuk jep rekomandime dozimi.`);
    const fragment = document.createDocumentFragment();
    results.forEach(drug => {
      const card = document.createElement('li');
      card.className = 'luna-result';
      const detail = document.createElement('div');
      detail.append(text('strong', drug.tradeName || drug.activeSubstance));
      detail.append(text('small', [drug.activeSubstance, drug.strength, drug.form].filter(Boolean).join(' · ')));
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'button button-secondary';
      action.textContent = 'Në regjistër';
      action.addEventListener('click', () => showInRegistry(drug));
      card.append(detail, action);
      fragment.append(card);
    });
    list.append(fragment);
  }
  async function initialize() {
    try {
      const response = await fetch('/api/luna-search?status=1', { credentials:'same-origin', cache:'no-store' });
      const data = await response.json();
      if (response.ok && data.enabled === true) panel.hidden = false;
    } catch {
      // No Luna key or no network: preserve the existing standard registry.
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (question.length < 2) { setStatus('Shkruaj një emër bari ose substancë.'); return; }
    controller?.abort();
    controller = new AbortController();
    submit.disabled = true;
    list.replaceChildren();
    setStatus('Luna po kërkon në regjistrin DRx…');
    try {
      const response = await fetch('/api/luna-search', {
        method:'POST',
        credentials:'same-origin',
        cache:'no-store',
        signal:controller.signal,
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Kërkimi nuk u krye.');
      render(data);
    } catch (error) {
      if (error.name !== 'AbortError') setStatus(error.message || 'Kërkimi dështoi.');
    } finally {
      submit.disabled = false;
    }
  });
  initialize();
})();
