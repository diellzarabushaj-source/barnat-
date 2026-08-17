(function bootstrapIcdCodingWorkspace(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;

  root.MedIndexIcdCodingWorkspace = api;
  const start = () => api.init(root);
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null, function createIcdCodingWorkspace() {
  'use strict';

  const VERSION = 'icd-coding-workspace-v1';
  const API_PATH = '/api/icd';
  const PRIMARY_KEY = 'medindex_rx_diagnosis_context_v2';
  const SECONDARY_KEY = 'medindex_rx_secondary_diagnosis_context_v1';
  const DIAGNOSIS_CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  const NAVIGATION_CODE_PATTERN = /^(?:[IVXLCDM]{1,8}|[A-Z][0-9]{2}-[A-Z][0-9]{2}|[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?)$/;
  const CODABLE_LEVELS = new Set(['category', 'subcategory']);
  const LEVEL_LABELS = Object.freeze({
    chapter:'Kapitull',
    block:'Bllok',
    category:'Kategori',
    subcategory:'Nënkategori',
  });
  const TERMINOLOGY = Object.freeze({
    verified:{ label:'Term i verifikuar', tone:'verified' },
    standardized:{ label:'Term i standardizuar', tone:'standardized' },
    machine:{ label:'Draft automatik', tone:'draft' },
    'machine-draft':{ label:'Draft automatik', tone:'draft' },
    missing:{ label:'Vetëm anglisht', tone:'missing' },
  });

  let rootRef = null;
  let activeResolved = null;
  let activeController = null;
  let requestSequence = 0;
  let initialized = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 500) => clean(value).slice(0, max);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function normalizeCode(value) {
    const code = safeText(value, 24).toUpperCase();
    return NAVIGATION_CODE_PATTERN.test(code) ? code : '';
  }

  function normalizeNode(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = normalizeCode(value.code);
    if (!code) return null;
    const level = safeText(value.level, 24).toLowerCase();
    const titleSq = safeText(value.albanianDraft || value.titleSq || value.displayTitle, 500);
    const titleEn = safeText(value.englishTitle || value.titleEn, 500);
    return {
      code,
      level,
      titleSq,
      titleEn,
      displayTitle:titleSq || titleEn || code,
      chapter:safeText(value.chapter, 160),
      block:safeText(value.block, 160),
      parentCode:normalizeCode(value.parentCode),
      childCount:Math.max(0, Math.min(9999, Number(value.childCount || 0))),
      translationStatus:safeText(value.translationStatus, 40).toLowerCase(),
    };
  }

  function normalizeResolved(value) {
    const node = normalizeNode(value?.node || value);
    if (!node) return null;
    const ancestors = Array.isArray(value?.ancestors)
      ? value.ancestors.map(normalizeNode).filter(Boolean).filter(item => item.code !== node.code)
      : [];
    const seen = new Set();
    return {
      node,
      ancestors:ancestors.filter(item => {
        if (seen.has(item.code)) return false;
        seen.add(item.code);
        return true;
      }),
    };
  }

  function levelLabel(level) {
    return LEVEL_LABELS[clean(level).toLowerCase()] || clean(level) || '—';
  }

  function terminologyInfo(status) {
    return TERMINOLOGY[clean(status).toLowerCase()] || { label:'Status i papërcaktuar', tone:'unknown' };
  }

  function canCode(node) {
    const normalized = normalizeNode(node);
    return Boolean(normalized && CODABLE_LEVELS.has(normalized.level) && DIAGNOSIS_CODE_PATTERN.test(normalized.code));
  }

  function specificityInfo(node) {
    const normalized = normalizeNode(node);
    if (!normalized || !canCode(normalized)) {
      return {
        tone:'navigation',
        label:'Nivel navigues',
        note:'Zgjidh një kategori ose nënkategori për kodim diagnostik.',
      };
    }
    if (normalized.childCount > 0) {
      return {
        tone:'review',
        label:`Ka ${normalized.childCount} nënkode direkte`,
        note:'Përdore kategorinë vetëm kur dokumentacioni nuk mbështet një nënkod më specifik.',
      };
    }
    return {
      tone:'specific',
      label:'Kodi më specifik i disponueshëm',
      note:'Ky kod nuk ka nënkode direkte në dataset-in aktual.',
    };
  }

  function diagnosisContext(node, selectedAt = Date.now()) {
    const normalized = normalizeNode(node);
    if (!normalized || !canCode(normalized)) return null;
    return {
      version:2,
      system:'ICD-10-WHO 2019',
      source:'medindex-icd-browser',
      code:normalized.code,
      level:normalized.level,
      titleSq:normalized.titleSq,
      titleEn:normalized.titleEn,
      display:`${normalized.code} — ${normalized.displayTitle}`.slice(0, 1000),
      translationStatus:normalized.translationStatus,
      childCount:normalized.childCount,
      selectedAt:Number(selectedAt) || Date.now(),
    };
  }

  function copyText(value) {
    const resolved = normalizeResolved(value);
    if (!resolved) return '';
    const { node, ancestors } = resolved;
    const terminology = terminologyInfo(node.translationStatus);
    const path = [...ancestors, node].map(item => item.code).join(' › ');
    return [
      'ICD-10-WHO 2019',
      `Kodi: ${node.code}`,
      `Niveli: ${levelLabel(node.level)}`,
      `Shqip: ${node.titleSq || '—'}`,
      `English: ${node.titleEn || '—'}`,
      `Statusi i termit: ${terminology.label}`,
      `Hierarkia: ${path}`,
    ].join('\n');
  }

  function ensureHost() {
    const document = rootRef?.document;
    if (!document) return null;
    let host = document.getElementById('icdCodingWorkspace');
    if (host) return host;
    const treePanel = document.querySelector('.icd-tree-panel');
    const intro = document.querySelector('.icd-registry-intro');
    if (!treePanel && !intro) return null;

    host = document.createElement('section');
    host.id = 'icdCodingWorkspace';
    host.className = 'icd-coding-workspace';
    host.setAttribute('aria-labelledby', 'icdCodingWorkspaceTitle');
    host.innerHTML = `<header class="icd-coding-workspace-head">
      <div>
        <p class="med-kicker">ICD-10-WHO 2019 · kodimi aktual</p>
        <h2 id="icdCodingWorkspaceTitle">Workspace klinik i kodimit</h2>
      </div>
      <span class="icd-coding-workspace-state" id="icdCodingWorkspaceState" role="status" aria-live="polite">Pa kod aktiv</span>
    </header>
    <!-- Udhëzimi jepet një herë, te gjendja bosh. Më parë ishte edhe si
         nëntitull i kartës edhe këtu, dhe faqja i thoshte të njëjtat fjalë dy
         herë me radhë. Kur karta ka një kod aktiv, gjendja bosh zhduket dhe
         udhëzimi nuk ka pse të mbetet në ekran. -->
    <div class="icd-coding-workspace-empty" id="icdCodingWorkspaceEmpty">
      <span aria-hidden="true">ICD</span>
      <div><strong>Zgjidh një kod nga hierarkia ose kërkimi</strong></div>
    </div>
    <div class="icd-coding-workspace-content" id="icdCodingWorkspaceContent" hidden>
      <div class="icd-coding-workspace-primary">
        <span class="icd-coding-workspace-code" id="icdCodingWorkspaceCode">—</span>
        <div class="icd-coding-workspace-title">
          <strong id="icdCodingWorkspaceName">—</strong>
          <small id="icdCodingWorkspaceEnglish"></small>
        </div>
        <div class="icd-coding-workspace-badges">
          <span id="icdCodingWorkspaceLevel">—</span>
          <span id="icdCodingWorkspaceTerminology">—</span>
        </div>
      </div>
      <nav class="icd-coding-workspace-path" id="icdCodingWorkspacePath" aria-label="Hierarkia e kodit aktiv"></nav>
      <div class="icd-coding-workspace-grid">
        <section><small>Specifikësia</small><strong id="icdCodingWorkspaceSpecificity">—</strong><p id="icdCodingWorkspaceSpecificityNote">—</p></section>
        <section><small>Kodi prind</small><strong id="icdCodingWorkspaceParent">—</strong><p id="icdCodingWorkspaceChildren">—</p></section>
        <section><small>Gatishmëria</small><strong id="icdCodingWorkspaceReadiness">—</strong><p id="icdCodingWorkspaceReadinessNote">—</p></section>
      </div>
      <p class="icd-coding-workspace-action-status" id="icdCodingWorkspaceActionStatus" role="status" aria-live="polite"></p>
      <div class="icd-coding-workspace-actions">
        <button type="button" data-mi-icd-workspace-detail>Hap detajet</button>
        <button type="button" data-mi-icd-workspace-children hidden>Hap nënkodet</button>
        <button type="button" data-mi-icd-workspace-copy>Kopjo përmbledhjen</button>
        <button class="is-primary" type="button" data-mi-icd-workspace-primary hidden>Përdore si diagnozë kryesore</button>
        <button type="button" data-mi-icd-workspace-secondary hidden>Shto si diagnozë shoqëruese</button>
      </div>
    </div>`;

    if (treePanel?.parentElement) treePanel.parentElement.insertBefore(host, treePanel);
    else intro?.insertAdjacentElement('afterend', host);
    return host;
  }

  function setStateLabel(value, tone = '') {
    const node = rootRef?.document.getElementById('icdCodingWorkspaceState');
    if (!node) return;
    node.textContent = value;
    node.dataset.tone = tone;
  }

  function renderLoading(code) {
    const host = ensureHost();
    if (!host) return;
    rootRef.document.getElementById('icdCodingWorkspaceEmpty').hidden = true;
    const content = rootRef.document.getElementById('icdCodingWorkspaceContent');
    content.hidden = false;
    content.setAttribute('aria-busy', 'true');
    rootRef.document.getElementById('icdCodingWorkspaceCode').textContent = code || '—';
    rootRef.document.getElementById('icdCodingWorkspaceName').textContent = 'Po ngarkohet kodi…';
    rootRef.document.getElementById('icdCodingWorkspaceEnglish').textContent = '';
    setStateLabel('Duke u ngarkuar…', 'loading');
  }

  function renderError(message) {
    activeResolved = null;
    const host = ensureHost();
    if (!host) return;
    const content = rootRef.document.getElementById('icdCodingWorkspaceContent');
    content.hidden = true;
    content.removeAttribute('aria-busy');
    const empty = rootRef.document.getElementById('icdCodingWorkspaceEmpty');
    empty.hidden = false;
    empty.querySelector('strong').textContent = 'Kodi nuk u ngarkua';
    empty.querySelector('p').textContent = clean(message) || 'Provo përsëri nga kërkimi ose hierarkia.';
    setStateLabel('Gabim gjatë ngarkimit', 'error');
  }

  function pathMarkup(resolved) {
    return [...resolved.ancestors, resolved.node].map((item, index, rows) => {
      const current = index === rows.length - 1;
      return `${index ? '<span aria-hidden="true">›</span>' : ''}<button type="button" data-mi-icd-workspace-navigate="${esc(item.code)}"${current ? ' aria-current="page"' : ''}>${esc(item.code)}</button>`;
    }).join('');
  }

  function renderResolved(value) {
    const resolved = normalizeResolved(value);
    if (!resolved) return renderError('Përgjigjja e kodit është e pavlefshme.');
    activeResolved = resolved;
    const { node } = resolved;
    const terminology = terminologyInfo(node.translationStatus);
    const specificity = specificityInfo(node);
    const codable = canCode(node);
    const document = rootRef.document;
    const content = document.getElementById('icdCodingWorkspaceContent');
    document.getElementById('icdCodingWorkspaceEmpty').hidden = true;
    content.hidden = false;
    content.removeAttribute('aria-busy');
    document.getElementById('icdCodingWorkspaceCode').textContent = node.code;
    document.getElementById('icdCodingWorkspaceName').textContent = node.displayTitle;
    const english = document.getElementById('icdCodingWorkspaceEnglish');
    english.textContent = node.titleEn && node.titleEn.toLowerCase() !== node.displayTitle.toLowerCase() ? node.titleEn : '';
    english.hidden = !english.textContent;
    document.getElementById('icdCodingWorkspaceLevel').textContent = levelLabel(node.level);
    document.getElementById('icdCodingWorkspaceLevel').dataset.tone = codable ? 'codable' : 'navigation';
    document.getElementById('icdCodingWorkspaceTerminology').textContent = terminology.label;
    document.getElementById('icdCodingWorkspaceTerminology').dataset.tone = terminology.tone;
    document.getElementById('icdCodingWorkspacePath').innerHTML = pathMarkup(resolved);
    document.getElementById('icdCodingWorkspaceSpecificity').textContent = specificity.label;
    document.getElementById('icdCodingWorkspaceSpecificity').dataset.tone = specificity.tone;
    document.getElementById('icdCodingWorkspaceSpecificityNote').textContent = specificity.note;
    document.getElementById('icdCodingWorkspaceParent').textContent = node.parentCode || 'Niveli rrënjë';
    document.getElementById('icdCodingWorkspaceChildren').textContent = node.childCount
      ? `${node.childCount} nënkode direkte në hierarki.`
      : 'Nuk ka nënkode direkte.';
    document.getElementById('icdCodingWorkspaceReadiness').textContent = codable ? 'I disponueshëm për zgjedhje' : 'Vetëm për navigim';
    document.getElementById('icdCodingWorkspaceReadiness').dataset.tone = codable ? 'ready' : 'navigation';
    document.getElementById('icdCodingWorkspaceReadinessNote').textContent = codable
      ? 'Përzgjedhja mbetet vendim klinik dhe duhet të mbështetet nga dokumentacioni.'
      : 'Kapitujt dhe blloqet nuk transferohen si diagnozë.';
    document.querySelector('[data-mi-icd-workspace-primary]').hidden = !codable;
    document.querySelector('[data-mi-icd-workspace-secondary]').hidden = !codable;
    document.querySelector('[data-mi-icd-workspace-children]').hidden = node.childCount < 1;
    document.getElementById('icdCodingWorkspaceActionStatus').textContent = '';
    setStateLabel(`${node.code} aktiv`, codable ? 'ready' : 'navigation');
  }

  async function resolveCode(code) {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode || !rootRef) return null;
    const sequence = ++requestSequence;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    renderLoading(normalizedCode);
    try {
      const response = await rootRef.fetch(`${API_PATH}?view=resolve&code=${encodeURIComponent(normalizedCode)}`, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
        signal:controller.signal,
      });
      if (!response.ok) throw new Error(`ICD API ${response.status}`);
      const payload = await response.json();
      if (sequence !== requestSequence || controller.signal.aborted) return null;
      if (!payload?.ok || !payload?.data?.node) throw new Error('Kodi ICD-10 nuk u gjet.');
      renderResolved(payload.data);
      return activeResolved;
    } catch (error) {
      if (error.name !== 'AbortError' && sequence === requestSequence) renderError(error.message);
      return null;
    }
  }

  async function writeClipboard(value) {
    try {
      await rootRef.navigator.clipboard.writeText(value);
      return true;
    } catch {}
    const area = rootRef.document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    rootRef.document.body.appendChild(area);
    area.select();
    const success = rootRef.document.execCommand('copy');
    area.remove();
    return success;
  }

  function announce(message) {
    const node = rootRef?.document.getElementById('icdCodingWorkspaceActionStatus');
    if (node) node.textContent = message;
  }

  async function copyActive() {
    if (!activeResolved) return;
    const value = copyText(activeResolved);
    if (!value) return;
    await writeClipboard(value);
    announce('Përmbledhja klinike e kodit u kopjua.');
  }

  function openDetail() {
    const code = activeResolved?.node?.code;
    if (!code) return;
    rootRef.dispatchEvent(new rootRef.CustomEvent('medindex:icd-open-detail', { detail:{ code } }));
  }

  function openChildren() {
    const code = activeResolved?.node?.code;
    if (!code) return;
    const treeNode = rootRef.document.querySelector(`[data-icd-tree-node="${rootRef.CSS.escape(code)}"]`);
    const toggle = treeNode?.querySelector(':scope > .icd-tree-row [data-tree-toggle]');
    if (toggle) {
      if (treeNode.getAttribute('aria-expanded') !== 'true') toggle.click();
      treeNode.scrollIntoView({ behavior:'smooth', block:'center' });
      toggle.focus({ preventScroll:true });
      announce(`Nënkodet e ${code} u hapën në hierarki.`);
      return;
    }
    rootRef.location.assign(`/icd.html?code=${encodeURIComponent(code)}`);
  }

  function handoff(kind) {
    const context = diagnosisContext(activeResolved?.node);
    if (!context) {
      announce('Ky nivel nuk mund të përdoret si diagnozë.');
      return false;
    }
    const secondary = kind === 'secondary';
    try {
      rootRef.sessionStorage.setItem(secondary ? SECONDARY_KEY : PRIMARY_KEY, JSON.stringify(context));
    } catch {
      announce('Shfletuesi nuk lejoi ruajtjen e përkohshme të kodit.');
      return false;
    }
    announce(secondary ? `${context.code} u përgatit si diagnozë shoqëruese.` : `${context.code} u përgatit si diagnozë kryesore.`);
    rootRef.location.assign(secondary ? '/recetat.html?from=icd-secondary' : '/recetat.html?from=icd');
    return true;
  }

  function navigateTo(code) {
    const target = normalizeCode(code);
    if (!target || target === activeResolved?.node?.code) return;
    rootRef.location.assign(`/icd.html?code=${encodeURIComponent(target)}`);
  }

  function bind() {
    const document = rootRef.document;
    document.addEventListener('click', event => {
      const treeAction = event.target.closest('[data-tree-toggle],[data-open-code]');
      const detail = event.target.closest('[data-mi-icd-workspace-detail]');
      const children = event.target.closest('[data-mi-icd-workspace-children]');
      const copy = event.target.closest('[data-mi-icd-workspace-copy]');
      const primary = event.target.closest('[data-mi-icd-workspace-primary]');
      const secondary = event.target.closest('[data-mi-icd-workspace-secondary]');
      const navigate = event.target.closest('[data-mi-icd-workspace-navigate]');
      if (treeAction) resolveCode(treeAction.dataset.treeToggle || treeAction.dataset.openCode);
      if (detail) openDetail();
      if (children) openChildren();
      if (copy) copyActive();
      if (primary) handoff('primary');
      if (secondary) handoff('secondary');
      if (navigate) navigateTo(navigate.dataset.miIcdWorkspaceNavigate);
    });

    rootRef.addEventListener('medindex:icd-state', event => {
      const code = normalizeCode(event.detail?.code || event.detail?.node?.code);
      if (code && code !== activeResolved?.node?.code) resolveCode(code);
    });
    rootRef.addEventListener('popstate', () => {
      const code = normalizeCode(new URL(rootRef.location.href).searchParams.get('code'));
      if (code) resolveCode(code);
    });
  }

  function init(rootWindow) {
    if (initialized || !rootWindow?.document?.getElementById('icdTree')) return false;
    rootRef = rootWindow;
    initialized = true;
    ensureHost();
    bind();
    const initialCode = normalizeCode(new URL(rootRef.location.href).searchParams.get('code'));
    if (initialCode) resolveCode(initialCode);
    rootRef.document.documentElement.dataset.miIcdCodingWorkspace = VERSION;
    rootRef.dispatchEvent(new rootRef.CustomEvent('medindex:icd-coding-workspace-ready', {
      detail:{ version:VERSION },
    }));
    return true;
  }

  return Object.freeze({
    VERSION,
    PRIMARY_KEY,
    SECONDARY_KEY,
    normalizeCode,
    normalizeNode,
    normalizeResolved,
    levelLabel,
    terminologyInfo,
    canCode,
    specificityInfo,
    diagnosisContext,
    copyText,
    init,
  });
});
