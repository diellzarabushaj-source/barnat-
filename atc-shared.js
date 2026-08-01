(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const ATC_PATTERN = /^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/;
  const DEFAULT_REGISTRY_PAGE_SIZE = 50;

  const clean = value => String(value ?? '').trim();

  function groups() {
    const value = root.MEDINDEX_ATC_GROUPS;
    return value && typeof value === 'object' ? value : {};
  }

  function subgroups() {
    const value = root.MEDINDEX_ATC_SUBGROUPS;
    return value && typeof value === 'object' ? value : {};
  }

  function normalizeCode(value) {
    const code = clean(value).toUpperCase().replace(/\s+/g, '');
    return ATC_PATTERN.test(code) ? code : '';
  }

  function resolveGroupCode(value) {
    const code = normalizeCode(value);
    const group = code.charAt(0);
    return group && Object.hasOwn(groups(), group) ? group : '';
  }

  function resolveCategoryCode(value) {
    const code = normalizeCode(value);
    if (!code) return '';

    const category = code.slice(0, 3);
    if (category.length === 3 && Object.hasOwn(subgroups(), category)) return category;

    return resolveGroupCode(code);
  }

  function getGroupName(value) {
    const code = resolveGroupCode(value);
    return code ? clean(groups()[code]) : '';
  }

  function getCategoryName(value) {
    const code = resolveCategoryCode(value);
    if (!code) return '';
    return clean(subgroups()[code] ?? groups()[code]);
  }

  function getCategoryLabel(value) {
    const code = resolveCategoryCode(value) || normalizeCode(value);
    if (!code) return '';
    const name = getCategoryName(code);
    return name ? `${code} — ${name}` : `Kategoria ATC ${code}`;
  }

  function getChildren(value) {
    const group = resolveGroupCode(value);
    if (!group) return [];

    return Object.entries(subgroups())
      .filter(([code]) => code.startsWith(group) && code.length === 3)
      .sort(([left], [right]) => left.localeCompare(right, 'sq'))
      .map(([code, name]) => ({ code, name: clean(name), label: `${code} — ${clean(name)}` }));
  }

  function matchesCategory(value, categoryValue) {
    const code = normalizeCode(value);
    const category = resolveCategoryCode(categoryValue);
    return Boolean(code && category && code.startsWith(category));
  }

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function safeUrl(value, fallbackPath = '/index.html') {
    const fallback = `https://medindex.local${fallbackPath}`;
    try {
      return new URL(clean(value) || root.location?.href || fallback, fallback);
    } catch {
      return new URL(fallback);
    }
  }

  function readRegistryUrlState(value) {
    const url = safeUrl(value);
    const query = clean(url.searchParams.get('q'));
    return {
      atc:resolveCategoryCode(url.searchParams.get('atc')),
      query,
      q:query,
      page:positiveInteger(url.searchParams.get('page')) || 1,
      pageSize:positiveInteger(url.searchParams.get('pageSize')) || DEFAULT_REGISTRY_PAGE_SIZE,
    };
  }

  function registryUrlFromState(value, state = {}, options = {}) {
    const url = safeUrl(value, clean(options.path) || '/index.html');
    const atc = resolveCategoryCode(state.atc);
    const query = clean(state.query ?? state.q);
    const page = positiveInteger(state.page) || 1;
    const pageSize = positiveInteger(state.pageSize) || DEFAULT_REGISTRY_PAGE_SIZE;

    if (atc) url.searchParams.set('atc', atc);
    else url.searchParams.delete('atc');

    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');

    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');

    if (pageSize !== DEFAULT_REGISTRY_PAGE_SIZE) url.searchParams.set('pageSize', String(pageSize));
    else url.searchParams.delete('pageSize');

    const relative = `${url.pathname}${url.search}${url.hash}`;
    return options.absolute === true ? `${url.origin}${relative}` : relative;
  }

  function registryUrl(options = {}) {
    const params = new URLSearchParams();
    const category = resolveCategoryCode(options.atc);
    const query = clean(options.query ?? options.q);
    const page = positiveInteger(options.page);
    const pageSize = positiveInteger(options.pageSize);

    if (category) params.set('atc', category);
    if (query) params.set('q', query);
    if (page) params.set('page', String(page));
    if (pageSize) params.set('pageSize', String(pageSize));

    const path = clean(options.path) || '/index.html';
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  }

  function classificationUrl(value, options = {}) {
    const code = resolveCategoryCode(value) || resolveGroupCode(value);
    const path = clean(options.path) || '/klasifikimi.html';
    return code ? `${path}#${encodeURIComponent(code)}` : path;
  }

  const api = Object.freeze({
    normalizeCode,
    normalizeAtcCode:normalizeCode,
    resolveGroupCode,
    getAtcGroupCode:resolveGroupCode,
    resolveCategoryCode,
    getAtcCategoryCode:resolveCategoryCode,
    getGroupName,
    getAtcGroupName:getGroupName,
    getCategoryName,
    getAtcCategoryName:getCategoryName,
    getCategoryLabel,
    getAtcLabel:getCategoryLabel,
    getChildren,
    matchesCategory,
    matchesAtcCategory:matchesCategory,
    readRegistryUrlState,
    registryUrlFromState,
    registryUrl,
    buildRegistryAtcUrl:registryUrl,
    classificationUrl,
    buildClassificationUrl:classificationUrl,
  });

  root.MedIndexATC = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();