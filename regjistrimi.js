(() => {
  'use strict';

  function mountRegistration(root = document, options = {}) {
  let active = true;
  const lifetime = new AbortController();
  const timers = new Set();
  const disposers = [];
  const find = id => root.querySelector('#' + id);
  const listen = (target, type, handler) => target?.addEventListener(type, handler, { signal:lifetime.signal });
  const schedule = (handler, delay) => {
    const timer = window.setTimeout(() => { timers.delete(timer); if (active) handler(); }, delay);
    timers.add(timer); return timer;
  };
  const navigate = (url, method = 'replace') => {
    if (!active) return;
    if (options.navigate) options.navigate(url, method);
    else location[method](url);
  };
  const reload = () => { if (active) { if (options.reload) options.reload(); else location.reload(); } };
  const query = () => new URLSearchParams(options.search ?? location.search);

  // Registration, in three states that the server decides — never the browser.
  //
  //   1. No account yet          → create one, with Google or with an email.
  //   2. Account, no document    → professional identity and the proof it needs.
  //   3. Document submitted      → waiting for the administrator.
  //
  // The page never assumes which state it is in. It asks
  // `GET /api/auth?scope=verification`, and a 401 there simply means "no
  // enrollment proof yet", which is state 1.

  const $ = id => find(id);
  const steps = $('registerSteps');
  const panels = {
    account:$('stepAccount'),
    profile:$('stepProfile'),
    pending:$('stepPending'),
  };

  let csrfToken = '';
  let titles = [];
  let maxDocumentBytes = 3 * 1024 * 1024;
  let selectedFile = null;
  let busy = false;
  let googleInitialized = false;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  function note(node, message, tone = '') {
    if (!node) return;
    node.textContent = message || '';
    node.classList.add('mi-note');
    ['success', 'warning', 'error'].forEach(value => node.classList.toggle('is-' + value, tone === value));
  }

  function showStep(name) {
    Object.entries(panels).forEach(([key, panel]) => { if (panel) panel.hidden = key !== name; });
    const order = ['account', 'profile', 'pending'];
    const active = order.indexOf(name);
    [...steps.children].forEach((item, index) => {
      if (index < active) item.dataset.complete = '1';
      else delete item.dataset.complete;
      if (index === active) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  function humanBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      cache:'no-store',
      credentials:'same-origin',
      ...options,
      signal:lifetime.signal,
      headers:{ Accept:'application/json', ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
      if (!active) throw new DOMException('View closed', 'AbortError');
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `Kërkesa dështoi (${response.status}).`);
      error.status = response.status;
      error.code = payload.code || '';
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  // --- step 1: creating an account ---------------------------------------

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function waitForGoogle(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
        if (Date.now() - started >= timeoutMs) return reject(new Error('Google Sign-In nuk u ngarkua.'));
        schedule(check, 80);
      };
      check();
    });
  }

  async function initializeGoogle(config) {
    const status = $('googleSignupStatus');
    if (googleInitialized) return;
    if (!config.googleConfigured || !config.googleClientId) {
      $('googleSignupButton').hidden = true;
      note(status, 'Regjistrimi me Google nuk është konfiguruar. Përdor emailin më poshtë.', 'warning');
      return;
    }
    try {
      const [identity, nonce] = await Promise.all([waitForGoogle(), sha256Hex(csrfToken)]);
      if (!active) return;
      identity.initialize({
        client_id:config.googleClientId,
        // Google identifies the person; MedIndex still creates the account as
        // pending and still asks for a professional document afterwards.
        callback:response => {
          if (!active) return;
          const credential = String(response?.credential || '');
          if (!credential) return note(status, 'Google nuk ktheu credential-in.', 'error');
          void submitGoogle(credential);
        },
        nonce,
        auto_select:false,
        cancel_on_tap_outside:true,
        use_fedcm_for_prompt:true,
      });
      const container = $('googleSignupButton');
      let renderedWidth = 0;
      const render = () => {
        if (!active) return;
        const width = Math.max(200, Math.min(400, Math.floor(container.getBoundingClientRect().width) || 320));
        if (width === renderedWidth) return;
        renderedWidth = width;
        container.replaceChildren();
        identity.renderButton(container, {
          type:'standard',
          theme:document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
          size:'large', text:'continue_with', shape:'rectangular', logo_alignment:'left', width,
        });
      };
      render();
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(render);
        observer.observe(container);
        disposers.push(() => observer.disconnect());
      }
      googleInitialized = true;
      note(status, 'Zgjidh llogarinë tënde Google për të vazhduar.');
    } catch (error) {
      $('googleSignupButton').hidden = true;
      note(status, `${error.message} Përdor emailin më poshtë.`, 'warning');
    }
  }

  async function submitGoogle(credential) {
    if (!active || busy) return;
    busy = true;
    note($('accountNote'), 'Po verifikohet llogaria…');
    try {
      await requestJson('/api/auth', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrfToken },
        body:JSON.stringify({ credential, csrfToken }),
      });
      // An approved account gets a session straight away and has no business here.
      navigate('/index.html');
    } catch (error) {
      // The expected outcome: a new Google account is pending, and the server
      // has just handed us the enrollment proof the next step needs.
      if (error.code === 'PROFESSIONAL_VERIFICATION_REQUIRED' || error.code === 'ACCOUNT_PENDING_APPROVAL') {
        await load();
        return;
      }
      note($('accountNote'), error.message, 'error');
    } finally {
      busy = false;
    }
  }

  async function submitSignup(event) {
    event.preventDefault();
    if (!active || busy) return;
    const email = $('signupEmail').value.trim();
    const password = $('signupPassword').value;
    if (!email || !password) return note($('accountNote'), 'Shkruaj emailin dhe fjalëkalimin.', 'error');
    if (password.length < 10) return note($('accountNote'), 'Fjalëkalimi duhet të ketë së paku 10 shenja.', 'error');

    busy = true;
    const button = $('signupSubmit');
    button.disabled = true;
    note($('accountNote'), 'Po krijohet llogaria…');
    try {
      const payload = await requestJson('/api/auth', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrfToken },
        body:JSON.stringify({ action:'signup', email, password, csrfToken }),
      });
      $('signupPassword').value = '';
      note($('accountNote'), payload.message, 'success');
      if (!payload.confirmationRequired) {
        // Confirmation is off on this project, so the account exists and can
        // sign in immediately to continue with its document.
        schedule(() => navigate(`/login.html?email=${encodeURIComponent(email)}`), 1500);
      }
    } catch (error) {
      note($('accountNote'), error.message, 'error');
    } finally {
      button.disabled = false;
      busy = false;
    }
  }

  // --- step 2: professional identity -------------------------------------

  function renderTitles() {
    const fieldset = $('titleChoices');
    const legend = fieldset.querySelector('legend');
    fieldset.innerHTML = '';
    fieldset.appendChild(legend);
    titles.forEach(title => {
      const label = document.createElement('label');
      label.className = 'mi-choice';
      label.innerHTML = `
        <input type="radio" name="professionalTitle" value="${escapeHtml(title.value)}">
        <span>
          <span>
            <strong>${escapeHtml(title.label)}</strong>
            <small>Duhet të ngarkosh: ${escapeHtml(title.proof)}</small>
          </span>
        </span>`;
      fieldset.appendChild(label);
    });
  }

  function selectedTitle() {
    const checked = $('titleChoices').querySelector('input:checked');
    return checked ? titles.find(title => title.value === checked.value) || null : null;
  }

  // The chosen title decides which document is asked for. The server decides the
  // same thing again; this only makes the requirement visible before uploading.
  function syncTitle() {
    const title = selectedTitle();
    const specialtyField = $('specialtyField');
    specialtyField.hidden = !title || !['specialist', 'specializant'].includes(title.value);
    $('specialtyLabel').innerHTML = title?.specialtyRequired
      ? 'Specialiteti <em aria-hidden="true">*</em>'
      : 'Specialiteti <small style="display:inline;font-weight:400">(opsional)</small>';
    $('specialty').required = Boolean(title?.specialtyRequired);

    $('documentLabel').innerHTML = title
      ? `${escapeHtml(title.proof)} <em aria-hidden="true">*</em>`
      : 'Dokumenti vërtetues <em aria-hidden="true">*</em>';
    if (!selectedFile) {
      $('documentTitle').textContent = title ? `Zgjidh ${title.proof.toLowerCase()}` : 'Zgjidh dokumentin';
    }
  }

  function syncFile() {
    const drop = $('documentDrop');
    if (!selectedFile) {
      delete drop.dataset.selected;
      $('documentHint').textContent = `PDF, JPG ose PNG · deri në ${humanBytes(maxDocumentBytes)}`;
      syncTitle();
      return;
    }
    drop.dataset.selected = '1';
    $('documentTitle').textContent = selectedFile.name;
    $('documentHint').textContent = `${humanBytes(selectedFile.size)} · kliko për ta ndërruar`;
  }

  function readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Dokumenti nuk u lexua.'));
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : '');
      };
      reader.readAsDataURL(file);
    });
  }

  async function submitProfile(event) {
    event.preventDefault();
    if (!active || busy) return;

    const firstName = $('firstName').value.trim();
    const lastName = $('lastName').value.trim();
    const title = selectedTitle();
    const specialty = $('specialty').value.trim();

    if (firstName.length < 2 || lastName.length < 2) return note($('profileNote'), 'Shkruaj emrin dhe mbiemrin.', 'error');
    if (!title) return note($('profileNote'), 'Zgjidh titullin tënd profesional.', 'error');
    if (title.specialtyRequired && !specialty) return note($('profileNote'), 'Shkruaj specialitetin tënd.', 'error');
    if (!selectedFile) return note($('profileNote'), `Ngarko ${title.proof.toLowerCase()}.`, 'error');
    if (selectedFile.size > maxDocumentBytes) {
      return note($('profileNote'), `Dokumenti duhet të jetë nën ${humanBytes(maxDocumentBytes)}.`, 'error');
    }

    busy = true;
    const button = $('profileSubmit');
    button.disabled = true;
    note($('profileNote'), 'Po dërgohet dokumenti…');
    try {
      const base64 = await readAsBase64(selectedFile);
      await requestJson('/api/auth?scope=verification', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrfToken },
        body:JSON.stringify({
          firstName,
          lastName,
          professionalTitle:title.value,
          specialty,
          filename:selectedFile.name,
          mimeType:selectedFile.type,
          base64,
        }),
      });
      await load();
    } catch (error) {
      note($('profileNote'), error.message, 'error');
    } finally {
      button.disabled = false;
      busy = false;
    }
  }

  // --- state ---------------------------------------------------------------

  function fillProfile(status) {
    const parts = String(status.profile?.fullName || '').split(/\s+/).filter(Boolean);
    if (parts.length && !$('firstName').value) {
      $('firstName').value = parts[0];
      $('lastName').value = parts.slice(1).join(' ');
    }
    if (status.profile?.specialty && !$('specialty').value) $('specialty').value = status.profile.specialty;

    const preselected = $('titleChoices').querySelector(`input[value="${CSS.escape(status.profile?.professionalTitle || '')}"]`);
    if (preselected) preselected.checked = true;
    syncTitle();

    if (status.document?.status === 'rejected') {
      note($('profileNote'), 'Dokumenti i mëparshëm u refuzua. Ngarko një dokument të ri.', 'warning');
    }
  }

  async function load() {
    try {
      const status = await requestJson('/api/auth?scope=verification');
      titles = Array.isArray(status.titles) ? status.titles : [];
      maxDocumentBytes = Number(status.maxDocumentBytes) || maxDocumentBytes;
      renderTitles();
      syncFile();

      if (['submitted', 'verified'].includes(status.status)) {
        showStep('pending');
        const proof = titles.find(title => title.documentKind === status.document?.documentKind);
        note($('pendingSummary'), [
          status.email,
          status.profile?.fullName,
          proof ? proof.label : '',
          status.document ? `${proof ? proof.proof : 'Dokumenti'} · ${humanBytes(status.document.byteSize)}` : '',
        ].filter(Boolean).join(' · '), 'success');
        return;
      }

      showStep('profile');
      $('stepProfileLead').textContent = status.email
        ? `Po regjistrohesh si ${status.email}. Administratori i shqyrton këto para se llogaria të hapet.`
        : 'Administratori i shqyrton këto para se llogaria të hapet.';
      fillProfile(status);
    } catch (error) {
      if (error.status === 401 || error.code === 'ENROLLMENT_REQUIRED') {
        showStep('account');
        return;
      }
      if (error.code === 'PENDING_PROFILE_REQUIRED') {
        // The account is no longer pending — it was approved, or refused.
        navigate('/login.html');
        return;
      }
      showStep('account');
      note($('accountNote'), error.message, 'error');
    }
  }

  async function start() {
    let config = {};
    try {
      config = await requestJson('/api/auth');
    } catch (error) {
      config = error.payload || {};
    }
    if (!active) return;
    csrfToken = String(config.csrfToken || '');
    if (config.authenticated) {
      navigate('/index.html');
      return;
    }
    await load();
    void initializeGoogle(config);
  }

  // --- wiring ---------------------------------------------------------------

  listen(root, 'click', event => {
    const toggle = event.target.closest('[data-toggle-password]');
    if (!toggle) return;
    const input = $(toggle.dataset.togglePassword);
    if (!input) return;
    const shown = input.type === 'text';
    input.type = shown ? 'password' : 'text';
    toggle.textContent = shown ? 'Shfaq' : 'Fshih';
    toggle.setAttribute('aria-pressed', String(!shown));
  });

  listen($('titleChoices'), 'change', syncTitle);
  listen($('signupForm'), 'submit', submitSignup);
  listen($('profileForm'), 'submit', submitProfile);

  listen($('documentInput'), 'change', event => {
    selectedFile = event.target.files?.[0] || null;
    note($('profileNote'), '');
    syncFile();
  });

  const drop = $('documentDrop');
  ['dragenter', 'dragover'].forEach(name => listen(drop, name, event => {
    event.preventDefault();
    drop.dataset.dragging = '1';
  }));
  ['dragleave', 'drop'].forEach(name => listen(drop, name, event => {
    event.preventDefault();
    delete drop.dataset.dragging;
  }));
  listen(drop, 'drop', event => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    selectedFile = file;
    $('documentInput').files = event.dataTransfer.files;
    note($('profileNote'), '');
    syncFile();
  });

  listen($('profileSignOut'), 'click', async event => {
    event.preventDefault();
    event.stopPropagation();
    try { await requestJson('/api/auth', { method:'DELETE' }); navigate('/login.html'); }
    catch { if (active) note($('profileNote'), 'Dalja nuk u përfundua. Provo përsëri.', 'error'); }
  });

  void start();
  return { destroy() {
    active = false;
    selectedFile = null;
    root.querySelectorAll('input[type="file"]').forEach(input => { input.value = ''; });
    lifetime.abort();
    timers.forEach(timer => clearTimeout(timer));
    disposers.forEach(dispose => dispose());
    root.querySelectorAll('input[type="password"],input[autocomplete="current-password"],input[autocomplete="new-password"]').forEach(input => { input.value = ''; });
  } };
  }
  window.DRxAuthViews = window.DRxAuthViews || {};
  window.DRxAuthViews.registration = mountRegistration;
  if (document.getElementById('registerSteps') && !document.querySelector('[data-home-auth]')) mountRegistration();
})();
