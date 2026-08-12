(() => {
  'use strict';

  const VERSION = 'registry-runtime-integrity-v1';
  const ROOT = document.documentElement;
  const BUILD_ID = String(
    document.querySelector('meta[name="medindex-build-id"]')?.content
      || ROOT.dataset.medindexBuildId
      || '',
  ).trim();
  const CORE_ENGINE_PATH = '/registry-unified-table.js';
  const MAX_REPAIR_ATTEMPTS = 2;
  const state = {
    version:VERSION,
    buildId:BUILD_ID,
    repairAttempts:0,
    lastSnapshot:null,
    timer:0,
  };
  const engine = window.MEDINDEX_REGISTRY_ENGINE && typeof window.MEDINDEX_REGISTRY_ENGINE === 'object'
    ? window.MEDINDEX_REGISTRY_ENGINE
    : {
        owner:'registry-unified-table.js',
        buildId:BUILD_ID,
        activeVersion:'',
        assignments:0,
        conflicts:[],
      };

  window.MEDINDEX_REGISTRY_ENGINE = engine;
  ROOT.dataset.medindexBuildId = BUILD_ID || 'unknown';
  ROOT.dataset.registryRuntimeIntegrity = VERSION;

  function clean(value) {
    return String(value ?? '').trim();
  }

  function assetRecord(node) {
    const raw = node.src || node.href || '';
    if (!raw) return null;
    let url;
    try { url = new URL(raw, location.href); } catch { return null; }
    const file = url.pathname.split('/').pop() || '';
    if (!file.startsWith('registry-')) return null;
    return {
      tag:node.tagName.toLowerCase(),
      file,
      path:url.pathname,
      build:clean(url.searchParams.get('build')),
      version:clean(url.searchParams.get('v')),
      url:url.href,
    };
  }

  function collectAssets() {
    return [...document.querySelectorAll('script[src],link[rel="stylesheet"][href]')]
      .map(assetRecord)
      .filter(Boolean);
  }

  function duplicateEngineScripts(assets) {
    return assets.filter(item => item.path === CORE_ENGINE_PATH);
  }

  function installUnifiedApiLock() {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'MedIndexRegistryUnified');
    if (descriptor && descriptor.configurable === false) return;

    let current = descriptor && 'value' in descriptor ? descriptor.value : window.MedIndexRegistryUnified;
    if (current?.version) {
      engine.activeVersion = clean(current.version);
      engine.assignments = Math.max(1, Number(engine.assignments) || 0);
    }

    try {
      Object.defineProperty(window, 'MedIndexRegistryUnified', {
        configurable:false,
        enumerable:true,
        get:() => current,
        set:value => {
          const nextVersion = clean(value?.version);
          const activeVersion = clean(current?.version);
          if (!current) {
            current = value;
            engine.activeVersion = nextVersion;
            engine.assignments = (Number(engine.assignments) || 0) + 1;
            scheduleAudit();
            return;
          }
          if (value === current) return;
          engine.conflicts.push({
            at:Date.now(),
            activeVersion,
            rejectedVersion:nextVersion || 'unknown',
          });
          ROOT.dataset.registryEngineConflict = 'true';
          scheduleAudit();
        },
      });
    } catch {
      // Diagnostics remain useful even if another runtime locked this property first.
    }
  }

  function componentVersions() {
    return {
      unified:clean(window.MedIndexRegistryUnified?.version),
      layoutGuard:clean(window.MedIndexRegistryLayoutGuard?.version),
      dosageLoader:clean(window.MedIndexRegistryDosageLoader?.version),
      doseTable:clean(window.MedIndexDoseTableUx?.version),
      tableTools:clean(ROOT.dataset.registryTableTools),
      desktopLite:clean(ROOT.dataset.registryDesktopLite),
      runtimeLoader:clean(ROOT.dataset.registryRuntimeLoader),
    };
  }

  function tableShapeAudit() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (!header || !tbody) return { available:false, stable:true, headerColumns:0, rowMismatches:0 };
    const headerKeys = [...header.children]
      .map(cell => clean(cell.dataset.registryColumnKey))
      .filter(Boolean);
    let rowMismatches = 0;
    let checkedRows = 0;
    [...tbody.children].forEach(row => {
      if (row.querySelector('.empty-state')) return;
      const keys = [...row.children]
        .map(cell => clean(cell.dataset.registryColumnKey))
        .filter(Boolean);
      if (!keys.length) return;
      checkedRows += 1;
      if (keys.length !== headerKeys.length || keys.some((key, index) => key !== headerKeys[index])) rowMismatches += 1;
    });
    return {
      available:true,
      stable:rowMismatches === 0,
      headerColumns:headerKeys.length,
      checkedRows,
      rowMismatches,
    };
  }

  function snapshot() {
    const assets = collectAssets();
    const engineScripts = duplicateEngineScripts(assets);
    const staleAssets = BUILD_ID
      ? assets.filter(item => item.build && item.build !== BUILD_ID)
      : [];
    const cohortAssets = assets.filter(item => item.build);
    const cohortBuilds = [...new Set(cohortAssets.map(item => item.build))];
    const duplicatePaths = [...new Set(assets.map(item => item.path))]
      .map(path => ({ path, count:assets.filter(item => item.path === path).length }))
      .filter(item => item.count > 1);
    const tableAudit = window.MEDINDEX_REGISTRY_TABLE_AUDIT || null;
    const layoutAudit = window.MEDINDEX_REGISTRY_LAYOUT_AUDIT || null;
    const shapeAudit = tableShapeAudit();
    const engineConflict = Boolean(engine.conflicts?.length || ROOT.dataset.registryEngineConflict === 'true');
    const duplicateEngine = engineScripts.length > 1;
    const mixedBuild = staleAssets.length > 0 || cohortBuilds.length > 1;
    const tableStable = !tableAudit || tableAudit.stable !== false;
    const layoutStable = !layoutAudit || layoutAudit.stable !== false;
    const stable = !mixedBuild
      && !duplicateEngine
      && !engineConflict
      && tableStable
      && layoutStable
      && shapeAudit.stable;

    const result = Object.freeze({
      version:VERSION,
      buildId:BUILD_ID,
      checkedAt:new Date().toISOString(),
      stable,
      mixedBuild,
      staleAssets,
      cohortBuilds,
      registryAssets:assets.length,
      duplicateEngine,
      duplicatePaths,
      engine:Object.freeze({
        owner:engine.owner,
        buildId:engine.buildId,
        activeVersion:clean(window.MedIndexRegistryUnified?.version || engine.activeVersion),
        assignments:Number(engine.assignments) || 0,
        conflicts:[...(engine.conflicts || [])],
      }),
      components:componentVersions(),
      table:tableAudit,
      layout:layoutAudit,
      shape:shapeAudit,
    });

    state.lastSnapshot = result;
    ROOT.dataset.medindexRuntimeIntegrity = stable ? 'ok' : 'mismatch';
    ROOT.dataset.medindexMixedBuild = mixedBuild ? 'true' : 'false';
    window.MEDINDEX_DIAGNOSTICS = result;
    return result;
  }

  function repair() {
    const audit = snapshot();
    if (audit.stable || audit.mixedBuild || audit.duplicateEngine || audit.engine.conflicts.length) return audit;
    if (state.repairAttempts >= MAX_REPAIR_ATTEMPTS) return audit;
    state.repairAttempts += 1;
    window.MedIndexRegistryUnified?.refresh?.();
    window.MedIndexRegistryLayoutGuard?.refresh?.();
    window.MedIndexRegistryDosageLoader?.schedule?.();
    window.dispatchEvent(new CustomEvent('medindex:registry-integrity-repair', {
      detail:{ attempt:state.repairAttempts, buildId:BUILD_ID },
    }));
    window.setTimeout(scheduleAudit, 80);
    return audit;
  }

  function scheduleAudit() {
    if (state.timer) return;
    state.timer = window.setTimeout(() => {
      state.timer = 0;
      repair();
    }, 32);
  }

  installUnifiedApiLock();

  [
    'DOMContentLoaded',
    'pageshow',
    'medindex:desktop-lite-ready',
    'medindex:registry-ready',
    'medindex:registry-table-stable',
    'medindex:registry-dosage-ready',
    'medindex:registry-dose-column-changed',
    'medindex:tailadmin-ready',
  ].forEach(name => window.addEventListener(name, scheduleAudit, { passive:true }));

  if ('MutationObserver' in window) {
    const assetObserver = new MutationObserver(mutations => {
      const touchesRegistryAsset = mutations.some(mutation => [...mutation.addedNodes].some(node => {
        if (!(node instanceof Element)) return false;
        return Boolean(assetRecord(node) || node.querySelector?.('script[src*="registry-"],link[href*="registry-"]'));
      }));
      if (touchesRegistryAsset) scheduleAudit();
    });
    assetObserver.observe(document.documentElement, { childList:true, subtree:true });
  }

  window.MedIndexRuntimeIntegrity = Object.freeze({
    version:VERSION,
    buildId:BUILD_ID,
    snapshot,
    refresh:scheduleAudit,
    repair,
  });

  scheduleAudit();
})();