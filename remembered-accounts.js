(() => {
  'use strict';
  const KEY = 'drx_remembered_accounts_v1';
  const mounted = new Map();
  function clean(value) {
    const email = String(value?.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return { email, name:String(value.name || email).trim().slice(0, 120), method:['google','email','fallback'].includes(value.method) ? value.method : '' };
  }
  function list() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(data) ? data.slice(0, 5).map(clean).filter(Boolean) : [];
    } catch { return []; }
  }
  function save(accounts) {
    try { localStorage.setItem(KEY, JSON.stringify(accounts)); } catch {}
    for (const [section, render] of mounted) {
      if (!section.isConnected) mounted.delete(section);
      else if (!list().length) { section.remove(); mounted.delete(section); }
      else render();
    }
  }
  function remember(payload) {
    // These are display hints only. They never prove authentication or contain
    // passwords, session tokens, photos, roles or private clinical data.
    if (payload?.authenticated !== true || Number(payload.sessionVersion) !== 3
      || !(payload.supabaseAuthenticated || payload.rollbackSession)) return;
    const account = clean({ ...payload.user, method:payload.signInMethod });
    if (account) {
      account.method = account.method || list().find(item => item.email === account.email)?.method || 'email';
      save([account, ...list().filter(item => item.email !== account.email)].slice(0, 5));
    }
  }
  function mount(host, choose) {
    if (!host || !list().length) return null;
    const section = document.createElement('section');
    section.className = 'drx-accounts';
    section.setAttribute('aria-label', 'Llogaritë e ruajtura në këtë shfletues');
    function render() {
      section.replaceChildren();
      const title = document.createElement('h3');
      title.textContent = 'Mirë se u ktheve';
      const note = document.createElement('p');
      note.className = 'drx-accounts__note';
      note.textContent = 'Zgjidh llogarinë tënde. Kur hyrja ka skaduar, kërkohet verifikim përsëri.';
      section.append(title, note);
      for (const account of list()) {
        const row = document.createElement('div'); row.className = 'drx-accounts__row';
        const link = document.createElement('a'); link.className = 'drx-accounts__choose';
        const query = new URLSearchParams(location.search); query.set('email', account.email); query.set('reauth', '1');
        link.href = '/login.html?' + query.toString();
        const avatar = document.createElement('span'); avatar.className = 'drx-accounts__avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = account.name.split(/\s+/).slice(0, 2).map(word => word[0] || '').join('').toUpperCase();
        const copy = document.createElement('span'); copy.className = 'drx-accounts__copy';
        const name = document.createElement('strong'); name.textContent = 'Vazhdo si ' + account.name;
        const email = document.createElement('small'); email.textContent = account.email;
        copy.append(name, email); link.append(avatar, copy);
        link.addEventListener('click', event => {
          window.DRxSelectedAccount = account.email;
          if (choose) { event.preventDefault(); choose(account); }
        });
        const remove = document.createElement('button'); remove.type = 'button';
        remove.className = 'drx-accounts__remove'; remove.textContent = '×';
        remove.setAttribute('aria-label', 'Hiq ' + account.name + ' nga lista');
        remove.addEventListener('click', () => {
          save(list().filter(item => item.email !== account.email));

        });
        row.append(link, remove); section.append(row);
      }
      if (choose) {
        const other = document.createElement('button'); other.type = 'button';
        other.className = 'drx-accounts__other'; other.textContent = 'Përdor llogari tjetër';
        other.addEventListener('click', () => { section.hidden = true; choose(null); });
        section.append(other);
      }
    }
    render(); host.prepend(section); mounted.set(section, render); return section;
  }
  window.DRxRememberedAccounts = { list, remember, mount };
  const host = document.querySelector('[data-remembered-accounts]');
  if (host) mount(host);
})();
