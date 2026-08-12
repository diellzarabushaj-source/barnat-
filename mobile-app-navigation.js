(() => {
  'use strict';

  const VERSION = 'mobile-app-navigation-v1';
  const BREAKPOINT = '(max-width: 1023px)';
  if (!window.matchMedia?.(BREAKPOINT).matches) return;

  const html = document.documentElement;

  function ensureStyles() {
    if (document.getElementById('miMobileAppNavigationStyles')) return;
    const style = document.createElement('style');
    style.id = 'miMobileAppNavigationStyles';
    style.textContent = `
      @media(max-width:1023px){
        :root{--mi-mobile-app-nav-height:calc(64px + env(safe-area-inset-bottom,0px))}
        html.medindex-tailadmin body{padding-bottom:var(--mi-mobile-app-nav-height)!important}
        html.medindex-tailadmin .mi-main{scroll-padding-bottom:calc(var(--mi-mobile-app-nav-height) + 20px)!important}
        html.medindex-tailadmin .mi-content-container{padding-bottom:calc(var(--mi-mobile-app-nav-height) + 28px)!important}
        .mi-mobile-app-nav{
          position:fixed;z-index:2050;left:0;right:0;bottom:0;
          display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:start;
          min-height:var(--mi-mobile-app-nav-height);padding:6px max(6px,env(safe-area-inset-right)) env(safe-area-inset-bottom,0px) max(6px,env(safe-area-inset-left));
          border-top:1px solid rgba(15,23,42,.10);background:rgba(255,255,255,.96);
          box-shadow:0 -10px 30px rgba(15,23,42,.08);backdrop-filter:blur(18px) saturate(1.08);-webkit-backdrop-filter:blur(18px) saturate(1.08)
        }
        .mi-mobile-app-nav-item{
          appearance:none;border:0;background:transparent;color:#667085;text-decoration:none;
          min-width:0;min-height:52px;padding:5px 2px 4px;border-radius:12px;
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
          font:600 10px/1.15 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;
          -webkit-tap-highlight-color:transparent;touch-action:manipulation
        }
        .mi-mobile-app-nav-item:active{background:#f2f4f7}
        .mi-mobile-app-nav-item:focus-visible{outline:3px solid rgba(29,78,216,.25);outline-offset:1px}
        .mi-mobile-app-nav-item.is-active,.mi-mobile-app-nav-item[aria-current="page"]{color:#0f766e;background:#f0fdfa}
        .mi-mobile-app-nav-icon{display:grid;place-items:center;width:26px;height:26px}
        .mi-mobile-app-nav-icon svg{width:23px;height:23px}
        body.mi-sidebar-open .mi-mobile-app-nav,body.mi-mobile-search-open .mi-mobile-app-nav{visibility:hidden;pointer-events:none}
      }
      @media(min-width:1024px){.mi-mobile-app-nav{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  const normalizePath = value => {
    const path = String(value || '/').split('?')[0].split('#')[0].replace(/\/{2,}/g, '/');
    return path === '/' ? '/index.html' : path.replace(/\/$/, '') || '/index.html';
  };
  const current = normalizePath(location.pathname);
  const isRegistry = current === '/index.html';
  const isCategories = current === '/klasifikimi.html';
  const isRecipes = current === '/recetat.html';

  function icon(name) {
    const paths = {
      home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',
      search:'<circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.5 4.5"/>',
      categories:'<rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/>',
      rx:'<path d="M5 4h8a4 4 0 0 1 0 8H5z"/><path d="m12 12 7 8M12 12l7-8"/>',
      more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.more}</svg>`;
  }

  function navItem({ href, label, iconName, active, action }) {
    const tag = href ? 'a' : 'button';
    const hrefAttr = href ? ` href="${href}"` : '';
    const actionAttr = action ? ` data-mobile-app-action="${action}"` : '';
    const currentAttr = active ? ' aria-current="page"' : '';
    const typeAttr = href ? '' : ' type="button"';
    return `<${tag}${typeAttr}${hrefAttr}${actionAttr}${currentAttr} class="mi-mobile-app-nav-item${active ? ' is-active' : ''}"><span class="mi-mobile-app-nav-icon">${icon(iconName)}</span><span>${label}</span></${tag}>`;
  }

  function ensureNavigation() {
    if (document.querySelector('[data-mobile-app-navigation]') || !document.body) return;
    ensureStyles();
    const nav = document.createElement('nav');
    nav.className = 'mi-mobile-app-nav';
    nav.dataset.mobileAppNavigation = VERSION;
    nav.setAttribute('aria-label', 'Navigimi kryesor');
    nav.innerHTML = [
      navItem({ href:'/index.html', label:'Kryefaqja', iconName:'home', active:isRegistry }),
      navItem({ label:'Kërko', iconName:'search', action:'search' }),
      navItem({ href:'/klasifikimi.html', label:'Kategoritë', iconName:'categories', active:isCategories }),
      navItem({ href:'/recetat.html', label:'Recetat', iconName:'rx', active:isRecipes }),
      navItem({ label:'Më shumë', iconName:'more', action:'more' }),
    ].join('');
    document.body.appendChild(nav);
    html.dataset.mobileAppNavigation = VERSION;

    nav.querySelector('[data-mobile-app-action="search"]')?.addEventListener('click', () => {
      const globalTrigger = document.querySelector('[data-mi-mobile-search]');
      if (globalTrigger) return globalTrigger.click();
      const input = ['#search','#atcSearch','#icdSearch','#labSearch','#dosageSearch','#protocolSearch','#rxDrugSearch']
        .map(selector => document.querySelector(selector)).find(Boolean);
      if (!input) return;
      input.scrollIntoView({ block:'center', behavior:'smooth' });
      requestAnimationFrame(() => input.focus({ preventScroll:true }));
    });

    nav.querySelector('[data-mobile-app-action="more"]')?.addEventListener('click', () => {
      const sidebarToggle = document.querySelector('[data-mi-sidebar-toggle], .mi-sidebar-toggle');
      if (sidebarToggle) return sidebarToggle.click();
      document.body.classList.toggle('mi-sidebar-open');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureNavigation, { once:true });
  else ensureNavigation();
})();
