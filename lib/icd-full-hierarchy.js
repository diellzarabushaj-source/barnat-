'use strict';

const EXPECTED_COUNTS = Object.freeze({
  chapter:22,
  block:274,
  category:2050,
  subcategory:10196,
  total:12542,
});

const LEVELS = Object.freeze({
  KAPITULL:'chapter',
  BLLOK:'block',
  KATEGORI:'category',
  'NËNKATEGORI':'subcategory',
  NENKATEGORI:'subcategory',
});

const clean = value => String(value ?? '').trim();
const normalize = value => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function parseCsv(value) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const text = String(value || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function headerIndex(rows) {
  return rows.findIndex(row => {
    const cells = row.map(normalize);
    return cells.includes('niveli')
      && cells.includes('kodi icd 10')
      && cells.includes('titulli zyrtar english')
      && cells.includes('titulli shqip');
  });
}

function stripPresentation(value, level) {
  let result = clean(value)
    .replace(/^\s*[▸▹•]\s*/, '')
    .replace(/^\s+/, '');
  if (level === 'chapter') result = result.replace(/^Chapter\s+[IVXLCDM]+\s+—\s+/i, '');
  if (level === 'block') result = result.replace(/^[A-Z]\d{2}(?:-[A-Z]?\d{2})?\s+/, '');
  return result.trim();
}

function translationStatus(value) {
  const title = clean(value);
  if (!title || /^loading\.{3}$/i.test(title) || /^#(n\/a|error|value!)/i.test(title)) return 'missing';
  return 'machine-draft';
}

function officialUrl(code) {
  return `https://icd.who.int/browse10/2019/en#/${encodeURIComponent(clean(code))}`;
}

function rowToNode(row, headers, rowNumber) {
  const record = Object.fromEntries(headers.map((header, index) => [clean(header), clean(row[index])]));
  const rawLevel = clean(record.Niveli).toUpperCase();
  const level = LEVELS[rawLevel] || LEVELS[normalize(rawLevel).toUpperCase()];
  if (!level) return null;
  const code = clean(record['Kodi ICD-10']);
  const englishTitle = stripPresentation(record['Titulli zyrtar — English'], level);
  const rawAlbanian = record['Titulli — Shqip'];
  const status = translationStatus(rawAlbanian);
  const albanianDraft = status === 'missing' ? '' : stripPresentation(rawAlbanian, level);
  return {
    code,
    level,
    chapter:clean(record.Kapitulli),
    block:clean(record.Blloku),
    parentCode:clean(record['Kodi prind']),
    englishTitle,
    albanianDraft,
    displayTitle:albanianDraft || englishTitle,
    translationStatus:status,
    sourceUrl:officialUrl(code),
    sourceRow:rowNumber,
    searchText:normalize([code, englishTitle, albanianDraft, record.Kapitulli, record.Blloku, record['Kodi prind']].join(' ')),
  };
}

function validate(nodes, { strictCounts = true } = {}) {
  const errors = [];
  const seen = new Set();
  const byCode = new Map();
  const counts = { chapter:0, block:0, category:0, subcategory:0, total:nodes.length };

  for (const node of nodes) {
    if (!node.code) errors.push(`Rreshti ${node.sourceRow}: mungon kodi ICD-10.`);
    if (!node.englishTitle) errors.push(`Rreshti ${node.sourceRow}: mungon titulli zyrtar anglisht.`);
    if (seen.has(node.code)) errors.push(`Kodi i dyfishtë: ${node.code}.`);
    seen.add(node.code);
    byCode.set(node.code, node);
    if (Object.hasOwn(counts, node.level)) counts[node.level] += 1;
  }

  for (const node of nodes) {
    if (node.level === 'chapter') {
      if (node.parentCode) errors.push(`Kapitulli ${node.code} nuk duhet të ketë prind.`);
      continue;
    }
    if (!node.parentCode) errors.push(`${node.code}: mungon kodi prind.`);
    else if (!byCode.has(node.parentCode)) errors.push(`${node.code}: prindi ${node.parentCode} nuk ekziston.`);
  }

  if (strictCounts) {
    for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
      if (counts[key] !== expected) errors.push(`Numri ${key} është ${counts[key]}, pritej ${expected}.`);
    }
  }

  if (errors.length) {
    const error = new Error(`ICD-10 full hierarchy validation failed: ${errors.slice(0, 12).join(' ')}`);
    error.validationErrors = errors;
    throw error;
  }

  return counts;
}

function buildDataset(csv, options = {}) {
  const rows = parseCsv(csv);
  const index = headerIndex(rows);
  if (index < 0) throw new Error('Nuk u gjet rreshti i kolonave të hierarkisë ICD-10.');
  const headers = rows[index].map(clean);
  const nodes = rows.slice(index + 1)
    .map((row, offset) => rowToNode(row, headers, index + offset + 2))
    .filter(Boolean);
  const counts = validate(nodes, options);
  const missingTranslations = nodes.filter(node => node.translationStatus === 'missing').length;
  const machineDraftTranslations = nodes.length - missingTranslations;
  return {
    version:'ICD-10-WHO 2019',
    sourceSpreadsheetId:'1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0',
    sheetName:'ICD-10 EN-SQ',
    counts,
    quality:{
      missingTranslations,
      machineDraftTranslations,
      verifiedTranslations:0,
      translationCoverage:Number(((machineDraftTranslations / Math.max(1, nodes.length)) * 100).toFixed(2)),
      publicationReady:false,
    },
    nodes,
  };
}

function queryDataset(dataset, params = {}) {
  const parent = clean(params.parent);
  const chapter = clean(params.chapter);
  const level = clean(params.level);
  const query = normalize(params.q);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 50));
  const page = Math.max(1, Number(params.page) || 1);
  const queryTokens = query.split(' ').filter(Boolean);

  let rows = dataset.nodes.filter(node => {
    if (parent && node.parentCode !== parent) return false;
    if (chapter && node.chapter !== chapter) return false;
    if (level && node.level !== level) return false;
    return queryTokens.every(token => node.searchText.includes(token));
  });

  if (queryTokens.length) {
    rows = rows.map(node => {
      const code = normalize(node.code);
      const sq = normalize(node.albanianDraft);
      const en = normalize(node.englishTitle);
      let score = 0;
      if (code === query) score += 1000;
      else if (code.startsWith(query)) score += 700;
      if (sq === query || en === query) score += 600;
      else if (sq.startsWith(query) || en.startsWith(query)) score += 350;
      score += queryTokens.reduce((sum, token) => sum + (node.searchText.includes(token) ? 20 : 0), 0);
      return { node, score };
    }).sort((a, b) => b.score - a.score || a.node.code.localeCompare(b.node.code, 'en', { numeric:true })).map(item => item.node);
  } else {
    rows.sort((a, b) => a.sourceRow - b.sourceRow);
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    total,
    totalPages:Math.max(1, Math.ceil(total / pageSize)),
    rows:rows.slice(start, start + pageSize),
  };
}

module.exports = {
  EXPECTED_COUNTS,
  parseCsv,
  buildDataset,
  queryDataset,
  translationStatus,
  stripPresentation,
};
