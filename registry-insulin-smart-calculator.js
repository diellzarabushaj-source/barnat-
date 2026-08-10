(() => {
  'use strict';

  const VERSION = 'registry-insulin-smart-v1.0.0';
  const PRODUCTS = Object.freeze({
    '2508': { name:'NovoRapid Flex Pen', substance:'Insulin aspart', atc:'A10AB05', strength:'100 U/1 mL', kind:'MEAL/CORRECTION', classLabel:'Rapid-acting', source:'https://www.ema.europa.eu/en/medicines/human/EPAR/novorapid' },
    '2509': { name:'NovoMix30 FlexPen', substance:'Insulin aspart', atc:'A10AD05', strength:'100 U/1 mL', kind:'PREMIX', classLabel:'Premix', source:'https://www.ema.europa.eu/en/medicines/human/EPAR/novomix' },
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
    PREMIX: [
      ['current_regimen','Regjimi aktual','text','Doza dhe orari i përshkruar aktualisht'],
      ['premeal_trend','Trendi preprandial','text','Trend, jo një vlerë e vetme'],
      ['meal_regularity','Rregullsia e vakteve','text','Ndryshimet e vakteve kërkojnë review'],
      ['recent_change','Ndryshimi i fundit i dozës','text','Kur dhe pse është ndryshuar'],
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
    { key:'hypoglycaemia', label:'Hipoglikemi aktuale ose simptoma të hipoglikemisë?', severity:'block', action:'Mos vazhdo me kalkulim. Trajto/rivlerëso hipoglikeminë sipas protokollit klinik.' },
    { key:'dka', label:'Ketone / dyshim për DKA / dehidrim të rëndësishëm?', severity:'manual_review', action:'Kërko vlerësim urgjent dhe protokoll specifik; mos përdor kalkulator rutinë.' },
    { key:'severe_hypo', label:'Hipoglikemi e rëndë ose e përsëritur së fundi?', severity:'manual_review', action:'Rishiko regjimin dhe targetet para çdo ndryshimi.' },
    { key:'renal_hepatic', label:'Dëmtim renal/hepatik ose ndryshim akut i funksionit?', severity:'manual_review', action:'Kërko vlerësim individual të nevojës për insulinë.' },
    { key:'illness', label:'Sëmundje akute, infeksion, marrje e ulët ushqimi ose aktivitet i pazakontë?', severity:'manual_review', action:'Përdor protokollin individual/sick-day, jo titrim rutinë.' },
    { key:'switch', label:'Po ndërrohet insulinë, pajisje, koncentrim ose regjim?', severity:'manual_review', action:'Kërko protokoll të verifikuar për switching dhe medication reconciliation.' },
    { key:'pregnancy', label:'Shtatzëni ose periudhë e menjëhershme postpartum?', severity:'manual_review', action:'Përdor targete dhe protokoll specifik për shtatzëni/postpartum.' },
  ]);

  const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
  const esc = value => clean(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
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
      if (!cell || !product) return;
      if (cell.querySelector('[data-insulin-smart-open]')) return;
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
    modal.innerHTML = `
      <div class="insulin-smart-backdrop" data-insulin-smart-close></div>
      <section class="insulin-smart-card" tabindex="-1">
        <header class="insulin-smart-head">
          <div><span class="insulin-smart-kicker">SMART INSULIN · FAIL-CLOSED</span><h2 id="insulinSmartTitle">Insulin Smart</h2><p data-insulin-smart-subtitle></p></div>
          <button type="button" class="insulin-smart-close" data-insulin-smart-close aria-label="Mbyll">×</button>
        </header>
        <div class="insulin-smart-grid">
          <section class="insulin-smart-section">
            <div class="insulin-smart-product" data-insulin-smart-product></div>
            <div class="insulin-smart-fields" data-insulin-smart-fields></div>
          </section>
          <section class="insulin-smart-section insulin-smart-safety">
            <div class="insulin-smart-section-title"><strong>Safety gate</strong><span>Po = aktiv</span></div>
            <div data-insulin-smart-safety></div>
          </section>
        </div>
        <div class="insulin-smart-state" data-insulin-smart-state aria-live="polite"></div>
        <footer class="insulin-smart-foot">
          <a data-insulin-smart-source target="_blank" rel="noopener noreferrer">Burimi zyrtar</a>
          <button type="button" class="insulin-smart-reset" data-insulin-smart-reset>Pacient i ri</button>
        </footer>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target.closest('[data-insulin-smart-close]')) close();
      if (event.target.closest('[data-insulin-smart-reset]')) reset();
    });
    modal.addEventListener('change', updateState);
    modal.addEventListener('input', updateState);
    document.addEventListener('keydown', event => {
      if (!modal.hidden && event.key === 'Escape') close();
    });
    return modal;
  }

  function fieldMarkup(def) {
    const [key,label,type,hint] = def;
    return `<label class="insulin-smart-field"><span>${esc(label)}</span><input type="${type}" data-insulin-smart-input="${esc(key)}" autocomplete="off"><small>${esc(hint)}</small></label>`;
  }

  function safetyMarkup(item) {
    return `<label class="insulin-smart-check"><input type="checkbox" data-insulin-smart-safety-check data-severity="${esc(item.severity)}" data-action="${esc(item.action)}"><span><strong>${esc(item.label)}</strong><small>${item.severity === 'block' ? 'BLOCK' : 'MANUAL REVIEW'}</small></span></label>`;
  }

  function render(product) {
    ensureModal();
    activeProduct = product;
    modal.querySelector('#insulinSmartTitle').textContent = product.name;
    modal.querySelector('[data-insulin-smart-subtitle]').textContent = `${product.classLabel} · ${product.atc} · ${product.strength}`;
    modal.querySelector('[data-insulin-smart-product]').innerHTML = `<strong>${esc(product.substance)}</strong><span>Route: SC</span><span>Flow: ${esc(product.kind)}</span><span>Status: kërkohet protokoll i verifikuar për dozë/titrim</span>`;
    modal.querySelector('[data-insulin-smart-fields]').innerHTML = (FLOW_FIELDS[product.kind] || []).map(fieldMarkup).join('');
    const applicableSafety = [...SAFETY];
    if (product.kind === 'MEAL/CORRECTION') applicableSafety.push({ key:'iob', label:'Bolus i fundit / insulin-on-board është i paqartë?', severity:'manual_review', action:'Mos bëj correction automatik pa e qartësuar insulinën aktive.' });
    if (['MEAL/CORRECTION','PREMIX','CO-FORMULATION'].includes(product.kind)) applicableSafety.push({ key:'meal', label:'Vakti është shtyrë, anuluar ose marrja e karbohidrateve është e pasigurt?', severity:'manual_review', action:'Rivlerëso para përdorimit të flow-it të vaktit.' });
    modal.querySelector('[data-insulin-smart-safety]').innerHTML = applicableSafety.map(safetyMarkup).join('');
    const source = modal.querySelector('[data-insulin-smart-source]');
    source.href = product.source;
    updateState();
  }

  function stateFromSelections() {
    const checked = Array.from(modal.querySelectorAll('[data-insulin-smart-safety-check]:checked'));
    const block = checked.find(input => input.dataset.severity === 'block');
    if (block) return { level:'block', title:'BLOCK', text:block.dataset.action };
    const manual = checked.find(input => input.dataset.severity === 'manual_review');
    if (manual) return { level:'manual', title:'MANUAL REVIEW', text:manual.dataset.action };
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
    updateState();
    modal.querySelector('[data-insulin-smart-input]')?.focus();
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

  window.MEDINDEX_INSULIN_SMART = Object.freeze({ version:VERSION, products:Object.keys(PRODUCTS).length, refresh:ensureButtons });
})();
