(() => {
  'use strict';

  const STORAGE_PREFIX = 'medindex_protocol_workspace_';
  const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
  let scheduled = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));
  const clean = (value, max = 12000) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  const oneLine = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  function routeId() {
    try {
      const value = new URL(window.location.href).searchParams.get('protocol') || '';
      return ID_PATTERN.test(value) ? value : '';
    } catch {
      return '';
    }
  }

  function storageKey(id) {
    return `${STORAGE_PREFIX}${id}_v1`;
  }

  function readState(id) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(id)) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeState(id, value) {
    try { localStorage.setItem(storageKey(id), JSON.stringify(value)); } catch {}
  }

  function clearState(id) {
    try { localStorage.removeItem(storageKey(id)); } catch {}
  }

  function currentReader() {
    const reader = document.querySelector('#protocolReader:not([hidden])');
    if (!reader || !routeId()) return null;
    return reader;
  }

  function currentTitle(reader) {
    return oneLine(reader.querySelector('#protocolReaderTitle')?.textContent, 500) || 'Protokoll klinik';
  }

  function currentSource(reader) {
    const link = reader.querySelector('.protocol-official-button[href], .protocol-source-button[href]');
    return link?.href || '';
  }

  function hasSourceElaboration(reader) {
    return Boolean(reader.querySelector('.protocol-reader-main:not(.protocol-primary-care)'));
  }

  const reviewItems = [
    ['scope', 'Qëllimi, popullata dhe kufijtë e dokumentit janë identifikuar nga burimi.'],
    ['assessment', 'Diagnostikimi / vlerësimi dhe kriteret kryesore janë kontrolluar kundrejt burimit.'],
    ['treatment', 'Trajtimi / intervenimet dhe çdo dozë e përmendur janë kontrolluar kundrejt burimit.'],
    ['referral', 'Referimi, urgjencat dhe kufijtë mes niveleve të kujdesit janë identifikuar.'],
    ['followup', 'Monitorimi, follow-up dhe pikat e sigurisë janë kontrolluar.'],
    ['citations', 'Pikat që do të publikohen në MedIndex kanë faqe / referencë të qartë në burim.'],
  ];

  const noteFields = [
    ['scope', 'Qëllimi / popullata', 'Shëno vetëm çka mbështetet nga dokumenti…'],
    ['assessment', 'Vlerësimi / diagnostikimi', 'Algoritmi, kriteret, ekzaminimi, analizat…'],
    ['treatment', 'Trajtimi / terapia', 'Intervenimet, barnat, dozat, kufizimet…'],
    ['referral', 'Referimi / urgjenca', 'Kur referohet, ku referohet, çka nuk duhet humbur…'],
    ['followup', 'Follow-up / siguria', 'Monitorimi, efektet anësore, edukimi i pacientit…'],
  ];

  function checkedCount(saved) {
    const checks = saved?.checks && typeof saved.checks === 'object' ? saved.checks : {};
    return reviewItems.filter(([key]) => Boolean(checks[key])).length;
  }

  function enhanceDirectory() {
    document.querySelectorAll('.clinical-row[data-protocol-id]').forEach(row => {
      const id = oneLine(row.dataset.protocolId, 64);
      if (!ID_PATTERN.test(id)) return;
      const action = row.querySelector('.protocol-action-elaborate');
      if (action) {
        action.textContent = 'Hape protokollin';
        action.setAttribute('aria-label', `Hape ${oneLine(row.querySelector('h2')?.textContent, 240) || id}`);
      }
      const meta = row.querySelector('.clinical-row-meta');
      if (!meta) return;
      let chip = meta.querySelector('[data-paw-row-status]');
      if (!chip) {
        chip = document.createElement('span');
        chip.className = 'clinical-chip';
        chip.dataset.pawRowStatus = '1';
        meta.appendChild(chip);
      }
      const count = checkedCount(readState(id));
      chip.textContent = id === 'upk-01' ? 'Interaktiv' : (count ? `Audit ${count}/${reviewItems.length}` : 'Workspace');
    });
  }

  function workspaceMarkup(id, title, sourceUrl, elaborated, saved) {
    const checks = saved.checks && typeof saved.checks === 'object' ? saved.checks : {};
    const notes = saved.notes && typeof saved.notes === 'object' ? saved.notes : {};
    const completed = checkedCount(saved);
    const progress = Math.round((completed / reviewItems.length) * 100);
    const statusCopy = elaborated
      ? 'Elaborimi i burimit ekziston; ky workspace shërben për auditimin final para publikimit klinik.'
      : 'Nuk ka ende elaborim klinik të strukturuar. Workspace-i ruan vetëm auditimin dhe shënimet e tua; nuk shpik rekomandime.';

    return `<section class="protocol-audit-workspace" data-protocol-workspace="${esc(id)}" aria-labelledby="pawTitle">
      <header class="paw-head">
        <div>
          <span class="paw-kicker">Workspace i auditimit · ${esc(id.toUpperCase())}</span>
          <h2 id="pawTitle">Strukturoje protokollin pa humbur gjurmueshmërinë</h2>
          <p>${esc(statusCopy)}</p>
        </div>
        <span class="paw-status">${elaborated ? 'Audit final' : 'Draft pune'}</span>
      </header>

      <div class="paw-body">
        <section class="paw-section" aria-labelledby="pawChecklistTitle">
          <div class="paw-section-head">
            <div><h3 id="pawChecklistTitle">Checklistë para strukturimit</h3><p>Shënoje një pikë vetëm pasi ta kesh kontrolluar në dokumentin zyrtar.</p></div>
            <div class="paw-progress-label" aria-live="polite"><strong data-paw-count>${completed}/${reviewItems.length}</strong><span>të kontrolluara</span></div>
          </div>
          <div class="paw-progress" aria-hidden="true"><span data-paw-progress style="width:${progress}%"></span></div>
          <div class="paw-checks">
            ${reviewItems.map(([key, label]) => `<label class="paw-check"><input type="checkbox" data-paw-check="${esc(key)}" ${checks[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}
          </div>
        </section>

        <section class="paw-section" aria-labelledby="pawNotesTitle">
          <div class="paw-section-head"><div><h3 id="pawNotesTitle">Shënimet e auditimit</h3><p>Ruhen lokalisht për këtë protokoll dhe nuk paraqiten si rekomandim klinik.</p></div></div>
          <div class="paw-notes">
            ${noteFields.map(([key, label, placeholder]) => `<label class="paw-note"><span>${esc(label)}</span><textarea rows="3" data-paw-note="${esc(key)}" placeholder="${esc(placeholder)}">${esc(clean(notes[key] || '', 4000))}</textarea></label>`).join('')}
          </div>
        </section>
      </div>

      <div class="paw-actions">
        ${sourceUrl ? `<a class="paw-button is-primary" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer external">Hap burimin zyrtar</a>` : ''}
        <button class="paw-button" type="button" data-paw-copy>Kopjo auditimin</button>
        <button class="paw-button" type="button" data-paw-clear>Pastro workspace-in</button>
      </div>
      <p class="paw-status-text" data-paw-status role="status" aria-live="polite"></p>
      <aside class="paw-warning"><strong>${esc(title)}</strong><br>Ky panel është mjet pune. Përmbajtja klinike që publikohet në MedIndex duhet të mbetet e lidhur me versionin dhe faqet e burimit zyrtar.</aside>
    </section>`;
  }

  function collectState(root) {
    return {
      checks:Object.fromEntries([...root.querySelectorAll('[data-paw-check]')].map(input => [input.dataset.pawCheck, Boolean(input.checked)])),
      notes:Object.fromEntries([...root.querySelectorAll('[data-paw-note]')].map(input => [input.dataset.pawNote, clean(input.value, 4000)])),
      updatedAt:new Date().toISOString(),
    };
  }

  function updateProgress(root) {
    const boxes = [...root.querySelectorAll('[data-paw-check]')];
    const checked = boxes.filter(box => box.checked).length;
    const count = root.querySelector('[data-paw-count]');
    const progress = root.querySelector('[data-paw-progress]');
    if (count) count.textContent = `${checked}/${boxes.length}`;
    if (progress) progress.style.width = boxes.length ? `${Math.round((checked / boxes.length) * 100)}%` : '0%';
  }

  function auditClipboardText(root, title, id) {
    const state = collectState(root);
    const checked = reviewItems.filter(([key]) => state.checks[key]).map(([, label]) => `✓ ${label}`);
    const notes = noteFields
      .map(([key, label]) => state.notes[key] ? `${label}:\n${state.notes[key]}` : '')
      .filter(Boolean);
    return [
      `${title} · ${id.toUpperCase()}`,
      '',
      'Kontrollet e përfunduara:',
      checked.length ? checked.join('\n') : '— Asnjë',
      '',
      'Shënimet:',
      notes.length ? notes.join('\n\n') : '— Pa shënime',
      '',
      'Draft auditimi; verifiko kundrejt burimit zyrtar para publikimit klinik.',
    ].join('\n');
  }

  function bind(root, id, title) {
    if (root.dataset.pawReady === 'true') return;
    root.dataset.pawReady = 'true';

    const persist = () => {
      writeState(id, collectState(root));
      updateProgress(root);
    };
    root.querySelectorAll('[data-paw-check]').forEach(input => input.addEventListener('change', persist));
    root.querySelectorAll('[data-paw-note]').forEach(input => input.addEventListener('input', persist, { passive:true }));

    root.querySelector('[data-paw-copy]')?.addEventListener('click', async () => {
      const status = root.querySelector('[data-paw-status]');
      try {
        await navigator.clipboard.writeText(auditClipboardText(root, title, id));
        if (status) status.textContent = 'Auditimi u kopjua.';
      } catch {
        if (status) status.textContent = 'Shfletuesi nuk lejoi kopjimin automatik.';
      }
    });

    root.querySelector('[data-paw-clear]')?.addEventListener('click', () => {
      root.querySelectorAll('[data-paw-check]').forEach(input => { input.checked = false; });
      root.querySelectorAll('[data-paw-note]').forEach(input => { input.value = ''; });
      clearState(id);
      updateProgress(root);
      const status = root.querySelector('[data-paw-status]');
      if (status) status.textContent = 'Workspace-i u pastrua për këtë protokoll.';
    });

    updateProgress(root);
  }

  function enhance() {
    scheduled = false;
    enhanceDirectory();
    const reader = currentReader();
    if (!reader) return;
    const id = routeId();
    const existing = reader.querySelector('[data-protocol-workspace]');

    if (reader.querySelector('.protocol-primary-care')) {
      existing?.remove();
      return;
    }

    if (existing && existing.dataset.protocolWorkspace === id) return;
    existing?.remove();

    const layout = reader.querySelector('.protocol-reader-layout');
    if (!layout) return;
    const title = currentTitle(reader);
    const source = currentSource(reader);
    const elaborated = hasSourceElaboration(reader);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = workspaceMarkup(id, title, source, elaborated, readState(id));
    const root = wrapper.firstElementChild;
    if (!root) return;
    layout.insertBefore(root, layout.firstElementChild || null);
    bind(root, id, title);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function init() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule, { passive:true });
    document.addEventListener('click', event => {
      if (event.target.closest?.('[data-protocol-open], [data-protocol-back]')) schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
