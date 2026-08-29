'use strict';

const HardenedReader = require('./dose-v3-product-reader.js');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const truthy = value => ['1','TRUE','YES','ON'].includes(clean(value).toUpperCase());

function enabled(env = process.env) {
  return truthy(env.DRX_DOSE_V3_READS);
}

function strictMode(env = process.env) {
  return truthy(env.DRX_DOSE_V3_STRICT);
}

function selectorFilter(selector) {
  if (!selector) return null;
  if (selector.column === 'product_key' && clean(selector.value)) {
    return { product_key:'eq.' + clean(selector.value) };
  }
  if (selector.column === 'drug_id' && clean(selector.value)) {
    return { drug_id:'eq.' + clean(selector.value) };
  }
  return null;
}

async function buildProductPayload(selector, env = process.env) {
  if (!enabled(env)) return null;
  if (!selectorFilter(selector)) return null;
  return HardenedReader.build(selector);
}

module.exports = {
  enabled,
  strictMode,
  buildProductPayload,
  _test:{ clean, truthy, selectorFilter },
};
