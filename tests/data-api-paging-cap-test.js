'use strict';

/* Supabase zbaton një tavan `max-rows` mbi çdo kërkesë REST. Nëse ai tavan bie
   nën `PAGE_SIZE`-in që kërkon lexuesi, çdo faqe kthehet "e shkurtër" — dhe
   lexuesit që ndalonin te faqja e shkurtër e prisnin tabelën që në faqen e
   parë. Kështu paneli i administrimit tregonte vetëm 500 barna nga 4013 të
   publikuara.

   Ky test ngre një server që imiton atë tavan dhe kërkon që lexuesit të
   kthejnë çdo rresht. */

const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const SERVER_MAX_ROWS = 500;
const TOTAL_DRUGS = 4013;

function parseQuery(requestPath) {
  const url = new URL(String(requestPath).replace(/^\/+/, ''), 'https://stub.local/');
  return {
    table:url.pathname.replace(/^\/+/, '').split('/')[0],
    limit:Number(url.searchParams.get('limit') || 0),
    offset:Number(url.searchParams.get('offset') || 0),
  };
}

/* Zëvendëson `neonRequest` me një burim që ndan tabelat sipas emrit dhe kurrë
   nuk kthen më shumë se tavanin e serverit — pikërisht si Supabase. */
function stubDataApi(tables) {
  const requests = [];
  const stubPath = require.resolve('../lib/neon-data-api.js');
  const original = require.cache[stubPath];

  require.cache[stubPath] = new Module(stubPath, null);
  require.cache[stubPath].filename = stubPath;
  require.cache[stubPath].loaded = true;
  require.cache[stubPath].exports = {
    neonRequest:async requestPath => {
      const { table, limit, offset } = parseQuery(requestPath);
      requests.push({ table, limit, offset });
      const rows = tables[table] || [];
      const size = Math.min(limit || SERVER_MAX_ROWS, SERVER_MAX_ROWS);
      return { data:rows.slice(offset, offset + size) };
    },
    dataOf:result => result?.data,
    isRelationMissing:() => false,
    supabaseRequest:async () => ({ data:[] }),
    exactCount:() => null,
  };

  return {
    requests,
    restore() {
      if (original) require.cache[stubPath] = original;
      else delete require.cache[stubPath];
    },
  };
}

function freshRequire(relative) {
  const target = require.resolve(relative);
  delete require.cache[target];
  return require(target);
}

async function run() {
  const drugs = Array.from({ length:TOTAL_DRUGS }, (_, index) => ({
    id:`drug-${index + 1}`,
    registry_number:index + 1,
    trade_name:`BAR ${index + 1}`,
    editorial_override:false,
    updated_at:'2026-08-01T00:00:00.000Z',
    is_published:true,
  }));

  const stub = stubDataApi({
    drugs,
    drug_clinical_profiles:[],
    dosage_regimens:[],
  });

  try {
    const editor = freshRequire('../lib/clinical-editor.js');
    const summary = await editor.getSummary();

    assert.strictEqual(
      summary.total,
      TOTAL_DRUGS,
      `Përmbledhja e barnave u pre te ${summary.total} rreshta nga ${TOTAL_DRUGS}; `
        + 'tavani i serverit po ndalon leximin që në faqen e parë.'
    );
    assert.strictEqual(summary.items.length, TOTAL_DRUGS, 'Lista e barnave nuk i mban të gjitha rreshtat.');

    /* Çdo faqe duhet të ecë sipas rreshtave që u kthyen vërtet, jo sipas
       PAGE_SIZE-it që u kërkua. */
    const drugRequests = stub.requests.filter(item => item.table === 'drugs');
    const offsets = drugRequests.map(item => item.offset);
    assert.deepStrictEqual(
      offsets.slice(0, 3),
      [0, SERVER_MAX_ROWS, SERVER_MAX_ROWS * 2],
      `Offset-et nuk ndoqën rreshtat e kthyer: ${offsets.slice(0, 3).join(', ')}`
    );

    const unique = new Set(summary.items.map(item => item.registryNumber));
    assert.strictEqual(unique.size, TOTAL_DRUGS, 'Faqet u mbivendosën ose lanë boshllëqe.');
  } finally {
    stub.restore();
    delete require.cache[require.resolve('../lib/clinical-editor.js')];
  }

  console.log(`data-api-paging-cap: ${TOTAL_DRUGS} barna u lexuan nën një tavan serveri prej ${SERVER_MAX_ROWS}.`);
}

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
