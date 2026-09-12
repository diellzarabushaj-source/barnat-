(() => {
  'use strict';

  const prepData = window.DRX_ANTIBIOTIC_PARENTERAL_PREP;
  const hospitalData = window.DRX_ANTIBIOTIC_HOSPITAL;
  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  if (!prepData || !hospitalData || !guide) return;

  const byPrepId = new Map(prepData.preparations.map(item => [item.id, item]));
  const byRegimenId = new Map(hospitalData.regimens.map(item => [item.id, item]));

  const normalizeRoute = route => {
    const value = String(route || '').trim().toUpperCase();
    if (value.startsWith('IV')) return 'IV';
    if (value.startsWith('IM')) return 'IM';
    return value;
  };

  const routeCompatible = (regimenRoute, prepRoute) => normalizeRoute(regimenRoute) === normalizeRoute(prepRoute);

  const capDose = (raw, maxDose) => Number.isFinite(maxDose) ? Math.min(raw, maxDose) : raw;

  function doseForRegimen(regimen, weightKg, drugName, ageMonths=null) {
    if (!regimen?.dose) return null;
    if (Number.isFinite(regimen.minAgeMonths) && !Number.isFinite(ageMonths)) return null;
    if (Number.isFinite(regimen.minAgeMonths) && ageMonths < regimen.minAgeMonths) return null;

    const dose = regimen.dose;
    if (dose.type === 'single') {
      if (!Number.isFinite(weightKg)) return null;
      return { kind:'mg', drug:regimen.drug, value:capDose(weightKg * dose.value, dose.maxDose), component:dose.component || regimen.drug };
    }
    if (dose.type === 'weight-threshold') {
      if (!Number.isFinite(weightKg)) return null;
      const eligible = dose.operator === '<' ? weightKg < dose.thresholdKg : weightKg >= dose.thresholdKg;
      return eligible ? { kind:'units', drug:regimen.drug, value:dose.units } : null;
    }
    if (dose.type === 'combo') {
      if (!Number.isFinite(weightKg)) return null;
      const part = dose.parts.find(item => item.drug === drugName);
      if (!part) return null;
      return { kind:'mg', drug:part.drug, value:capDose(weightKg * part.value, part.maxDose), component:part.component || part.drug };
    }
    return null;
  }

  function calculatePreparation({ prep, regimenRoute, dose, exactProductConfirmed=false, stockChoiceMgPerMl=null, targetConcentration=null }) {
    if (!prep) return { gate:'BLOCK_NO_PREP' };
    if (!routeCompatible(regimenRoute, prep.route)) return { gate:'HARD_BLOCK_ROUTE' };
    if (prep.publishable === false) return { gate:'HARD_BLOCK_PREP' };
    if (!dose) return { gate:'BLOCK_FINAL_CONTEXT' };
    if (prep.exactProduct && !exactProductConfirmed) return { gate:'VERIFY_EXACT_PRODUCT' };

    if (dose.kind === 'units') {
      if (!Number.isFinite(prep.unitsPerMl) || !Number.isFinite(prep.doseUnits) || prep.doseUnits !== dose.value) return { gate:'BLOCK_PRODUCT_DOSE_MISMATCH' };
      return { gate:'ALLOW', rawVolumeMl:dose.value / prep.unitsPerMl };
    }

    if (dose.kind !== 'mg') return { gate:'BLOCK_DOSE_TYPE' };
    const mg = dose.value;

    if (['tdm-block','pediatric-regimen-required','blocked-pediatric-default'].includes(prep.calcMode)) {
      return { gate:'HARD_BLOCK_WORKFLOW' };
    }
    if (prep.calcMode === 'manual-stock') {
      return { gate:'MANUAL_STOCK_VERIFY', message:'Koncentrimi final i stock-ut është product-specific; DRx nuk jep mL automatik.' };
    }
    if (prep.calcMode === 'stock-choice') {
      const allowed = (prep.stockChoices || []).some(item => item.mgPerMl === Number(stockChoiceMgPerMl));
      if (!allowed) return { gate:'SELECT_STOCK_PATH' };
      return { gate:'ALLOW', rawStockMl:mg / Number(stockChoiceMgPerMl), stockMgPerMl:Number(stockChoiceMgPerMl) };
    }
    if (prep.calcMode === 'stock-only') {
      if (!Number.isFinite(prep.stockMgPerMl) || prep.stockMgPerMl <= 0) return { gate:'BLOCK_NO_CONCENTRATION' };
      return { gate:'ALLOW', rawStockMl:mg / prep.stockMgPerMl, stockMgPerMl:prep.stockMgPerMl };
    }
    if (prep.calcMode === 'stock-and-target') {
      if (!Number.isFinite(prep.stockMgPerMl) || prep.stockMgPerMl <= 0) return { gate:'BLOCK_NO_CONCENTRATION' };
      const result = { gate:'ALLOW', rawStockMl:mg / prep.stockMgPerMl, stockMgPerMl:prep.stockMgPerMl, targetRequired:true };
      const target = Number(targetConcentration);
      if (Number.isFinite(target) && prep.target?.kind === 'range' && target >= prep.target.min && target <= prep.target.max) {
        result.targetRequired = false;
        result.targetConcentration = target;
        result.rawFinalVolumeMl = mg / target;
      }
      return result;
    }
    if (prep.calcMode === 'component-stock-and-total-target') {
      if (!Number.isFinite(prep.stockMgPerMl) || prep.stockMgPerMl <= 0) return { gate:'BLOCK_NO_CONCENTRATION' };
      const totalMg = mg * prep.totalToComponentRatio;
      const result = { gate:'ALLOW', rawStockMl:mg / prep.stockMgPerMl, stockMgPerMl:prep.stockMgPerMl, totalDrugMg:totalMg, targetRequired:true };
      const target = Number(targetConcentration);
      if (Number.isFinite(target) && prep.target?.kind === 'range' && target >= prep.target.min && target <= prep.target.max) {
        result.targetRequired = false;
        result.targetConcentration = target;
        result.rawFinalVolumeMl = totalMg / target;
      }
      return result;
    }
    if (prep.calcMode === 'stock-min-volume-rate') {
      if (!Number.isFinite(prep.stockMgPerMl) || !Number.isFinite(prep.target?.max) || !Number.isFinite(prep.maxRateMgPerMin)) return { gate:'BLOCK_NO_CONCENTRATION' };
      return {
        gate:'ALLOW',
        rawStockMl:mg / prep.stockMgPerMl,
        stockMgPerMl:prep.stockMgPerMl,
        rawMinimumFinalVolumeMl:mg / prep.target.max,
        rawMinimumInfusionMinutes:mg / prep.maxRateMgPerMin
      };
    }
    return { gate:'BLOCK_UNSUPPORTED_PREP' };
  }

  window.DRX_ANTIBIOTIC_PREP_ENGINE = Object.freeze({ normalizeRoute, routeCompatible, doseForRegimen, calculatePreparation });

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fmt = (value, digits=2) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const p = 10 ** digits;
    const rounded = Math.round(n * p) / p;
    return String(rounded).replace('.', ',');
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function realWeight() {
    const raw = clean(document.getElementById('weightInput')?.value).replace(',', '.');
    const value = Number(raw);
    return raw && Number.isFinite(value) && value >= 1 && value <= 200 ? value : null;
  }

  function ageMonths() {
    const id = document.getElementById('ageSelect')?.value || '';
    const band = (guide.ageBands || []).find(item => item.id === id);
    return band && Number.isFinite(band.months) ? band.months : null;
  }

  function componentDrugNames(regimen) {
    if (regimen.dose?.type === 'combo') return regimen.dose.parts.map(part => part.drug);
    return [regimen.drug];
  }

  function relevantPreps(regimen, drugName, weightKg) {
    const dose = doseForRegimen(regimen, weightKg, drugName, ageMonths());
    return (regimen.prepIds || [])
      .map(id => byPrepId.get(id))
      .filter(Boolean)
      .filter(prep => prep.publishable !== false)
      .filter(prep => prep.drug === drugName)
      .filter(prep => routeCompatible(regimen.route, prep.route))
      .filter(prep => dose?.kind !== 'units' || !Number.isFinite(prep.doseUnits) || prep.doseUnits === dose.value);
  }

  function prepInfoRows(prep) {
    const rows = [];
    if (prep.presentation) rows.push(['Produkti', `${prep.product} · ${prep.presentation}`]);
    if (prep.diluent) rows.push(['Tretësi / përgatitja', prep.amountAdded ? `${prep.diluent} · ${prep.amountAdded}` : prep.diluent]);
    if (prep.stockText) rows.push(['Stock', prep.stockText]);
    if (prep.targetText) rows.push(['Hollimi final', prep.targetText]);
    else if (prep.target?.kind === 'volume-range') rows.push(['Hollimi final', `${prep.target.min}–${prep.target.max} ${prep.target.unit}`]);
    else if (prep.target?.kind === 'max-concentration') rows.push(['Koncentrimi final', `≤${prep.target.max} ${prep.target.unit}`]);
    else if (prep.target?.kind === 'range') rows.push(['Target', `${prep.target.min}–${prep.target.max} ${prep.target.unit}`]);
    if (prep.administration) rows.push(['Administrimi', prep.administration]);
    if (prep.time) rows.push(['Koha / rate', prep.time]);
    return rows;
  }

  function renderCalculation(target, prep, regimen, drugName, confirm, stockChoice, targetInput) {
    target.replaceChildren();
    const dose = doseForRegimen(regimen, realWeight(), drugName, ageMonths());
    const result = calculatePreparation({
      prep,
      regimenRoute:regimen.route,
      dose,
      exactProductConfirmed:confirm.checked,
      stockChoiceMgPerMl:stockChoice?.value || null,
      targetConcentration:targetInput?.value ? Number(String(targetInput.value).replace(',', '.')) : null
    });

    if (result.gate === 'VERIFY_EXACT_PRODUCT') {
      target.append(make('p', 'abx-prep-gate', 'Konfirmo produktin/presentation dhe rrugën e saktë para se DRx të japë mL.'));
      return;
    }
    if (result.gate === 'BLOCK_FINAL_CONTEXT') {
      target.append(make('p', 'abx-prep-gate', 'Duhet peshë reale dhe, kur ka age-gate, moshë reale para llogaritjes së mL.'));
      return;
    }
    if (result.gate === 'SELECT_STOCK_PATH') {
      target.append(make('p', 'abx-prep-gate', 'Zgjidh rrugën e rekonstituimit / koncentrimin stock të verifikuar.'));
      return;
    }
    if (result.gate === 'MANUAL_STOCK_VERIFY') {
      target.append(make('p', 'abx-prep-gate is-warning', result.message));
      return;
    }
    if (result.gate !== 'ALLOW') {
      target.append(make('p', 'abx-prep-gate is-danger', 'Auto-kalkulimi është i bllokuar për këtë kombinim route/product/workflow.'));
      return;
    }

    const grid = make('div', 'abx-prep-results');
    if (Number.isFinite(result.rawVolumeMl)) grid.append(resultRow('Vëllimi', `${fmt(result.rawVolumeMl)} mL`));
    if (Number.isFinite(result.rawStockMl)) grid.append(resultRow('Tërhiq nga stock-u', `${fmt(result.rawStockMl)} mL`));
    if (Number.isFinite(result.rawFinalVolumeMl)) grid.append(resultRow('Vëllimi final matematik', `${fmt(result.rawFinalVolumeMl)} mL`));
    if (Number.isFinite(result.rawMinimumFinalVolumeMl)) grid.append(resultRow('Vëllimi final minimal', `≥${fmt(result.rawMinimumFinalVolumeMl)} mL`));
    if (Number.isFinite(result.rawMinimumInfusionMinutes)) grid.append(resultRow('Koha minimale nga rate', `≥${fmt(result.rawMinimumInfusionMinutes,1)} min`));
    target.append(grid);

    if (result.targetRequired) target.append(make('p', 'abx-prep-gate is-warning', 'Zgjidh target-koncentrimin brenda intervalit të etiketës për vëllimin final.'));
    target.append(make('p', 'abx-prep-raw-note', 'Vlerat e mL ruhen matematikisht pa rounding klinik; rrumbullakimi final varet nga pajisja/politika lokale.'));
  }

  function resultRow(label, value) {
    const row = make('div', 'abx-prep-result-row');
    row.append(make('span', '', label), make('strong', '', value));
    return row;
  }

  function buildComponent(regimen, drugName) {
    const wrapper = make('div', 'abx-prep-component');
    if (regimen.dose?.type === 'combo') wrapper.append(make('strong', 'abx-prep-component-title', drugName));

    const preps = relevantPreps(regimen, drugName, realWeight());
    if (!preps.length) {
      wrapper.append(make('p', 'abx-prep-gate', 'Nuk ka preparation record të publikueshëm që përputhet me këtë route/regimen.'));
      return wrapper;
    }

    const selector = document.createElement('select');
    selector.className = 'abx-prep-select';
    selector.setAttribute('aria-label', `Preparati ${drugName}`);
    preps.forEach(prep => {
      const option = document.createElement('option');
      option.value = prep.id;
      option.textContent = `${prep.routeLabel} · ${prep.presentation}`;
      selector.append(option);
    });
    if (preps.length > 1) wrapper.append(selector);

    const content = make('div', 'abx-prep-content');
    wrapper.append(content);

    function paint() {
      const prep = byPrepId.get(selector.value || preps[0].id);
      content.replaceChildren();

      const info = make('div', 'abx-prep-info');
      prepInfoRows(prep).forEach(([label, value]) => info.append(resultRow(label, value)));
      content.append(info);

      if (prep.safety) content.append(make('p', 'abx-prep-safety', prep.safety));

      const confirmLabel = make('label', 'abx-prep-confirm');
      const confirm = document.createElement('input');
      confirm.type = 'checkbox';
      confirmLabel.append(confirm, make('span', '', 'Kam verifikuar që produkti/presentation dhe route përputhen saktë me këtë record.'));
      content.append(confirmLabel);

      let stockChoice = null;
      if (Array.isArray(prep.stockChoices)) {
        stockChoice = document.createElement('select');
        stockChoice.className = 'abx-prep-select';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = 'Zgjidh rekonstituimin…';
        stockChoice.append(blank);
        prep.stockChoices.forEach(choice => {
          const option = document.createElement('option');
          option.value = String(choice.mgPerMl);
          option.textContent = choice.label;
          stockChoice.append(option);
        });
        content.append(stockChoice);
      }

      let targetInput = null;
      if (prep.target?.kind === 'range') {
        const targetWrap = make('label', 'abx-prep-target');
        targetWrap.append(make('span', '', `Target ${prep.target.min}–${prep.target.max} ${prep.target.unit}`));
        targetInput = document.createElement('input');
        targetInput.type = 'text';
        targetInput.inputMode = 'decimal';
        targetInput.placeholder = 'p.sh. ' + prep.target.max;
        targetWrap.append(targetInput);
        content.append(targetWrap);
      }

      const output = make('div', 'abx-prep-output');
      content.append(output);
      const refresh = () => renderCalculation(output, prep, regimen, drugName, confirm, stockChoice, targetInput);
      confirm.addEventListener('change', refresh);
      stockChoice?.addEventListener('change', refresh);
      targetInput?.addEventListener('input', refresh);
      refresh();

      const source = make('a', 'abx-prep-source', 'Etiketa e produktit');
      source.href = prep.sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      content.append(source);
    }

    selector.addEventListener('change', paint);
    paint();
    return wrapper;
  }

  function enhanceCard(card) {
    const id = card.dataset.regimenId;
    const regimen = byRegimenId.get(id);
    if (!regimen || card.dataset.prepEnhanced === '1') return;
    card.dataset.prepEnhanced = '1';

    const details = make('details', 'abx-prep');
    const summary = document.createElement('summary');
    summary.append(make('span', '', 'Si përgatitet'), make('small', '', 'produkt-specifik'));
    details.append(summary);

    const body = make('div', 'abx-prep-body');
    componentDrugNames(regimen).forEach(drug => body.append(buildComponent(regimen, drug)));
    body.append(make('p', 'abx-prep-footer', prepData.safetyRules.vialStrengthIsNotConcentration));
    details.append(body);
    card.append(details);
  }

  function scan() {
    document.querySelectorAll('#hospitalList .abx-hosp-card').forEach(enhanceCard);
  }

  const list = document.getElementById('hospitalList');
  const observer = list ? new MutationObserver(scan) : null;
  observer?.observe(list, { childList:true });
  window.addEventListener('drx:antibiotics-hospital-rendered', scan);
  document.getElementById('weightInput')?.addEventListener('input', () => {
    document.querySelectorAll('#hospitalList .abx-hosp-card').forEach(card => { card.dataset.prepEnhanced = '0'; card.querySelector('.abx-prep')?.remove(); });
    scan();
  });
  document.getElementById('ageSelect')?.addEventListener('change', () => {
    document.querySelectorAll('#hospitalList .abx-hosp-card').forEach(card => { card.dataset.prepEnhanced = '0'; card.querySelector('.abx-prep')?.remove(); });
    scan();
  });
  scan();
})();