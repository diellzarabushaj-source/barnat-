(() => {
  'use strict';

  const VERSION = 'medindex-brand-v4';
  const PROFILE_VERSION = 'profile-portal-v2';
  // Legacy per-device photos are retained only as a one-time migration source.
  // The canonical photo lives behind the authenticated same-origin profile API.
  const PROFILE_KEY_PREFIX = 'medindex_profile_v2:';
  const PROFILE_API = '/api/profile-photo';
  // A single global key that belonged to whoever used the browser last. It is
  // removed on sight; nothing is migrated out of it, because it cannot be said
  // whose it was.
  const LEGACY_PROFILE_KEY = 'medindex_profile_v1';
  const ROOT = '/brand/';
  const ASSETS = Object.freeze({
    horizontalLight:`${ROOT}drx-horizontal-dark.svg`,
    horizontalDark:`${ROOT}drx-horizontal-white.svg`,
    fullLight:`${ROOT}drx-horizontal-dark.svg`,
    fullDark:`${ROOT}drx-horizontal-white.svg`,
    iconLight:`${ROOT}drx-icon-silver.svg`,
    iconDark:`${ROOT}drx-icon-white.svg`,
  });
  // Until the session answers, the card names nobody. It used to default to a
  // real person, so every account that opened MedIndex on this device was shown
  // that person's name and role as if it were their own.
  const SIGNED_OUT_PROFILE = Object.freeze({ name:'Llogaria', role:'', email:'', photo:'' });
  const ROLE_LABELS = Object.freeze({ admin:'Administrim', doctor:'Mjekësi' });
  let account = null;
  let profile = { ...SIGNED_OUT_PROFILE };
  let faviconsInstalled = false;

  const clean = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const initials = name => {
    const parts = clean(name, 80).split(' ').filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || 'DR').toUpperCase();
  };
  const svg = name => ({
    user:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
    camera:'<svg viewBox="0 0 24 24"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
    close:'<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  }[name] || '');

  function accountKey(value) {
    const id = clean(value?.id, 80);
    if (id) return id;
    return clean(value?.email, 120).toLowerCase();
  }

  function profileStorageKey() {
    const key = accountKey(account);
    return key ? `${PROFILE_KEY_PREFIX}${key}` : '';
  }

  function roleLabel(value) {
    const role = clean(value, 80);
    return ROLE_LABELS[role.toLowerCase()] || role;
  }

  // Name, email and role come from the session. A legacy device photo may be
  // shown briefly while it is migrated to the account's persistent profile.
  function readProfile() {
    if (!account) return { ...SIGNED_OUT_PROFILE };
    const identity = {
      name:clean(account.name, 80) || clean(account.email, 120).split('@')[0] || SIGNED_OUT_PROFILE.name,
      role:roleLabel(account.role),
      email:clean(account.email, 120),
      photo:'',
    };
    const key = profileStorageKey();
    if (!key) return identity;
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      const photo = typeof value?.photo === 'string' && value.photo.startsWith('data:image/') ? value.photo : '';
      return { ...identity, photo };
    } catch { return identity; }
  }

  function savePhoto(photo) {
    const key = profileStorageKey();
    if (!key) throw new Error('Fotografia ruhet vetëm pasi të hapet llogaria.');
    const safe = typeof photo === 'string' && photo.startsWith('data:image/') ? photo : '';
    try {
      if (safe) localStorage.setItem(key, JSON.stringify({ photo:safe }));
      else localStorage.removeItem(key);
    } catch { throw new Error('Fotografia nuk mund të ruhej në këtë pajisje.'); }
    profile = { ...profile, photo:safe };
    applyProfile();
  }

  function clearLocalPhoto() {
    const key = profileStorageKey();
    if (!key) return;
    try { localStorage.removeItem(key); } catch {}
  }

  async function profileApi(url = PROFILE_API, options = {}) {
    if (typeof fetch !== 'function') throw new Error('Lidhja me profilin nuk është në dispozicion.');
    const response = await fetch(url, {
      credentials:'same-origin',
      cache:'no-store',
      ...options,
      headers:{
        Accept:'application/json',
        ...(options.body !== undefined ? { 'Content-Type':'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload?.error || 'Profili nuk mund të përditësohej.');
    return payload || {};
  }

  async function syncRemotePhoto() {
    if (!account || typeof fetch !== 'function') return;
    const owner = accountKey(account);
    const local = profile.photo && profile.photo.startsWith('data:image/') ? profile.photo : '';
    try {
      const meta = await profileApi(`${PROFILE_API}?meta=1`);
      if (!account || accountKey(account) !== owner) return;
      if (meta.exists && meta.url) {
        clearLocalPhoto();
        profile = { ...profile, photo:String(meta.url) };
        applyProfile();
        return;
      }
      if (local.startsWith('data:image/jpeg;base64,')) {
        const saved = await profileApi(PROFILE_API, {
          method:'POST',
          body:JSON.stringify({ dataUrl:local }),
        });
        if (!account || accountKey(account) !== owner) return;
        clearLocalPhoto();
        profile = { ...profile, photo:String(saved.url || '') };
        applyProfile();
      } else if (!local) {
        profile = { ...profile, photo:'' };
        applyProfile();
      }
    } catch {
      // Offline or a temporary server failure keeps the account-scoped local fallback.
    }
  }

  async function persistPhoto(photo) {
    const safe = typeof photo === 'string' && photo.startsWith('data:image/jpeg;base64,') ? photo : '';
    if (!safe) throw new Error('Fotografia nuk mund të përpunohej si JPEG.');
    const saved = await profileApi(PROFILE_API, {
      method:'POST',
      body:JSON.stringify({ dataUrl:safe }),
    });
    clearLocalPhoto();
    profile = { ...profile, photo:String(saved.url || '') };
    applyProfile();
  }

  async function removePhoto() {
    await profileApi(PROFILE_API, { method:'DELETE' });
    clearLocalPhoto();
    profile = { ...profile, photo:'' };
    applyProfile();
  }

  function forgetLegacyProfile() {
    try { localStorage.removeItem(LEGACY_PROFILE_KEY); } catch {}
  }

  // The session is the only source of identity. Offline the lease carries none,
  // so the card stays neutral rather than showing whoever was here last.
  function adoptAccount(payload) {
    const user = payload?.user && typeof payload.user === 'object' ? payload.user : null;
    const authUser = payload?.authUser && typeof payload.authUser === 'object' ? payload.authUser : null;
    const next = payload?.authenticated && user ? {
      id:clean(authUser?.id, 80),
      email:clean(user.email, 120),
      name:clean(user.name, 80),
      role:clean(authUser?.role || user.role, 80),
    } : null;
    if (accountKey(next) === accountKey(account)) return;
    account = next;
    profile = readProfile();
    applyProfile();
    void syncRemotePhoto();
  }

  function installStyles() {
    if (document.getElementById('medindexBrandRuntimeStyles')) return;
    const style = document.createElement('style');
    style.id = 'medindexBrandRuntimeStyles';
    style.textContent = `
      .mi-brand[data-medindex-brand="${VERSION}"]{display:flex!important;align-items:center!important;min-width:0!important;text-decoration:none!important}.medindex-brand-picture{display:block;min-width:0;line-height:0}.medindex-brand-picture img{display:block;width:100%;height:100%;object-fit:contain;object-position:left center}.medindex-brand-dark{display:none!important}html[data-theme="dark"] .medindex-brand-light,html.dark .medindex-brand-light{display:none!important}html[data-theme="dark"] .medindex-brand-dark,html.dark .medindex-brand-dark{display:block!important}.mi-sidebar:not(.mi-sidebar-collapsed) .medindex-brand-full{width:188px;height:52px}.medindex-brand-icon{display:none;width:38px;height:38px;flex:0 0 38px}body.mi-sidebar-collapsed .medindex-brand-full{display:none}body.mi-sidebar-collapsed .medindex-brand-icon{display:block}.mi-mobile-brand[data-medindex-brand="${VERSION}"]{display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:0!important}.mi-mobile-brand[data-medindex-brand="${VERSION}"] .medindex-brand-icon{display:block;width:34px;height:34px}.mi-mobile-brand[data-medindex-brand="${VERSION}"] .medindex-brand-full{display:none}
      [data-mi-profile-trigger]{cursor:pointer!important;border-radius:10px;transition:background .15s ease}[data-mi-profile-trigger]:hover{background:var(--mi-gray-100,#f2f4f7)}html[data-theme="dark"] [data-mi-profile-trigger]:hover,html.dark [data-mi-profile-trigger]:hover{background:rgba(255,255,255,.06)}[data-mi-profile-trigger]:focus-visible{outline:3px solid #d48b20!important;outline-offset:3px!important}.mi-user-card[data-mi-profile-trigger]{width:100%;padding:4px!important}.mi-user-avatar[data-has-photo="true"],.mi-profile-photo[data-has-photo="true"]{background-position:center!important;background-size:cover!important;background-repeat:no-repeat!important;color:transparent!important}
      .mi-profile-menu{position:fixed;z-index:100000;width:248px;padding:8px;border:1px solid var(--mi-border,#e4e7ec);border-radius:14px;background:var(--mi-surface,#fff);box-shadow:0 18px 45px rgba(16,24,40,.18)}.mi-profile-menu[hidden],.mi-profile-overlay[hidden]{display:none!important}.mi-profile-menu-head{display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--mi-border,#e4e7ec)}.mi-profile-menu-head .mi-user-avatar{width:42px!important;height:42px!important;flex:0 0 42px!important}.mi-profile-menu-copy{display:grid;min-width:0}.mi-profile-menu-copy>*{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mi-profile-menu-copy strong{font-size:13px}.mi-profile-menu-copy small{color:var(--mi-muted,#667085);font-size:11px}.mi-profile-menu-actions{display:grid;padding-top:6px}.mi-profile-menu button{display:flex;min-height:42px;align-items:center;gap:10px;padding:9px 10px;border:0;border-radius:9px;background:transparent;color:var(--mi-text,#101828);cursor:pointer;text-align:left;font-size:13px;font-weight:600}.mi-profile-menu button:hover{background:var(--mi-gray-100,#f2f4f7)}.mi-profile-menu button:disabled{cursor:not-allowed;opacity:.45}.mi-profile-menu svg,.mi-profile-close svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.mi-profile-menu-icon{display:grid;width:22px;height:22px;place-items:center;color:var(--mi-brand-600,#155f63)}
      .mi-profile-overlay{position:fixed;z-index:100001;inset:0;display:grid;place-items:center;padding:20px;background:rgba(16,24,40,.55);backdrop-filter:blur(4px)}.mi-profile-dialog{width:min(620px,100%);max-height:calc(100dvh - 40px);overflow:auto;border:1px solid var(--mi-border,#e4e7ec);border-radius:20px;background:var(--mi-surface,#fff);box-shadow:0 28px 80px rgba(16,24,40,.28)}.mi-profile-head{display:flex;justify-content:space-between;gap:16px;padding:22px;border-bottom:1px solid var(--mi-border,#e4e7ec)}.mi-profile-head h2{margin:0;font-size:20px}.mi-profile-head p{margin:5px 0 0;color:var(--mi-muted,#667085);font-size:13px}.mi-profile-close{display:grid;width:40px;height:40px;place-items:center;border:1px solid var(--mi-border,#e4e7ec);border-radius:10px;background:transparent;color:var(--mi-muted,#667085);cursor:pointer}.mi-profile-form{display:grid;gap:18px;padding:22px}.mi-profile-photo-row{display:flex;align-items:center;gap:16px;padding:16px;border:1px solid var(--mi-border,#e4e7ec);border-radius:14px;background:var(--mi-surface-soft,#f9fafb)}.mi-profile-photo{display:grid;width:76px;height:76px;flex:0 0 76px;place-items:center;border-radius:50%;background:linear-gradient(145deg,var(--mi-brand-100,#d6eae5),var(--mi-brand-200,#b6d8d0));color:var(--mi-brand-700,#0d4145);font-size:20px;font-weight:750}.mi-profile-photo-copy{display:grid;gap:8px}.mi-profile-photo-copy small{color:var(--mi-muted,#667085);font-size:12px}.mi-profile-photo-actions{display:flex;flex-wrap:wrap;gap:8px}.mi-profile-secondary,.mi-profile-danger,.mi-profile-cancel,.mi-profile-save{min-height:40px;padding:8px 12px;border:1px solid var(--mi-border,#e4e7ec);border-radius:9px;background:var(--mi-surface,#fff);color:var(--mi-text,#101828);cursor:pointer;font-size:12px;font-weight:700}.mi-profile-danger{color:var(--mi-error-700,#b42318)}.mi-profile-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.mi-profile-field{display:grid;gap:6px}.mi-profile-field-wide{grid-column:1/-1}.mi-profile-field label{font-size:12px;font-weight:700}.mi-profile-field input{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--mi-border,#e4e7ec);border-radius:10px;background:var(--mi-surface,#fff);color:var(--mi-text,#101828)}.mi-profile-note{padding:11px 12px;border-radius:10px;background:var(--mi-brand-50,#eaf4f1);color:var(--mi-brand-700,#0d4145);font-size:12px;line-height:1.45}.mi-profile-status{min-height:18px;margin:0;color:var(--mi-muted,#667085);font-size:12px}.mi-profile-status[data-tone="error"]{color:var(--mi-error-700,#b42318)}.mi-profile-status[data-tone="success"]{color:var(--mi-success-700,#027a48)}.mi-profile-actions{display:flex;justify-content:flex-end;gap:10px}.mi-profile-save{border-color:var(--mi-brand-600,#155f63);background:var(--mi-brand-600,#155f63);color:#fff}body.mi-profile-open{overflow:hidden!important}
      @media(max-width:1023px){.mi-sidebar .medindex-brand-full{display:none!important}.mi-sidebar .medindex-brand-icon{display:block!important;width:38px;height:38px}.mi-sidebar-header{min-height:66px!important}.mi-profile-menu{right:12px!important;bottom:12px!important;left:12px!important;top:auto!important;width:auto!important}.mi-profile-overlay{padding:12px}.mi-profile-dialog{max-height:calc(100dvh - 24px);border-radius:16px}}@media(max-width:520px){.mi-profile-fields{grid-template-columns:1fr}.mi-profile-field-wide{grid-column:auto}.mi-profile-photo-row{display:grid}.mi-profile-head,.mi-profile-form{padding:18px}.mi-profile-actions>*{flex:1}}@media(min-width:1024px){body:not(.mi-sidebar-collapsed) .mi-sidebar .mi-brand{justify-content:flex-start!important}}
    `;
    document.head.appendChild(style);
  }

  function picture(kind, className) {
    const full = kind === 'full';
    const light = full ? ASSETS.horizontalLight : ASSETS.iconLight;
    const dark = full ? ASSETS.horizontalDark : ASSETS.iconDark;
    return `<span class="medindex-brand-picture ${className}" aria-hidden="true"><img class="medindex-brand-light" src="${light}" alt="" decoding="async" draggable="false"><img class="medindex-brand-dark" src="${dark}" alt="" decoding="async" draggable="false"></span>`;
  }

  function enhanceBrands() {
    const sidebar = document.querySelector('.mi-sidebar .mi-brand, .sidebar .brand');
    const mobile = document.querySelector('.mi-mobile-brand');
    if (sidebar && sidebar.dataset.medindexBrand !== VERSION) {
      sidebar.dataset.medindexBrand = VERSION;
      sidebar.setAttribute('aria-label', 'DRx by Dr. Diellza Rabushaj');
      sidebar.innerHTML = `${picture('full','medindex-brand-full')}${picture('icon','medindex-brand-icon')}`;
    }
    if (mobile && mobile.dataset.medindexBrand !== VERSION) {
      mobile.dataset.medindexBrand = VERSION;
      mobile.setAttribute('aria-label', 'DRx');
      mobile.innerHTML = picture('icon','medindex-brand-icon');
    }
    return Boolean(sidebar);
  }

  function setAvatar(node) {
    if (!node) return;
    node.dataset.hasPhoto = String(Boolean(profile.photo));
    node.style.backgroundImage = profile.photo ? `url("${profile.photo}")` : '';
    node.textContent = profile.photo ? '' : initials(profile.name);
  }

  function applyProfile() {
    document.querySelectorAll('.mi-user-avatar,.mi-profile-photo').forEach(setAvatar);
    document.querySelectorAll('.mi-user-copy strong,.mi-profile-chip strong,.mi-profile-menu-copy strong').forEach(node => { node.textContent = profile.name; });
    const secondary = profile.email || profile.role;
    document.querySelectorAll('.mi-user-copy small,.mi-profile-chip small,.mi-profile-menu-copy small').forEach(node => { node.textContent = secondary; });
    document.querySelectorAll('[data-profile-remove]').forEach(button => { button.disabled = !profile.photo; });
  }

  function createProfileUi() {
    if (!document.getElementById('miProfileMenu')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="mi-profile-menu" id="miProfileMenu" role="menu" aria-label="Opsionet e profilit" hidden>
          <div class="mi-profile-menu-head"><span class="mi-user-avatar"></span><span class="mi-profile-menu-copy"><strong></strong><small></small></span></div>
          <div class="mi-profile-menu-actions">
            <button type="button" role="menuitem" data-profile-open><span class="mi-profile-menu-icon">${svg('user')}</span>Menaxho profilin</button>
            <button type="button" role="menuitem" data-profile-upload><span class="mi-profile-menu-icon">${svg('camera')}</span>Ndrysho fotografinë</button>
            <button type="button" role="menuitem" data-profile-remove><span class="mi-profile-menu-icon">${svg('trash')}</span>Hiq fotografinë</button>
          </div>
        </div>
        <input id="miProfileFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
        <div class="mi-profile-overlay" id="miProfileOverlay" hidden>
          <section class="mi-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="miProfileTitle">
            <header class="mi-profile-head"><div><h2 id="miProfileTitle">Profili im</h2><p>Përditëso fotografinë dhe të dhënat që shfaqen në DRx.</p></div><button class="mi-profile-close" type="button" data-profile-close aria-label="Mbyll">${svg('close')}</button></header>
            <form class="mi-profile-form" id="miProfileForm" novalidate>
              <div class="mi-profile-photo-row"><span class="mi-profile-photo"></span><div class="mi-profile-photo-copy"><strong>Fotografia e profilit</strong><small>PNG, JPG ose WebP, maksimumi 5 MB.</small><div class="mi-profile-photo-actions"><button class="mi-profile-secondary" type="button" data-profile-upload>Zgjidh fotografi</button><button class="mi-profile-danger" type="button" data-profile-remove>Hiq fotografinë</button></div></div></div>
              <div class="mi-profile-fields">
                <div class="mi-profile-field"><label for="miProfileName">Emri dhe mbiemri</label><input id="miProfileName" name="name" maxlength="80" readonly></div>
                <div class="mi-profile-field"><label for="miProfileRole">Roli</label><input id="miProfileRole" name="role" maxlength="80" readonly></div>
                <div class="mi-profile-field mi-profile-field-wide"><label for="miProfileEmail">Emaili</label><input id="miProfileEmail" name="email" type="email" maxlength="120" readonly></div>
              </div>
              <div class="mi-profile-note">Emri, roli dhe emaili vijnë nga llogaria me të cilën ke hyrë dhe ndryshohen vetëm atje. Fotografia ruhet në profilin tënd DRx dhe sinkronizohet në pajisjet ku hyn me këtë llogari.</div>
              <p class="mi-profile-status" id="miProfileStatus" role="status" aria-live="polite"></p>
              <div class="mi-profile-actions"><button class="mi-profile-save" type="submit">Mbyll</button></div>
            </form>
          </section>
        </div>`);
    }
    bindProfileUi();
    applyProfile();
  }

  function status(message, tone = '') {
    const node = document.getElementById('miProfileStatus');
    if (!node) return;
    node.textContent = message;
    if (tone) node.dataset.tone = tone; else node.removeAttribute('data-tone');
  }

  function closeMenu(returnFocus = false) {
    const menu = document.getElementById('miProfileMenu');
    if (!menu || menu.hidden) return;
    const id = menu.dataset.anchor;
    menu.hidden = true;
    document.querySelectorAll('[data-mi-profile-trigger]').forEach(node => node.setAttribute('aria-expanded', 'false'));
    if (returnFocus && id) document.getElementById(id)?.focus({ preventScroll:true });
  }

  function openMenu(anchor) {
    const menu = document.getElementById('miProfileMenu');
    const wasOpen = !menu.hidden && menu.dataset.anchor === anchor.id;
    closeMenu();
    if (wasOpen) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(248, innerWidth - 24);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.min(Math.max(12, rect.left), innerWidth - width - 12)}px`;
    menu.style.top = `${Math.max(12, rect.top - 190)}px`;
    menu.dataset.anchor = anchor.id;
    menu.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => menu.querySelector('[role="menuitem"]')?.focus());
  }

  function openDialog() {
    closeMenu();
    const form = document.getElementById('miProfileForm');
    form.elements.name.value = profile.name;
    form.elements.role.value = profile.role;
    form.elements.email.value = profile.email;
    status('');
    document.getElementById('miProfileOverlay').hidden = false;
    document.body.classList.add('mi-profile-open');
    requestAnimationFrame(() => form.elements.name.focus());
  }

  function closeDialog() {
    document.getElementById('miProfileOverlay').hidden = true;
    document.body.classList.remove('mi-profile-open');
  }

  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file?.type.startsWith('image/')) return reject(new Error('Zgjidh një fotografi të vlefshme.'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('Fotografia duhet të jetë më e vogël se 5 MB.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Fotografia nuk mund të lexohej.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Formati i fotografisë nuk mbështetet.'));
        image.onload = () => {
          const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d', { alpha:false });
          if (!context) return reject(new Error('Fotografia nuk mund të përpunohej.'));
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', .86));
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  function bindProfileUi() {
    const menu = document.getElementById('miProfileMenu');
    if (menu.dataset.bound === '1') return;
    menu.dataset.bound = '1';
    const overlay = document.getElementById('miProfileOverlay');
    const file = document.getElementById('miProfileFile');
    const upload = () => { file.value = ''; file.click(); };
    const remove = async () => { status('Duke hequr fotografinë…'); try { await removePhoto(); status('Fotografia u hoq.', 'success'); } catch (error) { status(error.message, 'error'); } };

    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-mi-profile-trigger]');
      if (trigger) { event.preventDefault(); openMenu(trigger); return; }
      if (!event.target.closest('#miProfileMenu')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      const trigger = event.target.closest?.('[data-mi-profile-trigger]');
      if (trigger && ['Enter',' ','ArrowDown'].includes(event.key)) { event.preventDefault(); openMenu(trigger); }
      if (event.key === 'Escape') { if (!overlay.hidden) closeDialog(); else closeMenu(true); }
    });
    window.addEventListener('resize', closeMenu, { passive:true });
    menu.addEventListener('click', event => {
      if (event.target.closest('[data-profile-open]')) openDialog();
      if (event.target.closest('[data-profile-upload]')) upload();
      if (event.target.closest('[data-profile-remove]')) void remove();
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-profile-close]')) closeDialog();
      if (event.target.closest('[data-profile-upload]')) upload();
      if (event.target.closest('[data-profile-remove]')) void remove();
    });
    // Identity is the account's and is not editable here: a local override was
    // exactly how one doctor's card came to carry another's name.
    document.getElementById('miProfileForm').addEventListener('submit', event => {
      event.preventDefault();
      closeDialog();
    });
    file.addEventListener('change', async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      status('Duke përpunuar fotografinë…');
      try { await persistPhoto(await resizePhoto(selected)); status('Fotografia u ruajt në profil.', 'success'); }
      catch (error) { status(error.message, 'error'); }
      file.value = '';
    });
  }

  function enhanceProfiles() {
    const candidates = [...document.querySelectorAll('[data-mi-profile-trigger], .mi-sidebar .mi-user-card, .mi-topbar .mi-profile-chip')];
    const entries = [...new Set(candidates)].map((node, index) => [node, index === 0 ? 'miSidebarProfileTrigger' : `miProfileTrigger${index + 1}`]);
    entries.forEach(([node, id]) => {
      if (!node) return;
      node.id ||= id;
      node.dataset.miProfileTrigger = PROFILE_VERSION;
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-haspopup', 'menu');
      node.setAttribute('aria-controls', 'miProfileMenu');
      node.setAttribute('aria-expanded', 'false');
      node.setAttribute('aria-label', 'Hap opsionet e profilit');
      node.setAttribute('title', 'Hap opsionet e profilit');
    });
    createProfileUi();
    return entries.length > 0 && entries.every(([node]) => Boolean(node));
  }

  function ensureFavicons() {
    if (faviconsInstalled) return;
    faviconsInstalled = true;
    document.querySelectorAll('link[data-medindex-brand-icon]').forEach(node => node.remove());
    [['icon','(prefers-color-scheme: light)',ASSETS.iconLight],['icon','(prefers-color-scheme: dark)',ASSETS.iconDark],['apple-touch-icon','',ASSETS.iconLight]].forEach(([rel,media,href]) => {
      const link = document.createElement('link'); link.rel = rel; link.href = `${href}?v=${VERSION}`; link.dataset.medindexBrandIcon = VERSION; if (media) link.media = media; document.head.appendChild(link);
    });
  }

  function apply() {
    installStyles();
    ensureFavicons();
    enhanceBrands();
    const ready = enhanceProfiles();
    applyProfile();
    document.documentElement.dataset.medindexBrand = VERSION;
    document.documentElement.dataset.medindexProfile = PROFILE_VERSION;
    return ready;
  }

  let frame = 0;
  const observer = new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; if (apply()) observer.disconnect(); });
  });
  const start = () => { if (!apply()) observer.observe(document.body, { childList:true, subtree:true }); };
  window.addEventListener('medindex:tailadmin-ready', apply);
  window.addEventListener('pageshow', apply, { passive:true });
  window.addEventListener('storage', event => {
    if (event.key && event.key !== profileStorageKey()) return;
    profile = readProfile();
    applyProfile();
  });

  // The identity surface, so a test can drive the same code the card runs on.
  window.MedIndexProfile = Object.freeze({
    version:PROFILE_VERSION,
    account:() => (account ? { ...account } : null),
    current:() => ({ ...profile }),
    adoptAccount,
    _test:{ accountKey, roleLabel, profileStorageKey, readProfile, savePhoto, syncRemotePhoto, persistPhoto, removePhoto, forgetLegacyProfile },
  });

  forgetLegacyProfile();
  window.addEventListener('medindex:auth-ready', event => adoptAccount(event.detail));
  window.addEventListener('medindex:auth-failed', () => adoptAccount(null));
  window.MEDINDEX_AUTH_READY?.then?.(adoptAccount, () => adoptAccount(null));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();