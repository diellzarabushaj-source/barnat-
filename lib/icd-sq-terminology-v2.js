'use strict';

const Base = require('./icd-sq-terminology.js');
const EndocrineTerms = require('./icd-sq-terms-iv.json');
const RespiratoryTerms = require('./icd-sq-terms-x.json');
const DigestiveTerms = require('./icd-sq-terms-xi.json');
const MusculoskeletalTerms = require('./icd-sq-terms-xiii.json');
const GenitourinaryTerms = require('./icd-sq-terms-xiv.json');
const SymptomTerms = require('./icd-sq-terms-xviii.json');

const TERMINOLOGY_VERSION = 'sq-terminology-2026.3';
const PILOT_CHAPTER = 'IX';
const PILOT_CHAPTERS = Object.freeze(['IV', 'IX', 'X', 'XI', 'XIII', 'XIV', 'XVIII']);
const CHAPTER_TERMS = Base.CHAPTER_TERMS;
const CODE_TERMS = Object.freeze({
  ...Base.CODE_TERMS,
  ...EndocrineTerms,
  ...RespiratoryTerms,
  ...DigestiveTerms,
  ...MusculoskeletalTerms,
  ...GenitourinaryTerms,
  ...SymptomTerms,
});
const SAFE_REPEATED_WORDS = new Set(['të', 'e', 'i', 'së', 'në', 'me', 'pa']);

const clean = value => String(value ?? '').trim();
const normalize = Base.normalize;

function sourceForCode(code) {
  const value = clean(code).toUpperCase();
  if (value.startsWith('E')) return 'medindex-editorial-pilot-iv';
  if (value.startsWith('J')) return 'medindex-editorial-pilot-x';
  if (value.startsWith('K')) return 'medindex-editorial-pilot-xi';
  if (value.startsWith('M')) return 'medindex-editorial-pilot-xiii';
  if (value.startsWith('N')) return 'medindex-editorial-pilot-xiv';
  if (value.startsWith('R')) return 'medindex-editorial-pilot-xviii';
  if (value.startsWith('I')) return 'medindex-editorial-pilot-ix';
  return 'medindex-editorial-standard';
}

function terminologyEntry(node) {
  if (node?.level === 'chapter' && CHAPTER_TERMS[node.code]) {
    return {
      title:CHAPTER_TERMS[node.code],
      aliases:[],
      status:'standardized',
      source:'medindex-chapter-standard',
    };
  }
  const entry = CODE_TERMS[node?.code];
  if (!entry) return null;
  return {
    ...entry,
    aliases:Array.isArray(entry.aliases) ? entry.aliases : [],
    status:entry.status || 'standardized',
    source:entry.source || sourceForCode(node.code),
  };
}

function adjacentRepeatedWords(title) {
  const tokens = (clean(title).match(/\p{L}+/gu) || [])
    .map(normalize)
    .filter(Boolean);
  const repeats = [];
  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index] === tokens[index - 1]) repeats.push(tokens[index]);
  }
  return repeats;
}

function lintTitle(title, englishTitle = '') {
  const flags = Base.lintTitle(title, englishTitle);
  if (!flags.includes('DUPLICATED_WORD')) return flags;
  const repeats = adjacentRepeatedWords(title);
  if (!repeats.length || repeats.every(word => SAFE_REPEATED_WORDS.has(word))) {
    return flags.filter(flag => flag !== 'DUPLICATED_WORD');
  }
  return flags;
}

function applyNode(node) {
  const draft = clean(node?.albanianDraft);
  const entry = terminologyEntry(node);
  if (entry) {
    const title = clean(entry.title);
    const aliases = entry.aliases.map(clean).filter(Boolean);
    return {
      ...node,
      machineDraftTitle:draft,
      albanianDraft:title,
      displayTitle:title || node.englishTitle,
      translationStatus:entry.status,
      reviewState:entry.status,
      terminologyVersion:TERMINOLOGY_VERSION,
      terminologySource:entry.source,
      terminologyAliases:aliases,
      terminologyFlags:lintTitle(title, node.englishTitle),
      searchText:normalize([
        node.code,
        node.englishTitle,
        title,
        draft,
        aliases.join(' '),
        node.chapter,
        node.block,
        node.parentCode,
      ].join(' ')),
    };
  }

  const status = draft ? 'machine-draft' : 'missing';
  return {
    ...node,
    machineDraftTitle:draft,
    translationStatus:status,
    reviewState:status === 'missing' ? 'missing' : 'pending-review',
    terminologyVersion:TERMINOLOGY_VERSION,
    terminologySource:draft ? 'sheet-machine-draft' : 'missing',
    terminologyAliases:[],
    terminologyFlags:lintTitle(draft, node.englishTitle),
    searchText:normalize([
      node.code,
      node.englishTitle,
      draft,
      node.chapter,
      node.block,
      node.parentCode,
    ].join(' ')),
  };
}

function quality(nodes) {
  const rows = Array.isArray(nodes) ? nodes : [];
  const count = status => rows.filter(node => node.translationStatus === status).length;
  const missingTranslations = count('missing');
  const machineDraftTranslations = count('machine-draft');
  const standardizedTranslations = count('standardized');
  const verifiedTranslations = count('verified');
  const reviewedTranslations = standardizedTranslations + verifiedTranslations;
  const translated = rows.length - missingTranslations;
  const flaggedTranslations = rows.filter(node => (node.terminologyFlags || []).length > 0).length;
  const standardizedByChapter = Object.fromEntries(
    PILOT_CHAPTERS.map(chapter => [
      chapter,
      rows.filter(node => node.chapter === chapter
        && ['standardized', 'verified'].includes(node.translationStatus)).length,
    ]),
  );

  return {
    missingTranslations,
    machineDraftTranslations,
    standardizedTranslations,
    verifiedTranslations,
    reviewedTranslations,
    flaggedTranslations,
    standardizedByChapter,
    translationCoverage:Number(((translated / Math.max(1, rows.length)) * 100).toFixed(2)),
    terminologyCoverage:Number(((reviewedTranslations / Math.max(1, rows.length)) * 100).toFixed(2)),
    publicationReady:missingTranslations === 0
      && machineDraftTranslations === 0
      && flaggedTranslations === 0,
    terminologyVersion:TERMINOLOGY_VERSION,
    pilotChapter:PILOT_CHAPTER,
    pilotChapters:[...PILOT_CHAPTERS],
  };
}

module.exports = {
  TERMINOLOGY_VERSION,
  PILOT_CHAPTER,
  PILOT_CHAPTERS,
  CHAPTER_TERMS,
  CODE_TERMS,
  applyNode,
  adjacentRepeatedWords,
  lintTitle,
  quality,
  normalize,
  sourceForCode,
};
