(() => {
  'use strict';

  const VERSION = 'medindex-brand-v4';
  const PROFILE_VERSION = 'profile-portal-v2';
  const PROFILE_KEY = 'medindex_profile_v1';
  const ROOT = '/public/images/brand/';
  const ASSETS = Object.freeze({
    fullLight:`${ROOT}medindex-full-on-light.png`,
    fullDark:`${ROOT}medindex-full-on-dark.png`,
    iconLight:`${ROOT}medindex-icon-on-light.png`,
    iconDark:`${ROOT}medindex-icon-on-dark.png`,
  });
  const DEFAULT_PROFILE = Object.freeze({
    name:'Diellza Rabushaj',
    role:'Administratore',
    email:'',
    photo:'',
  });

  let profile = readProfile();
  let faviconsInstalled = false;
  let lastDialogTrigger = null;

  const clean = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const initials = value => {
    const parts = clean(value, 80).split(' ').filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || 'DR').toUpperCase();
  };
  const icon = name => ({
    user:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
    camera:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
    close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  }[name] || '');

  function readProfile() {
    try {
      const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      if (!value || typeof value !== 'object') return { ...DEFAULT_PROFILE };
      return {
        name:clean(value.name, 80) || DEFAULT_PROFILE.name,
        role:clean(value.role, 80) || DEFAULT_PROFILE.role,
        email:clean(value.email, 120),
        photo:typeof value.photo === 'string' && value.photo.startsWith('data:image/') ? value.photo : '',
      };
    } catch {
      return { ...DEFAULT_PROFILE };
    }
  }

  function saveProfile(next) {
    const safe = {
      name:clean(next.name, 80) || DEFAULT_PROFILE.name,
      role:clean(next.role, 80) || DEFAULT_PROFILE.role,
      email:clean(next.email, 120),
      photo:typeof next.photo === 'string' && next.photo.startsWith('data:image/') ? next.photo : '',
    };
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(safe));
    } catch {
      throw new Error('Profili nuk mund të ruhej në këtë pajisje.');
    }
    profile = safe;
    applyProfile();
  }

  function installStyles() {
    if (document.getElementById('medindexBrandRuntimeStyles')) return;
    const style = document.createElement('style');
    style.id = 'medindexBrandRuntimeStyles';
    style.textContent = `
      .mi-brand[data-medindex-brand="${VERSION}"]{display:flex!important;align-items:center!important;min-width:0!important;text-decoration:none!important}
      .medindex-brand-picture{display:block;min-width:0;line-height:0}.medindex-brand-picture img{display:block;width:100%;height:100%;object-fit:contain;object-position:left center;filter:none!important}.medindex-brand-dark{display:none!important}html[data-theme="dark"] .medindex-brand-light,html.dark .medindex-brand-light{display:none!important}html[data-theme="dark"] .medindex-brand-dark,html.dark .medindex-brand-dark{display:block!important}.mi-sidebar:not(.mi-sidebar-collapsed) .medindex-brand-full{width:154px;height:58px}.medindex-brand-icon{display:none;width:38px;height:38px;flex:0 0 38px}body.mi-sidebar-collapsed .medindex-brand-full{display:none}body.mi-sidebar-collapsed .medindex-brand-icon{display:block}.mi-mobile-brand[data-medindex-brand="${VERSION}"]{display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:0!important}.mi-mobile-brand[data-medindex-brand="${VERSION}"] .medindex-brand-icon{display:block;width:34px;height:34px}.mi-mobile-brand[data-medindex-brand="${VERSION}"] .medindex-brand-full{display:none}
      [data-mi-profile-trigger]{cursor:pointer!important;border-radius:10px;transition:background .15s ease,box-shadow .15s ease}[data-mi-profile-trigger]:hover{background:var(--mi-gray-100,#f2f4f7)}html[data-theme="dark"] [data-mi-profile-trigger]:hover,html.dark [data-mi-profile-trigger]:hover{background:rgba(255,255,255,.06)}[data-mi-profile-trigger]:focus-visible{outline:3px solid #d48b20!important;outline-offset:3px!important}.mi-user-card[data-mi-profile-trigger]{width:100%;padding:4px!important}.mi-user-avatar[data-has-photo="true"],.mi-profile-photo[data-has-photo="true"]{background-position:center!important;background-size:cover!important;background-repeat:no-repeat!important;color:transparent!important}
      .mi-profile-menu{position:fixed;z-index:100000;width:248px;padding:8px;border:1px solid var(--mi-border,#e4e7ec);border-radius:14px;background:var(--mi-surface,#fff);box-shadow:0 18px 45px rgba(16,24,40,.18)}.mi-profile-menu[hidden],.mi-profile-overlay[hidden]{display:none!important}.mi-profile-menu-head{display:flex;align-items:center;gap:10px;padding:8px 8px 10px;border-bottom:1px solid var(--mi-border,#e4e7ec)}.mi-profile-menu-head .mi-user-avatar{width:42px!important;height:42px!important;flex:0 0 42px!important}.mi-profile-menu-copy{display:grid;min-width:0}.mi-profile-menu-copy>*{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mi-profile-menu-copy strong{font-size:13px}.mi-profile-menu-copy small{color:var(--mi-muted,#667085);font-size:11px}.mi-profile-menu-actions{display:grid;padding-top:6px}.mi-profile-menu button{display:flex;min-height:42px;align-items:center;gap:10px;padding:9px 10px;border:0;border-radius:9px;background:transparent;color:var(--mi-text,#101828);cursor:pointer;text-align:left;font:600 13px/1.25 inherit}.mi-profile-menu button:hover{background:var(--mi-gray-100,#f2f4f7)}.mi-profile-menu button:disabled{cursor:not-allowed;opacity:.45}.mi-profile-menu svg,.mi-profile-close svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.mi-profile-menu-icon{display:grid;width:22px;height:22px;place-items:center;color:var(--mi-brand-600,#155f63)}
      .mi-profile-overlay{position:fixed;z-index:100001;inset:0;display:grid;place-items:center;padding:14px;background:rgba(16,24,40,.56);backdrop-filter:blur(4px)}.mi-profile-dialog{display:grid;grid-template-rows:auto minmax(0,1fr);width:min(560px,calc(100vw - 28px));max-height:min(760px,calc(100dvh - 28px));overflow:hidden;border:1px solid var(--mi-border,#e4e7ec);border-radius:18px;background:var(--mi-surface,#fff);box-shadow:0 28px 80px rgba(16,24,40,.3)}.mi-profile-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:17px 19px 15px;border-bottom:1px solid var(--mi-border,#e4e7ec)}.mi-profile-head h2{margin:0;font-size:18px;line-height:1.25}.mi-profile-head p{max-width:430px;margin:4px 0 0;color:var(--mi-muted,#667085);font-size:12px;line-height:1.45}.mi-profile-close{display:grid;width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important;flex:0 0 34px;place-items:center;padding:0!important;border:1px solid var(--mi-border,#e4e7ec);border-radius:9px;background:transparent;color:var(--mi-muted,#667085);cursor:pointer}.mi-profile-close:hover{background:var(--mi-gray-100,#f2f4f7);color:var(--mi-text,#101828)}
      .mi-profile-form{display:grid;gap:13px;min-height:0;overflow:auto;padding:16px 19px 18px;overscroll-behavior:contain}.mi-profile-photo-row{display:grid;grid-template-columns:62px minmax(0,1fr);align-items:center;gap:13px;padding:12px 13px;border:1px solid var(--mi-border,#e4e7ec);border-radius:12px;background:var(--mi-surface-soft,#f9fafb)}.mi-profile-photo{display:grid;width:62px!important;height:62px!important;min-width:62px!important;min-height:62px!important;place-items:center;border-radius:50%;background:linear-gradient(145deg,var(--mi-brand-100,#d6eae5),var(--mi-brand-200,#b6d8d0));color:var(--mi-brand-700,#0d4145);font-size:18px;font-weight:750}.mi-profile-photo-copy{display:grid;gap:5px;min-width:0}.mi-profile-photo-copy>strong{font-size:13px}.mi-profile-photo-copy small{color:var(--mi-muted,#667085);font-size:11px;line-height:1.4}.mi-profile-photo-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}
      .mi-profile-secondary,.mi-profile-danger,.mi-profile-cancel,.mi-profile-save{box-sizing:border-box!important;min-height:36px!important;height:36px!important;padding:7px 11px!important;border:1px solid var(--mi-border,#e4e7ec);border-radius:8px;background:var(--mi-surface,#fff);color:var(--mi-text,#101828);cursor:pointer;font:700 12px/1.2 inherit!important;white-space:nowrap}.mi-profile-secondary:hover,.mi-profile-cancel:hover{background:var(--mi-gray-100,#f2f4f7)}.mi-profile-danger{color:var(--mi-error-700,#b42318)}.mi-profile-danger:hover{background:#fef3f2}.mi-profile-danger:disabled{cursor:not-allowed;opacity:.45}
      .mi-profile-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:11px 12px}.mi-profile-field{display:grid;gap:5px;min-width:0}.mi-profile-field-wide{grid-column:1/-1}.mi-profile-field label{font-size:11px;font-weight:700;line-height:1.3}.mi-profile-field input{box-sizing:border-box!important;width:100%!important;min-width:0!important;min-height:40px!important;height:40px!important;padding:8px 10px!important;border:1px solid var(--mi-border,#d0d5dd)!important;border-radius:9px!important;background:var(--mi-surface,#fff)!important;color:var(--mi-text,#101828)!important;font:500 13px/20px inherit!important;box-shadow:none!important}.mi-profile-field input:focus{border-color:var(--mi-brand-500,#2b7a78)!important;outline:3px solid rgba(43,122,120,.14)!important;outline-offset:0!important}.mi-profile-note{padding:9px 11px;border-radius:9px;background:var(--mi-brand-50,#eaf4f1);color:var(--mi-brand-700,#0d4145);font-size:11px;line-height:1.45}.mi-profile-status{min-height:15px;margin:0;color:var(--mi-muted,#667085);font-size:11px;line-height:1.35}.mi-profile-status:empty{display:none}.mi-profile-status[data-tone="error"]{color:var(--mi-error-700,#b42318)}.mi-profile-status[data-tone="success"]{color:var(--mi-success-700,#027a48)}.mi-profile-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:1px}.mi-profile-actions>*{min-width:108px}.mi-profile-save{border-color:var(--mi-brand-600,#155f63)!important;background:var(--mi-brand-600,#155f63)!important;color:#fff!important}.mi-profile-save:hover{filter:brightness(.94)}body.mi-profile-open{overflow:hidden!important}
      html[data-theme="dark"] .mi-profile-dialog,html.dark .mi-profile-dialog,html[data-theme="dark"] .mi-profile-menu,html.dark .mi-profile-menu{background:var(--mi-surface,#101828)}html[data-theme="dark"] .mi-profile-photo-row,html.dark .mi-profile-photo-row{background:rgba(255,255,255,.035)}html[data-theme="dark"] .mi-profile-danger:hover,html.dark .mi-profile-danger:hover{background:rgba(240,68,56,.12)}
      @media(max-width:1023px){.mi-sidebar .medindex-brand-full{display:none!important}.mi-sidebar .medindex-brand-icon{display:block!important;width:38px;height:38px}.mi-sidebar-header{min-height:66px!important}.mi-profile-menu{right:12px!important;bottom:12px!important;left:12px!important;top:auto!important;width:auto!important}.mi-profile-overlay{padding:10px}.mi-profile-dialog{width:min(560px,calc(100vw - 20px));max-height:calc(100dvh - 20px);border-radius:15px}}
      @media(max-width:430px){.mi-profile-head{padding:15px 15px 13px}.mi-profile-form{gap:11px;padding:13px 15px 15px}.mi-profile-photo-row{grid-template-columns:52px minmax(0,1fr);gap:11px;padding:10px}.mi-profile-photo{width:52px!important;height:52px!important;min-width:52px!important;min-height:52px!important}.mi-profile-fields{grid-template-columns:1fr;gap:10px}.mi-profile-field-wide{grid-column:auto}.mi-profile-photo-actions{display:grid;grid-template-columns:1fr 1fr}.mi-profile-photo-actions>*{width:100%;min-width:0}.mi-profile-actions{display:grid;grid-template-columns:1fr 1fr}.mi-profile-actions>*{width:100%;min-width:0}}
      @media(max-height:680px) and (min-width:431px){.mi-profile-dialog{max-height:calc(100dvh - 16px)}.mi-profile-head{padding-top:13px;padding-bottom:12px}.mi-profile-form{gap:10px;padding-top:12px;padding-bottom:13px}.mi-profile-photo-row{padding:9px 11px}.mi-profile-photo{width:54px!important;height:54px!important;min-width:54px!important;min-height:54px!important}.mi-profile-field input{min-height:38px!important;height:38px!important}.mi-profile-secondary,.mi-profile-danger,.mi-profile-cancel,.mi-profile-save{min-height:34px!important;height:34px!important}}
      @media(min-width:1024px){body:not(.mi-sidebar-collapsed) .mi-sidebar .mi-brand{justify-content:flex-start!important}}
      @media(forced-colors:active){.mi-profile-dialog,.mi-profile-menu,.mi-profile-photo-row,.mi-profile-field input,.mi-profile-close,.mi-profile-secondary,.mi-profile-danger,.mi-profile-cancel,.mi-profile-save{border:1px solid CanvasText!important}.mi-profile-save{background:Highlight!important;color:HighlightText!important}}
      @media(prefers-reduced-motion:reduce){[data-mi-profile-trigger]{transition:none}.mi-profile-overlay{backdrop-filter:none}}
    `;
    document.head.appendChild(style);
  }

  function picture(kind, className) {
    const full = kind === 'full';
    const light = full ? ASSETS.fullLight : ASSETS.iconLight;
    const dark = full ? ASSETS.fullDark : ASSETS.iconDark;
    return `<span class="medindex-brand-picture ${className}" aria-hidden="true"><img class="medindex-brand-light" src="${light}" alt="" decoding="async" draggable="false"><img class="medindex-brand-dark" src="${dark}" alt="" decoding="async" draggable="false"></span>`;
  }

  function enhanceBrands() {
    const sidebar = document.querySelector('.mi-sidebar .mi-brand');
    const mobile = document.querySelector('.mi-mobile-brand');
    if (sidebar && sidebar.dataset.medindexBrand !== VERSION) {
      sidebar.dataset.medindexBrand = VERSION;
      sidebar.setAttribute('aria-label', 'MedIndex by Dr. Diellza Rabushaj');
      sidebar.innerHTML = `${picture('full','medindex-brand-full')}${picture('icon','medindex-brand-icon')}`;
    }
    if (mobile && mobile.dataset.medindexBrand !== VERSION) {
      mobile.dataset.medindexBrand = VERSION;
      mobile.setAttribute('aria-label', 'MedIndex');
      mobile.innerHTML = picture('icon','medindex-brand-icon');
    }
    return Boolean(sidebar && mobile);
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
    document.querySelectorAll('.mi-user-copy small,.mi-profile-chip small,.mi-profile-menu-copy small').forEach(node => { node.textContent = profile.role; });
    document.querySelectorAll('[data-profile-remove]').forEach(button => { button.disabled = !profile.photo; });
  }

  function createProfileUi() {
    if (document.getElementById('miProfileMenu')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="mi-profile-menu" id="miProfileMenu" role="menu" aria-label="Opsionet e profilit" hidden>
        <div class="mi-profile-menu-head"><span class="mi-user-avatar" aria-hidden="true"></span><span class="mi-profile-menu-copy"><strong></strong><small></small></span></div>
        <div class="mi-profile-menu-actions">
          <button type="button" role="menuitem" data-profile-open><span class="mi-profile-menu-icon">${icon('user')}</span>Menaxho profilin</button>
          <button type="button" role="menuitem" data-profile-upload><span class="mi-profile-menu-icon">${icon('camera')}</span>Ndrysho fotografinë</button>
          <button type="button" role="menuitem" data-profile-remove><span class="mi-profile-menu-icon">${icon('trash')}</span>Hiq fotografinë</button>
        </div>
      </div>
      <input id="miProfileFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
      <div class="mi-profile-overlay" id="miProfileOverlay" hidden>
        <section class="mi-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="miProfileTitle" aria-describedby="miProfileDescription">
          <header class="mi-profile-head"><div><h2 id="miProfileTitle">Profili im</h2><p id="miProfileDescription">Përditëso fotografinë dhe të dhënat që shfaqen në MedIndex.</p></div><button class="mi-profile-close" type="button" data-profile-close aria-label="Mbyll portalin e profilit">${icon('close')}</button></header>
          <form class="mi-profile-form" id="miProfileForm" novalidate>
            <div class="mi-profile-photo-row"><span class="mi-profile-photo" aria-label="Fotografia aktuale e profilit"></span><div class="mi-profile-photo-copy"><strong>Fotografia e profilit</strong><small>PNG, JPG ose WebP, maksimumi 5 MB.</small><div class="mi-profile-photo-actions"><button class="mi-profile-secondary" type="button" data-profile-upload>Zgjidh fotografi</button><button class="mi-profile-danger" type="button" data-profile-remove>Hiq fotografinë</button></div></div></div>
            <div class="mi-profile-fields">
              <div class="mi-profile-field"><label for="miProfileName">Emri dhe mbiemri</label><input id="miProfileName" name="name" maxlength="80" autocomplete="name" required></div>
              <div class="mi-profile-field"><label for="miProfileRole">Roli</label><input id="miProfileRole" name="role" maxlength="80" autocomplete="organization-title" required></div>
              <div class="mi-profile-field mi-profile-field-wide"><label for="miProfileEmail">Emaili</label><input id="miProfileEmail" name="email" type="email" maxlength="120" autocomplete="email" placeholder="email@shembull.com"></div>
            </div>
            <div class="mi-profile-note">Këto ndryshime ruhen vetëm në këtë shfletues dhe nuk ndryshojnë llogarinë e autentikimit.</div>
            <p class="mi-profile-status" id="miProfileStatus" role="status" aria-live="polite"></p>
            <div class="mi-profile-actions"><button class="mi-profile-cancel" type="button" data-profile-close>Anulo</button><button class="mi-profile-save" type="submit">Ruaj ndryshimet</button></div>
          </form>
        </section>
      </div>`);
    bindProfileUi();
    applyProfile();
  }

  function status(message, tone = '') {
    const node = document.getElementById('miProfileStatus');
    if (!node) return;
    node.textContent = message;
    if (tone) node.dataset.tone = tone;
    else node.removeAttribute('data-tone');
  }

  function closeMenu(returnFocus = false) {
    const menu = document.getElementById('miProfileMenu');
    if (!menu || menu.hidden) return;
    const anchorId = menu.dataset.anchor;
    menu.hidden = true;
    document.querySelectorAll('[data-mi-profile-trigger]').forEach(node => node.setAttribute('aria-expanded', 'false'));
    if (returnFocus && anchorId) document.getElementById(anchorId)?.focus({ preventScroll:true });
  }

  function openMenu(anchor) {
    const menu = document.getElementById('miProfileMenu');
    if (!menu || !anchor) return;
    const sameAnchor = !menu.hidden && menu.dataset.anchor === anchor.id;
    closeMenu();
    if (sameAnchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(248, innerWidth - 24);
    const preferredTop = rect.top - 190;
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.min(Math.max(12, rect.left), innerWidth - width - 12)}px`;
    menu.style.top = `${Math.max(12, Math.min(preferredTop, innerHeight - 230))}px`;
    menu.dataset.anchor = anchor.id;
    menu.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => menu.querySelector('[role="menuitem"]')?.focus());
  }

  function openDialog(trigger = null) {
    const overlay = document.getElementById('miProfileOverlay');
    const form = document.getElementById('miProfileForm');
    if (!overlay || !form) return;
    lastDialogTrigger = trigger || document.activeElement;
    closeMenu();
    form.elements.name.value = profile.name;
    form.elements.role.value = profile.role;
    form.elements.email.value = profile.email;
    status('');
    overlay.hidden = false;
    document.body.classList.add('mi-profile-open');
    requestAnimationFrame(() => form.elements.name.focus());
  }

  function closeDialog() {
    const overlay = document.getElementById('miProfileOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('mi-profile-open');
    if (lastDialogTrigger instanceof HTMLElement && lastDialogTrigger.isConnected) lastDialogTrigger.focus({ preventScroll:true });
    lastDialogTrigger = null;
  }

  function dialogFocusable() {
    const overlay = document.getElementById('miProfileOverlay');
    if (!overlay || overlay.hidden) return [];
    return [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(node => !node.hidden);
  }

  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) return reject(new Error('Zgjidh një fotografi PNG, JPG ose WebP.'));
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
    if (!menu || menu.dataset.bound === '1') return;
    menu.dataset.bound = '1';
    const overlay = document.getElementById('miProfileOverlay');
    const fileInput = document.getElementById('miProfileFile');
    const upload = () => { fileInput.value = ''; fileInput.click(); };
    const remove = () => {
      try {
        saveProfile({ ...profile, photo:'' });
        status('Fotografia u hoq.', 'success');
      } catch (error) {
        status(error.message, 'error');
      }
    };

    document.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-mi-profile-trigger]');
      if (trigger) {
        event.preventDefault();
        openMenu(trigger);
        return;
      }
      if (!event.target.closest?.('#miProfileMenu')) closeMenu();
    });

    document.addEventListener('keydown', event => {
      const trigger = event.target.closest?.('[data-mi-profile-trigger]');
      if (trigger && ['Enter',' ','ArrowDown'].includes(event.key)) {
        event.preventDefault();
        openMenu(trigger);
        return;
      }
      if (event.key === 'Escape') {
        if (!overlay.hidden) closeDialog();
        else closeMenu(true);
        return;
      }
      if (event.key === 'Tab' && !overlay.hidden) {
        const focusable = dialogFocusable();
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    window.addEventListener('resize', () => closeMenu(), { passive:true });
    menu.addEventListener('click', event => {
      if (event.target.closest('[data-profile-open]')) openDialog(event.target.closest('button'));
      else if (event.target.closest('[data-profile-upload]')) upload();
      else if (event.target.closest('[data-profile-remove]')) remove();
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-profile-close]')) closeDialog();
      else if (event.target.closest('[data-profile-upload]')) upload();
      else if (event.target.closest('[data-profile-remove]')) remove();
    });

    document.getElementById('miProfileForm').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = clean(form.elements.name.value, 80);
      const role = clean(form.elements.role.value, 80);
      const email = clean(form.elements.email.value, 120);
      if (!name || !role) return status('Emri dhe roli janë të detyrueshëm.', 'error');
      if (email && !form.elements.email.checkValidity()) return status('Shkruaj një email të vlefshëm.', 'error');
      try {
        saveProfile({ ...profile, name, role, email });
        status('Ndryshimet u ruajtën.', 'success');
        setTimeout(closeDialog, 450);
      } catch (error) {
        status(error.message, 'error');
      }
    });

    fileInput.addEventListener('change', async () => {
      const selected = fileInput.files?.[0];
      if (!selected) return;
      status('Duke përpunuar fotografinë…');
      try {
        saveProfile({ ...profile, photo:await resizePhoto(selected) });
        status('Fotografia u përditësua.', 'success');
      } catch (error) {
        status(error.message, 'error');
      }
      fileInput.value = '';
    });
  }

  function enhanceProfiles() {
    const entries = [
      [document.querySelector('.mi-sidebar .mi-user-card'), 'miSidebarProfileTrigger'],
      [document.querySelector('.mi-topbar .mi-profile-chip'), 'miTopbarProfileTrigger'],
    ];
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
    return entries.every(([node]) => Boolean(node));
  }

  function ensureFavicons() {
    if (faviconsInstalled) return;
    faviconsInstalled = true;
    document.querySelectorAll('link[data-medindex-brand-icon]').forEach(node => node.remove());
    [
      ['icon','(prefers-color-scheme: light)',ASSETS.iconLight],
      ['icon','(prefers-color-scheme: dark)',ASSETS.iconDark],
      ['apple-touch-icon','',ASSETS.iconLight],
    ].forEach(([rel, media, href]) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = `${href}?v=${VERSION}`;
      link.dataset.medindexBrandIcon = VERSION;
      if (media) link.media = media;
      document.head.appendChild(link);
    });
  }

  function apply() {
    installStyles();
    ensureFavicons();
    const ready = enhanceBrands() && enhanceProfiles();
    applyProfile();
    document.documentElement.dataset.medindexBrand = VERSION;
    document.documentElement.dataset.medindexProfile = PROFILE_VERSION;
    return ready;
  }

  let frame = 0;
  const observer = new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (apply()) observer.disconnect();
    });
  });
  const start = () => {
    if (!apply()) observer.observe(document.body, { childList:true, subtree:true });
  };

  window.addEventListener('medindex:tailadmin-ready', apply);
  window.addEventListener('pageshow', apply, { passive:true });
  window.addEventListener('storage', event => {
    if (event.key !== PROFILE_KEY) return;
    profile = readProfile();
    applyProfile();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
