(() => {
  'use strict';

  const ITEMS = [
    {
      id:'classification', href:'klasifikimi.html', title:'Klasifikimi',
      icon:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><rect x="36" y="36" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/><rect x="144" y="36" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/><rect x="36" y="144" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/><rect x="144" y="144" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/></svg>'
    },
    {
      id:'icd', href:'icd.html', title:'ICD',
      icon:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="M48 32h112l48 48v144H48V32Z" stroke="currentColor" stroke-width="16"/><path d="M160 32v48h48M80 120h96M80 160h96M80 200h64" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg>'
    },
    {
      id:'labs', href:'analizat.html', title:'Analizat',
      icon:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="M96 24h64M112 24v64l-56 96a32 32 0 0 0 28 48h88a32 32 0 0 0 28-48l-56-96V24" stroke="currentColor" stroke-width="16"/><path d="M78 176h100" stroke="currentColor" stroke-width="16"/></svg>'
    },
    {
      id:'dosage', href:'dozologjia.html', title:'Dozologjia',
      icon:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="M64 52h128v152H64zM96 84h64M96 124h64M96 164h36" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg>'
    },
    {
      id:'clinical-protocols', href:'protokollet.html', title:'Protokollet',
      icon:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="M56 36h144v184H56zM88 80h80M88 120h80M88 160h56" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg>'
    }
  ];

  function installStyles() {
    if (document.getElementById('mainNavigationExtensionStyles')) return;
    const style = document.createElement('style');
    style.id = 'mainNavigationExtensionStyles';
    style.textContent = '.app-menu{overflow-y:auto;scrollbar-width:none}.app-menu::-webkit-scrollbar{display:none}.app-menu-link[href]{text-decoration:none}@media(max-width:780px){.app-menu{justify-content:flex-start;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity}.app-menu-link{scroll-snap-align:center}.theme-control{display:none}}';
    document.head.appendChild(style);
  }

  function openPrescriptionDashboard(event) {
    event?.preventDefault();
    const button = document.getElementById('protocolsBtn');
    if (button) button.click();
    else window.location.href = '/recetat.html';
  }

  function prescriptionLink(menu) {
    const existing = menu.querySelector('[data-nav="protocols"],[data-medical-nav="protocols"],[data-medical-nav="prescriptions"]');
    if (!existing) return null;

    let link = existing;
    if (!existing.matches('a')) {
      link = document.createElement('a');
      link.className = existing.className || 'app-menu-link';
      link.innerHTML = existing.innerHTML;
      existing.replaceWith(link);
    }

    link.href = '/recetat.html';
    delete link.dataset.nav;
    link.dataset.medicalNav = 'prescriptions';
    link.setAttribute('aria-label', 'Recetat');
    const title = link.querySelector('.app-menu-title');
    if (title) title.textContent = 'Recetat';
    if (link.dataset.prescriptionBridge !== '1') {
      link.dataset.prescriptionBridge = '1';
      link.addEventListener('click', openPrescriptionDashboard);
    }
    return link;
  }

  function install() {
    installStyles();
    const menu = document.getElementById('appMenu');
    if (!menu) return false;
    if (menu.dataset.medicalSectionsInstalled === '1') return true;

    const protocol = prescriptionLink(menu);
    ITEMS.forEach(item => {
      const existing = menu.querySelector(`[data-nav="${item.id}"], [data-medical-nav="${item.id}"]`);
      if (existing) {
        existing.dataset.medicalNav = item.id;
        return;
      }
      const link = document.createElement('a');
      link.className = 'app-menu-link';
      link.href = item.href;
      link.dataset.medicalNav = item.id;
      link.setAttribute('aria-label', item.title);
      link.innerHTML = `<span class="app-menu-icon">${item.icon}</span><span class="app-menu-title">${item.title}</span>`;
      menu.insertBefore(link, protocol || menu.querySelector('.theme-control'));
    });
    menu.dataset.medicalSectionsInstalled = '1';
    return true;
  }

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
  }
})();
