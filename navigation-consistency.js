(() => {
  'use strict';

  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const ICONS = {
    favorites:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="m128 24 31 63 69 10-50 49 12 69-62-33-62 33 12-69-50-49 69-10 31-63Z" stroke="currentColor" stroke-width="16" stroke-linejoin="round"/></svg>',
    search:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><circle cx="116" cy="116" r="76" stroke="currentColor" stroke-width="16"/><path d="m171 171 53 53" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg>',
  };

  function installStyles() {
    if (document.getElementById('medindexNavigationConsistency')) return;
    const style = document.createElement('style');
    style.id = 'medindexNavigationConsistency';
    style.textContent = `
      :root{--mi-nav-width:112px!important}
      html,body{overflow-x:hidden}
      html body.has-app-nav{padding-left:var(--mi-nav-width)!important}
      html .med-shell{padding-left:var(--mi-nav-width)!important}
      html .atc-shell{grid-template-columns:var(--mi-nav-width) minmax(0,1fr)!important}
      html body.has-app-nav .app-menu,html .med-nav,html .atc-nav{width:var(--mi-nav-width)!important;padding:20px 12px!important;gap:9px!important;overflow-x:hidden!important;overflow-y:auto!important;scrollbar-width:none!important;background:#0d4b4f!important;border:0!important;border-right:4px solid #c77d1f!important;box-shadow:8px 0 24px rgba(4,29,31,.12)!important}
      html body.has-app-nav .app-menu::-webkit-scrollbar,html .med-nav::-webkit-scrollbar,html .atc-nav::-webkit-scrollbar{display:none}
      html body.has-app-nav .app-menu-link,html .med-nav-link,html .atc-nav-link{position:relative;flex:0 0 auto!important;width:100%!important;min-height:73px!important;padding:9px 5px!important;gap:6px!important;border-radius:14px!important;color:#e1eeeb!important;transform:none!important}
      html body.has-app-nav .app-menu-link::before,html .med-nav-link::before,html .atc-nav-link::before{display:none!important}
      html body.has-app-nav .app-menu-link:hover,html body.has-app-nav .app-menu-link.active,html .med-nav-link:hover,html .med-nav-link.active,html .atc-nav-link:hover,html .atc-nav-link.active{background:rgba(255,255,255,.14)!important;color:#fff!important;transform:none!important}
      html body.has-app-nav .app-menu-link.active,html .med-nav-link.active,html .atc-nav-link.active{box-shadow:inset 0 0 0 1px rgba(255,255,255,.045)!important}
      html body.has-app-nav .app-menu-icon,html .med-nav-icon,html .atc-nav-icon{width:34px!important;height:34px!important}
      html body.has-app-nav .app-menu-icon svg,html .med-nav-icon svg,html .atc-nav-icon svg{width:27px!important;height:27px!important}
      html body.has-app-nav .app-menu-title,html .med-nav-title,html .atc-nav-title{font-size:.69rem!important;font-weight:790!important;line-height:1.12!important;text-align:center!important}
      html body.has-app-nav .auth-logout,html .med-nav .auth-logout,html .atc-nav .auth-logout{margin-top:auto!important}
      html body.has-app-nav .theme-control,html .med-theme,html .atc-theme{margin-top:0!important}
      html .med-main,html .atc-main{min-width:0!important;overflow-x:hidden!important}
      html .med-main{width:min(1420px,calc(100% - 36px))!important}
      .medindex-nav-count{position:absolute;top:7px;right:8px;min-width:20px;height:20px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:#c77d1f;color:#fff;font:850 .61rem/1 var(--mi-mono,var(--mono,monospace))}
      @media(max-width:780px){
        :root{--mi-nav-width:0px!important}
        html body.has-app-nav{padding-left:0!important;padding-bottom:calc(70px + env(safe-area-inset-bottom))!important}
        html .med-shell{padding-left:0!important;padding-bottom:calc(70px + env(safe-area-inset-bottom))!important}
        html .atc-shell{display:block!important;padding-bottom:calc(70px + env(safe-area-inset-bottom))!important}
        html body.has-app-nav .app-menu,html .med-nav,html .atc-nav{position:fixed!important;inset:auto 0 0 0!important;width:100%!important;height:calc(70px + env(safe-area-inset-bottom))!important;padding:6px 7px calc(6px + env(safe-area-inset-bottom))!important;display:flex!important;flex-direction:row!important;justify-content:flex-start!important;gap:4px!important;overflow-x:auto!important;overflow-y:hidden!important;border:0!important;border-top:3px solid #c77d1f!important}
        html body.has-app-nav .app-menu-link,html .med-nav-link,html .atc-nav-link{flex:0 0 68px!important;width:68px!important;min-width:68px!important;min-height:55px!important;padding:5px 3px!important;border-radius:11px!important}
        html body.has-app-nav .app-menu-icon,html .med-nav-icon,html .atc-nav-icon{width:27px!important;height:27px!important}
        html body.has-app-nav .app-menu-icon svg,html .med-nav-icon svg,html .atc-nav-icon svg{width:22px!important;height:22px!important}
        html body.has-app-nav .app-menu-title,html .med-nav-title,html .atc-nav-title{font-size:.59rem!important}
        html body.has-app-nav .auth-logout,html .med-nav .auth-logout,html .atc-nav .auth-logout{margin-top:0!important}
        html body.has-app-nav .theme-control,html .med-theme,html .atc-theme{display:none!important}
        .medindex-nav-count{top:2px;right:5px}
      }
    `;
    document.head.appendChild(style);
  }

  function favoriteCount() {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(saved) ? saved.length : 0;
    } catch { return 0; }
  }

  function makeStaticLink(nav, id, title, href) {
    const prefix = nav.classList.contains('atc-nav') ? 'atc' : 'med';
    const link = document.createElement('a');
    link.className = `${prefix}-nav-link medindex-common-nav`;
    link.href = href;
    link.dataset.medindexNav = id;
    link.innerHTML = `<span class="${prefix}-nav-icon">${ICONS[id]}</span><span class="${prefix}-nav-title">${title}</span>`;
    if (id === 'favorites') {
      const count = document.createElement('span');
      count.className = 'medindex-nav-count';
      count.textContent = String(favoriteCount());
      link.appendChild(count);
    }
    return link;
  }

  function normalizeNavigation() {
    const appMenu = document.getElementById('appMenu');
    if (appMenu) {
      const protocol = appMenu.querySelector('[data-nav="protocols"]');
      if (protocol) {
        const label = protocol.querySelector('.app-menu-title');
        if (label) label.textContent = 'Recetat';
        if (protocol.tagName === 'A') protocol.href = 'recetat.html';
      }
      return;
    }

    const nav = document.querySelector('.med-nav,.atc-nav');
    if (!nav) return;
    const prefix = nav.classList.contains('atc-nav') ? 'atc' : 'med';
    const before = nav.querySelector('.auth-logout') || nav.querySelector(`.${prefix}-theme`) || null;
    if (!nav.querySelector('[data-medindex-nav="favorites"]')) nav.insertBefore(makeStaticLink(nav, 'favorites', 'Favoritet', '/index.html#favoritet'), before);
    if (!nav.querySelector('[data-medindex-nav="search"]')) nav.insertBefore(makeStaticLink(nav, 'search', 'Kërko', '/index.html#kerko'), before);
    const prescription = [...nav.querySelectorAll('a')].find(link => /recetat|#recetat/i.test(`${link.getAttribute('href') || ''} ${link.textContent || ''}`));
    if (prescription) {
      prescription.href = '/recetat.html';
      const title = prescription.querySelector(`.${prefix}-nav-title`);
      if (title) title.textContent = 'Recetat';
    }
  }

  function activateHashTarget() {
    const hash = location.hash.toLocaleLowerCase('sq');
    const target = hash === '#favoritet' ? 'favorites' : hash === '#kerko' ? 'search' : '';
    if (!target || !/\/(?:index\.html)?$/.test(location.pathname)) return;
    let attempts = 0;
    const activate = () => {
      const button = document.querySelector(`#appMenu [data-nav="${target}"]`);
      if (button) {
        button.click();
        history.replaceState(null, '', location.pathname + location.search);
      } else if (attempts++ < 80) setTimeout(activate, 50);
    };
    activate();
  }

  function init() {
    installStyles();
    normalizeNavigation();
    activateHashTarget();
    window.addEventListener('storage', event => {
      if (event.key !== FAVORITES_KEY) return;
      document.querySelectorAll('.medindex-nav-count').forEach(node => { node.textContent = String(favoriteCount()); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
