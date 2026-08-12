'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'api', 'drug-search.js');
const MARKER = 'phase6-atc-counts-neon-v2';

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const constantsAnchor = `const REGISTRY_MAX_QUERY_LENGTH = 80;`;
  const constants = `${constantsAnchor}\nconst ATC_COUNTS_PAGE_SIZE = 250;\nconst ATC_COUNTS_MAX_ROWS = 6000;\nconst ATC_COUNTS_CACHE_TTL_MS = 30 * 60 * 1000;\nconst ATC_COUNTS_REVISION_CHECK_MS = 60 * 1000;\nconst ATC_COUNTS_RUNTIME = '${MARKER}';\nlet atcCountsCache = null;\nlet atcCountsRevisionCheckedAt = 0;`;
  if (!source.includes(constantsAnchor)) throw new Error('Phase 6 ATC patch: constants anchor missing.');
  source = source.replace(constantsAnchor, constants);

  const helperAnchor = `function resultFromRow(row) {`;
  const helpers = `async function fetchAtcCountRowsFromNeon() {\n  const rows = [];\n  for (let offset = 0; offset < ATC_COUNTS_MAX_ROWS; offset += ATC_COUNTS_PAGE_SIZE) {\n    const params = new URLSearchParams();\n    params.set('select', 'registry_number,atc_code');\n    params.set('is_published', 'eq.true');\n    params.set('editorial_status', 'eq.published');\n    params.set('order', 'registry_number.asc');\n    params.set('limit', String(ATC_COUNTS_PAGE_SIZE));\n    params.set('offset', String(offset));\n    const { data } = await neonRequest(\`drugs?\${params.toString()}\`, {\n      timeoutMs:5000,\n      label:'ATC count projection',\n    });\n    if (!Array.isArray(data)) throw new Error('Neon ATC projection did not return a list.');\n    rows.push(...data);\n    if (data.length < ATC_COUNTS_PAGE_SIZE) return rows;\n  }\n  throw new Error(\`ATC projection exceeded the hard cap of \${ATC_COUNTS_MAX_ROWS} rows.\`);\n}\n\nasync function currentAtcRegistryRevision() {\n  return clean(await RegistryRevision.getRegistryRevision({ maxAgeMs:ATC_COUNTS_REVISION_CHECK_MS }));\n}\n\nasync function neonAtcCounts() {\n  const now = Date.now();\n  if (atcCountsCache?.value && atcCountsCache.expiresAt > now) {\n    if (now - atcCountsRevisionCheckedAt < ATC_COUNTS_REVISION_CHECK_MS) {\n      return { ...atcCountsCache.value, cacheState:'fresh' };\n    }\n    try {\n      const revision = await currentAtcRegistryRevision();\n      atcCountsRevisionCheckedAt = Date.now();\n      if (revision && revision === atcCountsCache.value.registryVersion) {\n        return { ...atcCountsCache.value, cacheState:'revision-hit' };\n      }\n    } catch {\n      atcCountsRevisionCheckedAt = Date.now();\n      return { ...atcCountsCache.value, source:'memory-stale-atc', cacheState:'stale' };\n    }\n  }\n\n  try {\n    let registryVersion = '';\n    try { registryVersion = await currentAtcRegistryRevision(); }\n    catch { registryVersion = ''; }\n    const rows = await fetchAtcCountRowsFromNeon();\n    const summary = countAtcRows(rows);\n    const value = {\n      ...summary,\n      registryVersion,\n      generatedAt:new Date().toISOString(),\n      source:'neon-bounded-atc',\n    };\n    atcCountsCache = { value, expiresAt:Date.now() + ATC_COUNTS_CACHE_TTL_MS };\n    atcCountsRevisionCheckedAt = Date.now();\n    return { ...value, cacheState:'fresh' };\n  } catch (error) {\n    if (atcCountsCache?.value) {\n      return { ...atcCountsCache.value, source:'memory-stale-atc', cacheState:'stale' };\n    }\n    throw error;\n  }\n}\n\n${helperAnchor}`;
  if (!source.includes(helperAnchor)) throw new Error('Phase 6 ATC patch: helper anchor missing.');
  source = source.replace(helperAnchor, helpers);

  const oldHandler = `  if (view === 'atc-counts') {\n    try {\n      const { rows, meta } = await registryHandler.getRegistryDataset();\n      const summary = countAtcRows(rows);\n      res.setHeader('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');\n      res.setHeader('Server-Timing', \`atccounts;dur=\${Date.now() - startedAt}\`);\n      return res.status(200).json({\n        ok:true,\n        ...summary,\n        registryVersion:clean(meta?.version),\n        generatedAt:new Date().toISOString(),\n      });\n    } catch (error) {\n      console.error('ATC counts error:', error);\n      res.setHeader('Cache-Control', 'private, no-store, max-age=0');\n      return res.status(500).json({ error:'Numërimet e kategorive nuk u ngarkuan.' });\n    }\n  }`;
  const newHandler = `  if (view === 'atc-counts') {\n    try {\n      const summary = await neonAtcCounts();\n      res.setHeader('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');\n      res.setHeader('Server-Timing', \`atccounts;dur=\${Date.now() - startedAt}\`);\n      res.setHeader('X-MedIndex-Data-Source', summary.source);\n      return res.status(200).json({ ok:true, ...summary });\n    } catch (error) {\n      console.error('ATC counts error:', error);\n      res.setHeader('Cache-Control', 'private, no-store, max-age=0');\n      res.setHeader('Retry-After', '30');\n      return res.status(503).json({ error:'Numërimet e kategorive nuk u ngarkuan.' });\n    }\n  }`;
  if (!source.includes(oldHandler)) throw new Error('Phase 6 ATC patch: legacy full-registry handler anchor missing.');
  source = source.replace(oldHandler, newHandler);

  const exportAnchor = `module.exports.countAtcRows = countAtcRows;`;
  const exports = `${exportAnchor}\nmodule.exports.fetchAtcCountRowsFromNeon = fetchAtcCountRowsFromNeon;\nmodule.exports.neonAtcCounts = neonAtcCounts;\nmodule.exports.ATC_COUNTS_PAGE_SIZE = ATC_COUNTS_PAGE_SIZE;\nmodule.exports.ATC_COUNTS_MAX_ROWS = ATC_COUNTS_MAX_ROWS;\nmodule.exports.ATC_COUNTS_CACHE_TTL_MS = ATC_COUNTS_CACHE_TTL_MS;\nmodule.exports.ATC_COUNTS_REVISION_CHECK_MS = ATC_COUNTS_REVISION_CHECK_MS;`;
  if (!source.includes(exportAnchor)) throw new Error('Phase 6 ATC patch: export anchor missing.');
  source = source.replace(exportAnchor, exports);
}

if (!source.includes(MARKER)) throw new Error('Phase 6 ATC patch marker missing after transformation.');
if (!source.includes("params.set('select', 'registry_number,atc_code')")) throw new Error('Phase 6 ATC projection is not explicit.');
if (!source.includes('ATC_COUNTS_PAGE_SIZE = 250')) throw new Error('Phase 6 ATC page size must stay within the Neon egress guard.');
if (!source.includes('ATC_COUNTS_MAX_ROWS = 6000')) throw new Error('Phase 6 ATC hard cap is missing.');
if (!source.includes('ATC_COUNTS_REVISION_CHECK_MS = 60 * 1000')) throw new Error('Phase 6 ATC revision probe interval is missing.');
if (!source.includes("cacheState:'revision-hit'")) throw new Error('Phase 6 ATC revision-hit cache path is missing.');
if (!source.includes("return res.status(503).json({ error:'Numërimet e kategorive nuk u ngarkuan.' })")) throw new Error('Phase 6 ATC controlled failure path is missing.');

const atcStart = source.indexOf("if (view === 'atc-counts')");
const atcEnd = source.indexOf('const rawQuery', atcStart);
if (atcStart < 0 || atcEnd < 0) throw new Error('Phase 6 ATC handler boundaries missing.');
const atcHandler = source.slice(atcStart, atcEnd);
if (/getRegistryDataset\s*\(/.test(atcHandler)) throw new Error('Phase 6 ATC path still loads the full registry dataset.');

fs.writeFileSync(TARGET, source, 'utf8');
console.log('Phase 6 revision-aware Neon ATC counts, bounded projection and no-full-registry contract passed.');
