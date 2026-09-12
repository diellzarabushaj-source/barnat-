(() => {
  'use strict';

  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  const liquids = window.DRX_ANTIBIOTIC_FORMULATIONS;
  const solids = window.DRX_ANTIBIOTIC_SOLIDS;
  const hospital = window.DRX_ANTIBIOTIC_HOSPITAL;
  if (!guide) return;

  const audit = {
    version:'2026-09-12-clinical-hardening-v1',
    scope:'12 outpatient diagnoses + linked hospital IV/IM pathways',
    sourcePolicy:'Current diagnosis pathway controls clinical dosing; exact product label controls formulation/preparation.',
    restrictedCustomDrugs:['Amoxicillin / clavulanate','Trimethoprim / sulfamethoxazole','Ciprofloxacin','Levofloxacin'],
    renalSensitiveHospitalRegimens:['H004','H006','H007','H009','H010','H013','H014','H015','H016'],
  };
  window.DRX_ANTIBIOTIC_CLINICAL_AUDIT = Object.freeze(audit);

  const indication = id => (guide.indications || []).find(item => item.id === id) || null;
  const option = (dxId, optionId) => indication(dxId)?.options?.find(item => item.id === optionId) || null;

  function appendNote(item, text) {
    if (!item) return;
    item.note = item.note ? `${item.note} ${text}` : text;
  }

  function patchClinicalData() {
    const sinusitis = indication('sinusitis');
    if (sinusitis) {
      sinusitis.minAgeMonths = 12;

      const levo = option('sinusitis', 'levo-sinusitis');
      if (levo) {
        levo.minAgeMonths = 6;
        levo.dose = { type:'fixed', text:'10 mg/kg/dozë · 6 muaj–5 vjeç: q12h · >5 vjeç: q24h · maks. 500 mg/ditë' };
        levo.frequency = 'sipas moshës';
        levo.frequencyNotComputable = true;
        levo.note = 'Rezervë për reaksion të rëndë të vonshëm ndaj beta-laktameve. Formula është age-dependent dhe nuk finalizohet automatikisht nga DRx; Children’s Mercy: 10 mg/kg/dozë, BID 6 muaj–5 vjeç ose q24h >5 vjeç, maks. 500 mg/ditë.';
      }

      if (!sinusitis.options.some(item => item.id === 'cefuroxime-sinusitis')) {
        const insertAt = Math.max(0, sinusitis.options.findIndex(item => item.id === 'levo-sinusitis'));
        sinusitis.options.splice(insertAt, 0, {
          id:'cefuroxime-sinusitis', tier:'allergy-low', allergy:['a1','a2'], drug:'Cefuroxime', route:'PO',
          frequency:'2 herë/ditë', dose:{ type:'fixed', text:'250 mg/dozë' }, duration:{ type:'fixed', text:'5–7 ditë' },
          source:'cm2026', conditional:'Vetëm për fëmijë që mund të gëlltisin tabletën; alternativë e listuar nga pathway i Children’s Mercy.'
        });
      }

      if (!sinusitis.options.some(item => item.id === 'cefixime-clinda-sinusitis')) {
        const insertAt = Math.max(0, sinusitis.options.findIndex(item => item.id === 'levo-sinusitis'));
        sinusitis.options.splice(insertAt, 0, {
          id:'cefixime-clinda-sinusitis', tier:'allergy-low', allergy:['a1','a2'], drug:'Cefixime + Clindamycin', route:'PO',
          frequency:'kombinim',
          dose:{
            type:'combo',
            parts:[
              { drug:'Cefixime', frequency:'2 herë/ditë', dose:{ type:'single', value:4, unit:'mg/kg/dozë', maxDose:200 } },
              { drug:'Clindamycin', frequency:'3 herë/ditë', dose:{ type:'single', value:10, unit:'mg/kg/dozë', maxDose:600 } },
            ]
          },
          duration:{ type:'fixed', text:'5–7 ditë' }, source:'cm2026',
          conditional:'Alternativë e listuar nga pathway; jepen TË DYJA barnat.'
        });
      }
    }

    ['uti-cystitis','uti-pyelo'].forEach(id => {
      const dx = indication(id);
      if (dx) dx.minAgeMonths = 1;
    });

    const nitro = option('uti-cystitis', 'nitro-cystitis');
    if (nitro) {
      nitro.duration = { type:'fixed', text:'5 ditë' };
      appendNote(nitro, 'CPS 2026: kur zgjidhet nitrofurantoin për cistit, përdoret kurs i plotë 5-ditor. Jo për pielonefrit.');
    }

    ['combo-bite-proph','combo-bite-treat'].forEach(id => {
      const bite = option('bite', id);
      const clinda = bite?.dose?.parts?.find(part => part.drug === 'Clindamycin');
      if (clinda?.dose) clinda.dose.maxDose = 450;
    });

    if (liquids?.indicationOverrides) {
      const cps7to1 = {
        allow:['amoxclav-400-57-5'],
        note:'CPS UTI 2026 specifikon formulimin amoxicillin/clavulanate 7:1; DRx përdor 400/57 mg/5 mL si presentation i verifikuar 7:1 dhe llogarit dozën mbi komponentin amoxicillin.'
      };
      liquids.indicationOverrides['uti-cystitis|Amoxicillin / clavulanate'] = { ...cps7to1 };
      liquids.indicationOverrides['uti-pyelo|Amoxicillin / clavulanate'] = { ...cps7to1 };
    }

    if (liquids?.comboAliases) {
      liquids.comboAliases['Cefixime + Clindamycin'] = [
        { drug:'Cefixime', frequency:'2 herë/ditë' },
        { drug:'Clindamycin', frequency:'3 herë/ditë' },
      ];
    }

    if (liquids?.drugs) {
      audit.restrictedCustomDrugs.forEach(drug => {
        if (liquids.drugs[drug]) liquids.drugs[drug].customAllowed = false;
      });
    }

    if (solids?.drugs && !solids.drugs.Cefuroxime) {
      solids.drugs.Cefuroxime = {
        forms:[
          {
            id:'cefuroxime-tab-250', label:'Tabletë 250 mg', form:'tabletë', componentMg:250,
            sourceUrl:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=135e2dfc-eb47-4d04-a903-a081d36c267e',
            caution:'ABRS: përdore vetëm kur fëmija mund të gëlltisë tabletën; skema e pathway është 250 mg PO BID.'
          }
        ]
      };
    }
  }

  patchClinicalData();

  if (typeof document === 'undefined') return;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const ageSelect = document.getElementById('ageSelect');
  const weightInput = document.getElementById('weightInput');
  const recommendationList = document.getElementById('recommendationList');
  const refineBlock = document.getElementById('refineBlock');
  let explicitAge = ageSelect?.dataset?.source === 'chosen' ? ageSelect.value : '';

  function ageIsExplicit() {
    return Boolean(ageSelect?.value) && ageSelect?.dataset?.source !== 'weight';
  }

  function reconcileAgeFromWeight() {
    if (!ageSelect) return;
    const wasDerived = ageSelect.dataset.source === 'weight';
    if (!wasDerived) return;
    ageSelect.value = explicitAge || '';
    ageSelect.dispatchEvent(new Event('change', { bubbles:true }));
  }

  if (ageSelect) {
    if (ageSelect.dataset.source === 'weight') {
      ageSelect.value = '';
      ageSelect.dispatchEvent(new Event('change', { bubbles:true }));
    }
    ageSelect.addEventListener('change', event => {
      if (event.isTrusted) explicitAge = ageSelect.value || '';
      window.setTimeout(updateSafetyUI, 0);
    });
  }
  weightInput?.addEventListener('input', () => window.setTimeout(() => {
    reconcileAgeFromWeight();
    updateSafetyUI();
  }, 0));

  function ensureA4Refinement() {
    if (!refineBlock) return null;
    let wrap = document.getElementById('cephAllergyRefineHardening');
    if (wrap) return wrap;
    wrap = make('div', 'abx-refine-item abx-hardening-refine');
    wrap.id = 'cephAllergyRefineHardening';
    wrap.hidden = true;
    const label = make('label', 'abx-hardening-field');
    label.append(make('span', '', 'Në alergji ndaj cefalosporinës · lloji i reaksionit'));
    const select = document.createElement('select');
    select.id = 'cephAllergyReactionHardening';
    [
      ['', 'Zgjidh reaksionin…'],
      ['low', 'Rrezik i ulët / rash jo-SCAR'],
      ['immediate', 'Urtikarie e menjëhershme / angioedemë / anafilaksi'],
      ['scar', 'SJS / TEN / DRESS / reaksion sistemik i rëndë'],
    ].forEach(([value, text]) => {
      const opt = document.createElement('option'); opt.value = value; opt.textContent = text; select.append(opt);
    });
    label.append(select);
    const note = make('p', 'abx-hardening-note', 'A4 nuk mund të trajtohet si një kategori e vetme për zëvendësim automatik. Reaksionet immediate/SCAR kërkojnë pathway individual të beta-laktameve.');
    wrap.append(label, note);
    refineBlock.append(wrap);
    select.addEventListener('change', updateSafetyUI);
    return wrap;
  }

  function ensureSinusitisAlarmControl() {
    if (!refineBlock) return null;
    let wrap = document.getElementById('sinusitisAlarmHardening');
    if (wrap) return wrap;
    wrap = make('div', 'abx-refine-item abx-hardening-refine');
    wrap.id = 'sinusitisAlarmHardening';
    wrap.hidden = true;
    const label = make('label', 'abx-toggle');
    const input = document.createElement('input');
    input.id = 'sinusitisAlarmInputHardening';
    input.type = 'checkbox';
    label.append(input, make('span', '', 'Ka shenja alarmi / komplikim orbital ose neurologjik'));
    const note = make('p', 'abx-hardening-note', 'Periorbital edema/erythema, diplopia, ophthalmoplegia, ulje e shikimit, cefale e rëndë, frontal swelling, sepsis/meningitis/neurologji → vlerësim urgjent në ED; mos përdor skemën e thjeshtë ambulatore.');
    wrap.append(label, note);
    refineBlock.append(wrap);
    input.addEventListener('change', updateSafetyUI);
    return wrap;
  }

  function currentIndicationId() {
    try { return new URL(location.href).searchParams.get('indication') || guide.indications?.[0]?.id || ''; }
    catch { return guide.indications?.[0]?.id || ''; }
  }

  function currentAllergy() {
    return document.querySelector('input[name="abx-allergy"]:checked')?.value || 'none';
  }

  function ensureHardStop() {
    let node = document.getElementById('antibioticHardeningStop');
    if (node) return node;
    node = make('div', 'abx-hardening-stop');
    node.id = 'antibioticHardeningStop';
    node.hidden = true;
    recommendationList?.parentElement?.insertBefore(node, recommendationList);
    return node;
  }

  function applyA4Gate(stop) {
    const wrap = ensureA4Refinement();
    if (!wrap) return false;
    const active = currentAllergy() === 'a4';
    wrap.hidden = !active;
    if (!active) return false;
    const reaction = document.getElementById('cephAllergyReactionHardening')?.value || '';
    if (reaction === 'low') return false;
    stop.hidden = false;
    stop.replaceChildren(
      make('strong', '', 'STOP — alergjia ndaj cefalosporinës duhet specifikuar'),
      make('span', '', reaction
        ? 'Për reaksion immediate/high-risk ose SCAR, DRx nuk bën zëvendësim automatik të beta-laktamit. Përdor pathway të alergjisë / specialist.'
        : 'Zgjidh llojin e reaksionit para se të përdoret një regjim automatik.')
    );
    return true;
  }

  function applySinusitisGate(stop) {
    const wrap = ensureSinusitisAlarmControl();
    if (!wrap) return false;
    const active = currentIndicationId() === 'sinusitis';
    wrap.hidden = !active;
    const checked = active && document.getElementById('sinusitisAlarmInputHardening')?.checked === true;
    if (!checked) return false;
    stop.hidden = false;
    stop.replaceChildren(
      make('strong', '', 'STOP — dyshim për sinusit të komplikuar'),
      make('span', '', 'Shenjat orbitale/neurologjike ose sepsis kërkojnë vlerësim urgjent spitalor. Mos përdor kalkulatorin ambulant si trajtim final.')
    );
    return true;
  }

  function updateAtypicalSafety() {
    const toggle = document.getElementById('atypicalInput');
    const wrap = document.getElementById('atypicalWrap');
    if (wrap) {
      const text = wrap.querySelector('span');
      if (text) text.textContent = 'Shfaq vetëm skemën për patogjen atipik';
    }
    let note = document.getElementById('atypicalSafetyHardening');
    if (!note && recommendationList?.parentElement) {
      note = make('p', 'abx-hardening-atypical');
      note.id = 'atypicalSafetyHardening';
      recommendationList.parentElement.insertBefore(note, recommendationList);
    }
    if (!note) return;
    const active = currentIndicationId() === 'pneumonia' && toggle?.checked === true;
    note.hidden = !active;
    if (active) note.textContent = 'Ky filtër shfaq skemën për patogjen atipik. Azithromycin nuk duhet interpretuar automatikisht si zëvendësim i mbulimit për pneumoni tipike kur të dyja janë klinikisht të mundshme.';
  }

  function hardenCustomFormulations() {
    const restricted = new Set(audit.restrictedCustomDrugs);
    document.querySelectorAll('.abx-formulation').forEach(node => {
      const drug = node.dataset.drug || '';
      if (!restricted.has(drug)) return;
      const select = node.querySelector('.abx-formulation-select');
      const custom = select?.querySelector('option[value="custom"]');
      if (custom) custom.remove();
      if (select && select.value === 'custom' && select.options.length) {
        select.value = select.options[0].value;
        select.dispatchEvent(new Event('change', { bubbles:true }));
      }
      const customWrap = node.querySelector('.abx-formulation-custom');
      if (customWrap) customWrap.hidden = true;
      if (!node.querySelector('.abx-hardening-product-note')) {
        node.append(make('p', 'abx-hardening-product-note', 'Për këtë bar DRx lejon vetëm presentation të verifikuar; “fuqi custom” është bllokuar për të mos anashkaluar raportin e kombinimit ose kufizimin product-specific.'));
      }
    });
  }

  function ensureRenalControl() {
    const body = document.querySelector('#hospitalModule .abx-hospital-body');
    if (!body) return null;
    let wrap = document.getElementById('renalGateHardening');
    if (wrap) return wrap;
    wrap = make('div', 'abx-hardening-renal');
    wrap.id = 'renalGateHardening';
    const label = make('label', 'abx-hardening-field');
    label.append(make('span', '', 'Funksioni renal para dozës IV/IM'));
    const select = document.createElement('select');
    select.id = 'renalStatusHardening';
    [
      ['', 'Zgjidh…'],
      ['normal', 'Normal / pa dëmtim renal të njohur'],
      ['impaired', 'I dëmtuar / kërkon përshtatje'],
      ['unknown', 'I panjohur'],
    ].forEach(([value, text]) => { const o=document.createElement('option'); o.value=value; o.textContent=text; select.append(o); });
    label.append(select);
    wrap.append(label, make('p', 'abx-hardening-note', 'DRx nuk prodhon renal-adjusted dose në këtë modul. Regjimet me eliminim renal bllokohen si dozë finale kur funksioni renal nuk është konfirmuar normal.'));
    body.insertBefore(wrap, body.firstChild);
    select.addEventListener('change', hardenHospitalCards);
    return wrap;
  }

  function setCardGate(card, message) {
    let gate = card.querySelector('.abx-hardening-card-gate');
    if (!gate) {
      gate = make('div', 'abx-hardening-card-gate');
      card.insertBefore(gate, card.firstChild?.nextSibling || card.firstChild);
    }
    const dose = card.querySelector('.abx-hosp-dose');
    if (message) {
      card.classList.add('is-clinically-blocked');
      gate.hidden = false;
      gate.textContent = message;
      if (dose) dose.hidden = true;
      card.querySelectorAll('input, select, button').forEach(control => {
        if (control.closest('#renalGateHardening')) return;
        if (!control.disabled) control.dataset.drxHardeningDisabled = '1';
        control.disabled = true;
      });
    } else {
      card.classList.remove('is-clinically-blocked');
      gate.hidden = true;
      if (dose) dose.hidden = false;
      card.querySelectorAll('[data-drx-hardening-disabled="1"]').forEach(control => {
        control.disabled = false;
        delete control.dataset.drxHardeningDisabled;
      });
    }
  }

  function hardenHospitalCards() {
    ensureRenalControl();
    if (!hospital?.regimens) return;
    const renalStatus = document.getElementById('renalStatusHardening')?.value || '';
    const renalSensitive = new Set(audit.renalSensitiveHospitalRegimens);
    document.querySelectorAll('#hospitalList .abx-hosp-card').forEach(card => {
      const regimen = hospital.regimens.find(item => item.id === card.dataset.regimenId);
      if (!regimen) return;
      let message = '';
      if (Number.isFinite(regimen.minAgeMonths) && !ageIsExplicit()) {
        message = `Zgjidh moshën reale para finalizimit të kësaj skeme (prag ≥${regimen.minAgeMonths} muaj). Pesha nuk përdoret si zëvendësim i moshës.`;
      } else if (renalSensitive.has(regimen.id) && renalStatus !== 'normal') {
        message = renalStatus === 'impaired'
          ? 'STOP — ky regjim kërkon renal-adjusted dosing / interval. Moduli i përgjithshëm nuk jep dozë finale në dëmtim renal.'
          : 'Konfirmo funksionin renal para finalizimit të kësaj skeme IV/IM.';
      }
      setCardGate(card, message);
    });
  }

  function updateSafetyUI() {
    const stop = ensureHardStop();
    if (stop) {
      stop.hidden = true;
      stop.replaceChildren();
      const blocked = applyA4Gate(stop) || applySinusitisGate(stop);
      if (recommendationList) recommendationList.hidden = blocked;
      const hospitalModule = document.getElementById('hospitalModule');
      if (hospitalModule && currentAllergy() === 'a4' && blocked) hospitalModule.hidden = true;
    }
    updateAtypicalSafety();
    hardenCustomFormulations();
    hardenHospitalCards();

    const ageHint = document.getElementById('ageHint');
    if (ageHint && !ageIsExplicit()) ageHint.textContent = 'Mosha klinike duhet zgjedhur veçmas. Pesha mund të japë vetëm një sugjerim orientues dhe nuk zhbllokon age-gates.';
  }

  document.addEventListener('change', event => {
    if (event.target?.matches?.('input[name="abx-allergy"], #atypicalInput, #ageSelect, #sinusitisAlarmInputHardening')) {
      window.setTimeout(updateSafetyUI, 0);
    }
  });

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => window.setTimeout(updateSafetyUI, 0));
    if (recommendationList) observer.observe(recommendationList, { childList:true, subtree:true });
    const hospitalModule = document.getElementById('hospitalModule');
    if (hospitalModule) observer.observe(hospitalModule, { childList:true, subtree:true });
  }

  window.addEventListener('drx:antibiotics-hospital-rendered', () => window.setTimeout(updateSafetyUI, 0));
  window.DRX_ANTIBIOTIC_CLINICAL_AUDIT.refresh = updateSafetyUI;
  window.setTimeout(() => {
    if (ageSelect?.dataset?.source === 'weight') reconcileAgeFromWeight();
    ageSelect?.dispatchEvent(new Event('change', { bubbles:true }));
    updateSafetyUI();
  }, 0);
})();