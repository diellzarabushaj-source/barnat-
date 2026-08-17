'use strict';

/*
 * Adapter i hollë për dy fushat PRN të Neon-it. Handler-i klinik ekzistues
 * mbetet i ngrirë; vetëm SELECT-i i tij zgjerohet para se të arrijë te Data API.
 */

const dataApi = require('./neon-data-api.js');
const originalNeonRequest = dataApi.neonRequest;
const PRN_SAFETY_COLUMNS = Object.freeze([
  'pediatric_max_doses_per_day',
  'pediatric_min_interval_hours',
]);

function augmentPediatricDrugSelect(requestPath) {
  const raw = String(requestPath || '');
  if (!raw.startsWith('drugs?')) return requestPath;

  const query = raw.slice('drugs?'.length);
  const params = new URLSearchParams(query);
  const select = params.get('select');
  if (!select || !select.includes('pediatric_')) return requestPath;

  const columns = select.split(',').map(item => item.trim()).filter(Boolean);
  for (const column of PRN_SAFETY_COLUMNS) {
    if (!columns.includes(column)) columns.push(column);
  }
  params.set('select', columns.join(','));
  return `drugs?${params.toString()}`;
}

dataApi.neonRequest = (requestPath, options) => originalNeonRequest(
  augmentPediatricDrugSelect(requestPath),
  options,
);

/* Core-i e kap adapterin e Data API në require-time. */
const handler = require('./pediatric-dosage-handler-core.js');
dataApi.neonRequest = originalNeonRequest;

handler.PEDIATRIC_COLUMNS = [...handler.PEDIATRIC_COLUMNS, ...PRN_SAFETY_COLUMNS];
handler.PRN_SAFETY_COLUMNS = PRN_SAFETY_COLUMNS;
handler.augmentPediatricDrugSelect = augmentPediatricDrugSelect;

module.exports = handler;
