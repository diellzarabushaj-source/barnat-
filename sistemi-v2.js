/* Sistemi V2 — consolidated operational runtime. */

(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);

  async function authJson(url='/api/auth', options={}, timeoutMs=5000) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetch(url,{
        credentials:'same-origin',
        cache:'no-store',
        ...options,
        signal:controller.signal,
        headers:{Accept:'application/json',...(options.headers||{})},
      });
      const payload=await response.json().catch(()=>({}));
      return {response,payload};
    } finally {
      clearTimeout(timer);
    }
  }

  function redirectToLogin() {
    const target=new URL('/landing.html',location.origin);
    target.searchParams.set('return',location.pathname+location.search+location.hash);
    location.replace(target.pathname+target.search);
  }

  async function ensureAuth() {
    const {response,payload}=await authJson();
    if(response.status===401||response.status===403||(response.ok&&payload.authenticated===false)){
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if(!response.ok||payload.authenticated!==true) throw new Error('Sesioni nuk mund të verifikohet.');
    return payload;
  }

  function loadRuntime(src,marker){
    const existing=document.querySelector(`script[${marker}]`);
    if(existing) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=src;
      script.defer=true;
      script.setAttribute(marker,'1');
      script.addEventListener('load',resolve,{once:true});
      script.addEventListener('error',reject,{once:true});
      document.head.appendChild(script);
    });
  }

  function loadSharedSidebarTaxonomy(){
    return loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v3','data-drx-sidebar-taxonomy');
  }

  async function syncProfile(payload){
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v5','data-drx-profile-runtime').catch(()=>null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready',{detail:payload}));
  }

  function openSidebar(){
    $('#sidebar')?.classList.add('is-open');
    const backdrop=$('#sidebarBackdrop');
    if(backdrop) backdrop.hidden=false;
  }

  function closeSidebar(){
    $('#sidebar')?.classList.remove('is-open');
    const backdrop=$('#sidebarBackdrop');
    if(backdrop) backdrop.hidden=true;
  }

  async function logout(){
    const button=$('#logoutButton');
    if(button) button.disabled=true;
    try{
      const {response}=await authJson('/api/auth',{method:'DELETE'});
      if(!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    }catch{
      if(button) button.disabled=false;
    }
  }

  function bindShell(){
    void loadSharedSidebarTaxonomy();
    $('#menuButton')?.addEventListener('click',openSidebar);
    $('#sidebarClose')?.addEventListener('click',closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click',closeSidebar);
    $('#logoutButton')?.addEventListener('click',logout);
    window.addEventListener('keydown',event=>{
      if(event.key==='Escape') closeSidebar();
    });
  }

  async function boot(){
    bindShell();
    try{
      const auth=await ensureAuth();
      await syncProfile(auth);
      document.documentElement.dataset.theme='light';
      if($('#syncText')) $('#syncText').textContent='Supabase';
      if($('#sourceStatus')) $('#sourceStatus').textContent='Sistemi · Supabase';
    }catch{
      return;
    }finally{
      $('#appShell')?.setAttribute('aria-busy','false');
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else void boot();

  window.DRxSystemShell=Object.freeze({loadSharedSidebarTaxonomy,ensureAuth});
})();

(() => {
  'use strict';

  const REFRESH_MS = 30000;
  const $ = id => document.getElementById(id);
  const elements = {
    overall:$('systemOverallState'), refresh:$('systemRefresh'), sync:$('systemSyncState'),
    sources:$('systemSourceList'), setup:$('systemSetup'), editorState:$('systemEditorState'),
    editorSummary:$('systemEditorSummary'), editorEvents:$('systemEditorEvents'),
    imports:$('systemImportRows'), checked:$('systemCheckedAt'), message:$('systemMessage'),
    drugs:$('systemDrugCount'), dosage:$('systemDosageCount'), icd:$('systemIcdCount'), labs:$('systemLabCount'),
    icdState:$('systemIcdState'), icdSummary:$('systemIcdSummary'), icdLiveNodes:$('systemIcdLiveNodes'),
    icdRevision:$('systemIcdRevision'), icdLoadedAt:$('systemIcdLoadedAt'),
    icdSourceStatus:$('systemIcdSourceStatus'), icdProbeScore:$('systemIcdProbeScore'),
    icdProbeList:$('systemIcdProbeList'), icdError:$('systemIcdError'),
  };
  let controller = null;
  let timer = 0;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat('sq-AL').format(number) : '—';
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDate(value, includeTime = true) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Asnjëherë';
    return new Intl.DateTimeFormat('sq-AL', includeTime
      ? { dateStyle:'medium', timeStyle:'short' }
      : { dateStyle:'medium' }).format(date);
  }

  function relativeTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'nuk është sinkronizuar ende';
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'para pak sekondash';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `para ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `para ${hours} orë`;
    return `më ${formatDate(value, false)}`;
  }

  function stateClass(state = {}) {
    const severity = ['success', 'warning', 'danger', 'info', 'neutral'].includes(state.severity)
      ? state.severity
      : 'neutral';
    return `system-state is-${severity}`;
  }

  function setState(node, state) {
    if (!node) return;
    node.className = stateClass(state);
    node.textContent = state?.label || 'E panjohur';
  }

  function sourceDescription(source) {
    const descriptions = {
      KARTELA_BARNAVE:'Kartelat klinike, kategoria dhe rrugët e administrimit',
      DOZA_TE_RRITUR:'Skemat e verifikuara për të rritur',
      DOZA_PEDIATRIKE:'Formulat dhe kufijtë pediatrikë',
    };
    return descriptions[source.sheetName] || source.entityScope || 'Burim i të dhënave';
  }

  function outboxState(outbox = {}) {
    if (outbox.available === false) return { label:'Kërkon migrim', severity:'warning' };
    if (Number(outbox.deadLetter) > 0) return { label:`${outbox.deadLetter} të bllokuara`, severity:'danger' };
    if (Number(outbox.pending) > 0) return { label:`${outbox.pending} në radhë`, severity:'info' };
    return { label:'E konfirmuar', severity:'success' };
  }

  function renderSources(payload) {
    const sources = payload?.synchronization?.dosageSources || [];
    const outbox = payload?.synchronization?.outbox || { available:false };
    const queueState = outboxState(outbox);
    const outboxMarkup = `
      <article class="system-source">
        <div>
          <strong>Editor → Google Sheet · Outbox</strong>
          <small>Çdo ndryshim ruhet në radhë dhe hiqet vetëm pas konfirmimit nga Apps Script.</small>
          <small>Konfirmimi i fundit: ${escapeHtml(relativeTime(outbox.lastAppliedAt))}</small>
          ${outbox.lastError ? `<small class="system-source-error">${escapeHtml(outbox.lastError)}</small>` : ''}
        </div>
        <span class="${stateClass(queueState)}">${escapeHtml(queueState.label)}</span>
      </article>`;
    const sourceMarkup = sources.length ? sources.map(source => `
      <article class="system-source">
        <div>
          <strong>${escapeHtml(source.sheetName)}</strong>
          <small>${escapeHtml(sourceDescription(source))}</small>
          <small>Sinkronizimi i fundit: ${escapeHtml(relativeTime(source.lastSyncedAt))}</small>
          ${source.lastError ? `<small class="system-source-error">${escapeHtml(source.lastError)}</small>` : ''}
        </div>
        <span class="${stateClass(source.state)}">${escapeHtml(source.state?.label || source.status)}</span>
      </article>`).join('') : '<div class="system-empty">Burimet e sinkronizimit nuk u kthyen nga serveri.</div>';
    elements.sources.innerHTML = outboxMarkup + sourceMarkup;

    const syncState = payload?.synchronization?.state || payload?.overall;
    setState(elements.sync, syncState);
    elements.setup.hidden = syncState?.code !== 'setup_required';
  }

  function renderIcd(icd = {}) {
    const source = icd.source || {};
    const hierarchy = icd.hierarchy || {};
    const search = icd.search || {};
    const probes = Array.isArray(search.probes) ? search.probes : [];
    const totalNodes = hierarchy?.actual?.total;
    const complete = hierarchy.complete === true;

    setState(elements.icdState, icd.state || { label:'E panjohur', severity:'neutral' });
    elements.icdLiveNodes.textContent = formatNumber(totalNodes);
    elements.icdRevision.textContent = source.revision ? String(source.revision).slice(0, 12) : '—';
    elements.icdRevision.title = source.revision || '';
    elements.icdLoadedAt.textContent = source.loadedAt ? relativeTime(source.loadedAt) : '—';
    elements.icdSourceStatus.textContent = source.status === 'stale'
      ? 'Cache i fundit i vlefshëm'
      : source.status === 'live'
        ? `Live · ${formatBytes(source.csvBytes)}`
        : source.status || '—';
    elements.icdProbeScore.textContent = `${Number(search.passed) || 0}/${Number(search.total) || 0}`;
    elements.icdSummary.textContent = icd.error
      ? 'Burimi publik ICD nuk u lexua; Supabase dhe shërbimet e tjera vazhdojnë të kontrollohen veçmas.'
      : complete && search.healthy
        ? 'Hierarkia e plotë dhe kërkimi clinical-ranking-v3 kaluan auditin operacional.'
        : complete
          ? 'Hierarkia është e plotë, por një ose më shumë kërkime klinike kërkojnë kontroll.'
          : 'Numrat e hierarkisë nuk përputhen me baseline-in 22 / 274 / 2,050 / 10,196 / 12,542.';

    elements.icdProbeList.innerHTML = probes.length ? probes.map(probe => `
      <article class="system-probe ${probe.passed ? 'is-ok' : 'is-failed'}">
        <div>
          <strong>${escapeHtml(probe.label || probe.id || 'Provë klinike')}</strong>
          <small><code>${escapeHtml(probe.query || '')}</code> → ${escapeHtml(probe.firstCode || 'pa rezultat')}</small>
          ${probe.error ? `<small class="system-source-error">${escapeHtml(probe.error)}</small>` : ''}
        </div>
        <span>${probe.passed ? 'Kaloi' : 'Dështoi'}</span>
      </article>`).join('') : '<div class="system-empty">Nuk u kthyen rezultatet e smoke-probes ICD.</div>';

    elements.icdError.hidden = !icd.error;
    elements.icdError.textContent = icd.error || '';
  }

  function renderEditor(editor = {}) {
    const events = Array.isArray(editor.recentChanges) ? editor.recentChanges : [];
    const editorState = editor.available
      ? { label:'Gati', severity:'success' }
      : { label:'Joaktiv', severity:'warning' };
    setState(elements.editorState, editorState);
    elements.editorSummary.textContent = editor.lastChangeAt
      ? `Ndryshimi i fundit është regjistruar ${relativeTime(editor.lastChangeAt)}.`
      : 'Editori është gati; ende nuk ka ndryshim të ri në audit.';
    elements.editorEvents.innerHTML = events.length ? events.map(event => `
      <article class="system-event">
        <strong>${escapeHtml(event.entityType || 'Kartelë klinike')} · ${escapeHtml(event.action || 'ndryshim')}</strong>
        <small>${escapeHtml(formatDate(event.changedAt))}${event.changedBy ? ` · ${escapeHtml(event.changedBy)}` : ''}</small>
      </article>`).join('') : '<div class="system-empty">Nuk ka ndryshime të fundit nga editori.</div>';
  }

  function renderImports(imports = []) {
    elements.imports.innerHTML = imports.length ? imports.map(run => {
      const status = String(run.status || '').toLowerCase();
      const rows = Number(run.rowsRead) || Number(run.rowsInserted) || Number(run.rowsUpdated) || 0;
      return `<tr>
        <td>${escapeHtml(formatDate(run.startedAt))}</td>
        <td class="${status === 'completed' || status === 'success' ? 'system-run-ok' : 'system-run-failed'}">${escapeHtml(run.status || '—')}</td>
        <td>${escapeHtml(run.targetScope || '—')}</td>
        <td>${escapeHtml(formatNumber(rows))}</td>
        <td class="${run.error ? 'system-run-error' : ''}">${escapeHtml(run.error || 'Pa gabime të regjistruara')}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5">Nuk ka importe të plota të regjistruara.</td></tr>';
  }

  function render(payload) {
    setState(elements.overall, payload.overall);
    elements.drugs.textContent = formatNumber(payload.counts?.drugs);
    elements.dosage.textContent = formatNumber(payload.counts?.dosageRegimens);
    elements.icd.textContent = formatNumber(payload.counts?.icdCodes);
    elements.labs.textContent = formatNumber(payload.counts?.labTests);
    elements.checked.textContent = `Kontrolluar: ${formatDate(payload.checkedAt)}`;
    renderSources(payload);
    renderIcd(payload.icd);
    renderEditor(payload.editor);
    renderImports(payload.recentImports);
    const outbox = payload?.synchronization?.outbox || {};
    const icdState = payload?.icd?.state?.code;
    elements.message.className = `system-message${Number(outbox.deadLetter) > 0 || icdState === 'error' ? ' is-error' : ''}`;
    elements.message.textContent = Number(outbox.deadLetter) > 0
      ? `${outbox.deadLetter} ndryshim(e) kanë kaluar në dead letter dhe kërkojnë ndërhyrje.`
      : icdState === 'error'
        ? 'Burimi ICD nuk u lexua. Kontrollo kartën ICD; Supabase mbetet i izoluar nga ky gabim.'
        : icdState === 'stale'
          ? 'ICD po shërbehet nga cache-i i fundit i vlefshëm derisa Google Sheet të rikthehet.'
          : icdState === 'warning'
            ? 'ICD u lexua, por integriteti ose një smoke-probe klinik kërkon kontroll.'
            : Number(outbox.pending) > 0
              ? `${outbox.pending} ndryshim(e) presin konfirmimin e Google Sheet-it.`
              : payload.overall?.code === 'healthy'
                ? 'Supabase, sinkronizimi dhe burimi ICD janë brenda intervalit të pritshëm.'
                : payload?.synchronization?.state?.code === 'setup_required'
                  ? 'Databaza është aktive. Për sinkronizim live duhet aktivizuar një herë Apps Script-i.'
                  : 'Kontrollo kartat e mësipërme për burimin që kërkon ndërhyrje.';
  }

  async function load() {
    clearTimeout(timer);
    controller?.abort();
    controller = new AbortController();
    elements.refresh.disabled = true;
    elements.refresh.textContent = 'Duke kontrolluar…';
    try {
      const response = await fetch('/api/neon-status', {
        credentials:'same-origin', cache:'no-store', signal:controller.signal,
        headers:{ Accept:'application/json' },
      });
      if (response.status === 401) {
        location.href = `/login-v2.html?return=${encodeURIComponent(location.pathname)}`;
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.connected !== true) throw new Error(payload.error || 'Statusi i sistemit nuk u lexua.');
      render(payload);
    } catch (error) {
      if (error.name === 'AbortError') return;
      setState(elements.overall, { label:'Nuk u kontrollua', severity:'danger' });
      setState(elements.sync, { label:'Gabim', severity:'danger' });
      setState(elements.icdState, { label:'Gabim', severity:'danger' });
      elements.message.className = 'system-message is-error';
      elements.message.textContent = error.message || 'Ndodhi një gabim gjatë kontrollit.';
    } finally {
      elements.refresh.disabled = false;
      elements.refresh.textContent = 'Rifresko tani';
      if (!document.hidden) timer = setTimeout(load, REFRESH_MS);
    }
  }

  elements.refresh?.addEventListener('click', load);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else load();
  });
  window.addEventListener('pageshow', load, { once:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();


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
      location.href = `/login-v2.html?return=${encodeURIComponent(location.pathname)}`;
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


(() => {
  'use strict';

  // The system page carries one admin-only element: a way into the admin
  // dashboard. It stays hidden for everyone else rather than linking to a page
  // that would immediately turn them away.
  //
  // This is a convenience, not a control. `/api/auth?scope=users` refuses a
  // non-admin regardless of what this page chooses to show.

  const panel = document.getElementById('systemUsersPanel');
  if (!panel) return;

  void (async () => {
    try {
      const response = await fetch('/api/auth', {
        credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.authUser?.role !== 'admin') return;
      panel.hidden = false;
    } catch {
      // Offline or refused: leave the panel hidden.
    }
  })();
})();
