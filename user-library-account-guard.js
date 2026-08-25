(() => {
  'use strict';

  const VERSION = 'user-library-account-isolation-v1';
  const INSTANCE_KEY = '__medindexUserLibraryAccountGuard';
  if (window[INSTANCE_KEY]) return;

  const API_PATH = '/api/user-library';
  const META_KEY = 'medindex_user_library_meta_v1';
  const PERSONAL_KEYS = Object.freeze([
    'regjistriBarnave_protokollet_v1',
    'regjistriBarnave_favoritet_v1',
    'regjistriBarnave_shenime_v1',
    'regjistriBarnave_barnat_personale_v1',
  ]);
  const ROOT_PENDING_CLASS = 'medindex-library-owner-pending';
  const nativeFetch = window.fetch.bind(window);
  let verifiedOwner = '';
  let verificationPromise = null;

  const clean = value => String(value ?? '').trim();

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '');
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function readMeta() {
    const value = readJson(META_KEY, {});
    return value && !Array.isArray(value) ? value : {};
  }

  function hasPersonalData() {
    try {
      const prescriptions = JSON.parse(localStorage.getItem(PERSONAL_KEYS[0]) || '[]');
      const favorites = JSON.parse(localStorage.getItem(PERSONAL_KEYS[1]) || '[]');
      const notes = JSON.parse(localStorage.getItem(PERSONAL_KEYS[2]) || '{}');
      const drugs = JSON.parse(localStorage.getItem(PERSONAL_KEYS[3]) || '[]');
      return (Array.isArray(prescriptions) && prescriptions.length > 0)
        || (Array.isArray(favorites) && favorites.length > 0)
        || (notes && typeof notes === 'object' && !Array.isArray(notes) && Object.keys(notes).length > 0)
        || (Array.isArray(drugs) && drugs.length > 0);
    } catch {
      // Malformed legacy personal state is untrusted as well.
      return PERSONAL_KEYS.some(key => {
        try { return Boolean(localStorage.getItem(key)); } catch { return false; }
      });
    }
  }

  function wipePersonalData() {
    for (const key of [...PERSONAL_KEYS, META_KEY]) {
      try { localStorage.removeItem(key); } catch {}
    }
  }

  function ownerKey(user) {
    const id = clean(user?.id);
    if (id) return id;
    return clean(user?.email).toLowerCase();
  }

  function writeOwner(owner) {
    if (!owner) return;
    const meta = readMeta();
    meta.owner = owner;
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
  }

  function adoptVerifiedOwner(user) {
    const owner = ownerKey(user);
    if (!owner) return { owner:'', discarded:false };

    const stored = clean(readMeta().owner);
    const unownedData = !stored && hasPersonalData();
    const wrongOwner = Boolean(stored && stored !== owner);
    const discarded = unownedData || wrongOwner;

    // Fixed legacy localStorage keys are not an ownership boundary. Never let
    // data without a verified owner, or data from another account, be claimed by
    // the account that happens to sign in next on the same browser.
    if (discarded) wipePersonalData();
    writeOwner(owner);

    if (discarded) {
      window.dispatchEvent(new CustomEvent('medindex:library-owner-changed', {
        detail:{ owner, reason:wrongOwner ? 'account-switch' : 'unowned-legacy-data' },
      }));
    }
    return { owner, discarded };
  }

  function setPending(value) {
    document.documentElement.classList.toggle(ROOT_PENDING_CLASS, Boolean(value));
  }

  function publishVerified(owner) {
    verifiedOwner = owner;
    // Identity verification and data reconciliation are deliberately separate.
    // Keep personal UI hidden until the library controller has merged the clean
    // snapshot and emits library-ready/library-synced.
    window.dispatchEvent(new CustomEvent('medindex:library-owner-verified', { detail:{ owner } }));
  }

  function requestInfo(input, options = {}) {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    let url;
    try { url = new URL(raw, location.href); }
    catch { return { isLibrary:false, isLogout:false, method:'' }; }
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    return {
      method,
      isLibrary:url.origin === location.origin && url.pathname === API_PATH,
      isLogout:url.origin === location.origin && url.pathname === '/api/auth' && method === 'DELETE',
    };
  }

  async function inspectSnapshotResponse(response) {
    if (!response?.ok) return { owner:'', discarded:false, snapshot:null };
    const snapshot = await response.clone().json().catch(() => null);
    const adopted = adoptVerifiedOwner(snapshot?.user);
    if (adopted.owner) publishVerified(adopted.owner);
    return { ...adopted, snapshot };
  }

  function snapshotResponse(snapshot, sourceResponse) {
    const headers = new Headers(sourceResponse?.headers || undefined);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('X-MedIndex-Account-Guard', 'ownership-reset');
    return new Response(JSON.stringify(snapshot || { ok:true, version:1, prescriptions:[], favorites:[], drugs:[], tombstones:{} }), {
      status:200,
      headers,
    });
  }

  async function verifyBeforeWrite() {
    if (verifiedOwner) return { ok:true, owner:verifiedOwner, discarded:false, snapshot:null, response:null };
    if (verificationPromise) return verificationPromise;

    verificationPromise = (async () => {
      const response = await nativeFetch(API_PATH, {
        method:'GET',
        cache:'no-store',
        credentials:'same-origin',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) return { ok:false, response };
      const result = await inspectSnapshotResponse(response);
      if (!result.owner) return { ok:false, response };
      return { ok:true, response, ...result };
    })().finally(() => { verificationPromise = null; });

    return verificationPromise;
  }

  // If an old build left personal data under the historical fixed keys without
  // an owner stamp, deletion happens synchronously before the personalization
  // controller can read it. The verified server snapshot is the only source that
  // may safely restore personal data after that point.
  if (!clean(readMeta().owner) && hasPersonalData()) wipePersonalData();

  setPending(navigator.onLine);

  window.fetch = async function medindexAccountGuardedFetch(input, options = {}) {
    const info = requestInfo(input, options);

    if (info.isLibrary && info.method === 'GET') {
      const response = await nativeFetch(input, options);
      await inspectSnapshotResponse(response);
      return response;
    }

    if (info.isLibrary && ['POST', 'PUT'].includes(info.method)) {
      const verification = await verifyBeforeWrite();
      if (!verification.ok) {
        // No verified account means no personal write. Return the identity probe
        // failure so the existing retry path remains responsible for recovery.
        return verification.response;
      }
      if (verification.discarded) {
        // The caller built this request body before the account mismatch was
        // discovered. Never forward that stale body into the newly verified
        // account; return its clean server snapshot instead.
        return snapshotResponse(verification.snapshot, verification.response);
      }
      return nativeFetch(input, options);
    }

    const response = await nativeFetch(input, options);
    if (info.isLogout && response?.ok) {
      verifiedOwner = '';
      setPending(true);
    }
    return response;
  };

  window.addEventListener('medindex:library-ready', event => {
    const eventOwner = ownerKey(event.detail?.user);
    if (verifiedOwner && eventOwner === verifiedOwner) setPending(false);
    else if (event.detail?.offline && clean(readMeta().owner)) setPending(false);
  });
  window.addEventListener('medindex:library-synced', () => {
    if (verifiedOwner) setPending(false);
  });
  window.addEventListener('offline', () => {
    // Offline work is allowed only when this browser already carries an explicit
    // owner stamp. Unowned personal storage has already been removed above.
    setPending(!clean(readMeta().owner));
  });
  window.addEventListener('online', () => {
    if (!verifiedOwner) setPending(true);
  });

  window[INSTANCE_KEY] = Object.freeze({
    version:VERSION,
    verifiedOwner:() => verifiedOwner,
    pending:() => document.documentElement.classList.contains(ROOT_PENDING_CLASS),
  });
})();
