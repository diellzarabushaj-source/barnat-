(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const STANDARD_ATC_PATTERN = /^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/;
  const REGISTRY_ATC_PATTERN = /^[A-Z](?:\d{2}[A-Z0-9]{0,4})?$/;
  const CATEGORY_PATTERN = /^[A-Z]\d{2}$/;
  const DEFAULT_REGISTRY_PAGE_SIZE = 50;
  const UNCLASSIFIED_VALUES = new Set(['N/A', 'NA', 'NONE', 'UNKNOWN', 'UNCLASSIFIED', '-']);

  const clean = value => String(value ?? '').trim();
  const compactCode = value => clean(value).toUpperCase().replace(/\s+/g, '');

  function groups() {
    const value = root.MEDINDEX_ATC_GROUPS;
    return value && typeof value === 'object' ? value : {};
  }

  function subgroups() {
    const value = root.MEDINDEX_ATC_SUBGROUPS;
    return value && typeof value === 'object' ? value : {};
  }

  function normalizeCode(value) {
    const code = compactCode(value);
    return REGISTRY_ATC_PATTERN.test(code) ? code : '';
  }

  function isStandardCode(value) {
    const code = compactCode(value);
    return Boolean(code && STANDARD_ATC_PATTERN.test(code));
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
    if (CATEGORY_PATTERN.test(category) && Object.hasOwn(subgroups(), category)) return category;

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

  function classifyCode(value) {
    const raw = clean(value);
    const compact = compactCode(value);
    if (!raw || UNCLASSIFIED_VALUES.has(compact)) {
      return Object.freeze({
        raw,
        normalized:'',
        group:'',
        category:'',
        status:'unclassified',
        isStandard:false,
        isCategoryResolvable:false,
      });
    }

    const normalized = normalizeCode(compact);
    if (!normalized) {
      return Object.freeze({
        raw,
        normalized:'',
        group:'',
        category:'',
        status:'invalid',
        isStandard:false,
        isCategoryResolvable:false,
      });
    }

    const group = resolveGroupCode(normalized);
    const category = normalized.length >= 3 && Object.hasOwn(subgroups(), normalized.slice(0, 3))
      ? normalized.slice(0, 3)
      : '';
    const standard = isStandardCode(normalized);
    let status = standard ? 'standard' : 'nonstandard-resolvable';
    if (!group) status = 'unknown-group';
    else if (normalized.length >= 3 && !category) status = 'unknown-category';

    return Object.freeze({
      raw,
      normalized,
      group,
      category,
      status,
      isStandard:standard,
      isCategoryResolvable:Boolean(category),
    });
  }

  function matchesCategory(value, categoryValue) {
    const codeAudit = classifyCode(value);
    const category = resolveCategoryCode(categoryValue);
    return Boolean(codeAudit.normalized && category && codeAudit.normalized.startsWith(category));
  }

  function readRowAtc(row, options = {}) {
    if (typeof options.getAtc === 'function') return options.getAtc(row);
    if (!row || typeof row !== 'object') return '';
    return row.atc_code ?? row.atcCode ?? row.atc ?? row['ATC Code'] ?? row.ATC ?? '';
  }

  function auditRows(rows, options = {}) {
    const source = Array.isArray(rows) ? rows : [];
    const categoryCounts = Object.fromEntries(Object.keys(subgroups()).map(code => [code, 0]));
    const groupCounts = Object.fromEntries(Object.keys(groups()).map(code => [code, 0]));
    const statuses = {
      standard:0,
      nonstandardResolvable:0,
      unclassified:0,
      invalid:0,
      unknownGroup:0,
      unknownCategory:0,
    };
    const examples = {
      nonstandardResolvable:[],
      unclassified:[],
      invalid:[],
      unknownGroup:[],
      unknownCategory:[],
    };
    const exampleLimit = Number.isInteger(options.exampleLimit) && options.exampleLimit >= 0
      ? options.exampleLimit
      : 5;

    source.forEach(row => {
      const result = classifyCode(readRowAtc(row, options));
      if (result.status === 'standard') statuses.standard += 1;
      else if (result.status === 'nonstandard-resolvable') statuses.nonstandardResolvable += 1;
      else if (result.status === 'unclassified') statuses.unclassified += 1;
      else if (result.status === 'invalid') statuses.invalid += 1;
      else if (result.status === 'unknown-group') statuses.unknownGroup += 1;
      else if (result.status === 'unknown-category') statuses.unknownCategory += 1;

      if (result.group && Object.hasOwn(groupCounts, result.group)) groupCounts[result.group] += 1;
      if (result.category && Object.hasOwn(categoryCounts, result.category)) categoryCounts[result.category] += 1;

      const exampleKey = result.status === 'nonstandard-resolvable'
        ? 'nonstandardResolvable'
        : result.status === 'unknown-group'
          ? 'unknownGroup'
          : result.status === 'unknown-category'
            ? 'unknownCategory'
            : result.status;
      if (examples[exampleKey] && examples[exampleKey].length < exampleLimit) {
        examples[exampleKey].push(result.raw || '(bosh)');
      }
    });

    const categorized = statuses.standard + statuses.nonstandardResolvable;
    const total = source.length;
    const report = {
      total,
      categorized,
      coveragePercent:total ? Number(((categorized / total) * 100).toFixed(3)) : 100,
      catalog:{
        groups:Object.keys(groups()).length,
        categories:Object.keys(subgroups()).length,
      },
      statuses,
      groupCounts,
      categoryCounts,
      emptyCategories:Object.entries(categoryCounts)
        .filter(([, count]) => count === 0)
        .map(([code]) => code),
      examples,
    };
    return Object.freeze(report);
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
    isStandardCode,
    isStandardAtcCode:isStandardCode,
    classifyCode,
    auditCode:classifyCode,
    auditRows,
    auditRegistryRows:auditRows,
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