'use strict';

const FullIcd = require('./icd-full-hierarchy.js');

const PARENT_LEVEL = Object.freeze({
  block:'chapter',
  category:'block',
  subcategory:'category',
});

const clean = value => String(value ?? '').trim();

function validate(nodes, options = {}) {
  const source = Array.isArray(nodes) ? nodes : [];
  const strictCounts = options.strictCounts !== false;
  const errors = [];
  const seen = new Set();
  const byCode = new Map();
  const counts = { chapter:0, block:0, category:0, subcategory:0, total:source.length };

  for (const node of source) {
    const code = clean(node?.code);
    const level = clean(node?.level);
    if (!code) errors.push(`Rreshti ${Number(node?.sourceRow || 0)}: mungon kodi ICD-10.`);
    if (!clean(node?.englishTitle)) errors.push(`Rreshti ${Number(node?.sourceRow || 0)}: mungon titulli zyrtar anglisht.`);
    if (seen.has(code)) errors.push(`Kodi i dyfishtë: ${code}.`);
    seen.add(code);
    byCode.set(code, node);
    if (Object.hasOwn(counts, level)) counts[level] += 1;
    else errors.push(`${code || 'Rresht pa kod'}: niveli ${level || 'mungon'} nuk është i vlefshëm.`);
  }

  for (const node of source) {
    const code = clean(node?.code);
    const level = clean(node?.level);
    const parentCode = clean(node?.parentCode);
    if (level === 'chapter') {
      if (parentCode) errors.push(`Kapitulli ${code} nuk duhet të ketë prind.`);
      continue;
    }
    if (!parentCode) {
      errors.push(`${code}: mungon kodi prind.`);
      continue;
    }
    const parent = byCode.get(parentCode);
    if (!parent) {
      errors.push(`${code}: prindi ${parentCode} nuk ekziston.`);
      continue;
    }
    if (clean(parent.level) !== PARENT_LEVEL[level]) {
      errors.push(`${code}: prindi ${parentCode} duhet të jetë ${PARENT_LEVEL[level]}, jo ${clean(parent.level)}.`);
    }
    if (level === 'block' && clean(node.chapter) !== clean(parent.code)) {
      errors.push(`${code}: kapitulli ${clean(node.chapter)} nuk përputhet me prindin ${clean(parent.code)}.`);
    }
    if (level === 'category' && clean(node.block) !== clean(parent.code)) {
      errors.push(`${code}: blloku ${clean(node.block)} nuk përputhet me prindin ${clean(parent.code)}.`);
    }
    if (level === 'subcategory' && clean(node.block) !== clean(parent.block)) {
      errors.push(`${code}: blloku ${clean(node.block)} nuk përputhet me kategorinë prind ${clean(parent.code)}.`);
    }
  }

  if (strictCounts) {
    for (const [key, expected] of Object.entries(FullIcd.EXPECTED_COUNTS)) {
      if (counts[key] !== expected) errors.push(`Numri ${key} është ${counts[key]}, pritej ${expected}.`);
    }
  }

  if (errors.length) {
    const error = new Error(`ICD-10 full hierarchy validation failed: ${errors.slice(0, 12).join(' ')}`);
    error.validationErrors = errors;
    error.counts = counts;
    throw error;
  }

  return counts;
}

module.exports = {
  PARENT_LEVEL,
  validate,
};
