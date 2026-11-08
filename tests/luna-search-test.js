'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Luna = require('../lib/luna-search-core.js');

const ID = '8bbd248b-e46c-483a-a781-8ca0c69844b1';
const OTHER = '5c2e4aae-780e-4b5c-8b79-580e4a0d3997';

async function run() {
  assert.equal(Luna.MODEL, 'gpt-6-luna');
  assert.equal(Luna.validQuestion('Amoxicillin fëmijë 12 kg'), true);
  assert.equal(Luna.validQuestion('person@example.com merr amoxicillin'), false);
  assert.equal(Luna.validQuestion('+383 44 123 456 amoxicillin'), false);
  assert.equal(Luna.validQuestion('x'.repeat(221)), false);
  assert.deepEqual(Luna.normalizeTerms(['  Amoxicillin ', 'amoxicillin','Ceftriaxone', '<script>', 'Azithromycin']), ['Amoxicillin','Ceftriaxone','script']);

  const requests = [];
  const mockFetch = async (url, options) => {
    requests.push({ url, options, body:JSON.parse(options.body) });
    return {ok:true, json:async () => ({
      status:'completed',
      output:[{type:'message', content:[{type:'output_text', text:'{"terms":["amoxicillin","J01CA04"]}'}]}],
    })};
  };
  assert.deepEqual(await Luna.extractTerms('amoxicillin 12 kg', 'test-key', mockFetch), ['amoxicillin','J01CA04']);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[0].body.model, 'gpt-6-luna');
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].body.reasoning.effort, 'none');
  assert.equal(requests[0].body.text.format.strict, true);

  const searched = [];
  const mockSearch = { buildSearchPath(term, limit) { return {path:'rpc/search', method:'POST', body:{term,limit}}; } };
  const mockRequest = async (path, opts) => {
    searched.push({path,opts});
    if (path === 'rpc/search') return {data:[{id:ID},{id:OTHER}]};
    assert.match(path, /is_published=eq.true/);
    assert.match(path, /editorial_status=eq.published/);
    return {data:[{id:ID,trade_name:'Amoxicillin',active_substance:'Amoxicillin',strength:'500 mg',pharmaceutical_form:'Tablet',pdid:'55'}]};
  };
  const rows = await Luna.findPublishedDrugs(['Amoxicillin'], mockSearch, mockRequest);
  assert.equal(rows.length, 1, 'unpublished candidate must not be returned');
  assert.equal(rows[0].id, ID);
  assert.equal(rows[0].strength, '500 mg');
  assert.equal(searched.length, 2);
  assert.deepEqual(await Luna.findPublishedDrugs([], mockSearch, mockRequest), []);
  assert.equal(searched.length, 2, 'no unnecessary database calls without extracted terms');
  const root = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(root, 'vercel.json'))) {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    assert.equal(config.rewrites.find(row => row.source === '/api/luna-search')?.destination, '/api/gemini-prescription-secure?lunaSearch=1');
    assert.ok(!fs.existsSync(path.join(root, 'api/luna-search.js')), 'Luna must not consume another Vercel Hobby function');
    const gateway = fs.readFileSync(path.join(root, 'api/gemini-prescription-secure.js'), 'utf8');
    assert.match(gateway, /lunaSearch/);
    assert.match(gateway, /lib\/luna-search-handler\.js/);
  }
  console.log('Luna DRx contract tests passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
