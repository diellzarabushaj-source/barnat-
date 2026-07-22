(() => {
  const ICONS = {
    A: { id: '12034498', page: 'https://www.flaticon.com/free-icon/digestive-system_12034498', label: 'Sistemi tretës' },
    B: { id: '11241557', page: 'https://www.flaticon.com/free-icon/blood-cells_11241557', label: 'Qelizat e gjakut' },
    C: { id: '4473632', page: 'https://www.flaticon.com/free-icon/heart_4473632', label: 'Sistemi kardiovaskular' },
    D: { id: '2885184', page: 'https://www.flaticon.com/free-icon/dermatology_2885184', label: 'Dermatologjia' },
    G: { id: '6979695', page: 'https://www.flaticon.com/free-icon/reproductive-system_6979695', label: 'Sistemi riprodhues' },
    H: { id: '4939306', page: 'https://www.flaticon.com/free-icon/endocrine_4939306', label: 'Sistemi endokrin' },
    J: { id: '1186538', page: 'https://www.flaticon.com/free-icon/bacteria_1186538', label: 'Antiinfektivët' },
    L: { id: '4006165', page: 'https://www.flaticon.com/free-icon/oncology_4006165', label: 'Onkologjia' },
    M: { id: '4706841', page: 'https://www.flaticon.com/free-icon/bones_4706841', label: 'Sistemi muskuloskeletal' },
    N: { id: '2375490', page: 'https://www.flaticon.com/free-icon/nervous-system_2375490', label: 'Sistemi nervor' },
    P: { id: '1432427', page: 'https://www.flaticon.com/free-icon/parasite_1432427', label: 'Antiparazitarët' },
    R: { id: '9286183', page: 'https://www.flaticon.com/free-icon/respiratory_9286183', label: 'Sistemi respirator' },
    S: { id: '10655628', page: 'https://www.flaticon.com/free-icon/sensory_10655628', label: 'Organet shqisore' },
    V: { id: '1721229', page: 'https://www.flaticon.com/free-icon/antidote_1721229', label: 'Produkte të tjera dhe antidote' }
  };

  let scheduled = false;

  function cdnUrl(id) {
    const folder = String(id).slice(0, -3);
    return `https://cdn-icons-png.flaticon.com/512/${folder}/${id}.png`;
  }

  function addStyles() {
    if (document.getElementById('atcFlaticonStyles')) return;
    const style = document.createElement('style');
    style.id = 'atcFlaticonStyles';
    style.textContent = `
      .atc-card { isolation:isolate; }
      .atc-card h3 { padding-right:76px; min-height:48px; }
      .atc-card::before { right:78px !important; top:19px !important; z-index:3; }
      .atc-flaticon-icon {
        position:absolute;
        top:14px;
        right:14px;
        width:60px;
        height:60px;
        display:grid;
        place-items:center;
        overflow:hidden;
        border:1px solid rgba(21,94,99,.14);
        border-radius:16px;
        background:linear-gradient(145deg,#ffffff,#f4f8f6);
        box-shadow:0 8px 20px rgba(13,61,64,.09);
        pointer-events:none;
        z-index:2;
      }
      .atc-flaticon-icon img {
        position:absolute;
        inset:6px;
        width:calc(100% - 12px);
        height:calc(100% - 12px);
        object-fit:contain;
        display:block;
      }
      .atc-flaticon-fallback {
        font:800 1.15rem var(--mono);
        color:var(--teal);
        opacity:.55;
      }
      .atc-icon-credit {
        margin-top:12px;
        text-align:right;
        color:var(--muted);
        font-size:.68rem;
        line-height:1.4;
      }
      .atc-icon-credit a { color:var(--teal); font-weight:700; }
      html[data-theme="dark"] .atc-flaticon-icon {
        background:linear-gradient(145deg,#1c2c2f,#122023);
        border-color:#385053;
        box-shadow:0 8px 22px rgba(0,0,0,.28);
      }
      html[data-theme="dark"] .atc-icon-credit a { color:#78c6c9; }
      @media(max-width:650px) {
        .atc-flaticon-icon { width:54px; height:54px; top:13px; right:13px; }
        .atc-card h3 { padding-right:66px; }
        .atc-card::before { right:70px !important; top:17px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function decorateCard(card) {
    if (card.querySelector('.atc-flaticon-icon')) return;
    const group = String(card.dataset.code || '').charAt(0).toUpperCase();
    const icon = ICONS[group];
    if (!icon) return;

    const holder = document.createElement('span');
    holder.className = 'atc-flaticon-icon';
    holder.title = icon.label;
    holder.setAttribute('aria-hidden', 'true');

    const fallback = document.createElement('span');
    fallback.className = 'atc-flaticon-fallback';
    fallback.textContent = group;

    const image = document.createElement('img');
    image.src = cdnUrl(icon.id);
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true });

    holder.append(fallback, image);
    card.appendChild(holder);
  }

  function addCredit() {
    if (document.querySelector('.atc-icon-credit')) return;
    const source = document.getElementById('sourceNote');
    if (!source) return;
    const credit = document.createElement('div');
    credit.className = 'atc-icon-credit';
    credit.innerHTML = 'Ikonat mjekësore nga <a href="https://www.flaticon.com/search?word=medical&shape=lineal-color" target="_blank" rel="noopener noreferrer">Flaticon</a> · autorë të ndryshëm.';
    source.after(credit);
  }

  function decorate() {
    scheduled = false;
    addStyles();
    document.querySelectorAll('.atc-card').forEach(decorateCard);
    addCredit();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate, { once: true });
  else decorate();
})();
