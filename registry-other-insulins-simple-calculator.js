(() => {
  'use strict';

  const VERSION = 'registry-other-insulins-simple-v1.0.0';
  const PRODUCTS = Object.freeze({
    '2510': {
      key: 'ryzodeg', name: 'Ryzodeg', subtitle: 'Insulin degludec/aspart 70/30 · 100 U/mL', minAge: 2,
      modes: [['t2_start','Fillim T2D'],['t1_start','Fillim T1D']],
      source: 'https://www.ema.europa.eu/en/medicines/human/EPAR/ryzodeg',
      doseSource: 'https://cima.aemps.es/cima/dochtml/ft/12806001/FT_12806001.html'
    },
    '2511': {
      key: 'levemir', name: 'Levemir FlexPen', subtitle: 'Insulin detemir · basal · 100 U/mL', minAge: 1,
      modes: [['t2_start','Fillim T2D'],['t2_titrate','Titrim T2D'],['t1_start','Fillim T1D']],
      source: 'https://www.ema.europa.eu/en/medicines/human/EPAR/levemir',
      doseSource: 'https://www.medicines.org.uk/emc/product/5536/smpc'
    },
    '2512': {
      key: 'tresiba', name: 'Tresiba', subtitle: 'Insulin degludec · basal ultra-long · 100 U/mL', minAge: 1,
      modes: [['t2_start','Fillim T2D'],['t1_start','Fillim T1D'],['switch','Kalimi nga insulinë bazale']],
      source: 'https://www.ema.europa.eu/en/medicines/human/EPAR/tresiba',
      doseSource: 'https://www.medicines.org.uk/emc/product/2944/smpc'
    },
    '2965': {
      key: 'apidra', name: 'Apidra SoloStar', subtitle: 'Insulin glulisine · rapid-acting · 100 U/mL', minAge: 6,
      modes: [['meal','Bolus vakti + korrigjim']],
      source: 'https://www.ema.europa.eu/en/medicines/human/EPAR/apidra',
      doseSource: 'https://www.medicines.org.uk/emc/product/8095/smpc'
    },
    '3730': {
      key: 'semglee', name: 'Semglee', subtitle: 'Insulin glargine · basal · 100 U/mL', minAge: 2,
      modes: [['t2_start','Fillim T2D'],['t1_start','Fillim T1D'],['switch','Kalimi nga insulinë tjetër']],
      source: 'https://www.ema.europa.eu/en/medicines/human/EPAR/semglee',
      doseSource: 'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=8cf5544f-87d6-468b-f6ae-898b1fdb5d80&type=display'
    }
  });

  const APIDRA_PROTOCOL_KEY = 'medindex:apidra:patient-protocol:v1';
  let modal = null;
  let activeId = null;
  let lastFocus = null;

  const num = value => {
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const round1 = value => Math.round(value * 10) / 10;
  const roundUnit = value => Math.max(0, Math.round(value));
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const esc = value => clean(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const isPediatric = age => age !== null && age < 18;

  function loadApidraProtocol() {
    try {
      const p = JSON.parse(sessionStorage.getItem(APIDRA_PROTOCOL_KEY) || 'null');
      const target = num(p?.target), icr = num(p?.icr), isf = num(p?.isf);
      return target > 0 && icr > 0 && isf > 0 ? { target, icr, isf } : null;
    } catch { return null; }
  }

  function saveApidraProtocol(protocol) {
    try { sessionStorage.setItem(APIDRA_PROTOCOL_KEY, JSON.stringify(protocol)); } catch {}
  }

  function clearApidraProtocol() {
    try { sessionStorage.removeItem(APIDRA_PROTOCOL_KEY); } catch {}
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'other-insulin-simple-modal';
    modal.id = 'otherInsulinSimpleModal';
    modal.hidden = true;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','oisTitle');
    modal.innerHTML = `
      <div class="ois-backdrop" data-ois-close></div>
      <section class="ois-card" tabindex="-1">
        <header class="ois-head">
          <div>
            <span class="ois-kicker">INSULIN SMART · SIMPLE</span>
            <h2 id="oisTitle">Insulin</h2>
            <p data-ois-subtitle></p>
          </div>
          <button type="button" class="ois-close" data-ois-close aria-label="Mbyll">×</button>
        </header>
        <div class="ois-body">
          <div class="ois-top-grid">
            <label class="ois-field">
              <span>Mosha</span>
              <div class="ois-input-unit"><input type="number" min="0" step="1" inputmode="numeric" data-ois-age autocomplete="off" placeholder="p.sh. 42"><small>vjeç</small></div>
            </label>
            <label class="ois-field">
              <span>Çfarë po bën?</span>
              <select data-ois-mode></select>
            </label>
          </div>
          <div class="ois-age-note" data-ois-age-note></div>
          <div data-ois-fields></div>
          <button type="button" class="ois-calculate" data-ois-calculate>Llogarit</button>
          <div class="ois-result" data-ois-result aria-live="polite" hidden></div>
          <details class="ois-safety">
            <summary>Kontroll i shpejtë sigurie</summary>
            <div>
              <p>Hipoglikemia aktive ose e dyshuar kërkon trajtim/rivlerësim para dozimit rutinë.</p>
              <p>Ketone/DKA, sëmundje akute, dehidrim, shtatzëni, ose ndryshim akut renal/hepatik kërkojnë vlerësim individual.</p>
              <p>Dozat janë për përdorim SC sipas produktit; mos i përdor si protokoll DKA/IV.</p>
            </div>
          </details>
        </div>
        <footer class="ois-foot">
          <div><a data-ois-source target="_blank" rel="noopener noreferrer">EMA</a><a data-ois-dose-source target="_blank" rel="noopener noreferrer">Dozimi zyrtar</a></div>
          <button type="button" data-ois-reset>Pacient i ri</button>
        </footer>
      </section>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (event.target.closest('[data-ois-close]')) close();
      if (event.target.closest('[data-ois-reset]')) reset(true);
      if (event.target.closest('[data-ois-calculate]')) calculate();
      if (event.target.closest('[data-apidra-save]')) saveApidraFromUI();
      if (event.target.closest('[data-apidra-clear]')) { clearApidraProtocol(); renderFields(); clearResult(); }
    });
    modal.addEventListener('change', event => {
      if (event.target.matches('[data-ois-mode]')) { renderFields(); clearResult(); }
      if (event.target.matches('[data-ois-age]')) updateAgeNote();
    });
    modal.addEventListener('input', event => {
      if (event.target.matches('[data-ois-age]')) updateAgeNote();
    });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('input,select')) {
        event.preventDefault();
        calculate();
      }
    });
    return modal;
  }

  function product() { return PRODUCTS[activeId] || null; }
  function age() { return num(modal?.querySelector('[data-ois-age]')?.value); }
  function mode() { return modal?.querySelector('[data-ois-mode]')?.value || ''; }

  function updateAgeNote() {
    const p = product();
    const host = modal?.querySelector('[data-ois-age-note]');
    if (!p || !host) return;
    const a = age();
    if (a === null) {
      host.className = 'ois-age-note';
      host.textContent = `Përdorimi i aprovuar: nga ${p.minAge} vjeç e lart.`;
      return;
    }
    if (a < p.minAge) {
      host.className = 'ois-age-note is-block';
      host.textContent = `Nën ${p.minAge} vjeç: ky kalkulator nuk aplikohet për ${p.name}.`;
      return;
    }
    host.className = `ois-age-note ${a < 18 ? 'is-ped' : 'is-adult'}`;
    host.textContent = a < 18 ? `Pediatrik · ${a} vjeç · dozimi individualizohet sipas produktit.` : `I rritur · ${a} vjeç.`;
  }

  function render(productId) {
    ensureModal();
    activeId = productId;
    const p = product();
    modal.querySelector('#oisTitle').textContent = p.name;
    modal.querySelector('[data-ois-subtitle]').textContent = p.subtitle;
    modal.querySelector('[data-ois-source]').href = p.source;
    modal.querySelector('[data-ois-dose-source]').href = p.doseSource;
    const select = modal.querySelector('[data-ois-mode]');
    select.innerHTML = p.modes.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
    renderFields();
    updateAgeNote();
  }

  function field(label, attr, unit='', placeholder='') {
    return `<label class="ois-field"><span>${esc(label)}</span><div class="ois-input-unit"><input type="number" step="0.1" inputmode="decimal" ${attr} autocomplete="off" placeholder="${esc(placeholder)}">${unit ? `<small>${esc(unit)}</small>` : ''}</div></label>`;
  }

  function renderFields() {
    const p = product();
    const host = modal?.querySelector('[data-ois-fields]');
    if (!p || !host) return;
    const m = mode() || p.modes[0][0];

    if (p.key === 'ryzodeg') {
      if (m === 't1_start') {
        host.innerHTML = `<div class="ois-callout"><strong>T1D · fillim</strong><span>Ryzodeg = 60–70% e insulinës totale ditore; insulinë rapid/short në vaktet tjera.</span></div>${field('Insulina totale ditore (TDD)','data-ryz-tdd','U/ditë','p.sh. 40')}`;
      } else {
        host.innerHTML = `<div class="ois-callout"><strong>T2D · fillim</strong><span>SmPC: 10 U gjithsej në ditë me vaktin kryesor, pastaj individualizohet.</span></div>`;
      }
      return;
    }

    if (p.key === 'levemir') {
      if (m === 't2_titrate') {
        host.innerHTML = `<div class="ois-two">${field('Doza aktuale','data-lev-current','U','p.sh. 14')}${field('Glukoza mesatare para mëngjesit','data-lev-fpg','mmol/L','p.sh. 7.4')}</div><small class="ois-help">Algoritmi i thjeshtë i SmPC për të rriturit: &gt;6.1 → +3 U · 4.4–6.1 → pa ndryshim · &lt;4.4 → −3 U.</small>`;
      } else if (m === 't1_start') {
        host.innerHTML = `<div class="ois-callout"><strong>T1D · dozë bazale fillestare</strong><span>Referencë nga label-i zyrtar: rreth 1/3–1/2 e TDD, me insulinë të shpejtë për vaktet.</span></div>${field('Insulina totale ditore (TDD)','data-lev-tdd','U/ditë','p.sh. 30')}`;
      } else {
        host.innerHTML = `<div class="ois-callout"><strong>T2D · fillim</strong><span>Te të rriturit: 10 U një herë/ditë ose 0.1–0.2 U/kg.</span></div>${field('Pesha','data-lev-weight','kg','p.sh. 80')}`;
      }
      return;
    }

    if (p.key === 'tresiba') {
      if (m === 't1_start') {
        host.innerHTML = `<div class="ois-callout"><strong>T1D · fillim</strong><span>Basali fillestar ≈ 1/3–1/2 e TDD; pjesa tjetër mbulohet me insulinë të shpejtë në vakte.</span></div>${field('Insulina totale ditore (TDD)','data-tre-tdd','U/ditë','p.sh. 36')}`;
      } else if (m === 'switch') {
        host.innerHTML = `<div class="ois-two">${field('Doza totale bazale aktuale','data-tre-current','U/ditë','p.sh. 24')}<label class="ois-field"><span>Regjimi aktual</span><select data-tre-switch-type><option value="once">Bazale 1×/ditë</option><option value="twice">Bazale 2×/ditë</option><option value="u300">Glargine U-300</option><option value="t1">T1D / pompë bazale</option></select></label></div>`;
      } else {
        host.innerHTML = `<div class="ois-callout"><strong>T2D · fillim</strong><span>Doza fillestare e rekomanduar: 10 U një herë në ditë.</span></div>`;
      }
      return;
    }

    if (p.key === 'apidra') {
      const pr = loadApidraProtocol();
      host.innerHTML = `
        <div class="ois-two">${field('Glukoza tani','data-api-glucose','mmol/L','p.sh. 9.2')}${field('Karbohidratet e vaktit','data-api-carbs','g','p.sh. 60')}</div>
        <details class="ois-protocol" data-api-protocol ${pr ? '' : 'open'}>
          <summary>Protokolli i pacientit <span>${pr ? '✓ ruajtur për këtë sesion' : 'vendose një herë'}</span></summary>
          <div class="ois-three">
            ${field('Targeti','data-api-target','mmol/L', pr?.target ?? 'p.sh. 6.0')}
            ${field('ICR','data-api-icr','g/U', pr?.icr ?? 'p.sh. 10')}
            ${field('ISF','data-api-isf','mmol/L/U', pr?.isf ?? 'p.sh. 2.5')}
          </div>
          <div class="ois-protocol-actions"><button type="button" data-apidra-save>Ruaje protokollin</button><button type="button" data-apidra-clear>Fshije</button></div>
        </details>
        <details class="ois-more"><summary>Më shumë <span>insulinë aktive</span></summary>${field('IOB / insulinë aktive','data-api-iob','U','0')}</details>`;
      if (pr) {
        const t = host.querySelector('[data-api-target]'), i = host.querySelector('[data-api-icr]'), s = host.querySelector('[data-api-isf]');
        if (t) t.value = pr.target; if (i) i.value = pr.icr; if (s) s.value = pr.isf;
      }
      const iob = host.querySelector('[data-api-iob]'); if (iob) iob.value = '0';
      return;
    }

    if (p.key === 'semglee') {
      if (m === 't1_start') {
        host.innerHTML = `<div class="ois-callout"><strong>T1D · fillim</strong><span>Label-i zyrtar US: rreth 1/3 e TDD si Semglee; pjesa tjetër insulinë e shpejtë para vakteve.</span></div>${field('Insulina totale ditore (TDD)','data-sem-tdd','U/ditë','p.sh. 30')}`;
      } else if (m === 'switch') {
        host.innerHTML = `<div class="ois-two">${field('Doza aktuale','data-sem-current','U/ditë','p.sh. 20')}<label class="ois-field"><span>Po kalon nga</span><select data-sem-switch-type><option value="u300">Glargine U-300 1×/ditë</option><option value="nph1">NPH 1×/ditë</option><option value="nph2">NPH 2×/ditë</option></select></label></div>`;
      } else {
        host.innerHTML = `<div class="ois-callout"><strong>T2D · insulin-naive</strong><span>Label-i zyrtar US: 0.2 U/kg ose deri 10 U një herë/ditë.</span></div>${field('Pesha','data-sem-weight','kg','p.sh. 75')}`;
      }
    }
  }

  function saveApidraFromUI() {
    const target = num(modal.querySelector('[data-api-target]')?.value);
    const icr = num(modal.querySelector('[data-api-icr]')?.value);
    const isf = num(modal.querySelector('[data-api-isf]')?.value);
    if (!(target >= 3.9 && target <= 12) || !(icr > 0 && icr <= 100) || !(isf > 0 && isf <= 15)) {
      show('warning','Kontrollo protokollin','<span>Targeti, ICR dhe ISF duhet të jenë vlera të verifikuara për pacientin.</span>');
      return;
    }
    saveApidraProtocol({target:round1(target),icr:round1(icr),isf:round1(isf)});
    renderFields();
    show('info','Protokolli u ruajt','<span>Vlen vetëm për këtë sesion/pacient.</span>');
  }

  function show(level, title, html) {
    const result = modal?.querySelector('[data-ois-result]');
    if (!result) return;
    result.hidden = false;
    result.className = `ois-result is-${level}`;
    result.innerHTML = `<strong>${esc(title)}</strong>${html}`;
  }

  function clearResult() {
    const result = modal?.querySelector('[data-ois-result]');
    if (!result) return;
    result.hidden = true;
    result.textContent = '';
    result.className = 'ois-result';
  }

  function validateAge() {
    const p = product(), a = age();
    if (a === null || a < 0) { show('warning','Shkruaj moshën','<span>Mosha nevojitet për të zgjedhur dozimin e të rriturit ose pediatrik.</span>'); return null; }
    if (a < p.minAge) { show('block',`Nën ${p.minAge} vjeç`,`<span>${esc(p.name)} nuk është i aprovuar për këtë grupmoshë sipas burimit të lidhur.</span>`); return null; }
    return a;
  }

  function calculate() {
    const p = product();
    if (!p) return;
    const a = validateAge();
    if (a === null) return;
    const m = mode() || p.modes[0][0];

    if (p.key === 'ryzodeg') {
      if (m === 't2_start') {
        const ped = isPediatric(a);
        const caution = a <= 5 ? '<em>2–5 vjeç: rrezik më i lartë i hipoglikemisë së rëndë; kërkon individualizim të kujdesshëm.</em>' : ped ? '<em>Pediatrik: monitorim i afërt dhe individualizim sipas përgjigjes.</em>' : '';
        show(a <= 5 ? 'warning' : 'ready','10 U SC/ditë me vaktin kryesor',`<span>Doza fillestare T2D sipas SmPC; pastaj titrohet individualisht.</span>${caution}`);
        return;
      }
      const tdd = num(modal.querySelector('[data-ryz-tdd]')?.value);
      if (!(tdd > 0)) { show('warning','Shkruaj TDD','<span>Duhet insulina totale ditore e planifikuar.</span>'); return; }
      const low = round1(tdd * 0.60), high = round1(tdd * 0.70);
      const caution = a <= 5 ? '<em>Te 2–5 vjeç Ryzodeg kërkon kujdes të veçantë për hipoglikeminë e rëndë.</em>' : '';
      show(a <= 5 ? 'warning' : 'ready',`${low}–${high} U Ryzodeg/ditë`,`<span>60–70% e TDD (${tdd} U). Jepet 1×/ditë me një vakt; përdor insulinë short/rapid në vaktet tjera dhe individualizo më tej.</span>${caution}`);
      return;
    }

    if (p.key === 'levemir') {
      if (m === 't2_start') {
        if (isPediatric(a)) { show('manual','Pediatrik · pa dozë fikse në SmPC','<span>Levemir lejohet nga 1 vjeç, por SmPC e jep 0.1–0.2 U/kg ose 10 U si fillim për pacientët e rritur. Te fëmijët doza individualizohet me monitorim më të afërt.</span>'); return; }
        const w = num(modal.querySelector('[data-lev-weight]')?.value);
        if (!(w > 0)) { show('warning','Shkruaj peshën','<span>Pesha nevojitet për referencën 0.1–0.2 U/kg.</span>'); return; }
        const low = round1(w * 0.1), high = round1(w * 0.2);
        show('ready','10 U SC një herë/ditë',`<span>Alternativa sipas peshës: ${low}–${high} U (0.1–0.2 U/kg). Pastaj titro sipas glukozës.</span>`);
        return;
      }
      if (m === 't2_titrate') {
        if (isPediatric(a)) { show('manual','Algoritmi është për të rritur','<span>Tabela e thjeshtë e titrimit në SmPC është për adult T2D. Te pediatria doza individualizohet.</span>'); return; }
        const current = num(modal.querySelector('[data-lev-current]')?.value), fpg = num(modal.querySelector('[data-lev-fpg]')?.value);
        if (!(current > 0) || !(fpg > 0)) { show('warning','Plotëso 2 vlerat','<span>Duhet doza aktuale dhe glukoza mesatare para mëngjesit.</span>'); return; }
        const delta = fpg > 6.1 ? 3 : fpg < 4.4 ? -3 : 0;
        const proposed = current + delta;
        if (proposed < 1 || proposed > 60) { show('block','Kërko rishikim klinik',`<span>${current} U ${delta >= 0 ? '+' : ''}${delta} U = ${proposed} U; FlexPen jep 1–60 U për injeksion.</span>`); return; }
        show(delta < 0 ? 'warning' : 'ready',`Doza e re: ${proposed} U`,`<span>${current} U ${delta === 0 ? '→ pa ndryshim' : `${delta > 0 ? '+' : ''}${delta} U`} · FPG ${fpg} mmol/L.</span>`);
        return;
      }
      const tdd = num(modal.querySelector('[data-lev-tdd]')?.value);
      if (!(tdd > 0)) { show('warning','Shkruaj TDD','<span>Duhet insulina totale ditore.</span>'); return; }
      const low = round1(tdd / 3), high = round1(tdd / 2);
      show('info',`${low}–${high} U/ditë si basal fillestar`,`<span>Referencë 1/3–1/2 e TDD; përdoret me insulinë short/rapid për vaktet. Pediatria ≥1 vjeç kërkon individualizim dhe monitorim më të afërt.</span>`);
      return;
    }

    if (p.key === 'tresiba') {
      if (m === 't2_start') { show('ready','10 U SC një herë/ditë','<span>Doza fillestare T2D; pastaj individualizohet sipas glukozës esëll. Te pediatria monitorimi duhet të jetë më i afërt.</span>'); return; }
      if (m === 't1_start') {
        const tdd = num(modal.querySelector('[data-tre-tdd]')?.value);
        if (!(tdd > 0)) { show('warning','Shkruaj TDD','<span>Duhet insulina totale ditore e planifikuar.</span>'); return; }
        const low = round1(tdd / 3), high = round1(tdd / 2);
        show('info',`${low}–${high} U Tresiba/ditë`,`<span>Referencë fillestare 1/3–1/2 e TDD; pjesa tjetër jepet si insulinë e shpejtë në vakte.</span>`);
        return;
      }
      const current = num(modal.querySelector('[data-tre-current]')?.value);
      const type = modal.querySelector('[data-tre-switch-type]')?.value || 'once';
      if (!(current > 0)) { show('warning','Shkruaj dozën aktuale','<span>Duhet doza totale bazale ditore që po zëvendësohet.</span>'); return; }
      let factor = 1;
      let why = 'kalim unit-to-unit nga bazale 1×/ditë';
      if (isPediatric(a)) { factor = 0.8; why = 'pediatrik: fillim rreth 80% e basalit të mëparshëm për të ulur rrezikun e hipoglikemisë'; }
      else if (type === 'twice' || type === 'u300' || type === 't1') { factor = 0.8; why = 'SmPC: konsidero reduktim 20% në këtë lloj kalimi'; }
      const proposed = roundUnit(current * factor);
      show(factor < 1 ? 'warning' : 'ready',`${proposed} U SC një herë/ditë`,`<span>${current} U × ${factor} = ${proposed} U · ${esc(why)}. Monitorim i afërt gjatë javëve të para.</span>`);
      return;
    }

    if (p.key === 'apidra') {
      const glucose = num(modal.querySelector('[data-api-glucose]')?.value), carbs = num(modal.querySelector('[data-api-carbs]')?.value), iob = num(modal.querySelector('[data-api-iob]')?.value) ?? 0;
      const pr = loadApidraProtocol();
      if (!(glucose > 0) || carbs === null || carbs < 0) { show('warning','Plotëso glukozën dhe karbohidratet','<span>Duhet glukoza aktuale dhe gramët e karbohidrateve.</span>'); return; }
      if (!pr) { modal.querySelector('[data-api-protocol]')?.setAttribute('open',''); show('warning','Vendos protokollin e pacientit','<span>ICR, ISF dhe targeti janë të individualizuara; ruaji një herë për këtë sesion.</span>'); return; }
      if (glucose < 3.9) { show('block','Hipoglikemi · mos llogarit bolus rutinë',`<span>Glukoza ${glucose} mmol/L kërkon trajtim/rivlerësim para bolusit.</span>`); return; }
      const meal = carbs / pr.icr;
      const correction = (glucose - pr.target) / pr.isf - Math.max(0,iob);
      const total = Math.max(0, meal + correction);
      const rounded = roundUnit(total);
      if (rounded > 80) { show('block','Mbi 80 U për një injeksion',`<span>Totali matematik është ${round1(total)} U. SoloStar vendos maksimum 80 U për injeksion; kërko rishikim të dozës/regjimit.</span>`); return; }
      show('ready',`Doza e llogaritur: ${rounded} U SC`,`<div class="ois-breakdown"><span>Vakti <b>${round1(meal)} U</b></span><span>Korrigjimi/IOB <b>${round1(correction)} U</b></span></div><span>Apidra: zakonisht 0–15 min para ose shpejt pas vaktit. ${isPediatric(a) ? 'Pediatrik ≥6 vjeç: përdor vetëm faktorët individualë të pacientit.' : ''}</span>`);
      return;
    }

    if (p.key === 'semglee') {
      if (m === 't2_start') {
        const w = num(modal.querySelector('[data-sem-weight]')?.value);
        if (!(w > 0)) { show('warning','Shkruaj peshën','<span>Pesha nevojitet për 0.2 U/kg.</span>'); return; }
        const calc = round1(w * 0.2);
        const dose = roundUnit(Math.min(calc,10));
        show('ready',`${dose} U SC një herë/ditë`,`<span>0.2 U/kg = ${calc} U; label-i zyrtar US rekomandon 0.2 U/kg ose deri 10 U si dozë fillestare në T2D insulin-naive.</span>`);
        return;
      }
      if (m === 't1_start') {
        const tdd = num(modal.querySelector('[data-sem-tdd]')?.value);
        if (!(tdd > 0)) { show('warning','Shkruaj TDD','<span>Duhet insulina totale ditore e planifikuar.</span>'); return; }
        const dose = roundUnit(tdd / 3);
        if (dose > 80) { show('block','Mbi 80 U për një injeksion','<span>Semglee pen jep maksimum 80 U për injeksion.</span>'); return; }
        show('info',`≈ ${dose} U Semglee/ditë`,`<span>Rreth 1/3 e TDD (${tdd} U); pjesa tjetër mbulohet me insulinë short/rapid para vakteve. Doza individualizohet sipas glukozës.</span>`);
        return;
      }
      const current = num(modal.querySelector('[data-sem-current]')?.value);
      const type = modal.querySelector('[data-sem-switch-type]')?.value || 'u300';
      if (!(current > 0)) { show('warning','Shkruaj dozën aktuale','<span>Duhet doza ditore e insulinës që po zëvendësohet.</span>'); return; }
      const factor = type === 'nph1' ? 1 : 0.8;
      const proposed = roundUnit(current * factor);
      if (proposed > 80) { show('block','Mbi 80 U për një injeksion','<span>Semglee pen jep maksimum 80 U për injeksion.</span>'); return; }
      const text = type === 'nph1' ? 'NPH 1×/ditë → të njëjtat njësi' : type === 'nph2' ? 'NPH 2×/ditë → 80% e totalit ditor' : 'Glargine U-300 → 80% e dozës';
      show('warning',`${proposed} U SC një herë/ditë`,`<span>${esc(text)}. Monitorim i afërt dhe rregullim sipas glukozës.</span>`);
    }
  }

  function open(productId, trigger) {
    ensureModal();
    lastFocus = trigger || document.activeElement;
    reset(false);
    render(productId);
    modal.hidden = false;
    document.body.classList.add('other-insulin-simple-opened');
    window.requestAnimationFrame(() => modal.querySelector('[data-ois-age]')?.focus());
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('other-insulin-simple-opened');
    lastFocus?.focus?.();
  }

  function reset(clearProtocol = false) {
    if (!modal) return;
    if (clearProtocol) clearApidraProtocol();
    const ageInput = modal.querySelector('[data-ois-age]');
    if (ageInput) ageInput.value = '';
    clearResult();
    if (activeId) render(activeId);
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-insulin-smart-open]');
    if (!trigger) return;
    const id = String(trigger.getAttribute('data-insulin-smart-open') || '');
    if (!PRODUCTS[id]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(id, trigger);
  }, true);

  document.addEventListener('keydown', event => {
    if (modal && !modal.hidden && event.key === 'Escape') close();
  });

  window.MEDINDEX_OTHER_INSULINS_SIMPLE = Object.freeze({ version: VERSION, products: Object.keys(PRODUCTS) });
})();