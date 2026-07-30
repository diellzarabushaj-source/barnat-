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

  function renderSources(payload) {
    const sources = payload?.synchronization?.dosageSources || [];
    elements.sources.innerHTML = sources.length ? sources.map(source => `
      <article class="system-source">
        <div>
          <strong>${escapeHtml(source.sheetName)}</strong>
          <small>${escapeHtml(sourceDescription(source))}</small>
          <small>Sinkronizimi i fundit: ${escapeHtml(relativeTime(source.lastSyncedAt))}</small>
          ${source.lastError ? `<small class="system-source-error">${escapeHtml(source.lastError)}</small>` : ''}
        </div>
        <span class="${stateClass(source.state)}">${escapeHtml(source.state?.label || source.status)}</span>
      </article>`).join('') : '<div class="system-empty">Burimet e sinkronizimit nuk u kthyen nga serveri.</div>';

    setState(elements.sync, payload?.overall);
    elements.setup.hidden = payload?.overall?.code !== 'setup_required';
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
    renderEditor(payload.editor);
    renderImports(payload.recentImports);
    elements.message.className = 'system-message';
    elements.message.textContent = payload.overall?.code === 'healthy'
      ? 'Neon dhe sinkronizimi i dozologjisë janë brenda intervalit të pritshëm.'
      : payload.overall?.code === 'setup_required'
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
        location.href = `/login.html?return=${encodeURIComponent(location.pathname)}`;
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.connected !== true) throw new Error(payload.error || 'Statusi i sistemit nuk u lexua.');
      render(payload);
    } catch (error) {
      if (error.name === 'AbortError') return;
      setState(elements.overall, { label:'Nuk u kontrollua', severity:'danger' });
      setState(elements.sync, { label:'Gabim', severity:'danger' });
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
