(() => {
  'use strict';

  const ITEMS = [
    {
      id: 'classification',
      href: 'klasifikimi.html',
      title: 'Klasifikimi',
      icon: '<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><rect x="36" y="36" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/><rect x="144" y="36" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/><rect x="36" y="144" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/><rect x="144" y="144" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/></svg>'
    },
    {
      id: 'icd',
      href: 'icd.html',
      title: 'ICD',
      icon: '<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="M48 32h112l48 48v144H48V32Z" stroke="currentColor" stroke-width="16"/><path d="M160 32v48h48M80 120h96M80 160h96M80 200h64" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg>'
    },
    {
      id: 'labs',
      href: 'analizat.html',
      title: 'Analizat',
      icon: '<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="M96 24h64M112 24v64l-56 96a32 32 0 0 0 28 48h88a32 32 0 0 0 28-48l-56-96V24" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M78 176h100" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg>'
    }
  ];

  function installStyles() {
    if (document.getElementById('mainNavigationExtensionStyles')) return;
    const style = document.createElement('style');
    style.id = 'mainNavigationExtensionStyles';
    style.textContent = `
      .app-menu{overflow-y:auto;scrollbar-width:none}.app-menu::-webkit-scrollbar{display:none}.app-menu-link[href]{text-decoration:none}
      @media(max-width:720px){.app-menu{justify-content:flex-start;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity}.app-menu-link{flex:0 0 62px;min-width:62px;scroll-snap-align:start}.theme-control{display:none}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    installStyles();
    const menu = document.getElementById('appMenu');
    if (!menu) return false;
    if (menu.dataset.medicalSectionsInstalled === '1') return true;

    const protocolButton = menu.querySelector('[data-nav="protocols"]');
    ITEMS.forEach(item => {
      if (menu.querySelector(`[data-medical-nav="${item.id}"]`)) return;
      const link = document.createElement('a');
      link.className = 'app-menu-link';
      link.href = item.href;
      link.dataset.medicalNav = item.id;
      link.innerHTML = `<span class="app-menu-icon">${item.icon}</span><span class="app-menu-title">${item.title}</span>`;
      menu.insertBefore(link, protocolButton || menu.querySelector('.theme-control'));
    });
    menu.dataset.medicalSectionsInstalled = '1';
    return true;
  }

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();