(() => {
  'use strict';

  const ENDPOINT = '/api/media';
  const MAX_BYTES = 8 * 1024 * 1024;
  const ALLOWED = new Set(['image/png', 'image/webp', 'image/jpeg']);
  const $ = id => document.getElementById(id);
  const elements = {
    state:$('mediaLibraryState'), form:$('mediaUploadForm'), file:$('mediaFile'), kind:$('mediaKind'),
    upload:$('mediaUploadButton'), setup:$('mediaLibrarySetup'), gallery:$('mediaGallery'),
    empty:$('mediaEmpty'), message:$('mediaMessage'), refresh:$('mediaRefresh'),
  };
  let csrfToken = '';
  let configured = false;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  function setState(label, severity = 'neutral') {
    if (!elements.state) return;
    elements.state.className = `system-state is-${severity}`;
    elements.state.textContent = label;
  }

  function setMessage(value, error = false) {
    if (!elements.message) return;
    elements.message.textContent = value || '';
    elements.message.className = `media-message${error ? ' is-error' : ''}`;
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('sq-AL', { dateStyle:'medium', timeStyle:'short' }).format(date)
      : '—';
  }

  function filename(pathname) {
    return String(pathname || '').split('/').pop() || 'media';
  }

  async function session() {
    const response = await fetch('/api/auth', { credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } });
    if (response.status === 401) throw new Error('Kërkohet autentikim.');
    const payload = await response.json().catch(() => ({}));
    csrfToken = payload.csrfToken || '';
    return payload;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials:'same-origin', cache:'no-store', ...options,
      headers:{ Accept:'application/json', ...(options.headers || {}) },
    });
    if (response.status === 401) {
      location.href = `/login.html?return=${encodeURIComponent(location.pathname)}`;
      throw new Error('Sesioni ka skaduar.');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Kërkesa dështoi (${response.status}).`);
    return payload;
  }

  function render(blobs = []) {
    elements.empty.hidden = blobs.length > 0;
    elements.gallery.innerHTML = blobs.map(blob => `
      <article class="media-card" data-media-pathname="${escapeHtml(blob.pathname)}">
        <a class="media-preview" href="${escapeHtml(blob.url)}" target="_blank" rel="noopener noreferrer" aria-label="Hape ${escapeHtml(filename(blob.pathname))}">
          <img src="${escapeHtml(blob.url)}" alt="${escapeHtml(filename(blob.pathname))}" loading="lazy" decoding="async">
        </a>
        <div class="media-card-body">
          <strong title="${escapeHtml(blob.pathname)}">${escapeHtml(filename(blob.pathname))}</strong>
          <small>${escapeHtml(formatBytes(blob.size))} · ${escapeHtml(formatDate(blob.uploadedAt))}</small>
          <div class="media-card-actions">
            <button type="button" data-copy-url="${escapeHtml(blob.url)}">Kopjo URL</button>
            <button type="button" class="is-danger" data-delete-path="${escapeHtml(blob.pathname)}">Fshi</button>
          </div>
        </div>
      </article>`).join('');
  }

  async function load() {
    setState('Duke kontrolluar…', 'info');
    setMessage('');
    try {
      await session();
      const payload = await request(ENDPOINT, { headers:{ 'X-MedIndex-All-Kinds':'1' } });
      configured = payload.configured !== false;
      elements.setup.hidden = configured;
      elements.form.hidden = !configured;
      if (!configured) {
        setState('Kërkon lidhje', 'warning');
        render([]);
        return;
      }
      render(payload.blobs || []);
      setState(`${(payload.blobs || []).length} media`, 'success');
    } catch (error) {
      setState('Gabim', 'danger');
      setMessage(error.message, true);
    }
  }

  async function upload(event) {
    event.preventDefault();
    const file = elements.file.files?.[0];
    if (!file) return setMessage('Zgjidh një imazh.', true);
    if (!ALLOWED.has(file.type)) return setMessage('Lejohen vetëm PNG, WebP dhe JPEG.', true);
    if (file.size > MAX_BYTES) return setMessage('Imazhi është më i madh se 8 MB.', true);
    if (!configured) return setMessage('Lidhe fillimisht Vercel Blob store me projektin.', true);

    elements.upload.disabled = true;
    elements.upload.textContent = 'Duke ngarkuar…';
    setMessage('');
    try {
      if (!csrfToken) await session();
      await request(ENDPOINT, {
        method:'POST',
        body:file,
        headers:{
          'Content-Type':file.type,
          'X-CSRF-Token':csrfToken,
          'X-MedIndex-Filename':encodeURIComponent(file.name),
          'X-MedIndex-Kind':elements.kind.value,
        },
      });
      elements.form.reset();
      setMessage('Imazhi u ruajt në Vercel Blob.');
      await load();
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      elements.upload.disabled = false;
      elements.upload.textContent = 'Ngarko imazhin';
    }
  }

  async function remove(pathname, button) {
    if (!confirm('Ta fshij këtë media nga Vercel Blob?')) return;
    button.disabled = true;
    try {
      if (!csrfToken) await session();
      await request(ENDPOINT, {
        method:'DELETE',
        body:JSON.stringify({ pathname }),
        headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrfToken },
      });
      setMessage('Media u fshi.');
      await load();
    } catch (error) {
      setMessage(error.message, true);
      button.disabled = false;
    }
  }

  elements.form?.addEventListener('submit', upload);
  elements.refresh?.addEventListener('click', load);
  elements.gallery?.addEventListener('click', async event => {
    const copyButton = event.target.closest('[data-copy-url]');
    if (copyButton) {
      try {
        await navigator.clipboard.writeText(copyButton.dataset.copyUrl);
        setMessage('URL-ja u kopjua.');
      } catch {
        setMessage('URL-ja nuk u kopjua automatikisht.', true);
      }
      return;
    }
    const deleteButton = event.target.closest('[data-delete-path]');
    if (deleteButton) void remove(deleteButton.dataset.deletePath, deleteButton);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();
