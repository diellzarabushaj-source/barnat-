(() => {
  'use strict';

  /* Favoritet kishin gjithçka përveç mënyrës për t'i shtuar.
   *
   * Matja e tregoi qartë: te 1440px dhe te 390px, numri i kontrolleve të
   * favoritit brenda rreshtave ishte zero. Ekzistonte çelësi i ruajtjes,
   * lexuesi që e njeh një rresht si favorit, filtri te `#favoritet`, numëruesi
   * në anështyllë, klienti që sinkronizon dhe endpoint-i që shkruan në Neon —
   * por asnjë yll për ta shtypur. Prandaj lista mbetej gjithmonë bosh.
   *
   * Ky shtresë e mbyll atë hendek dhe asgjë më. Nuk prek sinkronizimin:
   * `user-library-client.js` e vëzhgon `localStorage` çdo 1.2s dhe niset vetë,
   * prandaj mjafton të shkruhet çelësi. `syncNow()` thirret vetëm që ruajtja të
   * mos varet nga rastësia e vëzhgimit kur mjekja mbyll faqen menjëherë.
   *
   * Formati i çelësit është ai që rreshtat tashmë e mbajnë te `data-drug-key`
   * (`PDID|Emri tregtar|Fortësia`) — i njëjti që `registryRowFavoriteCandidates`
   * e pranon. Pa këtë përputhje ylli do të ndizej po rreshti nuk do të njihej.
   */

  const VERSION = 'registry-favorites-control-v1';
  const KEY = 'regjistriBarnave_favoritet_v1';
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z"/></svg>';

  const root = document.documentElement;
  if (root.dataset.registryFavoritesControl === VERSION) return;

  function read() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []);
    } catch {
      return new Set();
    }
  }

  function write(set) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...set]));
    } catch {
      /* Kuota e mbushur ose ruajtja e bllokuar: gjendja në ekran mbetet e
         sinkronizuar me atë që lexohet, prandaj nuk shtirem se u ruajt. */
      return false;
    }
    return true;
  }

  function drugKeyOf(row) {
    const checkbox = row.querySelector('.drug-select[data-drug-key]');
    const key = String(checkbox?.dataset.drugKey || '').trim();
    return key || '';
  }

  function nameOf(row) {
    const cell = row.querySelector('[data-registry-column-key="trade-name"]');
    return String(cell?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'barin';
  }

  function syncCount(set) {
    /* Butoni i anështyllës e mban atributin `data-nav="favorites"` — jo
       `data-medical-nav`, siç e supozova fillimisht; matja e DOM-it e tregoi.
       Numëruesi mund të mos ekzistojë ende kur ngarkohet faqja, prandaj
       krijohet nëse mungon, që numri të mos mbetet i ngrirë te zero. */
    document.querySelectorAll('[data-nav="favorites"], [data-medical-nav="favorites"], [data-medindex-nav="favorites"]')
      .forEach(item => {
        let node = item.querySelector('.nav-mini-count, .mi-menu-badge');
        if (!node) {
          node = document.createElement('span');
          node.className = 'nav-mini-count mi-menu-badge';
          item.appendChild(node);
        }
        node.textContent = String(set.size);
      });
  }

  function paint(button, active, name) {
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? `Hiqe ${name} nga favoritet` : `Shto ${name} te favoritet`);
    button.title = active ? 'Hiqe nga favoritet' : 'Shto te favoritet';
    button.classList.toggle('is-favorite', active);
  }

  function toggle(button, key, name) {
    const set = read();
    const active = set.has(key);
    if (active) set.delete(key); else set.add(key);
    if (!write(set)) return;
    paint(button, !active, name);
    syncCount(set);
    /* Rreshtat e tjerë të të njëjtit bar, nëse tabela i ka të dyfishuar. */
    document.querySelectorAll(`.registry-favorite-toggle[data-favorite-key="${CSS.escape(key)}"]`)
      .forEach(other => { if (other !== button) paint(other, !active, other.dataset.favoriteName || name); });
    try { window.MedIndexUserLibrary?.syncNow?.(); } catch { /* sinkronizimi periodik e merr prapë */ }
  }

  function decorate(row) {
    if (row.querySelector('.registry-favorite-toggle')) return;
    const host = row.querySelector('[data-registry-column-key="trade-name"]');
    if (!host) return;
    const key = drugKeyOf(row);
    if (!key) return;

    const name = nameOf(row);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'registry-favorite-toggle';
    button.dataset.favoriteKey = key;
    button.dataset.favoriteName = name;
    button.innerHTML = STAR;
    paint(button, read().has(key), name);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggle(button, key, name);
    });
    host.appendChild(button);
  }

  function scan() {
    const body = document.getElementById('tbody');
    if (!body) return;
    body.querySelectorAll(':scope > tr').forEach(decorate);
    syncCount(read());
  }

  function refreshAll() {
    const set = read();
    document.querySelectorAll('.registry-favorite-toggle').forEach(button => {
      paint(button, set.has(button.dataset.favoriteKey || ''), button.dataset.favoriteName || 'barin');
    });
    syncCount(set);
  }

  let frame = 0;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; scan(); });
  }

  function start() {
    /* Vëzhgohet `#registryContent`, jo `#tbody`. Matja e tregoi pse: skripti
       nisej, rreshtat ekzistonin, po asnjë yll nuk shtohej. Runtime-i i
       regjistrit e zëvendëson vetë elementin `#tbody`, prandaj një vëzhgues i
       lidhur te ai në DOMContentLoaded mbetet mbi një nyje të shkëputur dhe nuk
       ndizet kurrë. Kontejneri rreth tij nuk ndryshon. */
    const host = document.getElementById('registryContent');
    if (!host) { setTimeout(start, 400); return; }
    scan();
    new MutationObserver(schedule).observe(host, { childList:true, subtree:true });
    /* Kur favoritet ndryshojnë në një skedë tjetër ose i sjell sinkronizimi. */
    window.addEventListener('storage', event => { if (event.key === KEY) refreshAll(); });
    window.addEventListener('medindex:library-synced', refreshAll);
    root.dataset.registryFavoritesControl = VERSION;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
