(() => {
  'use strict';

  const VERSION = 'registry-other-insulins-simple-v2.0.0';
  const PRODUCTS = Object.freeze({
    '2510': {
      key: 'ryzodeg', name: 'Ryzodeg', subtitle: 'Insulin degludec/aspart 70/30 · 100 U/mL', minAge: 2,
      modes: [['t2_start','Fillim · Diabet tip 2 (T2D)'],['t1_start','Fillim · Diabet tip 1 (T1D)'],['t2_switch','Kalim · Diabet tip 2 (T2D)']],
      source: 'https://www.ema.europa.eu/en/medicines/human/EPAR/ryzodeg',
      doseSource: 'https://cima.aemps.es/cima/dochtml/ft/12806001/FT_12806001.html'
    },
    '2511': {
      key: 'levemir', name: 'Levemir FlexPen', subtitle: 'Insulin detemir · bazale · 100 U/mL', minAge: 1,
      modes: [['t2_start','Fillim · Diabet tip 2 (T2D)'],['t2_titrate','Rregullim doze · Diabet tip 2 (T2D)'],['individual','Dozë bazale e planifikuar']],
      source: 'https://www.ema.europa.eu/en/medicines/human/EPAR/levemir',
      doseSource: 'https://www.medicines.org.uk/emc/product/5536/smpc'
    },
    '2512': {
      key: 'tresiba', name: 'Tresiba', subtitle: 'Insulin degludec · bazale ultra-long · 100 U/mL', minAge: 1,
      modes: [['t2_start','Fillim · Diabet tip 2 (T2D)'],['t2_switch','Kalim · Diabet tip 2 (T2D)'],['t1_switch','Kalim · Diabet tip 1 (T1D)'],['individual','Dozë bazale e planifikuar']],
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
      key: 'semglee', name: 'Semglee', subtitle: 'Insulin glargine · bazale · 100 U/mL', minAge: 2,
      modes: [['individual','Dozë bazale e planifikuar'],['nph2_switch','Kalim nga NPH 2×/ditë'],['u300_switch','Kalim nga glargine U-300'],['other_switch','Kalim nga insulinë tjetër bazale']],
      source: 'https://www.ema.europa.eu/en/medicines/human/EPAR/semglee',
      doseSource: 'https://www.medicines.org.uk/emc/product/100785/smpc'
    }
  });

  const APIDRA_PROTOCOL_KEY = 'medindex:apidra:patient-protocol:v2';
  let modal = null;
  let activeId = null;
  let lastFocus = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const num = value => {
    const text = clean(value).replace(',', '.');
    if (text === '') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  };
  const round1 = value => Math.round(value * 10) / 10;
  const roundUnit = value => Math.max(0, Math.round(value));
  const esc = value => clean(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const isPediatric = age => age !== null && age < 18;
  const ageGroup = age => isPediatric(age) ? 'pediatric' : 'adult';

  function loadApidraProtocol() {
    try {
      const p = JSON.parse(sessionStorage.getItem(APIDRA_PROTOCOL_KEY) || 'null');
      const target = num(p?.target), icr = num(p?.icr), isf = num(p?.isf);
      if (!(target >= 3.9 && target <= 12) || !(icr > 0 && icr <= 100) || !(isf > 0 && isf <= 15)) return null;
      return { target, icr, isf, ageGroup: p?.ageGroup === 'pediatric' ? 'pediatric' : 'adult' };
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
            <span class="ois-kicker">SMART INSULIN · SIMPLE</span>
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
              <p>Ndërrimi i insulinës kërkon monitorim të afërt; kalkulatori nuk zëvendëson medication reconciliation ose protokollet DKA/IV.</p>
            </div>
          </details>
        </div>
        <footer class="ois-foot">
          <div><a data-ois-source target="_blank" rel="noopener noreferrer">EMA</a><a data-ois-dose-source target="_blank" rel="noopener noreferrer">SmPC</a></div>
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
      if (event.target.matches('[data-ois-age]')) { updateAgeNote(); if (product()?.key === 'apidra') renderFields(); }
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

  function selectField(label, attr, options) {
    return `<label class="ois-field"><span>${esc(label)}</span><select ${attr}>${options.map(([value,text]) => `<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select></label>`;
  }

  function renderFields() {
    const p = product();
    const host = modal?.querySelector('[data-ois-fields]');
    if (!p || !host) return;
    const m = mode() || p.modes[0][0];

    if (p.key === 'ryzodeg') {
      if (m === 't1_start') {
        host.innerHTML = `<div class="ois-callout"><strong>Diabet tip 1 (T1D)</strong><span>Ryzodeg fillestar = 60–70% e nevojës totale ditore për insulinë; insulinë short/rapid në vaktet tjera.</span></div><div class="ois-two">${field('Insulina totale ditore e planifikuar','data-ryz-tdd','U/ditë','p.sh. 40')}${selectField('Pena','data-ryz-device',[['flextouch','FlexTouch · max 80 U/injeksion'],['flexpen','FlexPen · max 60 U/injeksion']])}</div>`;
      } else if (m === 't2_switch') {
        host.innerHTML = `<div class="ois-callout"><strong>Kalim · Diabet tip 2 (T2D)</strong><span>Nga insulinë bazale ose premix: te të rriturit nis përgjithësisht unit-to-unit sipas totalit ditor, pastaj individualizohet.</span></div><div class="ois-two">${field('Doza totale ditore aktuale','data-ryz-current','U/ditë','p.sh. 30')}${selectField('Pena','data-ryz-device',[['flextouch','FlexTouch · max 80 U/injeksion'],['flexpen','FlexPen · max 60 U/injeksion']])}</div>`;
      } else {
        host.innerHTML = `<div class="ois-callout"><strong>Fillim · Diabet tip 2 (T2D)</strong><span>Te të rriturit SmPC jep 10 U/ditë me vaktin kryesor, pastaj individualizohet.</span></div>`;
      }
      return;
    }

    if (p.key === 'levemir') {
      if (m === 't2_titrate') {
        host.innerHTML = `<div class="ois-two">${field('Doza aktuale','data-lev-current','U','p.sh. 14')}${field('Glukoza mesatare para mëngjesit','data-lev-fpg','mmol/L','p.sh. 7.4')}</div><small class="ois-help">Algoritmi i thjeshtë adult: &gt;6.1 → +3 U · 4.4–6.1 → pa ndryshim · &lt;4.4 → −3 U.</small>`;
      } else if (m === 'individual') {
        host.innerHTML = `<div class="ois-callout"><strong>Dozë e planifikuar</strong><span>Kur doza është përcaktuar klinikisht, kalkulatori kontrollon vetëm prezantimin dhe frekuencën; nuk shpik dozë T1D/pediatrike.</span></div><div class="ois-two">${field('Doza për injeksion','data-lev-planned','U','p.sh. 12')}${selectField('Frekuenca','data-lev-frequency',[['od','1×/ditë'],['bid','2×/ditë']])}</div>`;
      } else {
        host.innerHTML = `<div class="ois-callout"><strong>Fillim · Diabet tip 2 (T2D)</strong><span>Vetëm për të rriturit: 10 U një herë/ditë ose 0.1–0.2 U/kg, pastaj individualizohet.</span></div>${field('Pesha','data-lev-weight','kg','p.sh. 80')}`;
      }
      return;
    }

    if (p.key === 'tresiba') {
      if (m === 't2_switch') {
        host.innerHTML = `<div class="ois-callout"><strong>Kalim · Diabet tip 2 (T2D)</strong><span>Doza varet nga lloji i basalit të mëparshëm.</span></div><div class="ois-two">${field('Doza totale bazale aktuale','data-tre-current','U/ditë','p.sh. 24')}${selectField('Po kalon nga','data-tre-switch-type',[['once','Bazale 1×/ditë / basal-bolus / premix'],['twice','Bazale 2×/ditë'],['u300','Insulin glargine U-300']])}</div>`;
      } else if (m === 't1_switch') {
        host.innerHTML = `<div class="ois-callout"><strong>Kalim · Diabet tip 1 (T1D)</strong><span>Te të rriturit SmPC sugjeron të konsiderohet reduktim 20% nga basali i mëparshëm ose komponenti bazal i pompës.</span></div>${field('Doza bazale aktuale','data-tre-t1-current','U/ditë','p.sh. 20')}`;
      } else if (m === 'individual') {
        host.innerHTML = `<div class="ois-callout"><strong>Dozë bazale e planifikuar</strong><span>Përdor dozën e përcaktuar për pacientin. Tresiba përdoret 1×/ditë; kontrollo pajisjen konkrete para injeksionit.</span></div>${field('Doza e planifikuar','data-tre-planned','U/ditë','p.sh. 18')}`;
      } else {
        host.innerHTML = `<div class="ois-callout"><strong>Fillim · Diabet tip 2 (T2D)</strong><span>Te të rriturit doza fillestare e rekomanduar është 10 U një herë në ditë, pastaj individualizohet.</span></div>`;
      }
      return;
    }

    if (p.key === 'apidra') {
      const pr = loadApidraProtocol();
      const a = age();
      const mismatch = pr && a !== null && pr.ageGroup !== ageGroup(a);
      host.innerHTML = `
        <div class="ois-two">${field('Glukoza tani','data-api-glucose','mmol/L','p.sh. 9.2')}${field('Karbohidratet e vaktit','data-api-carbs','g','p.sh. 60')}</div>
        <details class="ois-more" open><summary>Më shumë <span>IOB është i detyrueshëm</span></summary>${field('IOB / insulinë aktive','data-api-iob','U','p.sh. 0')}</details>
        <details class="ois-protocol" data-api-protocol ${!pr || mismatch ? 'open' : ''}>
          <summary>Parametrat e pacientit <span>${pr && !mismatch ? '✓ aktivë për këtë sesion' : 'vendosi një herë'}</span></summary>
          <div class="ois-three">
            ${field('Targeti','data-api-target','mmol/L', pr?.target ?? 'p.sh. 6.0')}
            ${field('ICR','data-api-icr','g/U', pr?.icr ?? 'p.sh. 10')}
            ${field('ISF','data-api-isf','mmol/L/U', pr?.isf ?? 'p.sh. 2.5')}
          </div>
          <label class="ois-field" style="padding:12px 14px 0"><span style="display:flex;gap:9px;align-items:flex-start;font-weight:650"><input type="checkbox" data-api-confirm style="width:18px;height:18px;min-height:18px"> I kam kontrolluar targetin, ICR dhe ISF për këtë pacient.</span></label>
          <div class="ois-protocol-actions"><button type="button" data-apidra-save>Aktivizo parametrat</button><button type="button" data-apidra-clear>Fshije</button></div>
        </details>`;
      if (pr) {
        const t = host.querySelector('[data-api-target]'), i = host.querySelector('[data-api-icr]'), s = host.querySelector('[data-api-isf]');
        if (t) t.value = pr.target; if (i) i.value = pr.icr; if (s) s.value = pr.isf;
      }
      return;
    }

    if (p.key === 'semglee') {
      if (m === 'nph2_switch') {
        host.innerHTML = `<div class="ois-callout"><strong>Kalim nga NPH 2×/ditë</strong><span>SmPC rekomandon reduktim 20–30% të dozës totale ditore bazale gjatë javëve të para.</span></div>${field('NPH totale ditore aktuale','data-sem-current','U/ditë','p.sh. 30')}`;
      } else if (m === 'u300_switch') {
        host.innerHTML = `<div class="ois-callout"><strong>Kalim nga glargine U-300</strong><span>SmPC rekomandon rreth 20% reduktim kur kalohet në Semglee U-100.</span></div>${field('Doza aktuale U-300','data-sem-current','U/ditë','p.sh. 24')}`;
      } else if (m === 'other_switch') {
        host.innerHTML = `<div class="ois-callout"><strong>Kalim nga insulinë tjetër bazale</strong><span>SmPC thotë se mund të kërkohet ndryshim i dozës, por nuk jep një faktor universal për çdo produkt.</span></div>${field('Doza bazale aktuale','data-sem-current','U/ditë','p.sh. 20')}`;
      } else {
        host.innerHTML = `<div class="ois-callout"><strong>Dozë bazale e planifikuar</strong><span>Semglee jepet 1×/ditë në të njëjtën kohë; doza individualizohet. Kalkulatori vetëm kontrollon dozën e planifikuar ndaj pen-it.</span></div>${field('Doza e planifikuar','data-sem-planned','U/ditë','p.sh. 18')}`;
      }
    }
  }

  function saveApidraFromUI() {
    const a = validateAge();
    if (a === null) return;
    const target = num(modal.querySelector('[data-api-target]')?.value);
    const icr = num(modal.querySelector('[data-api-icr]')?.value);
    const isf = num(modal.querySelector('[data-api-isf]')?.value);
    const confirmed = Boolean(modal.querySelector('[data-api-confirm]')?.checked);
    if (!(target >= 3.9 && target <= 12) || !(icr > 0 && icr <= 100) || !(isf > 0 && isf <= 15)) {
      show('warning','Kontrollo parametrat','<span>Targeti, ICR dhe ISF duhet të jenë vlera të verifikuara për pacientin.</span>');
      return;
    }
    if (!confirmed) {
      show('warning','Konfirmimi mungon','<span>Kontrollo targetin, ICR dhe ISF dhe shëno konfirmimin klinik.</span>');
      return;
    }
    saveApidraProtocol({target:round1(target),icr:round1(icr),isf:round1(isf),ageGroup:ageGroup(a)});
    renderFields();
    show('info','Parametrat u aktivizuan','<span>Vlejnë vetëm për këtë sesion dhe këtë grupmoshë.</span>');
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
    if (a === null || a < 0) { show('warning','Shkruaj moshën','<span>Mosha nevojitet para llogaritjes.</span>'); return null; }
    if (a < p.minAge) { show('block',`Nën ${p.minAge} vjeç`,`<span>${esc(p.name)} nuk aplikohet për këtë grupmoshë sipas SmPC të lidhur.</span>`); return null; }
    return a;
  }

  function pediatricManual(productName, detail) {
    show('manual',`Pediatrik · ${productName}`,`<span>${detail} Doza duhet të individualizohet me monitorim të afërt.</span>`);
  }

  function calculate() {
    const p = product();
    if (!p) return;
    const a = validateAge();
    if (a === null) return;
    const ped = isPediatric(a);
    const m = mode() || p.modes[0][0];

    if (p.key === 'ryzodeg') {
      if (m === 't2_start') {
        if (ped) { pediatricManual('Ryzodeg','SmPC lejon përdorimin nga 2 vjeç, por ky kalkulator nuk aplikon automatikisht skemën fikse adult 10 U për fillim T2D te fëmijët/adoleshentët.'); return; }
        show('ready','10 U SC/ditë me vaktin kryesor','<span>Doza fillestare adult për Diabet tip 2 (T2D); pastaj titrohet individualisht.</span>');
        return;
      }

      if (m === 't2_switch') {
        const current = num(modal.querySelector('[data-ryz-current]')?.value);
        if (!(current > 0)) { show('warning','Shkruaj dozën totale ditore','<span>Duhet total ditor i regjimit bazal/premix që po zëvendësohet.</span>'); return; }
        if (ped) { pediatricManual('Ryzodeg',`Gjatë kalimit nga regjim tjetër, SmPC kërkon të konsiderohet individualisht reduktimi i insulinës totale për të ulur hipoglikeminë; nuk aplikohet unit-to-unit automatik për ${a} vjeç.`); return; }
        const device = modal.querySelector('[data-ryz-device]')?.value || 'flextouch';
        const max = device === 'flexpen' ? 60 : 80;
        const deviceNote = current > max ? `<em>Totali ${current} U tejkalon kapacitetin e një injeksioni të pen-it të zgjedhur (${max} U); mos e ndani automatikisht.</em>` : '';
        show(current > max ? 'warning' : 'ready',`${round1(current)} U Ryzodeg/ditë`,`<span>Kalim adult unit-to-unit nga totali ditor bazal/premix; mund të jepet 1–2×/ditë me vaktet kryesore dhe pastaj individualizohet.</span>${deviceNote}`);
        return;
      }

      const tdd = num(modal.querySelector('[data-ryz-tdd]')?.value);
      if (!(tdd > 0)) { show('warning','Shkruaj TDD','<span>Duhet nevoja totale ditore për insulinë.</span>'); return; }
      const low = round1(tdd * 0.60), high = round1(tdd * 0.70);
      const device = modal.querySelector('[data-ryz-device]')?.value || 'flextouch';
      const max = device === 'flexpen' ? 60 : 80;
      const capacity = high > max ? `<em>Skaji i sipërm ${high} U kalon ${max} U për një injeksion me pen-in e zgjedhur; kërko rishikim të prezantimit/regjimit, jo ndarje automatike.</em>` : '';
      const young = a <= 5 ? '<em>2–5 vjeç: SmPC kërkon kujdes të veçantë për shkak të rrezikut më të lartë të hipoglikemisë së rëndë.</em>' : ped ? '<em>Pediatrik: përshtat dozën me ushqimin, aktivitetin dhe monitorimin.</em>' : '';
      show(a <= 5 || high > max ? 'warning' : 'info',`${low}–${high} U Ryzodeg/ditë`,`<span>60–70% e TDD ${tdd} U; 1×/ditë me një vakt + insulinë short/rapid në vaktet tjera, pastaj individualizohet.</span>${young}${capacity}`);
      return;
    }

    if (p.key === 'levemir') {
      if (m === 't2_start') {
        if (ped) { pediatricManual('Levemir','Skema 10 U ose 0.1–0.2 U/kg në SmPC është skemë fillestare për pacientë adult me T2D në kombinimet e specifikuara.'); return; }
        const w = num(modal.querySelector('[data-lev-weight]')?.value);
        if (!(w > 0)) { show('warning','Shkruaj peshën','<span>Pesha nevojitet për të shfaqur alternativën 0.1–0.2 U/kg.</span>'); return; }
        const low = round1(w * 0.1), high = round1(w * 0.2);
        show('ready','10 U SC një herë/ditë',`<span>Alternativa sipas peshës: ${low}–${high} U (0.1–0.2 U/kg). Pastaj titro sipas nevojës individuale.</span>`);
        return;
      }
      if (m === 't2_titrate') {
        if (ped) { pediatricManual('Levemir','Tabela e thjeshtë +3/0/−3 U është algoritëm adult për Diabet tip 2 (T2D).'); return; }
        const current = num(modal.querySelector('[data-lev-current]')?.value), fpg = num(modal.querySelector('[data-lev-fpg]')?.value);
        if (!(current > 0) || !(fpg > 0)) { show('warning','Plotëso 2 vlerat','<span>Duhet doza aktuale dhe glukoza mesatare para mëngjesit.</span>'); return; }
        if (current > 60) { show('block','Mbi 60 U për injeksion','<span>Levemir FlexPen jep maksimum 60 U për injeksion.</span>'); return; }
        const delta = fpg > 6.1 ? 3 : fpg < 4.4 ? -3 : 0;
        const proposed = current + delta;
        if (proposed < 1 || proposed > 60) { show('block','Kërko rishikim klinik',`<span>${current} U ${delta >= 0 ? '+' : ''}${delta} U = ${proposed} U; FlexPen jep 1–60 U për injeksion.</span>`); return; }
        show(delta < 0 ? 'warning' : 'ready',`Doza e re: ${proposed} U`,`<span>${current} U ${delta === 0 ? '→ pa ndryshim' : `${delta > 0 ? '+' : ''}${delta} U`} · glukoza mesatare ${fpg} mmol/L.</span>`);
        return;
      }
      const planned = num(modal.querySelector('[data-lev-planned]')?.value);
      const freq = modal.querySelector('[data-lev-frequency]')?.value || 'od';
      if (!(planned > 0)) { show('warning','Shkruaj dozën e planifikuar','<span>Duhet doza e përcaktuar klinikisht për injeksion.</span>'); return; }
      if (planned > 60) { show('block','Mbi 60 U për injeksion','<span>Levemir FlexPen jep 1–60 U në hapa prej 1 U. Mos e ndani automatikisht.</span>'); return; }
      show(ped ? 'warning' : 'info',`${roundUnit(planned)} U · ${freq === 'bid' ? '2×/ditë' : '1×/ditë'}`,`<span>Dozë e planifikuar, jo dozë e derivuar nga kalkulatori. ${ped ? 'Pediatrik: kërkohet individualizim dhe monitorim i afërt.' : ''}</span>`);
      return;
    }

    if (p.key === 'tresiba') {
      if (m === 't2_start') {
        if (ped) { pediatricManual('Tresiba','Skema fikse 10 U/ditë në SmPC është doza fillestare për pacientë me Diabet tip 2 (T2D); ky kalkulator nuk e transferon automatikisht te pediatria.'); return; }
        show('ready','10 U SC një herë/ditë','<span>Fillim adult për Diabet tip 2 (T2D), pastaj individualizohet.</span>');
        return;
      }
      if (m === 't2_switch') {
        const current = num(modal.querySelector('[data-tre-current]')?.value);
        const type = modal.querySelector('[data-tre-switch-type]')?.value || 'once';
        if (!(current > 0)) { show('warning','Shkruaj dozën aktuale','<span>Duhet doza totale bazale që po zëvendësohet.</span>'); return; }
        if (ped) { pediatricManual('Tresiba','Në pediatri reduktimi gjatë kalimit duhet të konsiderohet individualisht; ky kalkulator nuk aplikon një faktor fiks adult.'); return; }
        const factor = type === 'once' ? 1 : 0.8;
        const proposed = roundUnit(current * factor);
        const why = factor === 1 ? 'unit-to-unit nga bazale 1×/ditë / basal-bolus / premix' : '−20% nga bazale 2×/ditë ose glargine U-300';
        show(factor < 1 ? 'warning' : 'ready',`${proposed} U Tresiba/ditë`,`<span>${current} U × ${factor} = ${proposed} U · ${esc(why)}. Pastaj individualizo sipas glukozës.</span>`);
        return;
      }
      if (m === 't1_switch') {
        const current = num(modal.querySelector('[data-tre-t1-current]')?.value);
        if (!(current > 0)) { show('warning','Shkruaj dozën bazale','<span>Duhet basali i mëparshëm ose komponenti bazal i pompës.</span>'); return; }
        if (ped) { pediatricManual('Tresiba','SmPC kërkon konsiderim individual të reduktimit gjatë kalimit te fëmijët/adoleshentët.'); return; }
        const proposed = roundUnit(current * 0.8);
        show('warning',`${proposed} U Tresiba/ditë`,`<span>Rreth 80% e basalit të mëparshëm (${current} U) si pikënisje e switch adult T1D, pastaj individualizohet.</span>`);
        return;
      }
      const planned = num(modal.querySelector('[data-tre-planned]')?.value);
      if (!(planned > 0)) { show('warning','Shkruaj dozën e planifikuar','<span>Duhet doza bazale e përcaktuar për pacientin.</span>'); return; }
      show(ped ? 'warning' : 'info',`${roundUnit(planned)} U Tresiba/ditë`,`<span>Dozë e planifikuar, jo e derivuar. Kontrollo pajisjen/presentimin konkret për kufirin e njësive dhe hapat e dozimit. ${ped ? 'Pediatrik: individualizo dhe monitoro nga afër.' : ''}</span>`);
      return;
    }

    if (p.key === 'apidra') {
      const glucose = num(modal.querySelector('[data-api-glucose]')?.value);
      const carbs = num(modal.querySelector('[data-api-carbs]')?.value);
      const iob = num(modal.querySelector('[data-api-iob]')?.value);
      const pr = loadApidraProtocol();
      if (!(glucose > 0) || carbs === null || carbs < 0) { show('warning','Plotëso glukozën dhe karbohidratet','<span>Duhet glukoza aktuale dhe gramët e karbohidrateve.</span>'); return; }
      if (iob === null || iob < 0) { show('warning','Shkruaj IOB','<span>Shkruaj insulinën aktive në U; 0 vetëm kur nuk ka insulinë aktive që duhet zbritur.</span>'); return; }
      if (!pr) { modal.querySelector('[data-api-protocol]')?.setAttribute('open',''); show('warning','Vendos parametrat e pacientit','<span>ICR, ISF dhe targeti janë individuale; aktivizoji një herë për këtë sesion.</span>'); return; }
      if (pr.ageGroup !== ageGroup(a)) { modal.querySelector('[data-api-protocol]')?.setAttribute('open',''); show('block','Parametrat nuk përputhen me grupmoshën','<span>Fshij parametrat e ruajtur dhe vendosi për pacientin aktual.</span>'); return; }
      if (glucose < 3.9) { show('block','Hipoglikemi · mos llogarit bolus rutinë',`<span>Glukoza ${glucose} mmol/L kërkon trajtim/rivlerësim para bolusit.</span>`); return; }
      const meal = carbs / pr.icr;
      const correction = (glucose - pr.target) / pr.isf - iob;
      const total = Math.max(0, meal + correction);
      const rounded = roundUnit(total);
      if (rounded > 80) { show('block','Mbi 80 U për një injeksion',`<span>Totali matematik është ${round1(total)} U. SoloStar zgjedh maksimum 80 U për injeksion; mos e ndani automatikisht pa plan të verifikuar.</span>`); return; }
      const high = glucose >= 13.9 ? '<em>Glukoza ≥13.9 mmol/L: kontrollo ketonet dhe gjendjen klinike; në DKA/sëmundje akute mos u mbështet vetëm në këtë kalkulator.</em>' : '';
      const pedNote = ped ? '<em>Pediatrik ≥6 vjeç: përdor vetëm ICR/ISF/target individuale dhe monitorim të afërt.</em>' : '';
      show('ready',`Doza e llogaritur: ${rounded} U SC`,`<div class="ois-breakdown"><span>Vakti <b>${round1(meal)} U</b></span><span>Korrigjimi − IOB <b>${round1(correction)} U</b></span></div><span>Apidra: 0–15 min para ose shpejt pas vaktit.</span>${pedNote}${high}`);
      return;
    }

    if (p.key === 'semglee') {
      if (m === 'individual') {
        const planned = num(modal.querySelector('[data-sem-planned]')?.value);
        if (!(planned > 0)) { show('warning','Shkruaj dozën e planifikuar','<span>Duhet doza bazale e përcaktuar klinikisht.</span>'); return; }
        const dose = roundUnit(planned);
        if (dose > 80) { show('block','Mbi 80 U për injeksion','<span>Semglee pen jep maksimum 80 U në një injeksion; mos e ndani automatikisht.</span>'); return; }
        show(ped ? 'warning' : 'info',`${dose} U SC një herë/ditë`,`<span>Dozë e planifikuar, jo e derivuar. Jepet në të njëjtën kohë çdo ditë dhe individualizohet sipas pacientit.${ped ? ' Pediatrik ≥2 vjeç: monitorim i afërt.' : ''}</span>`);
        return;
      }

      const current = num(modal.querySelector('[data-sem-current]')?.value);
      if (!(current > 0)) { show('warning','Shkruaj dozën aktuale','<span>Duhet doza totale ditore bazale që po zëvendësohet.</span>'); return; }

      if (m === 'other_switch') {
        show('manual','Nuk ka faktor universal','<span>SmPC thotë se doza bazale mund të kërkojë ndryshim kur kalohet nga një insulinë tjetër intermediate/long-acting, por nuk jep një përqindje universale për çdo produkt. Kërko plan individual dhe monitorim të afërt.</span>');
        return;
      }

      if (m === 'nph2_switch') {
        const low = roundUnit(current * 0.70), high = roundUnit(current * 0.80);
        if (high > 80) { show('block','Kufiri i pen-it tejkalohet',`<span>70–80% e ${current} U = ${low}–${high} U; Semglee pen jep maksimum 80 U për injeksion. Kërko rishikim të regjimit/device-it.</span>`); return; }
        show('warning',`${low}–${high} U Semglee/ditë`,`<span>Reduktim 20–30% nga NPH 2×/ditë gjatë javëve të para. Monitorim i afërt dhe rregullim individual.${ped ? ' Pediatrik: individualizo me kujdes.' : ''}</span>`);
        return;
      }

      const proposed = roundUnit(current * 0.8);
      if (proposed > 80) { show('block','Mbi 80 U për injeksion','<span>Doza e llogaritur kalon kapacitetin e Semglee pen.</span>'); return; }
      show('warning',`${proposed} U Semglee/ditë`,`<span>Rreth 80% e glargine U-300 (${current} U), pastaj monitorim i afërt dhe individualizim.${ped ? ' Pediatrik: kërko mbikëqyrje të afërt gjatë switch-it.' : ''}</span>`);
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