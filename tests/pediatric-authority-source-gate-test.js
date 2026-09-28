'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pediatric-clinical-audit-v1.json'), 'utf8'));

const APPROVED_HOSTS = new Set([
  'medicalguidelines.msf.org',
  'www.medicines.org.uk',
  'dailymed.nlm.nih.gov',
  'www.dailymed.nlm.nih.gov',
  'www.cdc.gov',
  'cdc.gov',
  'www.ema.europa.eu',
  'www.fda.gov',
  'www.who.int',
  'iris.who.int',
  'platform.who.int',
  'cdn.who.int',
  'cps.ca',
  'www.rch.org.au',
]);

const drugs = Object.entries(audit.drugs || {});
assert.equal(drugs.length, 50);

let sourceCount = 0;
for (const [drugName, item] of drugs) {
  assert.ok(Array.isArray(item.sources) && item.sources.length > 0, `${drugName}: missing authoritative source`);

  for (const source of item.sources) {
    sourceCount += 1;
    assert.match(source.url, /^https:\/\//, `${drugName}: source must use HTTPS`);

    let url;
    assert.doesNotThrow(() => { url = new URL(source.url); }, `${drugName}: malformed source URL`);
    assert.equal(url.protocol, 'https:');
    assert.ok(APPROVED_HOSTS.has(url.hostname), `${drugName}: unapproved source host ${url.hostname}`);

    assert.ok(source.authority && source.authority.trim(), `${drugName}: authority label missing`);
    assert.ok(source.title && source.title.trim(), `${drugName}: source title missing`);
  }
}

assert.equal(sourceCount, 65, 'Current 50-drug audit must retain all 65 authoritative source references');

const blocked = drugs.filter(([,item]) => item.calculator?.disabled).map(([name]) => name).sort();
assert.deepStrictEqual(blocked, ['Calcium','Cefoperazone','Ranitidine']);

console.log('PASS: all 50 pediatric drugs are backed by 65 HTTPS references from approved authoritative domains');
