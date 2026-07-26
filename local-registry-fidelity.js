(() => {
  'use strict';

  const DB_NAME = 'medindex-registry-v1';
  const DB_STORE = 'datasets';
  const DB_KEY = 'registry-parts';
  const REGISTRY_URL = '/api/registry';
  const MAX_QUERY_LENGTH = 90;
  const REGISTRY_SCHEMA_VERSION = 'registry-prescription-master-v3-no-dynamic-code';
  let rowsPromise = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq')
    .replace(/[^a-z0-9%+./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB nuk mbështetet.'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB nuk u hap.'));
      request.onblocked = () => reject(new Error('IndexedDB është bllokuar.'));
    });
  }

  async function databaseGet(key) {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Cache-i lokal nuk u lexua.'));
      });
    } finally {
      database.close();
    }
  }

  async function databasePut(key, value) {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(DB_STORE, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Cache-i lokal nuk u ruajt.'));
        transaction.onabort = () => reject(transaction.error || new Error('Ruajtja lokale u anulua.'));
        transaction.objectStore(DB_STORE).put(value, key);
      });
    } finally {
      database.close();
    }
  }

  async function decodeParts(parts) {
    if (!Array.isArray(parts) || !parts.length) return [];
    if (parts.every(item => item && typeof item === 'object')) return parts;
    if (typeof DecompressionStream !== 'function') throw new Error('Shfletuesi nuk mbështet dekompresimin lokal.');
    const encoded = parts.join('');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const parsed = JSON.parse(await new Response(stream).text());
    if (Array.isArray(parsed)) return parsed;
    for (const key of ['rows', 'data', 'records', 'items', 'drugs', 'barnat']) {
      if (Array.isArray(parsed?.[key])) return parsed[key];
    }
    return [];
  }

  function parseAssignment(source, name, fallback = null) {
    const prefix = `window.${name}`;
    const line = String(source || '').split(/\r?\n/).find(item => item.trim().startsWith(prefix));
    if (!line) return fallback;
    const equals = line.indexOf('=');
    if (equals < 0) return fallback;
    const serialized = line.slice(equals + 1).trim().replace(/;+\s*$/, '');
    try { return JSON.parse(serialized); }
    catch { throw new Error(`Payload-i i regjistrit ka fushë të pavlefshme: ${name}.`); }
  }

  function parsePayload(source) {
    const parts = parseAssignment(source, 'DRUG_DATA_PARTS', []);
    if (!Array.isArray(parts) || !parts.length) {
      throw new Error(parseAssignment(source, 'REGISTRY_LOAD_ERROR', 'Regjistri nuk ktheu të dhëna.'));
    }
    return {
      parts,
      quality:parseAssignment(source, 'REGISTRY_QUALITY_META', null),
    };
  }

  async function fetchAndStoreParts() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(REGISTRY_URL, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/javascript' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Regjistri ${response.status}`);
      const payload = parsePayload(await response.text());
      const record = {
        version: REGISTRY_SCHEMA_VERSION,
        savedAt: Date.now(),
        parts: payload.parts,
        quality: payload.quality,
      };
      await databasePut(DB_KEY, record).catch(() => null);
      return record;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadRows() {
    let record = null;
    try { record = await databaseGet(DB_KEY); } catch {}
    if (!record?.parts?.length || record.version !== REGISTRY_SCHEMA_VERSION) record = await fetchAndStoreParts();
    const rows = await decodeParts(record.parts);
    return rows.filter(row => String(row?.__qualityStatus || '').trim() !== 'blocked');
  }

  function resultFromRow(row) {
    const tradeName = clean(row['Emri tregtar']);
    const substance = clean(row['Substanca aktive']);
    const strength = clean(row['Fortësia']);
    const form = clean(row['Forma farmaceutike']);
    const packaging = clean(row['Madhësia e paketimit']);
    const pdid = clean(row.PDID);
    const protocolNo = clean(row.ProtocolNo);
    const prescriptionLine = clean(row.__prescriptionLine);
    const packagingSummary = clean(row.__packagingSummary);
    return {
      key: `${pdid}|${protocolNo}|${tradeName}|${strength}`,
      tradeName,
      substance,
      strength,
      form,
      packaging,
      prescriptionLine,
      prescriptionNotation:[prescriptionLine, packagingSummary].filter(Boolean).join(' — '),
      packagingSummary,
      dispense:clean(row.__dispense),
      route:clean(row.__prescriptionRoute),
      sheetPrescriptionNotation:clean(row.__sheetPrescriptionNotation),
      atc:clean(row['ATC Code']),
      pdid,
      protocolNo,
      qualityStatus:clean(row.__qualityStatus || 'verified'),
    };
  }

  function rank(row, query, tokens) {
    const trade = normalize(row['Emri tregtar']);
    const substance = normalize(row['Substanca aktive']);
    const strength = normalize(row['Fortësia']);
    const form = normalize(row['Forma farmaceutike']);
    const atc = normalize(row['ATC Code']);
    const prescription = normalize(row['Si të shënohet në recetë']);
    const packaging = normalize(row['Madhësia e paketimit']);
    const haystack = `${substance} ${trade} ${strength} ${form} ${atc} ${prescription} ${packaging}`;
    if (!tokens.every(token => haystack.includes(token))) return -1;
    let score = 0;
    if (substance === query) score += 120;
    else if (substance.startsWith(query)) score += 90;
    else if (substance.includes(query)) score += 65;
    if (trade === query) score += 100;
    else if (trade.startsWith(query)) score += 75;
    else if (trade.includes(query)) score += 50;
    if (prescription.startsWith(query)) score += 40;
    if (atc.startsWith(query)) score += 35;
    if (strength.includes(query)) score += 12;
    return score;
  }

  async function rows() {
    if (!rowsPromise) rowsPromise = loadRows().catch(error => {
      rowsPromise = null;
      throw error;
    });
    return rowsPromise;
  }

  async function search(rawQuery, options = {}) {
    const query = normalize(clean(rawQuery).slice(0, MAX_QUERY_LENGTH));
    const limit = Math.min(50, Math.max(1, Number(options.limit || 12)));
    if (query.length < 2) return [];
    const tokens = query.split(/\s+/).filter(Boolean);
    const registryRows = await rows();
    return registryRows
      .map(row => ({ row, score: rank(row, query, tokens) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score || clean(a.row['Substanca aktive']).localeCompare(clean(b.row['Substanca aktive']), 'sq'))
      .slice(0, limit)
      .map(item => resultFromRow(item.row));
  }

  window.MedIndexLocalRegistry = {
    search,
    ready: rows,
    resetMemory() { rowsPromise = null; },
  };
  window.dispatchEvent(new CustomEvent('medindex:local-registry-ready'));
})();
