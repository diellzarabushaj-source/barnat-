(() => {
  'use strict';

  const ROOT = document.documentElement;
  if (ROOT.dataset.miPage !== 'barnat') return;

  const VERSION = 'registry-list-data-bridge-v1';
  const API = '/api/drug-search';
  const PAGE_SIZE = 400;
  const MAX_ROWS = 10000;
  const MAX_PAGES = Math.ceil(MAX_ROWS / PAGE_SIZE);
  const CONCURRENCY = 3;
  const REQUEST_TIMEOUT_MS = 12000;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let cachedRows = null;
  let inflight = null;
  let controller = null;
  let requestEpoch = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const listOwnsSurface = () => ROOT.dataset.miRegistryView === 'list';

  function canonicalRow(row) {
    return {
      'Nr rendor':row?.registryNumber ?? '',
      'PDID':clean(row?.pdid),
      'ProtocolNo':clean(row?.protocolNo),
      'Emri tregtar':clean(row?.tradeName),
      'Substanca aktive':clean(row?.activeSubstance),
      'ATC Code':clean(row?.atc),
      'Klasa / Çka është':clean(row?.drugClass),
      'Përdorimi (fjalë kyçe)':clean(row?.use),
      'Fortësia':clean(row?.strength),
      'Forma farmaceutike':clean(row?.form),
      'Madhësia e paketimit':clean(row?.packaging),
      'Si të shënohet në recetë':clean(row?.prescriptionNotation),
      'Bartësi i Autorizim Marketingut':clean(row?.marketingAuthorizationHolder),
      'Prodhuesi':clean(row?.manufacturer),
      'MA certifikata':clean(row?.maCertificate),
      'Statusi':clean(row?.productStatus),
      'Çmimi me shumicë':row?.wholesalePrice ?? '',
      'Çmimi me marzhë':row?.wholesaleWithMargin ?? '',
      'TVSH':clean(row?.vat),
      'Çmimi me pakicë':row?.retailPrice ?? '',
      'Afati i vlefshmërisë':clean(row?.validity),
      __neonDrugId:clean(row?.id),
      __qualityStatus:'verified',
      __registryListDataset:true,
    };
  }

  function pageUrl(page, includeTotal = false) {
    const params = new URLSearchParams({
      view:'registry-browse-page',
      page:String(page),
      pageSize:String(PAGE_SIZE),
    });
    if (includeTotal) params.set('includeTotal', '1');
    return `${API}?${params.toString()}`;
  }

  async function fetchPage(page, { includeTotal = false, signal } = {}) {
    const timeout = new AbortController();
    const onAbort = () => timeout.abort();
    signal?.addEventListener('abort', onAbort, { once:true });
    const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(pageUrl(page, includeTotal), {
        credentials:'same-origin',
        cache:'default',
        signal:timeout.signal,
        headers:{ Accept:'application/json' },
      });
      if (response.status === 401) throw new Error('Sesioni ka skaduar.');
      if (!response.ok) throw new Error(`Dataset-i i listës nuk u ngarkua (${response.status}).`);
      const payload = await response.json();
      if (!payload?.ok || !Array.isArray(payload.rows)) {
        throw new Error('Përgjigjja e dataset-it të listës është e pavlefshme.');
      }
      return payload;
    } catch (error) {
      if (timeout.signal.aborted && !signal?.aborted && error?.name === 'AbortError') {
        throw new Error('Ngarkimi i dataset-it të listës zgjati tepër.');
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    }
  }

  function publishProgress(loaded, total) {
    if (!listOwnsSurface()) return;
    window.dispatchEvent(new CustomEvent('medindex:registry-list-dataset-progress', {
      detail:{ loaded, total, version:VERSION },
    }));
  }

  function validateRows(rows, expectedTotal) {
    if (!Array.isArray(rows)) throw new Error('Dataset-i i listës nuk është listë.');
    if (rows.length > MAX_ROWS) throw new Error('Dataset-i i listës kaloi kufirin e sigurisë.');
    if (Number.isFinite(expectedTotal) && rows.length !== expectedTotal) {
      throw new Error(`Dataset-i i listës është jo i plotë (${rows.length}/${expectedTotal}).`);
    }

    const ids = new Set();
    for (const row of rows) {
      const id = clean(row?.id);
      if (!UUID_RE.test(id)) throw new Error('Dataset-i i listës përmban bar pa UUID stabile.');
      if (ids.has(id)) throw new Error('Dataset-i i listës përmban UUID të dyfishuar.');
      ids.add(id);
    }
  }

  async function loadAll(signal) {
    const first = await fetchPage(1, { includeTotal:true, signal });
    const total = Number(first?.pagination?.total);
    if (!Number.isInteger(total) || total < 0 || total > MAX_ROWS) {
      throw new Error('Numri total i barnave për Listë është i pavlefshëm.');
    }
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pageCount > MAX_PAGES) throw new Error('Dataset-i i listës kërkon shumë faqe.');

    const pages = new Array(pageCount);
    pages[0] = first.rows;
    let loaded = first.rows.length;
    publishProgress(loaded, total);

    let nextPage = 2;
    const worker = async () => {
      while (nextPage <= pageCount) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const page = nextPage++;
        const payload = await fetchPage(page, { signal });
        pages[page - 1] = payload.rows;
        loaded += payload.rows.length;
        publishProgress(loaded, total);
      }
    };

    await Promise.all(Array.from({ length:Math.min(CONCURRENCY, Math.max(0, pageCount - 1)) }, worker));
    const rawRows = pages.flat();
    validateRows(rawRows, total);
    return rawRows.map(canonicalRow);
  }

  function publish(rows, source = 'neon-bounded-pages') {
    if (!listOwnsSurface()) return false;
    window.MEDINDEX_REGISTRY_LIST_ROWS = rows;
    window.MEDINDEX_REGISTRY_LIST_READY = true;
    window.MEDINDEX_REGISTRY_LIST_ERROR = '';
    ROOT.dataset.registryListDataset = VERSION;
    window.dispatchEvent(new CustomEvent('medindex:registry-list-dataset-ready', {
      detail:{ rows, total:rows.length, source, version:VERSION },
    }));
    return true;
  }

  function cancel(reason = 'cancelled') {
    requestEpoch += 1;
    controller?.abort();
    controller = null;
    inflight = null;
    ROOT.dataset.registryListDatasetState = reason;
  }

  function ensureFull(reason = 'registry-list-view') {
    if (!listOwnsSurface()) return Promise.resolve([]);
    if (Array.isArray(cachedRows)) {
      publish(cachedRows, 'memory-cache');
      return Promise.resolve(cachedRows);
    }
    if (inflight) return inflight;

    const epoch = ++requestEpoch;
    controller?.abort();
    controller = new AbortController();
    const localController = controller;
    ROOT.dataset.registryListDatasetState = 'loading';
    window.MEDINDEX_REGISTRY_LIST_ERROR = '';

    inflight = loadAll(localController.signal)
      .then(rows => {
        if (epoch !== requestEpoch || localController.signal.aborted) return [];
        cachedRows = rows;
        ROOT.dataset.registryListDatasetState = 'ready';
        publish(rows);
        return rows;
      })
      .catch(error => {
        if (error?.name === 'AbortError' || epoch !== requestEpoch) return [];
        const message = clean(error?.message || error || 'Dataset-i i listës nuk u ngarkua.');
        window.MEDINDEX_REGISTRY_LIST_READY = false;
        window.MEDINDEX_REGISTRY_LIST_ERROR = message;
        ROOT.dataset.registryListDatasetState = 'error';
        if (listOwnsSurface()) {
          window.dispatchEvent(new CustomEvent('medindex:registry-list-dataset-error', {
            detail:{ message, reason, version:VERSION },
          }));
        }
        console.error('Registry list data bridge:', error);
        return [];
      })
      .finally(() => {
        if (controller === localController) controller = null;
        if (epoch === requestEpoch) inflight = null;
      });
    return inflight;
  }

  window.addEventListener('medindex:registry-list-dataset-needed', event => {
    void ensureFull(clean(event?.detail?.reason) || 'registry-list-view');
  });

  const viewObserver = new MutationObserver(records => {
    if (!records.some(record => record.attributeName === 'data-mi-registry-view')) return;
    if (!listOwnsSurface() && inflight) cancel('table-owner');
  });
  viewObserver.observe(ROOT, { attributes:true, attributeFilter:['data-mi-registry-view'] });

  window.MedIndexRegistryListData = Object.freeze({
    version:VERSION,
    ensureFull,
    cancel,
    ready:() => Array.isArray(cachedRows),
    rowCount:() => cachedRows?.length || 0,
    _test:{ canonicalRow, validateRows, pageUrl },
  });
})();
