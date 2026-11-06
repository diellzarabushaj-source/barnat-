'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../entry-resume.js'), 'utf8');
const worker = fs.readFileSync(path.resolve(__dirname, '../sw-resilient.js'), 'utf8');
const landing = fs.readFileSync(path.resolve(__dirname, '../landing.html'), 'utf8');

async function checkResume({ response, dialogOpen = false }) {
  const calls = [];
  const destinations = [];
  const timers = [];
  const handlers = new Map();
  const context = {
    navigator:{ onLine:true },
    location:{
      search:'?return=%2Frecetat.html%3Fdraft%3Dreturning',
      replace(url) { destinations.push(url); },
    },
    window:{ addEventListener(name, handler) { handlers.set(name, handler); } },
    document:{
      hidden:false,
      querySelector() { return dialogOpen ? { open:true } : null; },
      addEventListener(name, handler) { handlers.set(name, handler); },
    },
    fetch:async (url, options) => {
      calls.push({ url, options });
      return { ok:response.status === 200, status:response.status,
        json:async () => response.payload };
    },
    AbortSignal:{ timeout:ms => ({ timeoutMs:ms }) },
    setTimeout(handler, milliseconds) { timers.push(milliseconds); return timers.length; },
    clearTimeout() {},
    URLSearchParams,
    encodeURIComponent,
  };

  vm.runInNewContext(source, context, { filename:'entry-resume.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { calls, destinations, timers, handlers };
}

(async () => {
  const valid = await checkResume({ dialogOpen:true, response:{ status:200,
    payload:{ authenticated:true, hardened:true, sessionVersion:3, offline:false } } });
  assert.equal(valid.calls.length, 1, 'An open login modal must not block remembered-session checks.');
  assert.equal(valid.calls[0].url, '/api/auth?entry=1', 'Renewal must bypass stale service-worker auth snapshots.');
  assert.equal(valid.calls[0].options.signal.timeoutMs, 45000, 'Slow mobile connections need a bounded renewal window.');
  assert.deepEqual(valid.destinations, ['/api/auth?resume=1&return=%2Frecetat.html%3Fdraft%3Dreturning']);

  const offline = await checkResume({ response:{ status:200,
    payload:{ authenticated:true, hardened:true, sessionVersion:3, offline:true } } });
  assert.equal(offline.destinations.length, 0, 'An offline snapshot cannot restore server authorization.');
  assert.deepEqual(offline.timers, [5000], 'An offline snapshot should be retried with the server.');

  const temporarilyUnavailable = await checkResume({ response:{ status:503, payload:{} } });
  assert.deepEqual(temporarilyUnavailable.timers, [5000], 'An upstream outage must not force login.');

  const unauthenticated = await checkResume({ response:{ status:200,
    payload:{ authenticated:false, hardened:true, sessionVersion:0 } } });
  assert.equal(unauthenticated.destinations.length, 0, 'No session must never be granted access.');
  assert.equal(unauthenticated.timers.length, 0, 'A confirmed signed-out browser should show the login screen.');

  assert.match(worker, /AUTH_ENTRY_PAGES\.has\(expectedPath\) && networkProfile\.online/, 'Entry HTML must be network-first.');
  assert.match(landing, /entry-resume\.js\?v=remembered-session-20261106/, 'New entry code must bust cached scripts.');
  console.log('Safari entry recovery passed: open login dialog, network-only renewal, slow links, offline snapshots, outages and missing sessions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
