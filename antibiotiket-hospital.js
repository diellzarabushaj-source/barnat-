(() => {
  'use strict';

  const data = window.DRX_ANTIBIOTIC_HOSPITAL;
  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  const module = document.getElementById('hospitalModule');
  const list = document.getElementById('hospitalList');
  const badge = document.getElementById('hospitalCount');
  const note = document.getElementById('hospitalContextNote');
  const recommendations = document.getElementById('recommendationList');
  if (!data || !guide || !module || !list || !badge || !note) return;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fmt = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const rounded = Math.round(n * 10) / 10;
    return String(rounded).replace('.', ',');
  };
  const formatUnits = value => new Intl.NumberFormat('en-US', { maximumFractionDigits:0 }).format(Number(value)).replace(/,/g, ' ');

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function indicationId() {
    try { return new URL(location.href).searchParams.get('indication') || guide.indications?.[0]?.id || ''; }
    catch { return guide.indications?.[0]?.id || ''; }
  }

  function realWeight() {
    const raw = clean(document.getElementById('weightInput')?.value).replace(',', '.');
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 1 && value <= 200 ? value : null;
  }

  function ageMonths() {
    const id = document.getElementById('ageSelect')?.value || '';
    const band = (guide.ageBands || []).find(item => item.id === id);
    return band && Number.isFinite(band.months) ? band.months : null;
  }

  function allergyBucket() {
    return document.querySelector('input[name="abx-allergy"]:checked')?.value || 'none';
  }

  function orbitalRedFlags() {
    return document.getElementById('orbitalRedFlagsInput')?.checked === true;
  }

  function sourceFor(id) {
    return data.sources?.[id] || null;
  }

  function regimenById(id) {
    return data.regimens.find(item => item.id === id) || null;
  }

  function allergyAllowed(regimen, allergy) {
    if (Array.isArray(regimen.allowedAllergy) && !regimen.allowedAllergy.includes(allergy)) return false;
    if (Array.isArray(regimen.blockedAllergy) && regimen.blockedAllergy.includes(allergy)) return false;
    return true;
  }

  function thresholdMatches(dose, weight) {
    if (dose?.type !== 'weight-threshold' || !Number.isFinite(weight)) return true;
    if (dose.operator === '<') return weight < dose.thresholdKg;
    if (dose.operator === '>=') return weight >= dose.thresholdKg;
    return true;
  }

  function ageAllowed(regimen, months) {
    if (!Number.isFinite(regimen.minAgeMonths) || !Number.isFinite(months)) return true;
    return months >= regimen.minAgeMonths;
  }

  function formulaText(dose) {
    if (!dose) return '—';
    if (dose.type === 'single') {
      const max = Number.isFinite(dose.maxDose) ? ` · maks. ${fmt(dose.maxDose)} mg${dose.component ? ` ${dose.component}` : ''}/dozë` : '';
      return `${fmt(dose.value)} ${dose.unit}${max}`;
    }
    if (dose.type === 'weight-threshold') {
      const comparator = dose.operator === '<' ? '<' : '≥';
      return `${comparator}${dose.thresholdKg} kg: ${formatUnits(dose.units)} U IM një herë`;
    }
    if (dose.type === 'combo') {
      return dose.parts.map(part => `${part.drug}: ${fmt(part.value)} ${part.unit}${Number.isFinite(part.maxDose) ? ` · maks. ${fmt(part.maxDose)} mg/dozë` : ''} · ${part.frequency}`).join(' + ');
    }
    if (dose.type === 'tdm') return 'Doza varet nga mosha, funksioni renal dhe TDM; nuk ka kalkulim universal.';
    return '—';
  }

  function calculatedDose(regimen, weight) {
    const dose = regimen.dose;
    if (!dose) return '';
    if (dose.type === 'single') {
      if (!Number.isFinite(weight)) return '';
      const raw = dose.value * weight;
      const value = Number.isFinite(dose.maxDose) ? Math.min(raw, dose.maxDose) : raw;
      const component = dose.component ? ` ${dose.component}` : '';
      const capped = Number.isFinite(dose.maxDose) && raw > dose.maxDose ? ' · kufiri maksimal i burimit' : '';
      return `${fmt(value)} mg${component}/dozë${capped}`;
    }
    if (dose.type === 'weight-threshold') {
      if (!Number.isFinite(weight)) return '';
      return `${formatUnits(dose.units)} U IM një herë`;
    }
    if (dose.type === 'combo') {
      if (!Number.isFinite(weight)) return '';
      return dose.parts.map(part => {
        const raw = part.value * weight;
        const value = Number.isFinite(part.maxDose) ? Math.min(raw, part.maxDose) : raw;
        const capped = Number.isFinite(part.maxDose) && raw > part.maxDose ? ' (maks.)' : '';
        return `${part.drug}: ${fmt(value)} mg/dozë${capped} · ${part.frequency}`;
      }).join(' + ');
    }
    return '';
  }

  function cardFor(regimen, weight, months) {
    const card = make('article', 'abx-hosp-card');
    card.dataset.regimenId = regimen.id;
    card.dataset.prepIds = (regimen.prepIds || []).join(';');
    card.dataset.route = regimen.route;

    const head = make('div', 'abx-hosp-card-head');
    const title = make('div', 'abx-hosp-title');
    title.append(make('strong', '', regimen.drug), make('span', '', regimen.scenario));
    const route = make('b', `abx-hosp-route is-${regimen.route.toLowerCase()}`, regimen.route);
    head.append(title, route);

    const calc = calculatedDose(regimen, weight);
    const dose = make('div', 'abx-hosp-dose');
    if (calc) dose.append(make('strong', '', calc));
    else if (regimen.dose?.type === 'tdm') dose.append(make('strong', '', 'TDM / specialist workflow'));
    else dose.append(make('strong', '', 'Formula e burimit'));
    dose.append(make('span', '', formulaText(regimen.dose)));
    if (!Number.isFinite(weight) && ['single','combo','weight-threshold'].includes(regimen.dose?.type)) {
      dose.append(make('small', 'abx-hosp-weight-note', 'Shkruaj peshën reale për dozën numerike. Pesha referuese nuk përdoret për finalizim spitalor.'));
    }
    if (Number.isFinite(regimen.minAgeMonths) && !Number.isFinite(months)) {
      dose.append(make('small', 'abx-hosp-weight-note', `Verifiko moshën reale; kjo skemë ka prag ≥${regimen.minAgeMonths} muaj.`));
    }

    const meta = make('div', 'abx-hosp-meta');
    meta.append(
      metaRow('Frekuenca', regimen.frequency || '—'),
      metaRow('Kur përdoret', regimen.useWhen || '—'),
      metaRow('Tranzicioni', regimen.transition || 'Sipas pathway / përgjigjes klinike')
    );

    const cautions = make('div', 'abx-hosp-cautions');
    if (regimen.allergyNote) cautions.append(make('p', '', `Alergjia: ${regimen.allergyNote}`));
    if (regimen.renal) cautions.append(make('p', '', `Renal/TDM: ${regimen.renal}`));
    if (regimen.safety) cautions.append(make('p', 'is-safety', regimen.safety));

    const source = sourceFor(regimen.source);
    if (source?.url) {
      const link = make('a', 'abx-hosp-source', source.short || 'Hap burimin');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      cautions.append(link);
    }

    card.append(head, dose, meta, cautions);
    return card;
  }

  function metaRow(label, value) {
    const row = make('div', 'abx-hosp-meta-row');
    row.append(make('span', '', label), make('strong', '', value));
    return row;
  }

  function render() {
    const indication = indicationId();
    const linkedIds = data.linkedByIndication?.[indication] || [];
    const escalationText = data.escalationOnly?.[indication] || '';
    const escalationVisible = indication === 'preseptal' && orbitalRedFlags() && escalationText;

    if (!linkedIds.length && !escalationVisible) {
      module.hidden = true;
      list.replaceChildren();
      return;
    }

    module.hidden = false;
    const weight = realWeight();
    const months = ageMonths();
    const allergy = allergyBucket();
    const linked = linkedIds.map(regimenById).filter(Boolean);
    const allowed = linked.filter(regimen => regimen.autoVisible !== false)
      .filter(regimen => allergyAllowed(regimen, allergy))
      .filter(regimen => ageAllowed(regimen, months))
      .filter(regimen => thresholdMatches(regimen.dose, weight));

    list.replaceChildren();
    note.textContent = 'Jo alternativë ambulatore. Këto skema shfaqen vetëm si pathway parenteral i lidhur me eskalim/hospitalizim; zgjedhja përfundimtare kërkon kontekst klinik, alergji, kulturë dhe monitorim sipas rastit.';

    if (escalationVisible) {
      const stop = make('div', 'abx-hosp-escalation');
      stop.append(make('strong', '', 'Eskalim spitalor'), make('span', '', escalationText));
      list.append(stop);
    }

    if (!allowed.length && linked.length) {
      const empty = make('div', 'abx-hosp-empty');
      empty.append(
        make('strong', '', 'Nuk ka skemë parenterale të auto-publikuar për këtë profil.'),
        make('span', '', 'Profili i alergjisë/moshës kërkon pathway specialist ose alternativë të verifikuar; DRx nuk zëvendëson automatikisht antibiotikun.')
      );
      list.append(empty);
    } else {
      allowed.forEach(regimen => list.append(cardFor(regimen, weight, months)));
    }

    const count = allowed.length;
    badge.textContent = count ? `${count} ${count === 1 ? 'skemë' : 'skema'}` : 'eskalim';
    module.dataset.indication = indication;
    window.dispatchEvent(new CustomEvent('drx:antibiotics-hospital-rendered', {
      detail:{ indication, regimenIds:allowed.map(item => item.id) }
    }));
  }

  const observer = recommendations ? new MutationObserver(render) : null;
  observer?.observe(recommendations, { childList:true });

  document.addEventListener('change', event => {
    if (event.target?.matches?.('#ageSelect, input[name="abx-allergy"], #orbitalRedFlagsInput, input[name="abx-indication"]')) render();
  });
  document.getElementById('weightInput')?.addEventListener('input', render);
  window.addEventListener('popstate', render);
  render();
})();