(() => {
  const KEY = 'regjistriBarnave_protokollet_v1';
  let editing = false;
  let current = '';
  let queued = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const all = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const get = id => all().find(item => String(item.id) === String(id));

  function patientSummary(protocol) {
    const parts = [];
    if (protocol.patientType === 'pediatric') parts.push('Pediatrik');
    else if (protocol.patientType === 'manual') parts.push('Manual');
    else parts.push('I rritur');
    if (protocol.ageValue) parts.push(`${protocol.ageValue} ${protocol.ageUnit === 'months' ? 'muaj' : 'vjeç'}`);
    if (protocol.weightKg) parts.push(`${protocol.weightKg} kg`);
    return parts.join(' · ');
  }

  function signatura(item) {
    const regimen = [item.dose, item.route, item.frequency, item.duration].filter(Boolean).join(' · ');
    return regimen || item.instructions || 'Signatura nuk është plotësuar.';
  }

  function itemMarkup(item, index) {
    const rxName = [item.prefix, item.tradeName || item.substance || 'Bar pa emër', item.strength].filter(Boolean).join(' ');
    const details = [item.substance, item.form, item.atc ? `ATC ${item.atc}` : ''].filter(Boolean).join(' · ');
    const trace = [item.regimenId ? `Skema ${item.regimenId}` : '', item.dosageStatus].filter(Boolean).join(' · ');
    return `<section class="mi-rx-item">
      <div class="mi-rx-no">${index + 1}</div>
      <div>
        <em>Rp.</em>
        <h3>${esc(rxName)}</h3>
        ${details ? `<p>${esc(details)}</p>` : ''}
        ${item.quantity ? `<div class="mi-dispense"><b>Dispenso</b><span>${esc(item.quantity)}</span></div>` : ''}
        <div class="mi-sign"><b>Signatura</b><span>${esc(signatura(item))}</span>${item.instructions && signatura(item) !== item.instructions ? `<small>${esc(item.instructions)}</small>` : ''}</div>
        ${item.doseCalculation ? `<div class="mi-calc"><b>Llogaritja</b>${esc(item.doseCalculation)}</div>` : ''}
        ${trace ? `<div class="mi-trace">${esc(trace)}${item.dosageSource ? ` · <a href="${esc(item.dosageSource)}" target="_blank" rel="noopener noreferrer">burimi</a>` : ''}</div>` : ''}
      </div>
    </section>`;
  }

  function markup(protocol) {
    const patient = patientSummary(protocol);
    return `<article class="mi-rx">
      <header><div><b>MedIndex</b><small>Regjistri i Barnave dhe Diagnozave ICD</small></div><strong>Dr. Diellza Rabushaj</strong></header>
      <section class="mi-rx-title"><div><small>RECETË / PROTOKOLL PERSONAL</small><h2>${esc(protocol.name || 'Recetë pa emër')}</h2></div><time>${new Date(protocol.updatedAt || Date.now()).toLocaleDateString('sq-AL')}</time></section>
      <div class="mi-rx-meta">
        <span><i>Indikacioni</i>${esc(protocol.indication || 'Nuk është shënuar')}</span>
        <span><i>Grupi / kushtet</i>${esc(protocol.population || 'Nuk është shënuar')}</span>
        <span><i>Pacienti</i>${esc(patient)}</span>
        <span><i>Versioni</i>${esc(protocol.version || 'Pa version')}</span>
      </div>
      ${(protocol.items || []).map(itemMarkup).join('') || '<p class="mi-empty">Nuk ka barna të ruajtura.</p>'}
      ${protocol.notes ? `<div class="mi-notes"><b>Vërejtje / monitorim</b><p>${esc(protocol.notes)}</p></div>` : ''}
      <footer>Auto-fill është pikënisje e editueshme · Verifikohet klinikisht para përdorimit individual.</footer>
    </article>`;
  }

  function toast(message) {
    if (window.showProtocolToast) return window.showProtocolToast(message);
    const node = document.getElementById('protocolToast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 2200);
  }

  function copyText(protocol) {
    if (window.protocolToText) return window.protocolToText(protocol);
    return (protocol.items || []).map((item, index) => `${index + 1}. Rp. ${[item.prefix, item.tradeName || item.substance, item.strength].filter(Boolean).join(' ')}\nSignatura: ${signatura(item)}`).join('\n\n');
  }

  function ensure() {
    if (document.getElementById('miOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'miOverlay';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="mi-dialog"><div class="mi-top"><b>Pamja e recetës</b><button data-a="close" aria-label="Mbyll">×</button></div><div id="miBody"></div><div class="mi-actions"><button class="primary" data-a="edit">Edito recetën</button><button data-a="copy">Kopjo</button><button data-a="print">Printo</button><button data-a="close">Kthehu</button></div></div>';
    overlay.addEventListener('click', async event => {
      const button = event.target.closest('[data-a]');
      const action = button?.dataset.a;
      if (event.target === overlay || action === 'close') close();
      if (action === 'edit') edit();
      if (action === 'copy') {
        const protocol = get(current);
        if (!protocol) return;
        try { await navigator.clipboard.writeText(copyText(protocol)); } catch {}
        toast('Receta u kopjua.');
      }
      if (action === 'print') {
        const protocol = get(current);
        const windowRef = window.open('', '_blank');
        if (!protocol || !windowRef) return;
        windowRef.document.write(`<meta charset="utf-8"><title>${esc(protocol.name)}</title><style>${PRINT}</style>${markup(protocol)}<script>onload=()=>print()<\/script>`);
        windowRef.document.close();
      }
    });
    document.body.append(overlay);
  }

  function open(id) {
    const protocol = get(id);
    if (!protocol) return;
    ensure();
    current = String(id);
    document.getElementById('miBody').innerHTML = markup(protocol);
    const overlay = document.getElementById('miOverlay');
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('open'));
  }

  function close() {
    const overlay = document.getElementById('miOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    setTimeout(() => { overlay.hidden = true; }, 160);
  }

  function edit() {
    const button = [...document.querySelectorAll('[data-load-protocol]')].find(node => String(node.dataset.loadProtocol) === current);
    if (!button) return;
    close();
    editing = true;
    button.click();
    editing = false;
  }

  const PRINT = '*{box-sizing:border-box}body{font-family:Arial;padding:24px;color:#17252a}.mi-rx{max-width:760px;margin:auto;padding:25px;border:1px solid #bbb}.mi-rx header,.mi-rx-title,.mi-rx-meta{display:flex;justify-content:space-between;gap:14px}.mi-rx header{border-bottom:3px solid #155e63;padding-bottom:12px}.mi-rx header b{display:block;font:700 24px Georgia}.mi-rx header small{display:block}.mi-rx-title{padding:20px 0}.mi-rx-title h2{margin:4px 0;font:700 22px Georgia}.mi-rx-meta{padding:10px;border:1px solid #ddd;flex-wrap:wrap}.mi-rx-meta span{flex:1;min-width:130px}.mi-rx-meta i{display:block;font-size:10px}.mi-rx-item{display:grid;grid-template-columns:30px 1fr;gap:12px;padding:18px 0;border-bottom:1px solid #ddd}.mi-rx-no{width:27px;height:27px;border-radius:50%;background:#155e63;color:#fff;display:grid;place-items:center}.mi-rx-item em{font:italic 24px Georgia}.mi-rx-item h3{margin:3px 0}.mi-sign,.mi-dispense{padding:10px;border-left:4px solid #c77d1f;background:#f5f7f6;margin-top:8px}.mi-sign b,.mi-dispense b{display:block;font-size:10px}.mi-sign small{display:block;margin-top:6px}.mi-calc,.mi-trace{margin-top:7px;font-size:10px}.mi-notes{margin-top:16px;padding:12px;border:1px solid #ddd}.mi-rx footer{margin-top:18px;font-size:10px;color:#666}';

  function style() {
    if (document.getElementById('miStyle')) return;
    const styleNode = document.createElement('style');
    styleNode.id = 'miStyle';
    styleNode.textContent = `body>header{background:linear-gradient(120deg,#0d3d40,#155e63);padding:24px 30px;box-shadow:0 8px 24px #0d3d4025}body>header h1{font-size:clamp(1.45rem,2.2vw,2rem)}.mi-brand{color:#fff}.mi-sep{color:var(--amber)}.mi-desc{font-size:.78em}.toolbar{gap:10px;padding:15px 30px;box-shadow:0 6px 18px #12222a10}.toolbar input,.toolbar select,.toolbar button{min-height:42px;border-radius:9px}thead th{height:47px;background:#17676c}tbody td{padding:10px 13px}.protocol-drawer{width:min(940px,97vw)}#miOverlay{position:fixed;inset:0;z-index:800;display:grid;place-items:center;padding:22px;background:#051214b5;backdrop-filter:blur(6px);opacity:0;transition:.16s}#miOverlay[hidden]{display:none}#miOverlay.open{opacity:1}.mi-dialog{width:min(880px,100%);max-height:94vh;display:flex;flex-direction:column;background:var(--paper);border-radius:18px;overflow:hidden;box-shadow:0 35px 100px #0007}.mi-top{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#0d3d40;color:#fff;border-bottom:4px solid var(--amber)}.mi-top button{width:36px;height:36px;background:transparent;color:#fff;border:1px solid #ffffff55;border-radius:8px}#miBody{overflow:auto;padding:24px}.mi-rx{max-width:780px;margin:auto;padding:27px;background:#fffdf9;color:#17252a;border:1px solid #cbd5d1;border-radius:14px;box-shadow:0 14px 40px #0d3d4018}.mi-rx header,.mi-rx-title,.mi-rx-meta{display:flex;justify-content:space-between;gap:16px}.mi-rx header{padding-bottom:13px;border-bottom:3px solid #155e63}.mi-rx header b{display:block;font:750 25px Georgia;color:#0d3d40}.mi-rx header small{display:block;font-size:11px;color:#667579}.mi-rx-title{padding:20px 0}.mi-rx-title small{font-size:10px;color:#8b642f}.mi-rx-title h2{margin:4px 0;font:700 22px Georgia}.mi-rx-meta{padding:11px;border:1px solid #d7dcd6;border-radius:8px;flex-wrap:wrap}.mi-rx-meta span{flex:1;min-width:145px;font-weight:700;font-size:13px}.mi-rx-meta i{display:block;font-style:normal;font-size:9px;text-transform:uppercase;color:#758184}.mi-rx-item{display:grid;grid-template-columns:32px 1fr;gap:12px;padding:18px 0;border-bottom:1px solid #d7dcd6}.mi-rx-no{width:28px;height:28px;border-radius:50%;background:#155e63;color:#fff;display:grid;place-items:center}.mi-rx-item em{font:italic 26px Georgia;color:#0d3d40}.mi-rx-item h3{margin:3px 0}.mi-rx-item>div>p{font-size:12px;color:#617075}.mi-sign,.mi-dispense{padding:11px 13px;border-left:4px solid var(--amber);background:#f4f7f5;margin-top:8px}.mi-sign b,.mi-dispense b{display:block;font-size:9px;text-transform:uppercase;color:#6c797c}.mi-sign span,.mi-dispense span{font-size:13px}.mi-sign small{display:block;margin-top:6px;color:#59696d;white-space:pre-line}.mi-calc{margin-top:8px;padding:8px 10px;border-radius:8px;background:#fff5e4;font-family:var(--mono);font-size:10px;color:#6d4817}.mi-calc b{display:block;margin-bottom:3px}.mi-trace{margin-top:7px;color:#718084;font-size:10px}.mi-trace a{color:#155e63;font-weight:800}.mi-notes{margin-top:16px;padding:13px;border:1px solid #d7dcd6}.mi-rx footer{margin-top:18px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#758184}.mi-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:13px 18px;background:#fff;border-top:1px solid var(--line)}.mi-actions button{padding:10px 14px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);font-weight:700}.mi-actions .primary{background:var(--teal);color:#fff;border-color:var(--teal)}html[data-theme=dark] .mi-dialog{background:#111b1e}html[data-theme=dark] .mi-rx{background:#172326;color:#edf3f1;border-color:#3b4d50}html[data-theme=dark] .mi-rx header b,html[data-theme=dark] .mi-rx-item em,html[data-theme=dark] .mi-rx-title h2{color:#f0f6f4}html[data-theme=dark] .mi-rx-meta,html[data-theme=dark] .mi-notes{border-color:#3b4d50}html[data-theme=dark] .mi-sign,html[data-theme=dark] .mi-dispense{background:#1d3033}html[data-theme=dark] .mi-calc{background:#302617;color:#e8c895}html[data-theme=dark] .mi-actions,html[data-theme=dark] .mi-actions button{background:#152124;color:#e8efed;border-color:#3a4c50}@media(max-width:700px){#miOverlay{padding:0}.mi-dialog{width:100%;height:100%;max-height:none;border-radius:0}#miBody{padding:12px}.mi-rx{padding:18px}.mi-rx header,.mi-rx-title,.mi-rx-meta{flex-direction:column}.mi-actions button{flex:1 1 130px}}`;
    document.head.append(styleNode);
  }

  function brand() {
    document.title = 'MedIndex | Regjistri i Barnave DHE DIAGNOZAVE ICD - Dr. Diellza Rabushaj';
    const heading = document.querySelector('body>header h1');
    if (heading && !heading.dataset.mi) {
      heading.dataset.mi = '1';
      heading.innerHTML = '<span class="mi-brand">MedIndex</span> <span class="mi-sep">|</span> <span class="mi-desc">Regjistri i Barnave dhe Diagnozave ICD</span>';
    }
    const sub = document.querySelector('body>header .sub');
    const subtitle = 'Dr. Diellza Rabushaj · Versioni 1.1 · Afati i vlefshmërisë: 01.05.2026 – 31.12.2026';
    if (sub && sub.textContent !== subtitle) sub.textContent = subtitle;
    const button = document.getElementById('protocolsBtn');
    if (button && !button.dataset.mi) {
      const count = button.querySelector('.mini-count');
      button.dataset.mi = '1';
      button.textContent = 'Recetat e mia ';
      if (count) button.append(count);
    }
    const drawerTitle = document.getElementById('protocolDrawerTitle');
    if (drawerTitle && drawerTitle.textContent !== 'Recetat dhe protokollet e mia') drawerTitle.textContent = 'Recetat dhe protokollet e mia';
    const nav = document.querySelector('[data-nav=protocols] .app-menu-title');
    if (nav && nav.textContent !== 'Recetat') nav.textContent = 'Recetat';
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-load-protocol]');
    if (!button || editing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(button.dataset.loadProtocol);
  }, true);

  style();
  brand();
  ensure();
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; brand(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();