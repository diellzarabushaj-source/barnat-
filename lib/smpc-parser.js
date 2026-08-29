'use strict';

const SECTION_TITLES = Object.freeze({
  '4.1':'therapeutic_indications',
  '4.2':'posology_and_method_of_administration',
  '4.3':'contraindications',
  '4.4':'special_warnings_and_precautions',
  '4.5':'interactions',
  '4.6':'fertility_pregnancy_lactation',
  '4.7':'effects_on_driving_and_machines',
  '4.8':'undesirable_effects',
  '4.9':'overdose',
});

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|section|article|h1|h2|h3|h4|h5|h6|li|tr|table|ul|ol)>/gi, '\n')
      .replace(/<(?:p|div|section|article|h1|h2|h3|h4|h5|h6|li|tr|table|ul|ol)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeClinicalText(input) {
  const raw = String(input || '');
  const text = /<[^>]+>/.test(raw) ? htmlToText(raw) : decodeEntities(raw);
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function headingMatches(text) {
  const regex = /(?:^|\n)\s*((?:4\.[1-9])|(?:5(?:\.\d+)?))\.?\s+([^\n]{0,220})/g;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      code:match[1],
      title:String(match[2] || '').trim(),
      start:match.index + (match[0].startsWith('\n') ? 1 : 0),
      contentStart:regex.lastIndex,
    });
  }
  return matches;
}

function extractClinicalSections(input) {
  const text = normalizeClinicalText(input);
  const headings = headingMatches(text);
  const sections = {};

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    if (!SECTION_TITLES[current.code]) continue;
    const next = headings.slice(i + 1).find(item =>
      SECTION_TITLES[item.code] || /^5(?:\.|$)/.test(item.code)
    );
    const end = next ? next.start : text.length;
    const body = text.slice(current.contentStart, end).trim();
    sections[current.code] = {
      code:current.code,
      key:SECTION_TITLES[current.code],
      heading:current.title,
      text:body,
      characterCount:body.length,
    };
  }

  const present = Object.keys(sections).sort();
  const missing = Object.keys(SECTION_TITLES).filter(code => !sections[code]);
  return {
    schemaVersion:'drx-smpc-sections-v1',
    sections,
    present,
    missing,
    clinicalSectionCoverage:present.length / Object.keys(SECTION_TITLES).length,
    doseSectionPresent:Boolean(sections['4.2']?.text),
    indicationsSectionPresent:Boolean(sections['4.1']?.text),
    sourceTextCharacters:text.length,
  };
}

function publicationExtractionGate(parsed) {
  const value = parsed && typeof parsed === 'object' ? parsed : {};
  if (!value.indicationsSectionPresent) return { allowed:false, reason:'section_4_1_missing' };
  if (!value.doseSectionPresent) return { allowed:false, reason:'section_4_2_missing' };
  if (!value.sections?.['4.2']?.text?.trim()) return { allowed:false, reason:'section_4_2_empty' };
  return { allowed:true, reason:'required_smpc_sections_present' };
}

module.exports = {
  SECTION_TITLES,
  decodeEntities,
  htmlToText,
  normalizeClinicalText,
  extractClinicalSections,
  publicationExtractionGate,
};
