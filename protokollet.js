(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const state = { manifest:{ categories:[], documents:[] } };
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const button = $('#themeButton');
    if (button) button.textContent = theme === 'dark' ? '☀' : '☾';
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    applyTheme(['dark', 'light'].includes(saved) ? saved : (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
    $('#themeButton')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function categoryLabel(id) {
    return state.manifest.categories.find(category => category.id === id)?.label || id;
  }

  function rowMarkup(document) {
    const mirrored = Boolean(document.blobUrl && document.contentSha256);
    return `<article class="clinical-row">
      <div>
        <h2>${document.order}. ${esc(document.title)}</h2>
        <div class="clinical-row-meta"><span class="clinical-chip">${esc(categoryLabel(document.category))}</span><span class="clinical-chip">${document.type.toUpperCase()}</span>${document.archived ? '<span class="clinical-chip is-warning">Arkivore</span>' : ''}</div>
        <p>${mirrored ? `Kopje private e verifikuar · ${Number(document.bytes || 0).toLocaleString('sq-AL')} bytes` : 'Burimi zyrtar është gati; kopja private aktivizohet pas sinkronizimit të Blob.'}</p>
      </div>
      <div class="clinical-actions">
        <a href="${esc(document.officialUrl)}" target="_blank" rel="noopener noreferrer">Burimi zyrtar</a>
        ${mirrored ? `<a class="primary" href="/api/protocol-document?id=${encodeURIComponent(document.id)}" ${document.type === 'pdf' ? 'target="_blank"' : ''}>Hape dokumentin</a>` : '<button class="primary" type="button" disabled title="Kërkon sinkronizimin e Blob">Hape dokumentin</button>'}
      </div>
    </article>`;
  }

  function render() {
    const query = fold($('#protocolSearch')?.value);
    const category = $('#protocolCategory')?.value || '';
    const type = $('#protocolType')?.value || '';
    const archive = $('#protocolArchive')?.value || 'current';
    const documents = state.manifest.documents.filter(document => {
      const statusMatch = archive === 'all' || (archive === 'archived' ? document.archived : !document.archived);
      return statusMatch
        && (!category || document.category === category)
        && (!type || document.type === type)
        && (!query || fold(`${document.title} ${categoryLabel(document.category)}`).includes(query));
    });
    $('#protocolCount').textContent = documents.length;
    $('#protocolStatus').textContent = `${documents.length} nga ${state.manifest.documents.length} dokumente`;
    $('#protocolList').innerHTML = documents.length ? documents.map(rowMarkup).join('') : '<div class="clinical-empty">Nuk u gjet asnjë dokument për këta filtra.</div>';
  }

  async function load() {
    try {
      const response = await fetch('/data/protocols.json', { credentials:'same-origin', cache:'no-cache' });
      if (!response.ok) throw new Error(`Manifesti ${response.status}`);
      state.manifest = await response.json();
      $('#protocolCategory').innerHTML = '<option value="">Të gjitha kategoritë</option>'
        + state.manifest.categories.map(category => `<option value="${esc(category.id)}">${esc(category.label)}</option>`).join('');
      render();
    } catch (error) {
      $('#protocolStatus').textContent = error.message;
      $('#protocolList').innerHTML = '<div class="clinical-empty">Manifesti i protokolleve nuk u ngarkua.</div>';
    }
  }

  function init() {
    initTheme();
    ['protocolSearch', 'protocolCategory', 'protocolType', 'protocolArchive'].forEach(id => {
      document.getElementById(id)?.addEventListener(id === 'protocolSearch' ? 'input' : 'change', render);
    });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
