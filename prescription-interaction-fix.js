(function (root, factory) {
  const api = factory(root?.MedIndexAdministrationRoutes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexPrescriptionInteractionFix = api;
  if (root?.document) {
    const run = () => api.init(root.document, root);
    root.document.readyState === 'loading'
      ? root.document.addEventListener('DOMContentLoaded', run, { once:true })
      : run();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Administration) {
  'use strict';

  if (!Administration && typeof require === 'function') {
    try { Administration = require('./administration-routes.js'); } catch {}
  }

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const CONTEXT_CONTROL = '[data-context-category],[data-context-route],#rxPediatricToggle';

  function hasSelectedDrug(documentRef) {
    return Boolean(documentRef?.querySelector?.('#rxSelectedDrugs .rx-drug-chip'));
  }

  function shouldTemporarilyReleaseComposer(documentRef, target) {
    if (!documentRef || !target?.closest?.(CONTEXT_CONTROL)) return false;
    if (hasSelectedDrug(documentRef)) return false;
    return Boolean(text(documentRef.getElementById('rxComposer')?.value));
  }

  function normalizeRegimensForContext(rows, context = {}) {
    if (!Administration || !Array.isArray(rows)) return Array.isArray(rows) ? rows : [];
    const category = Administration.normalizeCategory(context.administrationCategory || context.category);
    const route = Administration.normalizeRoute(context.route);
    if (!category || !route) return rows;

    return rows.map(regimen => {
      const inferred = Administration.inferAdministration({
        administrationCategory:regimen?.administrationCategory,
        allowedRoutes:regimen?.allowedRoutes,
        form:regimen?.form,
        route:regimen?.route,
      });
      const routes = Administration.routeTokens([
        regimen?.route,
        regimen?.allowedRoutes,
        inferred.routes,
      ].flat().filter(Boolean).join(' '));
      if (inferred.category !== category || !routes.includes(route)) return regimen;
      if (routes.length === 1 && routes[0] === route) return regimen;
      return {
        ...regimen,
        administrationCategory:category,
        allowedRoutes:[route],
        route,
      };
    });
  }

  function installComposerGuard(documentRef, rootRef) {
    if (!rootRef?.addEventListener || rootRef.__rxComposerContextGuard) return;
    rootRef.__rxComposerContextGuard = true;
    rootRef.addEventListener('click', event => {
      if (!shouldTemporarilyReleaseComposer(documentRef, event.target)) return;
      const composer = documentRef.getElementById('rxComposer');
      if (!composer) return;
      const snapshot = {
        value:composer.value,
        start:composer.selectionStart,
        end:composer.selectionEnd,
        scrollTop:composer.scrollTop,
      };
      composer.value = '';
      const restore = () => {
        if (composer.value !== '') return;
        composer.value = snapshot.value;
        composer.scrollTop = snapshot.scrollTop;
        try { composer.setSelectionRange(snapshot.start, snapshot.end); } catch {}
        try { composer.dispatchEvent(new Event('input', { bubbles:true })); } catch {}
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(restore);
      else Promise.resolve().then(restore);
    }, true);
  }

  function installContextCompatibility(rootRef) {
    const Context = rootRef?.MedIndexPrescriptionContext;
    const Engine = rootRef?.MedIndexDosageEngine;
    if (!Context || !Engine || Engine.__rxMultiRouteCompatibility) return;

    const previousDecideMatch = Engine.decideMatch.bind(Engine);
    Engine.decideMatch = (drug, rows) => previousDecideMatch(
      drug,
      normalizeRegimensForContext(rows, Context.getContext()),
    );
    Engine.__rxMultiRouteCompatibility = true;

    Context.filterRegimens = (rows, value) => {
      const context = Context.normalizeContext(value);
      const wantedPopulation = context.pediatric ? 'pediatric' : 'adult';
      return (Array.isArray(rows) ? rows : []).filter(regimen => {
        if (Context.population(regimen) !== wantedPopulation) return false;
        const administration = Context.regimenAdministration(regimen);
        if (administration.category !== context.administrationCategory) return false;
        const routes = Administration.routeTokens(regimen.route || administration.routes.join(' '));
        return routes.includes(context.route);
      });
    };
  }

  function init(documentRef, rootRef) {
    installComposerGuard(documentRef, rootRef);
    installContextCompatibility(rootRef);
  }

  return {
    hasSelectedDrug,
    shouldTemporarilyReleaseComposer,
    normalizeRegimensForContext,
    installComposerGuard,
    installContextCompatibility,
    init,
  };
});
