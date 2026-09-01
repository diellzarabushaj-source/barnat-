'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const api = read('api/drug-search.js');
const registry = read('registry-v2.js');
const cardHandler = read('lib/dosage-card-handler.js');
const migration = read('supabase/migrations/20260901230042_expand_ranked_drug_search_limit_to_50.sql');

assert.match(migration, /create\s+or\s+replace\s+function\s+public\.medindex_search_drugs_v2/i);
assert.match(migration, /translate\(lower[\s\S]*?'ëç'\s*,\s*'ec'/i);
assert.match(migration, /or\s+d\.pdid\s*=\s*q/i);
assert.match(migration, /identity_norm/);
assert.match(migration, /identity_token_all/);
assert.match(migration, /least\(greatest\(coalesce\(p_limit,\s*20\),\s*1\),\s*50\)/i);

assert.match(api, /const SEARCH_MAX_LIMIT = 50;/);
assert.match(api, /view === 'registry-search'/);
assert.match(api, /sendRankedRegistrySearch/);
assert.match(api, /searchVersion:'v3'/);
assert.match(api, /sourceFields:sourceFields\(source\)/);
assert.match(api, /p_limit:boundedLimit/);

assert.match(registry, /view:rankedSearch \? 'registry-search' : 'registry-page'/);
assert.match(registry, /view=cards&nrs=/);
assert.match(registry, /Të dhënat e plota nga databaza/);
assert.match(registry, /sourceDose\(detail, 'pediatric'\)/);
assert.match(registry, /sourceDose\(detail, 'adult'\)/);
assert.match(registry, /sourceFields\.map/);

assert.match(cardHandler, /Promise\.allSettled/);
assert.match(cardHandler, /profileAvailable/);
assert.doesNotThrow(() => new Function(registry));
assert.doesNotThrow(() => new Function(api));
assert.doesNotThrow(() => new Function(cardHandler));

console.log('Registry search v3 + dosage detail resilience contract passed.');
