(() => {
  'use strict';

  const VERSION = 'registry-insulin-smart-v1.1.0';
  const PRODUCTS = Object.freeze({
    '2508': { name:'NovoRapid Flex Pen', substance:'Insulin aspart', atc:'A10AB05', strength:'100 U/1 mL', kind:'MEAL/CORRECTION', classLabel:'Rapid-acting', source:'https://www.ema.europa.eu/en/medicines/human/EPAR/novorapid' },
    '2509': { name:'NovoMix30 FlexPen', substance:'Insulin aspart 30% soluble + 70% protamine-crystallised', atc:'A10AD05', strength:'100 U/1 mL', kind:'PREMIX', classLabel:'Premix 30/70', source:'https://cima.aemps.es/cima/dochtml/ft/00142009/FT_00142009.html' },
    '2510': { name:'Ryzodeg', substance:'Insulin degludec; Insulin aspart', atc:'A10AD06', strength:'100 U/mL', kind:'CO-FORMULATION', classLabel:'Basal + rapid co-formulation', source:'https://www.ema.europa.eu/en/medicines/human/EPAR/ryzodeg' },
    '2511': { name:'Levemir FlexPen', substance:'Insulin detemir', atc:'A10AE05', strength:'100 U/1 mL', kind:'BASAL', classLabel:'Basal / long-acting', source:'https://www.ema.europa.eu/en/medicines/human/EPAR/levemir' },
    '2512': { name:'Tresiba', substance:'Insulin degludec', atc:'A10AE06', strength:'100 U/mL', kind:'BASAL', classLabel:'Basal / ultra-long', source:'https://www.ema.europa.eu/en/medicines/human/EPAR/tresiba' },
    '2965': { name:'APIDRA SOLOSTAR', substance:'Insulin glulisine', atc:'A10AB06', strength:'100 IU/1 mL', kind:'MEAL/CORRECTION', classLabel:'Rapid-acting', source:'https://www.ema.europa.eu/en/medicines/human/EPAR/apidra' },
    '3730': { name:'Semglee', substance:'Insulin glargine', atc:'A10AE04', strength:'100 Units/mL', kind:'BASAL', classLabel:'Basal / long-acting', source:'https://www.ema.europa.eu/en/medicines/human/EPAR/semglee' },
  });

  const FLOW_FIELDS = Object.freeze({
    'MEAL/CORRECTION': [
      ['current_glucose','Glukoza aktuale','number',''],
      ['target_glucose','Targeti i aprovuar','number',''],
      ['carbohydrates','Karbohidratet e planifikuara','number',''],
      ['icr','ICR i aprovuar nga klinicisti','text','Mos e derivoni automatikisht'],
      ['isf','ISF i aprovuar nga klinicisti','text','Mos e derivoni automatikisht'],
      ['last_bolus','Bolusi i fundit / insulin-on-board','text','Koha dhe konteksti klinik'],
      ['meal_timing','Koha e vaktit','text','Para / gjatë / pas vaktit'],
    ],
    'CO-FORMULATION': [
      ['current_regimen','Regjimi aktual','text','Përfshi insulinën e mëparshme'],
      ['meal_pattern','Modeli i vakteve','text','Vakti/vaktet ku përdoret preparati'],
      ['glucose_trend','Trendi i glukozës','text','Fasting + pre/post-meal sipas rastit'],
      ['switch_context','Po bëhet switch?','text','Nëse po, kërko protokoll të verifikuar'],
    ],
    BASAL: [
      ['current_basal','Regjimi bazal aktual','text','Produkti, doza e përshkruar dhe orari'],
      ['fasting_trend','Trendi i glukozës esëll','text','Trend disa-ditor sipas protokollit'],
      ['nocturnal_hypo','Hipoglikemi nokturne?','text','Po / Jo / E panjohur'],
      ['recent_change','Ndryshimi i fundit i dozës','text','Kur dhe pse është ndryshuar'],
    ],
  });

  const SAFETY = Object.freeze([
    { key:'allergy', label:'Hipersensitivitet ndaj insulinës ose përbërësve të preparatit?', severity:'block', action:'Mos e përdor preparatin; kërko alternativë dhe vlerësim klinik.' },
    { key:'hypoglycaemia', label:'Hipoglikemi aktuale ose e dyshuar?', severity:'block', action:'Mos vazhdo me kalkulim. Trajto/stabilizo hipoglikeminë dhe rivlerëso më pas.' },
    { key:'dka', label:'Ketone / dyshim për DKA / dehidrim të rëndësishëm?', severity:'manual_review', action:'Kërko vlerësim urgjent dhe protokoll specifik; mos përdor kalkulator rutinë.' },
    { key:'severe_hypo', label:'Hipoglikemi e rëndë ose e përsëritur së fundi?', severity:'manual_review', action:'Rishiko regjimin dhe targetet para çdo ndryshimi.' },
    { key:'renal_hepatic', label:'Dëmtim renal/hepatik ose ndryshim akut i funksionit?', severity:'manual_review', action:'Kërko vlerësim individual të nevojës për insulinë.' },
    { key:'illness', label:'Sëmundje akute, infeksion, marrje e ulët ushqimi ose aktivitet i pazakontë?', severity:'manual_review', action:'Përdor protokollin individual/sick-day, jo titrim rutinë.' },
    { key:'switch', label:'Po ndërrohet insulinë, pajisje, koncentrim ose regjim?', severity:'manual_review', action:'Kërko protokoll të verifikuar për switching dhe medication reconciliation.' },
    { key:'pregnancy', label:'Shtatzëni ose periudhë e menjëhershme postpartum?', severity:'manual_review', action:'Përdor targete dhe protokoll specifik për shtatzëni/postpartum.' },
  ]);

  const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
  const esc = value => clean(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = value => { const n = Number(String(value ?? '').replace(',','.')); return Number.isFinite(n) ? n : null; };
  let modal = null;
  let activeProduct = null;
  let lastFocus = null;
  let observer = null;

  function headerIndex() {
    const map = new Map();
    document.querySelectorAll('#headerRow > th').forEach((th, index) => {
      const text = clean(th.textContent).replace(/[▲▼↕]/g,'').trim();
      if (text && !map.has(text)) map.set(text,index);
    });
    return map;
  }

  function registryNumberForRow(row, map) {
    const idx = map.get('Nr');
    if (Number.isInteger(idx)) return clean(row.children[idx]?.textContent);
    return clean(row.querySelector('.drug-select')?.dataset.registryNumber);
  }

  function ensureButtons() {
    const map = headerIndex();
    document.querySelectorAll('#tbody > tr').forEach(row => {
      if (row.querySelector('.empty-state')) return;
      const nr = registryNumberForRow(row,map);
      const product = PRODUCTS[nr];
      const cell = row.querySelector('[data-registry-dose-calculator-column="dose-calculator"]');
      if (!cell || !product || cell.querySelector('[data-insulin-smart-open]')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'insulin-smart-cell';
      wrapper.innerHTML = `<span class="insulin-smart-badge">INSULIN</span><button type="button" class="insulin-smart-open" data-insulin-smart-open="${esc(nr)}">Insulin Smart</button>`;
      if (!cell.querySelector('.dose-calculator-open')) cell.replaceChildren(wrapper);
      else cell.appendChild(wrapper);
    });
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'insulin-smart-modal';
    modal.hidden = true;
    modal.id = 'insulinSmartModal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','insulinSmartTitle');
    modal.innerHTML = `<div class="insulin-smart-backdrop" data-insulin-smart-close></div><section class="insulin-smart-card" tabindex="-1"><header class="insulin-smart-head"><div><span class="insulin-smart-kicker">SMART INSULIN · FAIL-CLOSED</span><h2 id="insulinSmartTitle">Insulin Smart</h2><p data-insulin-smart-subtitle></p></div><button type="button" class="insulin-smart-close" data-insulin-smart-close aria-label="Mbyll">×</button></header><div class="insulin-smart-grid"><section class="insulin-smart-section"><div class="insulin-smart-product" data-insulin-smart-product></div><div class="insulin-smart-fields" data-insulin-smart-fields></div></section><section class="insulin-smart-section insulin-smart-safety"><div class="insulin-smart-section-title"><strong>Safety gate</strong><span>Po = aktiv</span></div><div data-insulin-smart-safety></div></section></div><div class="insulin-smart-state" data-insulin-smart-state aria-live="polite"></div><footer class="insulin-smart-foot"><a data-insulin-smart-source target="_blank" rel="noopener noreferrer">Burimi zyrtar</a><button type="button" class="insulin-smart-reset" data-insulin-smart-reset>Pacient i ri</button></footer></section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target.closest('[data-insulin-smart-close]')) close();
      if (event.target.closest('[data-insulin-smart-reset]')) reset();
    });
    modal.addEventListener('change', event => {
      if (event.target.matches('[data-novomix-workflow]')) syncNovoMixFields();
      updateState();
    });
    modal.addEventListener('input', updateState);
    document.addEventListener('keydown', event => { if (!modal.hidden && event.key === 'Escape') close(); });
    return modal;
  }

  function fieldMarkup([key,label,type,hint]) {
    return `<label class="insulin-smart-field"><span>${esc(label)}</span><input type="${type}" data-insulin-smart-input="${esc(key)}" autocomplete="off"><small>${esc(hint)}</small></label>`;
  }

  function safetyMarkup(item) {
    return `<label class="insulin-smart-check"><input type="checkbox" data-insulin-smart-safety-check data-severity="${esc(item.severity)}" data-action="${esc(item.action)}"><span><strong>${esc(item.label)}</strong><small>${item.severity === 'block' ? 'BLOCK' : 'MANUAL REVIEW'}</small></span></label>`;
  }

  function novoMixBaseMarkup() {
    return `<label class="insulin-smart-field"><span>Mosha</span><input type="number" min="0" step="1" inputmode="decimal" data-novomix-age autocomplete="off"><small>NovoMix30: kalkulatori ≥10 vjeç</small></label><label class="insulin-smart-field"><span>Çfarë po bën?</span><select data-novomix-workflow><option value="">Zgjidhe</option><option value="init">Fillim T2D</option><option value="titrate">Titrim javor T2D</option><option value="t1d">T1D — referencë TDD</option><option value="switch">Switch nga insulinë njerëzore bifazike</option></select><small>Shfaqen vetëm fushat e nevojshme</small></label><div data-novomix-dynamic class="insulin-smart-dynamic"></div>`;
  }

  function syncNovoMixFields() {
    if (!modal || activeProduct?.kind !== 'PREMIX') return;
    const workflow = modal.querySelector('[data-novomix-workflow]')?.value;
    const host = modal.querySelector('[data-novomix-dynamic]');
    if (!host) return;
    if (workflow === 'titrate') host.innerHTML = `<label class="insulin-smart-field"><span>Doza aktuale që po rishikohet</span><input type="number" min="1" max="60" step="1" inputmode="numeric" data-novomix-current-dose><small>U për injeksion</small></label><label class="insulin-smart-field"><span>Regjimi</span><select data-novomix-regimen><option value="">Zgjidhe</option><option value="od">1×/ditë</option><option value="bid">2×/ditë</option><option value="tid">3×/ditë</option></select><small>Doza paraprake vlerësohet nga glukoza pre-meal</small></label><label class="insulin-smart-field"><span>Vlera më e ulët pre-meal, 3 ditët e fundit</span><input type="number" min="0" step="0.1" inputmode="decimal" data-novomix-glucose><small>Jo mesatarja — vlera më e ulët</small></label><label class="insulin-smart-field"><span>Njësia e glukozës</span><select data-novomix-glucose-unit><option value="mmol">mmol/L</option><option value="mg">mg/dL</option></select><small>Tabela SmPC mbështet të dyja</small></label><label class="insulin-smart-field"><span>Ditë nga ndryshimi i fundit</span><input type="number" min="0" step="1" inputmode="numeric" data-novomix-days><small>Titrimi: një herë në javë</small></label><label class="insulin-smart-check"><input type="checkbox" data-novomix-hypo3><span><strong>Ka pasur hipoglikemi në këto 3 ditë?</strong><small>NO INCREASE</small></span></label>`;
    else if (workflow === 't1d') host.innerHTML = `<label class="insulin-smart-field"><span>Pesha reale</span><input type="number" min="1" step="0.1" inputmode="decimal" data-novomix-weight><small>kg</small></label>`;
    else if (workflow === 'switch') host.innerHTML = `<label class="insulin-smart-field"><span>Doza aktuale e insulinës bifazike</span><input type="number" min="1" step="1" inputmode="numeric" data-novomix-switch-dose><small>U për dozë</small></label><label class="insulin-smart-field"><span>Regjimi aktual</span><input type="text" data-novomix-switch-regimen placeholder="p.sh. 2×/ditë"><small>Ruhet i njëjti regjim fillestar; pastaj individualizohet</small></label>`;
    else host.innerHTML = '';
  }

  function render(product) {
    ensureModal();
    activeProduct = product;
    modal.querySelector('#insulinSmartTitle').textContent = product.name;
    modal.querySelector('[data-insulin-smart-subtitle]').textContent = `${product.classLabel} · ${product.atc} · ${product.strength}`;
    modal.querySelector('[data-insulin-smart-product]').innerHTML = `<strong>${esc(product.substance)}</strong><span>Route: SC</span><span>Flow: ${esc(product.kind)}</span><span>${product.kind === 'PREMIX' ? 'FlexPen: 1–60 U, hapa 1 U · menjëherë para ose pak pas vaktit' : 'Status: kërkohet protokoll i verifikuar për dozë/titrim'}</span>`;
    const fields = modal.querySelector('[data-insulin-smart-fields]');
    fields.innerHTML = product.kind === 'PREMIX' ? novoMixBaseMarkup() : (FLOW_FIELDS[product.kind] || []).map(fieldMarkup).join('');
    const applicableSafety = [...SAFETY];
    if (product.kind === 'MEAL/CORRECTION') applicableSafety.push({ key:'iob', label:'Bolus i fundit / insulin-on-board është i paqartë?', severity:'manual_review', action:'Mos bëj correction automatik pa e qartësuar insulinën aktive.' });
    if (product.kind === 'PREMIX') {
      applicableSafety.push({ key:'pump', label:'Po planifikohet përdorim në pompë ose rrugë jo-SC?', severity:'block', action:'NovoMix30 FlexPen është vetëm SC dhe nuk përdoret në pompë. Blloko administrimin.' });
      applicableSafety.push({ key:'meal', label:'Vakti është shtyrë/anuluar ose marrja ushqimore është e pasigurt?', severity:'manual_review', action:'NovoMix30 lidhet ngushtë me vaktin; rivlerëso para injektimit.' });
      applicableSafety.push({ key:'suspension', label:'Pas resuspensionit preparati nuk është uniformisht i bardhë/turbullt?', severity:'manual_review', action:'Mos e përdor pen-in derisa handling-u dhe pamja e suspensionit të jenë të përshtatshme.' });
    } else if (['MEAL/CORRECTION','CO-FORMULATION'].includes(product.kind)) applicableSafety.push({ key:'meal', label:'Vakti është shtyrë, anuluar ose marrja e karbohidrateve është e pasigurt?', severity:'manual_review', action:'Rivlerëso para përdorimit të flow-it të vaktit.' });
    modal.querySelector('[data-insulin-smart-safety]').innerHTML = applicableSafety.map(safetyMarkup).join('');
    modal.querySelector('[data-insulin-smart-source]').href = product.source;
    syncNovoMixFields();
    updateState();
  }

  function genericSafetyState() {
    const checked = Array.from(modal.querySelectorAll('[data-insulin-smart-safety-check]:checked'));
    const block = checked.find(input => input.dataset.severity === 'block');
    if (block) return { level:'block', title:'BLOCK', text:block.dataset.action };
    const manual = checked.find(input => input.dataset.severity === 'manual_review');
    if (manual) return { level:'manual', title:'MANUAL REVIEW', text:manual.dataset.action };
    return null;
  }

  function titrationAdjustment(mmol) {
    if (mmol < 4.4) return -2;
    if (mmol <= 6.1) return 0;
    if (mmol <= 7.8) return 2;
    if (mmol <= 10) return 4;
    return 6;
  }

  function novoMixState() {
    const safety = genericSafetyState();
    if (safety) return safety;
    const age = num(modal.querySelector('[data-novomix-age]')?.value);
    if (age === null) return { level:'manual', title:'SHKRUAJ MOSHËN', text:'Mosha nevojitet për kontrollin e përdorimit të NovoMix30.' };
    if (age < 10) return { level:'block', title:'BLOCK · <10 VJEÇ', text:'Kalkulatori NovoMix30 nuk aplikohet nën 10 vjeç. Kërko vlerësim specialistik dhe informacion produkt-specifik.' };
    const workflow = modal.querySelector('[data-novomix-workflow]')?.value;
    if (!workflow) return { level:'manual', title:'ZGJIDH RRJEDHËN', text:'Zgjidh Fillim T2D, Titrim, T1D referencë ose Switch.' };

    if (workflow === 'init') return { level:'ready', title:'T2D · FILLIMI SIPAS SmPC', text:'Dy opsione zyrtare: 6 U SC me mëngjes + 6 U SC me darkë, OSE 12 U SC me darkë. Doza individualizohet sipas monitorimit të glukozës. NovoMix30 jepet menjëherë para vaktit; kur nevojitet, mund të jepet pak pas vaktit.' };

    if (workflow === 't1d') {
      const weight = num(modal.querySelector('[data-novomix-weight]')?.value);
      if (!weight || weight <= 0) return { level:'manual', title:'SHKRUAJ PESHËN', text:'Pesha reale nevojitet për referencën 0.5–1.0 U/kg/ditë.' };
      const low = Math.round(weight * 0.5 * 10) / 10;
      const high = Math.round(weight * 1.0 * 10) / 10;
      return { level:'manual', title:'T1D · REFERENCË, JO DOZË NOVOMIX', text:`Nevoja totale tipike e insulinës: ${low}–${high} U/ditë (${weight} kg × 0.5–1.0 U/kg/ditë). NovoMix30 mund ta mbulojë tërësisht ose pjesërisht; SmPC nuk jep ndarje universale, prandaj regjimi kërkon plan individual.` };
    }

    if (workflow === 'switch') {
      const dose = num(modal.querySelector('[data-novomix-switch-dose]')?.value);
      const regimen = clean(modal.querySelector('[data-novomix-switch-regimen]')?.value);
      if (!dose || !regimen) return { level:'manual', title:'PLOTËSO SWITCH-IN', text:'Shkruaj dozën dhe regjimin aktual të insulinës njerëzore bifazike.' };
      if (dose > 60) return { level:'block', title:'BLOCK · FLEXPEN >60 U', text:'FlexPen lejon 1–60 U për injeksion. Mos ndaj automatikisht dozën; kërko plan/device të verifikuar.' };
      return { level:'manual', title:'SWITCH · KËRKON MONITORIM TË AFËRT', text:`Sipas SmPC, fillo NovoMix30 me të njëjtën dozë (${dose} U) dhe të njëjtin regjim (${regimen}), pastaj individualizo sipas glukozës. Kontroll i afërt gjatë switch-it dhe javët e para.` };
    }

    const current = num(modal.querySelector('[data-novomix-current-dose]')?.value);
    const regimen = modal.querySelector('[data-novomix-regimen]')?.value;
    const glucose = num(modal.querySelector('[data-novomix-glucose]')?.value);
    const unit = modal.querySelector('[data-novomix-glucose-unit]')?.value || 'mmol';
    const days = num(modal.querySelector('[data-novomix-days]')?.value);
    const hypo3 = Boolean(modal.querySelector('[data-novomix-hypo3]')?.checked);
    if (!current || !regimen || glucose === null || days === null) return { level:'manual', title:'PLOTËSO TITRIMIN', text:'Duhet doza aktuale, regjimi, vlera më e ulët pre-meal nga 3 ditët dhe ditët nga ndryshimi i fundit.' };
    if (current > 60) return { level:'block', title:'BLOCK · FLEXPEN >60 U', text:'FlexPen lejon maksimum 60 U për një injeksion.' };
    if (days < 7) return { level:'manual', title:'PRIT PËR TITRIMIN JAVOR', text:'SmPC lejon rregullimin e dozës një herë në javë. Nuk propozohet ndryshim para 7 ditëve.' };
    const mmol = unit === 'mg' ? glucose / 18 : glucose;
    let adjustment = titrationAdjustment(mmol);
    if (hypo3 && adjustment > 0) return { level:'manual', title:'MOS E RRIT DOZËN', text:'Ka pasur hipoglikemi gjatë 3 ditëve të përdorura për titrim. SmPC thotë të mos rritet doza; rivlerëso klinikisht.' };
    const next = current + adjustment;
    if (next <= 0) return { level:'manual', title:'MANUAL REVIEW', text:'Rezultati i tabelës do ta çonte dozën në ≤0 U; kërko rivlerësim klinik, mos apliko automatikisht.' };
    if (next > 60) return { level:'block', title:'BLOCK · FLEXPEN >60 U', text:`Tabela jep ${adjustment > 0 ? '+' : ''}${adjustment} U, por rezultati ${next} U tejkalon 60 U për injeksion. Mos e ndaj automatikisht.` };
    const sign = adjustment > 0 ? `+${adjustment}` : String(adjustment);
    let extra = `Ndryshimi sipas tabelës: ${sign} U → ${next} U për dozën që po rishikohet.`;
    if (regimen === 'od' && next >= 30) extra += ' Kur NovoMix30 një herë/ditë arrin 30 U, SmPC zakonisht rekomandon kalim në 2×/ditë duke e ndarë në dy doza të barabarta mëngjes/darkë; kërkon konfirmim klinik para ndryshimit të regjimit.';
    return { level:'ready', title:'TITRIMI SIPAS SmPC', text:`Vlera e përdorur: ${Math.round(mmol * 10) / 10} mmol/L. ${extra} Rregullimi bëhet një herë në javë dhe doza individualizohet sipas kontrollit glikemik.` };
  }

  function stateFromSelections() {
    if (activeProduct?.kind === 'PREMIX') return novoMixState();
    const safety = genericSafetyState();
    if (safety) return safety;
    const missing = Array.from(modal.querySelectorAll('[data-insulin-smart-input]')).filter(input => !clean(input.value));
    if (missing.length) return { level:'manual', title:'PLOTËSO INPUTET KLINIKE', text:`Mungojnë ${missing.length} fusha për flow-in ${activeProduct?.kind || ''}. Asnjë dozë nuk llogaritet.` };
    return { level:'ready', title:'READY FOR VERIFIED PROTOCOL', text:'Safety gate kaloi dhe inputet bazë janë plotësuar. Doza/titrimi mbetet i bllokuar derisa të lidhet një protokoll i verifikuar për këtë produkt dhe kontekst klinik.' };
  }

  function updateState() {
    if (!modal || modal.hidden || !activeProduct) return;
    const state = stateFromSelections();
    const node = modal.querySelector('[data-insulin-smart-state]');
    node.className = `insulin-smart-state is-${state.level}`;
    node.innerHTML = `<strong>${esc(state.title)}</strong><span>${esc(state.text)}</span>`;
  }

  function open(registryNumber, trigger) {
    const product = PRODUCTS[clean(registryNumber)];
    if (!product) return;
    lastFocus = trigger || document.activeElement;
    render(product);
    modal.hidden = false;
    document.body.classList.add('insulin-smart-opened');
    updateState();
    modal.querySelector('.insulin-smart-card')?.focus();
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('insulin-smart-opened');
    activeProduct = null;
    lastFocus?.focus?.();
  }

  function reset() {
    if (!modal || !activeProduct) return;
    modal.querySelectorAll('input').forEach(input => { input.type === 'checkbox' ? input.checked = false : input.value = ''; });
    modal.querySelectorAll('select').forEach(select => { select.selectedIndex = 0; });
    syncNovoMixFields();
    updateState();
    modal.querySelector('input,select')?.focus();
  }

  function bind() {
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-insulin-smart-open]');
      if (button) open(button.dataset.insulinSmartOpen, button);
    });
    observer = new MutationObserver(() => ensureButtons());
    const tbody = document.getElementById('tbody');
    if (tbody) observer.observe(tbody,{childList:true,subtree:true});
    window.addEventListener('medindex:registry-data-ready', ensureButtons);
    ensureButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();

  window.MEDINDEX_INSULIN_SMART = Object.freeze({ version:VERSION, products:Object.keys(PRODUCTS).length, refresh:ensureButtons, novomixTitration:titrationAdjustment });
})();