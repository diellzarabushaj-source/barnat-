(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const state = { manifest:{ categories:[], documents:[] } };
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const safeHttpsUrl = value => {
    try {
      const url = new URL(text(value));
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  };

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const button = $('#themeButton');
    if (button) {
      button.textContent = theme === 'dark' ? '☀' : '☾';
      button.setAttribute('aria-label', theme === 'dark' ? 'Aktivizo temën e çelët' : 'Aktivizo temën e errët');
    }
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    applyTheme(['dark', 'light'].includes(saved) ? saved : (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
    $('#themeButton')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function normalizeManifest(raw) {
    const categories = Array.isArray(raw?.categories)
      ? raw.categories.map(category => ({ id:text(category?.id), label:text(category?.label) })).filter(category => category.id && category.label)
      : [];
    const knownCategories = new Set(categories.map(category => category.id));
    const seenIds = new Set();
    const documents = Array.isArray(raw?.documents) ? raw.documents.flatMap((document, index) => {
      const id = text(document?.id);
      const title = text(document?.title);
      const type = fold(document?.type);
      const category = text(document?.category);
      if (!id || !title || seenIds.has(id) || !['pdf', 'docx', 'html', 'txt'].includes(type)) return [];
      seenIds.add(id);
      return [{
        id,
        title,
        type,
        category:knownCategories.has(category) ? category : '',
        order:Number.isFinite(Number(document?.order)) ? Number(document.order) : index + 1,
        archived:Boolean(document?.archived),
        officialUrl:safeHttpsUrl(document?.officialUrl),
        blobUrl:safeHttpsUrl(document?.blobUrl),
        contentSha256:/^[a-f0-9]{64}$/i.test(text(document?.contentSha256)) ? text(document.contentSha256) : '',
        bytes:Number.isFinite(Number(document?.bytes)) && Number(document.bytes) >= 0 ? Number(document.bytes) : 0,
        keywords:Array.isArray(document?.keywords) ? document.keywords.map(text).filter(Boolean) : [],
      }];
    }) : [];
    documents.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'sq'));
    return { categories, documents };
  }

  function categoryLabel(id) {
    return state.manifest.categories.find(category => category.id === id)?.label || 'Pa kategori';
  }

  function rowMarkup(document) {
    const mirrored = Boolean(document.blobUrl && document.contentSha256);
    const official = document.officialUrl
      ? `<a href="${esc(document.officialUrl)}" target="_blank" rel="noopener noreferrer external">Burimi zyrtar</a>`
      : '<span class="clinical-action-disabled" aria-disabled="true">Burimi zyrtar mungon</span>';
    return `<article class="clinical-row" data-protocol-id="${esc(document.id)}">
      <div>
        <h2>${esc(document.order)}. ${esc(document.title)}</h2>
        <div class="clinical-row-meta"><span class="clinical-chip">${esc(categoryLabel(document.category))}</span><span class="clinical-chip">${esc(document.type.toUpperCase())}</span>${document.archived ? '<span class="clinical-chip is-warning">Arkivore</span>' : ''}</div>
        <p>${mirrored ? `Kopje private e verifikuar · ${document.bytes.toLocaleString('sq-AL')} bytes` : 'Burimi zyrtar është gati; kopja private aktivizohet pas sinkronizimit të Blob.'}</p>
      </div>
      <div class="clinical-actions">
        ${official}
        ${mirrored ? `<a class="primary" href="/api/protocol-document?id=${encodeURIComponent(document.id)}" ${document.type === 'pdf' ? 'target="_blank" rel="noopener"' : ''}>Hape dokumentin</a>` : '<button class="primary" type="button" disabled title="Kërkon sinkronizimin e Blob">Hape dokumentin</button>'}
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
      const searchable = `${document.title} ${categoryLabel(document.category)} ${document.type} ${document.keywords.join(' ')}`;
      return statusMatch
        && (!category || document.category === category)
        && (!type || document.type === type)
        && (!query || fold(searchable).includes(query));
    });
    $('#protocolCount').textContent = documents.length;
    $('#protocolStatus').textContent = `${documents.length} nga ${state.manifest.documents.length} dokumente`;
    $('#protocolList').innerHTML = documents.length ? documents.map(rowMarkup).join('') : '<div class="clinical-empty">Nuk u gjet asnjë dokument për këta filtra.</div>';
  }

  async function load() {
    const status = $('#protocolStatus');
    try {
      const response = await fetch('/data/protocols.json', { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } });
      if (!response.ok) throw new Error(`Manifesti ${response.status}`);
      const manifest = normalizeManifest(await response.json());
      if (!manifest.documents.length) throw new Error('Manifesti nuk përmban dokumente të vlefshme.');
      state.manifest = manifest;
      $('#protocolCategory').innerHTML = '<option value="">Të gjitha kategoritë</option>'
        + state.manifest.categories.map(category => `<option value="${esc(category.id)}">${esc(category.label)}</option>`).join('');
      render();
    } catch (error) {
      if (status) status.textContent = text(error.message) || 'Manifesti nuk u ngarkua.';
      $('#protocolList').innerHTML = '<div class="clinical-empty"><strong>Manifesti i protokolleve nuk u ngarkua.</strong><button id="protocolRetry" type="button">Provo përsëri</button></div>';
      $('#protocolRetry')?.addEventListener('click', load, { once:true });
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