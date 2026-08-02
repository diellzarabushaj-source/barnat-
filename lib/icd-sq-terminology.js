'use strict';

const TERMINOLOGY_VERSION = 'sq-terminology-2026.1';
const PILOT_CHAPTER = 'IX';

const clean = value => String(value ?? '').trim();
const normalize = value => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const CHAPTER_TERMS = Object.freeze({
  I:'Sëmundje të caktuara infektive dhe parazitare',
  II:'Neoplazitë',
  III:'Sëmundjet e gjakut dhe organeve gjakformuese dhe disa çrregullime që përfshijnë mekanizmin imunitar',
  IV:'Sëmundjet endokrine, ushqyese dhe metabolike',
  V:'Çrregullimet mendore dhe të sjelljes',
  VI:'Sëmundjet e sistemit nervor',
  VII:'Sëmundjet e syrit dhe aparatit ndihmës të tij',
  VIII:'Sëmundjet e veshit dhe procesit mastoid',
  IX:'Sëmundjet e sistemit të qarkullimit të gjakut',
  X:'Sëmundjet e sistemit të frymëmarrjes',
  XI:'Sëmundjet e sistemit tretës',
  XII:'Sëmundjet e lëkurës dhe indit nënlëkuror',
  XIII:'Sëmundjet e sistemit muskuloskeletal dhe indit lidhor',
  XIV:'Sëmundjet e sistemit gjenitourinar',
  XV:'Shtatzënia, lindja dhe periudha e lehonisë',
  XVI:'Gjendje të caktuara me origjinë në periudhën perinatale',
  XVII:'Keqformime kongjenitale, deformime dhe anomali kromozomale',
  XVIII:'Simptoma, shenja dhe gjetje jonormale klinike e laboratorike, të paklasifikuara gjetkë',
  XIX:'Lëndime, helmime dhe pasoja të tjera të shkaqeve të jashtme',
  XX:'Shkaqe të jashtme të sëmundshmërisë dhe vdekshmërisë',
  XXI:'Faktorë që ndikojnë në gjendjen shëndetësore dhe kontaktin me shërbimet shëndetësore',
  XXII:'Kode për qëllime të veçanta',
});

const CODE_TERMS = Object.freeze({
  'I00-I02':{ title:'Ethet reumatike akute' },
  'I05-I09':{ title:'Sëmundjet kronike reumatike të zemrës' },
  'I10-I15':{ title:'Sëmundjet hipertensive' },
  'I20-I25':{ title:'Sëmundjet ishemike të zemrës' },
  'I26-I28':{ title:'Sëmundjet pulmonare të zemrës dhe sëmundjet e qarkullimit pulmonar' },
  'I30-I52':{ title:'Forma të tjera të sëmundjeve të zemrës' },
  'I60-I69':{ title:'Sëmundjet cerebrovaskulare' },
  'I70-I79':{ title:'Sëmundjet e arterieve, arteriolave dhe kapilarëve' },
  'I80-I89':{ title:'Sëmundjet e venave, enëve limfatike dhe nyjeve limfatike, të paklasifikuara gjetkë' },
  'I95-I99':{ title:'Çrregullime të tjera dhe të paspecifikuara të sistemit të qarkullimit' },
  I10:{ title:'Hipertensioni esencial (primar)', aliases:['tension i lartë', 'shtypje e lartë e gjakut', 'hipertension primar'] },
  I11:{ title:'Sëmundja hipertensive e zemrës' },
  I12:{ title:'Sëmundja hipertensive e veshkave' },
  I13:{ title:'Sëmundja hipertensive e zemrës dhe veshkave' },
  I15:{ title:'Hipertensioni sekondar' },
  I20:{ title:'Angina pektoris', aliases:['angina e kraharorit'] },
  I21:{ title:'Infarkti akut i miokardit', aliases:['infarkt i zemrës', 'atak në zemër'] },
  I22:{ title:'Infarkti pasues i miokardit' },
  I23:{ title:'Disa komplikime aktuale pas infarktit akut të miokardit' },
  I24:{ title:'Sëmundje të tjera akute ishemike të zemrës' },
  I25:{ title:'Sëmundja kronike ishemike e zemrës' },
  I26:{ title:'Embolia pulmonare' },
  I27:{ title:'Sëmundje të tjera pulmonare të zemrës' },
  I28:{ title:'Sëmundje të tjera të enëve pulmonare' },
  I30:{ title:'Perikarditi akut' },
  I31:{ title:'Sëmundje të tjera të perikardit' },
  I32:{ title:'Perikarditi në sëmundje të klasifikuara gjetkë' },
  I33:{ title:'Endokarditi akut dhe subakut' },
  I34:{ title:'Çrregullime joreumatike të valvulës mitrale' },
  I35:{ title:'Çrregullime joreumatike të valvulës aortale' },
  I36:{ title:'Çrregullime joreumatike të valvulës trikuspidale' },
  I37:{ title:'Çrregullime të valvulës pulmonare' },
  I38:{ title:'Endokarditi, valvula e paspecifikuar' },
  I39:{ title:'Endokarditi dhe çrregullimet e valvulave të zemrës në sëmundje të klasifikuara gjetkë' },
  I40:{ title:'Miokarditi akut' },
  I41:{ title:'Miokarditi në sëmundje të klasifikuara gjetkë' },
  I42:{ title:'Kardiomiopatia' },
  I43:{ title:'Kardiomiopatia në sëmundje të klasifikuara gjetkë' },
  I44:{ title:'Blloku atrioventrikular dhe blloku i degës së majtë' },
  I45:{ title:'Çrregullime të tjera të përçimit kardiak' },
  I46:{ title:'Arresti kardiak', aliases:['ndalja e zemrës'] },
  I47:{ title:'Takikardia paroksizmale' },
  I48:{ title:'Fibrilacioni dhe flutter-i atrial', aliases:['fibrilacion atrial', 'flutter atrial'] },
  I49:{ title:'Aritmi të tjera kardiake' },
  I50:{ title:'Pamjaftueshmëria e zemrës', aliases:['insuficienca kardiake', 'dështimi i zemrës'] },
  I51:{ title:'Komplikime dhe përshkrime të papërcaktuara të sëmundjes së zemrës' },
  I52:{ title:'Çrregullime të tjera të zemrës në sëmundje të klasifikuara gjetkë' },
  I60:{ title:'Hemorragjia subaraknoidale' },
  I61:{ title:'Hemorragjia intracerebrale' },
  I62:{ title:'Hemorragji të tjera intrakraniale jotraumatike' },
  I63:{ title:'Infarkti cerebral', aliases:['goditje ishemike', 'infarkt i trurit'] },
  I64:{ title:'Insulti cerebral, i paspecifikuar si hemorragji ose infarkt', aliases:['goditje në tru', 'stroke'] },
  I65:{ title:'Okluzioni dhe stenoza e arterieve precerebrale, pa shkaktuar infarkt cerebral' },
  I66:{ title:'Okluzioni dhe stenoza e arterieve cerebrale, pa shkaktuar infarkt cerebral' },
  I67:{ title:'Sëmundje të tjera cerebrovaskulare' },
  I68:{ title:'Çrregullime cerebrovaskulare në sëmundje të klasifikuara gjetkë' },
  I69:{ title:'Pasoja të sëmundjeve cerebrovaskulare' },
  I70:{ title:'Ateroskleroza' },
  I71:{ title:'Aneurizma dhe diseksioni i aortës' },
  I72:{ title:'Aneurizma dhe diseksione të tjera' },
  I73:{ title:'Sëmundje të tjera vaskulare periferike' },
  I74:{ title:'Embolia dhe tromboza arteriale' },
  I77:{ title:'Çrregullime të tjera të arterieve dhe arteriolave' },
  I78:{ title:'Sëmundjet e kapilarëve' },
  I79:{ title:'Çrregullime të arterieve, arteriolave dhe kapilarëve në sëmundje të klasifikuara gjetkë' },
  I80:{ title:'Flebiti dhe tromboflebiti' },
  I81:{ title:'Tromboza e venës portale' },
  I82:{ title:'Emboli dhe tromboza të tjera venoze' },
  I83:{ title:'Venat varikoze të ekstremiteteve të poshtme' },
  I85:{ title:'Varicet e ezofagut' },
  I86:{ title:'Venat varikoze të lokalizimeve të tjera' },
  I87:{ title:'Çrregullime të tjera të venave' },
  I88:{ title:'Limfadeniti jospecifik' },
  I89:{ title:'Çrregullime të tjera joinfektive të enëve dhe nyjeve limfatike' },
  I95:{ title:'Hipotensioni', aliases:['tension i ulët'] },
  I97:{ title:'Çrregullime të sistemit të qarkullimit pas procedurave, të paklasifikuara gjetkë' },
  I98:{ title:'Çrregullime të tjera të sistemit të qarkullimit në sëmundje të klasifikuara gjetkë' },
  I99:{ title:'Çrregullime të tjera dhe të paspecifikuara të sistemit të qarkullimit' },
});

const ENGLISH_FRAGMENT = /\b(and|with|without|other|unspecified|disease|diseases|disorder|disorders|syndrome|acute|chronic|due to|classified elsewhere)\b/i;

function terminologyEntry(node) {
  if (node?.level === 'chapter' && CHAPTER_TERMS[node.code]) {
    return { title:CHAPTER_TERMS[node.code], aliases:[], status:'standardized', source:'medindex-chapter-standard' };
  }
  const entry = CODE_TERMS[node?.code];
  if (!entry) return null;
  return { ...entry, aliases:entry.aliases || [], status:'standardized', source:'medindex-editorial-pilot-ix' };
}

function lintTitle(title, englishTitle = '') {
  const value = clean(title);
  const flags = [];
  if (!value) flags.push('MISSING_ALBANIAN');
  if (/^loading\.{3}$/i.test(value) || /^#(n\/a|error|value!)/i.test(value)) flags.push('SPREADSHEET_ERROR');
  if (value && normalize(value) === normalize(englishTitle)) flags.push('UNTRANSLATED_ENGLISH');
  if (ENGLISH_FRAGMENT.test(value)) flags.push('ENGLISH_FRAGMENT');
  if ((value.match(/\(/g) || []).length !== (value.match(/\)/g) || []).length) flags.push('UNBALANCED_PARENTHESES');
  if (/\b([\p{L}]+)\s+\1\b/iu.test(value)) flags.push('DUPLICATED_WORD');
  if (/\s{2,}/.test(value)) flags.push('EXTRA_WHITESPACE');
  return [...new Set(flags)];
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
        node.code, node.englishTitle, title, draft, aliases.join(' '),
        node.chapter, node.block, node.parentCode,
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
      node.code, node.englishTitle, draft, node.chapter, node.block, node.parentCode,
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
  return {
    missingTranslations,
    machineDraftTranslations,
    standardizedTranslations,
    verifiedTranslations,
    reviewedTranslations,
    flaggedTranslations,
    translationCoverage:Number(((translated / Math.max(1, rows.length)) * 100).toFixed(2)),
    terminologyCoverage:Number(((reviewedTranslations / Math.max(1, rows.length)) * 100).toFixed(2)),
    publicationReady:missingTranslations === 0 && machineDraftTranslations === 0 && flaggedTranslations === 0,
    terminologyVersion:TERMINOLOGY_VERSION,
    pilotChapter:PILOT_CHAPTER,
  };
}

module.exports = {
  TERMINOLOGY_VERSION,
  PILOT_CHAPTER,
  CHAPTER_TERMS,
  CODE_TERMS,
  applyNode,
  lintTitle,
  quality,
  normalize,
};
