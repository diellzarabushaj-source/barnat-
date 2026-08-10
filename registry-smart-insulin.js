(() => {
  'use strict';

  const VERSION = 'registry-smart-insulin-v1.0.0';
  const COLUMN_KEY = 'dose-calculator';
  const PRIORITY = Object.freeze({ block:0, manual_review:1, caution:2, info:3 });

  const PROFILES = Object.freeze({
    '2508': Object.freeze({
      registryNumber:'2508',
      productKey:'NOVORAPID-FLEXPEN-2508',
      tradeName:'NovoRapid Flex Pen',
      activeSubstance:'Insulin aspart',
      atcCode:'A10AB05',
      strength:'100 U/mL',
      form:'Solution for injection',
      route:'SC',
      minAgeMonths:12,
      ageLabel:'≥1 vjeç + të rritur',
      typeLabel:'Insulinë me veprim të shpejtë',
      sources:Object.freeze([
        Object.freeze({ name:'EMA · NovoRapid EPAR', url:'https://www.ema.europa.eu/en/medicines/human/EPAR/novorapid' }),
      ]),
      checks:Object.freeze([
        Object.freeze({ key:'hypoglycaemia', severity:'block', label:'Hipoglikemi aktuale ose e dyshuar?', message:'Mos vazhdo me workflow rutinë të insulinës derisa hipoglikemia të trajtohet dhe pacienti të rivlerësohet.' }),
        Object.freeze({ key:'ketones_dka', severity:'manual_review', label:'Ketone pozitive, DKA ose sick-day state?', message:'Kërkohet pathway/protokoll i dedikuar dhe vlerësim klinik.' }),
        Object.freeze({ key:'renal_hepatic', severity:'manual_review', label:'Dëmtim renal ose hepatik?', message:'Nevoja për insulinë mund të ndryshojë; parametrat e pacientit duhet të rivlerësohen.' }),
        Object.freeze({ key:'insulin_transfer', severity:'manual_review', label:'Po kalon nga insulinë/brand/regjim tjetër?', message:'Mos bëj konvertim automatik; kërko plan transferimi dhe monitorim të afërt.' }),
      ]),
    }),
    '2509': Object.freeze({
      registryNumber:'2509',
      productKey:'NOVOMIX30-FLEXPEN-2509',
      tradeName:'NovoMix30 FlexPen',
      activeSubstance:'Insulin aspart',
      atcCode:'A10AD05',
      strength:'100 U/mL',
      form:'Suspension for injection',
      route:'SC',
      minAgeMonths:120,
      ageLabel:'≥10 vjeç + të rritur',
      typeLabel:'Insulinë biphasike 30/70',
      sources:Object.freeze([
        Object.freeze({ name:'EMA · NovoMix EPAR', url:'https://www.ema.europa.eu/en/medicines/human/EPAR/novomix' }),
        Object.freeze({ name:'SmPC · NovoMix30 FlexPen', url:'https://www.medicines.org.uk/emc/product/1600/smpc' }),
      ]),
      checks:Object.freeze([
        Object.freeze({ key:'hypersensitivity', severity:'block', label:'Alergji ndaj insulin aspart ose përbërësve?', message:'Hipersensitiviteti është kundërindikacion; mos e përdor këtë preparat.' }),
        Object.freeze({ key:'route_mismatch', severity:'block', label:'Po planifikohet rrugë tjetër përveç SC?', message:'NovoMix30 FlexPen është vetëm për administrim subkutan.' }),
        Object.freeze({ key:'hypoglycaemia', severity:'manual_review', label:'Hipoglikemi aktuale ose episode të përsëritura?', message:'Rivlerëso glukozën, ushqimin dhe regjimin e përshkruar para administrimit.' }),
        Object.freeze({ key:'renal_hepatic', severity:'manual_review', label:'Dëmtim renal ose hepatik?', message:'Nevoja për insulinë mund të ndryshojë; kërkohet monitorim dhe individualizim.' }),
        Object.freeze({ key:'insulin_transfer', severity:'manual_review', label:'Po kalon nga insulinë/regjim tjetër?', message:'Mos bëj konvertim automatik; verifiko planin e transferimit.' }),
        Object.freeze({ key:'resuspension', severity:'manual_review', label:'Suspensioni nuk është uniform pas resuspensionit?', message:'Mos e përdor pen-in derisa handling-u dhe pamja të jenë në përputhje me SmPC.' }),
        Object.freeze({ key:'meal_timing', severity:'caution', label:'Koha e injektimit nuk përputhet me vaktin e planifikuar?', message:'Konfirmo meal timing sipas planit individual të pacientit.' }),
      ]),
    }),
  });

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const esc = value => clean(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  let activeProfile = null;
  let modal = null;
  let scheduled = false;
  let observer = null;

  function ensureStyles() {
    if (document.getElementById('smartInsulinStyles')) return;
    const style = document.createElement('style');
    style.id = 'smartInsulinStyles';
    style.textContent = `
      .smart-insulin-open{min-width:112px;min-height:46px;border:0;border-radius:13px;background:#0d5f63;color:#fff;font:inherit;font-size:.78rem;font-weight:850;cursor:pointer;box-shadow:0 4px 12px rgba(13,95,99,.16)}
      .smart-insulin-open:hover{filter:brightness(.96)}.smart-insulin-open:focus-visible{outline:3px solid rgba(13,95,99,.24);outline-offset:2px}
      .smart-insulin-modal{position:fixed;inset:0;z-index:10040;display:grid;place-items:center;padding:18px;background:rgba(15,23,42,.50);backdrop-filter:blur(5px)}
      .smart-insulin-modal[hidden]{display:none!important}.smart-insulin-card{width:min(580px,100%);max-height:min(88vh,760px);overflow:auto;border-radius:20px;background:#fff;box-shadow:0 30px 90px rgba(15,23,42,.28);color:#172b2e}
      .smart-insulin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 18px 12px;border-bottom:1px solid rgba(15,23,42,.08)}
      .smart-insulin-kicker{font-size:.68rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#0d5f63}.smart-insulin-head h2{margin:3px 0 2px;font-size:1.18rem}.smart-insulin-meta{font-size:.72rem;color:#667085}
      .smart-insulin-close{width:38px;height:38px;border:0;border-radius:11px;background:#f2f4f7;color:#344054;font-size:1.2rem;cursor:pointer}.smart-insulin-body{padding:15px 18px 18px;display:grid;gap:13px}
      .smart-insulin-notice{padding:10px 12px;border-radius:12px;background:rgba(13,95,99,.07);font-size:.72rem;line-height:1.42;color:#36585b}.smart-insulin-field{display:grid;gap:6px}.smart-insulin-field label{font-size:.72rem;font-weight:850}.smart-insulin-field input{height:43px;border:1px solid #d0d5dd;border-radius:11px;padding:0 11px;font:inherit}
      .smart-insulin-checks{display:grid;border:1px solid #e4e7ec;border-radius:14px;overflow:hidden}.smart-insulin-check{display:grid;grid-template-columns:22px 1fr;gap:8px;padding:10px 11px;border-bottom:1px solid #eef0f2;cursor:pointer}.smart-insulin-check:last-child{border-bottom:0}.smart-insulin-check input{width:17px;height:17px;margin-top:1px;accent-color:#0d5f63}.smart-insulin-check strong{display:block;font-size:.73rem}.smart-insulin-check small{display:block;margin-top:2px;font-size:.66rem;line-height:1.35;color:#667085}
      .smart-insulin-result{padding:11px 12px;border-radius:13px;border:1px solid rgba(13,95,99,.18);background:rgba(13,95,99,.06);display:grid;gap:4px}.smart-insulin-result strong{font-size:.78rem}.smart-insulin-result span{font-size:.69rem;line-height:1.4}.smart-insulin-result.is-block{border-color:rgba(180,35,24,.24);background:rgba(180,35,24,.07);color:#8f1d15}.smart-insulin-result.is-manual_review{border-color:rgba(181,71,8,.24);background:rgba(181,71,8,.07);color:#8b3a09}.smart-insulin-result.is-caution{border-color:rgba(180,120,0,.22);background:rgba(245,158,11,.08);color:#7a4d00}
      .smart-insulin-sources{display:flex;flex-wrap:wrap;gap:8px}.smart-insulin-sources a{font-size:.66rem;font-weight:800;color:#0d5f63;text-decoration:underline;text-underline-offset:2px}.smart-insulin-actions{display:flex;gap:8px;justify-content:flex-end}.smart-insulin-actions button{min-height:40px;border-radius:10px;padding:0 12px;font:inherit;font-size:.71rem;font-weight:850;cursor:pointer}.smart-insulin-copy{border:0;background:#0d5f63;color:#fff}.smart-insulin-reset{border:1px solid #d0d5dd;background:#fff;color:#344054}
      [data-theme="dark"] .smart-insulin-card{background:#1b292c;color:#edf4f4}[data-theme="dark"] .smart-insulin-head,[data-theme="dark"] .smart-insulin-check{border-color:rgba(255,255,255,.09)}[data-theme="dark"] .smart-insulin-checks,[data-theme="dark"] .smart-insulin-field input{border-color:rgba(255,255,255,.14);background:#223437;color:#fff}[data-theme="dark"] .smart-insulin-meta,[data-theme="dark"] .smart-insulin-check small{color:#aab9bb}[data-theme="dark"] .smart-insulin-reset,[data-theme="dark"] .smart-insulin-close{background:#223437;color:#edf4f4;border-color:rgba(255,255,255,.12)}
      @media(max-width:640px){.smart-insulin-modal{padding:8px;align-items:end}.smart-insulin-card{border-radius:18px 18px 0 0;max-height:92vh}.smart-insulin-actions{display:grid;grid-template-columns:1fr 1fr}.smart-insulin-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function profileForRow(row) {
    const text = clean(row?.textContent).toLowerCase();
    if (!text) return null;
    return Object.values(PROFILES).find(profile => text.includes(profile.tradeName.toLowerCase())) || null;
  }

  function enhanceRows() {
    scheduled = false;
    document.querySelectorAll('#tbody > tr').forEach(row => {
      if (row.querySelector('.empty-state')) return;
      const profile = profileForRow(row);
      if (!profile) return;
      const cell = row.querySelector(`[data-registry-dose-calculator-column="${COLUMN_KEY}"]`);
      if (!(cell instanceof HTMLElement)) return;
      if (cell.querySelector('.dose-calculator-open') || cell.querySelector('.smart-insulin-open')) return;
      if (/duke|ngark/i.test(clean(cell.textContent))) return;
      cell.className = 'registry-dose-calculator-column dose-table-cell-ready smart-insulin-cell';
      cell.dataset.registryDoseCalculatorColumn = COLUMN_KEY;
      cell.dataset.registryColumnKey = COLUMN_KEY;
      cell.dataset.label = 'Doza';
      cell.innerHTML = `<span class="dose-calculator-group dose-calculator-group-pediatric_and_adult">${esc(profile.ageLabel.toUpperCase())}</span><button type="button" class="smart-insulin-open" data-smart-insulin-key="${esc(profile.registryNumber)}">Kalkulo</button>`;
      row.classList.add('has-all-ages-dose-calculator','has-parenteral-dose-calculator');
      row.dataset.smartInsulinAvailable = 'true';
    });
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhanceRows);
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'smartInsulinModal';
    modal.className = 'smart-insulin-modal';
    modal.hidden = true;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','smartInsulinTitle');
    modal.innerHTML = `<section class="smart-insulin-card"><div class="smart-insulin-head"><div><div class="smart-insulin-kicker">Smart insulin · clinician check</div><h2 id="smartInsulinTitle" data-smart-title></h2><div class="smart-insulin-meta" data-smart-meta></div></div><button type="button" class="smart-insulin-close" aria-label="Mbyll">×</button></div><div class="smart-insulin-body"><div class="smart-insulin-notice">Ky modul <strong>nuk iniciuon, nuk konverton dhe nuk titron dozën e insulinës</strong>. Përdoret për kontroll të shpejtë të një regjimi që është përcaktuar tashmë nga klinicisti.</div><div class="smart-insulin-field"><label for="smartInsulinAge">Mosha e pacientit (vjet)</label><input id="smartInsulinAge" type="number" min="0" max="130" step="0.1" inputmode="decimal" autocomplete="off" data-smart-age></div><div class="smart-insulin-checks" data-smart-checks></div><div class="smart-insulin-result" data-smart-result aria-live="polite"></div><div class="smart-insulin-sources" data-smart-sources></div><div class="smart-insulin-actions"><button type="button" class="smart-insulin-reset">Pacient i ri</button><button type="button" class="smart-insulin-copy">Kopjo kontrollin</button></div></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector('.smart-insulin-close').addEventListener('click', closeModal);
    modal.querySelector('.smart-insulin-reset').addEventListener('click', resetModal);
    modal.querySelector('.smart-insulin-copy').addEventListener('click', copySummary);
    modal.querySelector('[data-smart-age]').addEventListener('input', evaluate);
    modal.querySelector('[data-smart-checks]').addEventListener('change', evaluate);
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
    return modal;
  }

  function checkMarkup(check) {
    const badge = check.severity === 'block' ? 'BLOCK' : check.severity === 'manual_review' ? 'MANUAL REVIEW' : check.severity === 'caution' ? 'KUJDES' : 'INFO';
    return `<label class="smart-insulin-check"><input type="checkbox" data-smart-check data-check-key="${esc(check.key)}"><span><strong>${esc(check.label)}</strong><small>${esc(badge)} · ${esc(check.message)}</small></span></label>`;
  }

  function openModal(profile) {
    activeProfile = profile;
    const root = ensureModal();
    root.querySelector('[data-smart-title]').textContent = profile.tradeName;
    root.querySelector('[data-smart-meta]').textContent = `${profile.activeSubstance} · ${profile.atcCode} · ${profile.strength} · ${profile.form} · ${profile.route}`;
    root.querySelector('[data-smart-checks]').innerHTML = profile.checks.map(checkMarkup).join('');
    root.querySelector('[data-smart-sources]').innerHTML = profile.sources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)}</a>`).join('');
    root.querySelector('[data-smart-age]').value = '';
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    evaluate();
    setTimeout(() => root.querySelector('[data-smart-age]')?.focus(), 0);
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    activeProfile = null;
  }

  function resetModal() {
    if (!modal) return;
    modal.querySelector('[data-smart-age]').value = '';
    modal.querySelectorAll('[data-smart-check]').forEach(input => { input.checked = false; });
    evaluate();
    modal.querySelector('[data-smart-age]')?.focus();
  }

  function selectedChecks() {
    if (!modal || !activeProfile) return [];
    const selected = new Set(Array.from(modal.querySelectorAll('[data-smart-check]:checked')).map(input => input.dataset.checkKey));
    return activeProfile.checks.filter(check => selected.has(check.key));
  }

  function ageGate() {
    if (!modal || !activeProfile) return null;
    const raw = modal.querySelector('[data-smart-age]')?.value;
    if (raw === '') return { severity:'manual_review', label:'Shkruaj moshën', message:'Mosha kërkohet para kontrollit të regjimit.' };
    const years = Number(raw);
    if (!Number.isFinite(years) || years < 0 || years > 130) return { severity:'block', label:'Moshë e pavlefshme', message:'Kontrollo moshën e pacientit.' };
    if (years * 12 < activeProfile.minAgeMonths) return { severity:'manual_review', label:'Jashtë grupmoshës së workflow-t', message:`Ky smart workflow është konfiguruar për ${activeProfile.ageLabel}. Kërko vlerësim specialistik.` };
    return null;
  }

  function evaluate() {
    if (!modal || !activeProfile) return;
    const items = selectedChecks();
    const gate = ageGate();
    if (gate) items.push(gate);
    items.sort((a,b) => (PRIORITY[a.severity] ?? 9) - (PRIORITY[b.severity] ?? 9));
    const highest = items[0] || null;
    const result = modal.querySelector('[data-smart-result]');
    if (!highest) {
      result.className = 'smart-insulin-result';
      result.innerHTML = '<strong>Pa red flags të zgjedhura</strong><span>Vazhdo vetëm me regjimin e përshkruar dhe monitorimin e pacientit. Doza nuk llogaritet automatikisht.</span>';
      return;
    }
    result.className = `smart-insulin-result is-${highest.severity}`;
    const title = highest.severity === 'block' ? 'STOP / BLOCK' : highest.severity === 'manual_review' ? 'Kërkohet manual review' : 'Kujdes';
    result.innerHTML = `<strong>${esc(title)} · ${esc(highest.label)}</strong><span>${esc(highest.message)}</span>`;
  }

  async function copySummary() {
    if (!modal || !activeProfile) return;
    const age = clean(modal.querySelector('[data-smart-age]')?.value) || '—';
    const flags = selectedChecks();
    const lines = [
      `${activeProfile.tradeName} — Smart insulin check`,
      `Mosha: ${age} vjet`,
      `Route: ${activeProfile.route}`,
      `Red flags: ${flags.length ? flags.map(flag => flag.label).join('; ') : 'Asnjë e zgjedhur'}`,
      'Doza: sipas regjimit individual të përcaktuar nga klinicisti; nuk është llogaritur automatikisht.',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      const button = modal.querySelector('.smart-insulin-copy');
      const old = button.textContent;
      button.textContent = 'U kopjua ✓';
      setTimeout(() => { button.textContent = old; }, 1200);
    } catch (_) {}
  }

  function start() {
    ensureStyles();
    ensureModal();
    const tbody = document.getElementById('tbody');
    if (tbody && !observer) {
      observer = new MutationObserver(scheduleEnhance);
      observer.observe(tbody, { childList:true, subtree:true });
      tbody.addEventListener('click', event => {
        const button = event.target.closest('.smart-insulin-open');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const profile = PROFILES[clean(button.dataset.smartInsulinKey)];
        if (profile) openModal(profile);
      });
    }
    scheduleEnhance();
    document.documentElement.dataset.smartInsulin = VERSION;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.MedIndexSmartInsulin = Object.freeze({
    version:VERSION,
    profiles:PROFILES,
    refresh:scheduleEnhance,
  });
})();
