'use strict';

const FullIcd = require('./icd-full-hierarchy.js');

const REQUIRED_COLUMNS = Object.freeze([
  'Niveli',
  'Kodi ICD-10',
  'Titulli zyrtar — English',
  'Titulli — Shqip',
]);

const HEADER_ALIASES = Object.freeze({
  niveli:'Niveli',
  level:'Niveli',
  kapitulli:'Kapitulli',
  chapter:'Kapitulli',
  blloku:'Blloku',
  block:'Blloku',
  'kodi icd 10':'Kodi ICD-10',
  'icd 10 code':'Kodi ICD-10',
  'icd code':'Kodi ICD-10',
  kodi:'Kodi ICD-10',
  'titulli zyrtar english':'Titulli zyrtar — English',
  'titulli english':'Titulli zyrtar — English',
  'official title english':'Titulli zyrtar — English',
  'english title':'Titulli zyrtar — English',
  'titulli shqip':'Titulli — Shqip',
  'titulli albanian':'Titulli — Shqip',
  'albanian title':'Titulli — Shqip',
  'title shqip':'Titulli — Shqip',
  'kodi prind':'Kodi prind',
  'parent code':'Kodi prind',
  'rruga e plote':'Rruga e plotë',
  path:'Rruga e plotë',
  burimi:'Burimi',
  source:'Burimi',
  perkthimi:'Përkthimi',
  translation:'Përkthimi',
  'roli ne mjekesine familjare':'Roli në mjekësinë familjare',
  'roli ne mf':'Roli në mjekësinë familjare',
  'primary care role':'Roli në mjekësinë familjare',
  'menaxhimi i shkurter':'Menaxhimi i shkurtër',
  management:'Menaxhimi i shkurtër',
  'management summary':'Menaxhimi i shkurtër',
});

const clean = value => String(value ?? '')
  .replace(/^\uFEFF/, '')
  .replace(/\u00a0/g, ' ')
  .trim();

function canonicalHeader(value) {
  const raw = clean(value);
  const key = FullIcd.normalize(raw);
  return HEADER_ALIASES[key] || raw;
}

function inspectRows(rows, { maxHeaderRows = 40 } = {}) {
  const source = Array.isArray(rows) ? rows : [];
  const limit = Math.min(source.length, Math.max(1, Number(maxHeaderRows) || 40));
  let best = null;

  for (let index = 0; index < limit; index += 1) {
    const row = Array.isArray(source[index]) ? source[index] : [];
    const headers = row.map(canonicalHeader);
    const found = new Set(headers.filter(Boolean));
    const matched = REQUIRED_COLUMNS.filter(column => found.has(column));
    const missing = REQUIRED_COLUMNS.filter(column => !found.has(column));
    const candidate = { index, headers, matched, missing };
    if (!best || matched.length > best.matched.length) best = candidate;
    if (!missing.length) return candidate;
  }

  const error = new Error(
    `Nuk u gjet rreshti i kolonave të hierarkisë ICD-10. Mungojnë: ${(best?.missing || REQUIRED_COLUMNS).join(', ')}.`,
  );
  error.code = 'ICD_HIERARCHY_HEADER_MISSING';
  error.headerInspection = {
    inspectedRows:limit,
    bestRow:best ? best.index + 1 : null,
    matched:best?.matched || [],
    missing:best?.missing || REQUIRED_COLUMNS,
  };
  throw error;
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stringifyCsv(rows) {
  return rows.map(row => (Array.isArray(row) ? row : []).map(escapeCsv).join(',')).join('\n');
}

function normalizeCsvHeaders(value, options = {}) {
  const rows = FullIcd.parseCsv(String(value || ''));
  const inspection = inspectRows(rows, options);
  const normalizedRows = rows.map(row => (Array.isArray(row) ? row.slice() : []));
  normalizedRows[inspection.index] = inspection.headers;
  return {
    text:stringifyCsv(normalizedRows),
    headerRow:inspection.index + 1,
    headers:inspection.headers,
    matched:inspection.matched,
  };
}

module.exports = {
  REQUIRED_COLUMNS,
  HEADER_ALIASES,
  canonicalHeader,
  inspectRows,
  stringifyCsv,
  normalizeCsvHeaders,
};
