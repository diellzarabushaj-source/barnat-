'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'user-library-client.js'), 'utf8').replace(/\r\n?/g, '\n');
const embedded = fs.readFileSync(path.join(root, 'recetat-v2.js'), 'utf8').replace(/\r\n?/g, '\n');
const start = embedded.indexOf("(() => {\n  'use strict';\n\n  const LONG_SESSION_VERSION");
assert.ok(start >= 0, 'Recetat must include its library singleton.');
assert.equal(embedded.slice(start, start + source.length), source, 'The embedded and standalone library clients must match exactly.');

const NOTES = 'regjistriBarnave_shenime_v1';
const META = 'medindex_user_library_meta_v1';
const FAVORITES = 'regjistriBarnave_favoritet_v1';
const key = 'registry:1';
const entityKey = `drug-note:${key}`;
const owner = { id:'11111111-1111-4111-8111-111111111111', email:'one@example.test' };
const otherOwner = { id:'22222222-2222-4222-8222-222222222222', email:'two@example.test' };
const iso = '2026-10-10T06:00:00.000Z';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return { getItem:name => data.get(name) ?? null, setItem:(name, value) => data.set(name, String(value)),
    removeItem:name => data.delete(name), dump:() => Object.fromEntries(data) };
}

function server(initial = { content:'Versioni fillestar', rowVersion:1, deleted:false }) {
  const accounts = new Map([[owner.id, { rows:new Map([[entityKey, { ...initial }]]), receipts:new Map() }],
    [otherOwner.id, { rows:new Map(), receipts:new Map() }]]);
  const account = who => accounts.get(who.id);
  const snapshot = who => {
    const rows = [...account(who).rows.entries()];
    return { ok:true, version:1, user:who, prescriptions:[], drugs:[],
      favorites:rows.flatMap(([name, row]) => !row.deleted && row.content?.trim() ? [{ entityType:'protocol', entityKey:name,
        payload:{ kind:'drug-note', text:row.content }, rowVersion:row.rowVersion, noteTarget:row.noteTarget, clientUpdatedAt:row.updatedAt || iso, serverUpdatedAt:iso }] : []),
      noteVersions:rows.map(([name, row]) => ({ entityType:'protocol', entityKey:name, rowVersion:row.rowVersion, noteTarget:row.noteTarget, deleted:row.deleted })),
      tombstones:{ drugs:[], prescriptions:[], favorites:rows.flatMap(([name, row]) => row.deleted
        ? [{ entityType:'protocol', entityKey:name, rowVersion:row.rowVersion, noteTarget:row.noteTarget, deletedAt:row.updatedAt || iso }] : []) }, generatedAt:iso };
  };
  async function apply(who, body) {
    const db = account(who);
    const operations = [...(body.favorites || []), ...(body.tombstones?.favorites || [])]
      .filter(row => row.entityType === 'protocol' && row.entityKey.startsWith('drug-note:'));
    assert.ok(!operations.length || body.noteOwner === who.id, 'Notes must carry the confirmed owner.');
    const conflicts = operations.flatMap(row => {
      assert.match(row.operationId, uuid);
      assert.ok(Number.isSafeInteger(row.expectedVersion) && row.expectedVersion >= 0);
      const receipt = db.receipts.get(row.operationId);
      if (receipt) {
        assert.equal(receipt.fingerprint, JSON.stringify(row), 'Retries must preserve the complete note operation.');
        return [];
      }
      const current = db.rows.get(row.entityKey);
      return (current?.rowVersion || 0) !== row.expectedVersion
        ? [{ entityType:row.entityType, entityKey:row.entityKey, rowVersion:current?.rowVersion || 0, deleted:Boolean(current?.deleted) }] : [];
    });
    if (conflicts.length) return { status:409, payload:{ code:'NOTE_VERSION_CONFLICT', conflicts, snapshot:snapshot(who) } };
    const acknowledgements = operations.map(row => {
      const previous = db.receipts.get(row.operationId);
      if (previous) return previous.receipt;
      const deleted = Boolean(row.deletedAt);
      const rowVersion = row.expectedVersion + 1;
      db.rows.set(row.entityKey, { content:deleted ? null : row.payload.text, deleted, rowVersion,
        noteTarget:row.noteTarget || db.rows.get(row.entityKey)?.noteTarget,
        updatedAt:row.clientUpdatedAt || row.deletedAt });
      const receipt = { operationId:row.operationId, entityType:row.entityType, entityKey:row.entityKey, rowVersion, deleted };
      db.receipts.set(row.operationId, { fingerprint:JSON.stringify(row), receipt });
      return receipt;
    });
    return { status:200, payload:{ ...snapshot(who), noteOperations:acknowledgements } };
  }
  return { account, snapshot, apply };
}

async function boot(db, { device = storage(), who = owner, offline = false, deferInitialGet = false, waitReady = true } = {}) {
  const requests = [];
  const events = [];
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;
  const control = { who, pauseNext:false, pending:null, failAfterCommit:false, omitReceipt:false, pauseGet:deferInitialGet };
  const nav = { onLine:!offline };
  const window = {
    crypto:webcrypto,
    addEventListener:(name, handler) => listeners.set(name, [...(listeners.get(name) || []), handler]),
    dispatchEvent:event => { events.push(event); for (const handler of listeners.get(event.type) || []) handler(event); return true; },
    setTimeout:(callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout:id => timers.delete(id), setInterval:() => 1, clearInterval:() => {},
  };
  window.fetch = async (_url, options = {}) => {
    const whoAtRequest = control.who;
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, body });
    if (String(_url).startsWith('/api/auth') && method === 'DELETE') return new Response('{}', { status:200 });
    if (method === 'GET' && control.pauseGet) {
      control.pauseGet = false;
      await new Promise(resolve => { control.pending = resolve; });
      control.pending = null;
    }
    if (method === 'GET') return new Response(JSON.stringify(db.snapshot(whoAtRequest)), { status:200 });
    if (control.pauseNext) {
      control.pauseNext = false;
      await new Promise(resolve => { control.pending = resolve; });
      control.pending = null;
    }
    const result = await db.apply(whoAtRequest, body);
    if (control.failAfterCommit) { control.failAfterCommit = false; throw new TypeError('Connection closed after commit'); }
    if (control.omitReceipt) { control.omitReceipt = false; delete result.payload.noteOperations; }
    return new Response(JSON.stringify(result.payload), { status:result.status });
  };
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail || {}; } }
  const context = vm.createContext({ window, document:{ visibilityState:'visible', addEventListener:() => {} }, navigator:nav,
    localStorage:device, sessionStorage:storage(), location:{ reload:() => {} }, CustomEvent, AbortController, console,
    setTimeout:window.setTimeout, clearTimeout:window.clearTimeout });
  vm.runInContext(source, context, { filename:'user-library-client.js' });
  if (waitReady) await window.MEDINDEX_LIBRARY_READY;
  const fire = type => window.dispatchEvent(new CustomEvent(type));
  const setNote = (content, stamp = iso) => {
    const notes = JSON.parse(device.getItem(NOTES) || '{}');
    if (content === null) delete notes[key];
    else notes[key] = { text:content, updatedAt:stamp };
    device.setItem(NOTES, JSON.stringify(notes));
    fire('medindex:notes-changed');
  };
  const drain = async () => {
    for (let pass = 0; pass < 8; pass += 1) {
      const due = [...timers.entries()].filter(([, row]) => row.delay < 1000);
      if (!due.length) return;
      for (const [id, row] of due) { timers.delete(id); row.callback(); }
      for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
    }
  };
  return { api:window.MedIndexUserLibrary, device, requests, events, control, nav, fire, setNote, drain,
    window, ready:window.MEDINDEX_LIBRARY_READY };
}

const getText = device => JSON.parse(device.getItem(NOTES) || '{}')[key]?.text ?? null;
const puts = client => client.requests.filter(row => row.method === 'PUT');
const ops = request => [...(request.body.favorites || []), ...(request.body.tombstones?.favorites || [])]
  .filter(row => row.entityType === 'protocol' && row.entityKey.startsWith('drug-note:'));

(async () => {
  // Read/echo cannot replay an unchanged note as an unrelated full-envelope write.
  {
    const db = server();
    const client = await boot(db);
    assert.equal(getText(client.device), 'Versioni fillestar');
    assert.ok(puts(client).every(row => ops(row).length === 0));
    client.device.setItem(FAVORITES, '["bari-personal"]');
    client.fire('medindex:favorites-changed');
    await client.api.syncNow();
    assert.equal(ops(puts(client).at(-1)).length, 0);
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 1);
  }

  // A deletion waiting in pre-versioned metadata is still the author's intent;
  // do not resurrect the remote note or replay that old tombstone as a write.
  {
    const db = server();
    const device = storage({ [META]:JSON.stringify({ owner:owner.id, deletedFavorites:{ [`protocol|${entityKey}`]:iso } }) });
    const client = await boot(db, { device });
    assert.equal(getText(device), null);
    assert.equal(client.api.noteConflicts()[0].remoteText, 'Versioni fillestar');
    assert.ok(puts(client).every(row => ops(row).length === 0));
    assert.equal(client.api.retryLocalNote(key), true);
    assert.equal(await client.api.syncNow(), true);
    assert.equal(db.account(owner).rows.get(entityKey).deleted, true);
  }

  // Unversioned compatibility data is adopted only when exact text agrees.
  // A timestamp, including one in the far future, cannot invent a shared base.
  {
    const db = server();
    const same = await boot(db, { device:storage({ [NOTES]:JSON.stringify({ [key]:{ text:'Versioni fillestar', updatedAt:'2099-01-01T00:00:00.000Z' } }) }) });
    assert.equal(same.api.diagnostics().pendingNotes, 0);
    assert.ok(puts(same).every(row => ops(row).length === 0));
    const different = await boot(db, { device:storage({ [NOTES]:JSON.stringify({ [key]:{ text:'Draft i vjetër lokal', updatedAt:'2099-01-01T00:00:00.000Z' } }) }) });
    assert.equal(getText(different.device), 'Draft i vjetër lokal');
    assert.equal(different.api.noteConflicts().length, 1);
    assert.ok(puts(different).every(row => ops(row).length === 0));
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 1);
  }

  // The routing base travels with the operation. A native row and a legacy
  // fallback can share a registry alias but are never interchangeable targets.
  {
    const db = server();
    const baseSnapshot = db.snapshot;
    const target = { storage:'native', entityType:'drug', entityKey:'33333333-3333-4333-8333-333333333333' };
    db.snapshot = who => {
      const snapshot = baseSnapshot(who);
      snapshot.noteVersions.forEach(row => { row.noteTarget = target; });
      snapshot.favorites.forEach(row => { row.noteTarget = target; });
      return snapshot;
    };
    const client = await boot(db);
    client.setNote('Teksti për objektivin e konfirmuar');
    assert.equal(await client.api.syncNow(), true);
    assert.deepEqual(ops(puts(client).at(-1))[0].noteTarget, target);
    client.setNote('Edhe shkrimi pasues');
    assert.equal(await client.api.syncNow(), true);
    assert.deepEqual(ops(puts(client).at(-1))[0].noteTarget, target);
  }

  // Two devices editing the same base: second draft survives and requires an
  // explicit author decision. Client clocks cannot overrule the stored version.
  {
    const db = server();
    const a = await boot(db);
    const b = await boot(db);
    a.setNote('  Teksti A\n me hapësira  ');
    assert.equal(await a.api.syncNow(), true);
    b.setNote('Drafti B', '2099-01-01T00:00:00.000Z');
    assert.equal(await b.api.syncNow(), false);
    assert.equal(getText(b.device), 'Drafti B');
    assert.equal(db.account(owner).rows.get(entityKey).content, '  Teksti A\n me hapësira  ');
    assert.equal(b.api.noteConflicts()[0].remoteText, '  Teksti A\n me hapësira  ');
    assert.equal(b.api.diagnostics().dirty, true);
    assert.ok(b.events.some(event => event.type === 'medindex:library-note-conflict'));
    await b.api.syncNow();
    assert.equal(ops(puts(b).at(-1)).length, 0, 'A conflict must never be silently retried against a newer version.');
    assert.equal(b.api.retryLocalNote(key), true);
    assert.equal(await b.api.syncNow(), true);
    assert.equal(db.account(owner).rows.get(entityKey).content, 'Drafti B');
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 3);
    assert.equal(b.api.noteConflicts().length, 0);
  }

  // A registry alias switching from legacy fallback to native storage must
  // compare identities before versions. Either counter direction is a conflict
  // that preserves the previous local text until an explicit resolution.
  for (const nativeVersion of [1, 20]) {
    const legacyTarget = { storage:'legacy', entityType:'protocol', entityKey };
    const nativeTarget = { storage:'native', entityType:'drug', entityKey:'33333333-3333-4333-8333-333333333333' };
    const db = server({ content:'Shënimi i sapo shfaqur native', rowVersion:nativeVersion, deleted:false, noteTarget:nativeTarget });
    const device = storage({ [NOTES]:JSON.stringify({ [key]:{ text:'Shënimi nga legacy', updatedAt:iso } }),
      [META]:JSON.stringify({ owner:owner.id, noteStates:{ [key]:{ rowVersion:8, content:'Shënimi nga legacy', noteTarget:legacyTarget, pending:null, conflict:null } } }) });
    const client = await boot(db, { device });
    assert.equal(getText(device), 'Shënimi nga legacy');
    assert.equal(client.api.noteConflicts()[0].rowVersion, nativeVersion);
    assert.equal(client.api.noteConflicts()[0].remoteText, 'Shënimi i sapo shfaqur native');
    assert.ok(puts(client).every(row => ops(row).length === 0));
    assert.equal(client.api.acceptRemoteNote(key), true);
    assert.equal(getText(device), 'Shënimi i sapo shfaqur native');
    client.setNote('Pas pranimit të objektivit native');
    assert.equal(await client.api.syncNow(), true);
    const operation = ops(puts(client).at(-1))[0];
    assert.equal(operation.expectedVersion, nativeVersion);
    assert.deepEqual(operation.noteTarget, nativeTarget);
  }

  // Delete and undo are versioned operations; a remote delete must remain a
  // tombstone until the author explicitly restores their conflicting draft.
  {
    const db = server();
    const a = await boot(db);
    const b = await boot(db);
    a.setNote(null);
    assert.equal(await a.api.syncNow(), true);
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 2);
    b.setNote('Draft kundër fshirjes');
    assert.equal(await b.api.syncNow(), false);
    assert.equal(b.api.noteConflicts()[0].remoteDeleted, true);
    assert.equal(b.api.acceptRemoteNote(key), true);
    assert.equal(getText(b.device), null);
    b.setNote('Rikthimi i vetëdijshëm');
    assert.equal(await b.api.syncNow(), true);
    const restore = ops(puts(b).at(-1))[0];
    assert.equal(restore.expectedVersion, 2);
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 3);
  }

  // Timeout after the server committed: a restarted device retries the exact
  // UUID/body and acknowledges the receipt rather than treating its own GET as
  // another writer or incrementing the version twice.
  {
    const db = server();
    const client = await boot(db);
    client.setNote('Ruajtja me përgjigje të humbur');
    client.control.failAfterCommit = true;
    assert.equal(await client.api.syncNow(), false);
    const first = ops(puts(client).at(-1))[0];
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 2);
    const restarted = await boot(db, { device:storage(client.device.dump()) });
    const retried = puts(restarted).flatMap(ops)[0];
    assert.deepEqual(retried, first);
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 2);
    assert.equal(restarted.api.diagnostics().pendingNotes, 0);
    assert.equal(getText(restarted.device), 'Ruajtja me përgjigje të humbur');
  }

  // An edit/delete during flight is queued against the acknowledged own write.
  // The returned snapshot must not replace the newer local text.
  {
    const db = server();
    const client = await boot(db);
    client.setNote('A në fluturim');
    client.control.pauseNext = true;
    const firstFlush = client.api.syncNow();
    assert.equal(typeof client.control.pending, 'function');
    client.setNote('B gjatë fluturimit');
    client.control.pending();
    await firstFlush;
    assert.equal(getText(client.device), 'B gjatë fluturimit');
    await client.drain();
    assert.equal(db.account(owner).rows.get(entityKey).content, 'B gjatë fluturimit');
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 3);
    const sent = puts(client).flatMap(ops);
    assert.deepEqual(sent.map(row => row.expectedVersion), [1, 2]);
    assert.notEqual(sent[0].operationId, sent[1].operationId);
    assert.equal(client.api.diagnostics().pendingNotes, 0);
  }

  // A queued deletion and later explicit restore use the own acknowledgement
  // version, and neither a returned active row nor a tombstone loses the edit.
  {
    const db = server();
    const client = await boot(db);
    client.setNote('Në ruajtje');
    client.control.pauseNext = true;
    const inFlight = client.api.syncNow();
    client.setNote(null);
    client.control.pending();
    await inFlight;
    assert.equal(getText(client.device), null);
    await client.drain();
    assert.equal(db.account(owner).rows.get(entityKey).deleted, true);
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 3);
    client.setNote('Rikthimi pas fshirjes');
    assert.equal(await client.api.syncNow(), true);
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 4);
  }

  // Offline pending versions survive restarts, and blank existing rows expose
  // their actual version even though they have no visible note content.
  {
    const db = server({ content:'', rowVersion:5, deleted:false });
    const client = await boot(db);
    client.nav.onLine = false;
    client.fire('offline');
    client.setNote('Nga telefoni offline');
    assert.equal(await client.api.syncNow(), false);
    const restarted = await boot(db, { device:storage(client.device.dump()) });
    const sent = puts(restarted).flatMap(ops)[0];
    assert.equal(sent.expectedVersion, 5);
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 6);
    assert.equal(getText(restarted.device), 'Nga telefoni offline');
  }

  // No acknowledgement is never reported as synchronized, and must retry
  // with the same identifier rather than manufacture a replacement operation.
  {
    const db = server();
    const client = await boot(db);
    client.setNote('Mos pretendo ruajtjen');
    client.control.omitReceipt = true;
    assert.equal(await client.api.syncNow(), false);
    assert.equal(client.api.diagnostics().pendingNotes, 1);
    const pending = ops(puts(client).at(-1))[0];
    assert.equal(await client.api.syncNow(), true);
    assert.deepEqual(ops(puts(client).at(-1))[0], pending);
    assert.equal(db.account(owner).rows.get(entityKey).rowVersion, 2);
  }

  // A stale in-flight owner response cannot hydrate or acknowledge another
  // doctor's local workspace, and pending metadata never migrates accounts.
  {
    const db = server();
    const client = await boot(db);
    client.setNote('Vetëm për pronarin e parë');
    client.control.pauseNext = true;
    const request = client.api.syncNow();
    client.api.adoptOwner(otherOwner);
    client.control.who = otherOwner;
    client.control.pending();
    assert.equal(await request, false);
    assert.equal(getText(client.device), null);
    assert.equal(JSON.parse(client.device.getItem(META)).owner, otherOwner.id);
    assert.equal(client.api.diagnostics().pendingNotes, 0);
    await client.api.syncNow();
    assert.equal(db.account(otherOwner).rows.size, 0);
    assert.equal(ops(puts(client).at(-1)).length, 0);
  }

  // Logout invalidates an initial GET even if the network delivers it after
  // the authenticated session ended and the local library was cleared.
  {
    const db = server();
    const client = await boot(db, { deferInitialGet:true, waitReady:false });
    assert.equal(typeof client.control.pending, 'function');
    const releaseInitial = client.control.pending;
    await client.window.fetch('/api/auth', { method:'DELETE' });
    assert.equal(client.device.getItem(META), null);
    releaseInitial();
    await client.ready;
    assert.equal(getText(client.device), null);
    assert.equal(client.device.getItem(META), null, 'A response from before logout must not restore owner metadata.');
    assert.equal(client.api.diagnostics().pendingNotes, 0);
  }

  console.log('✓ Legacy note CAS passed: conditional-only envelopes, exact drafts, two-device conflicts, delete/restore, stable lost-response retries, queued writes, offline restarts, missing-ack protection and owner isolation.');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
