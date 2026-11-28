(() => {
  'use strict';

  const PAGE_SIZE = 10;
  const clean = value => String(value ?? '').trim();

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function definitionList(fields) {
    const list = node('dl', undefined, 'atc-drug-fields');
    for (const [label, value] of fields) {
      if (clean(label) && clean(value)) list.append(node('dt', label), node('dd', clean(value)));
    }
    return list;
  }

  function fieldSection(title, fields) {
    const list = definitionList(fields);
    if (!list.childElementCount) return null;
    const section = node('section', undefined, 'atc-drug-section');
    section.append(node('h3', title), list);
    return section;
  }

  function sourceSection(detail) {
    const sourceFields = Array.isArray(detail.sourceFields) ? detail.sourceFields : [];
    const list = definitionList(sourceFields.map(item => [item?.label, item?.value]));
    if (!list.childElementCount) return null;
    const section = node('details', undefined, 'atc-drug-section');
    section.append(node('summary', 'Fushat burimore të regjistrit'), list);
    return section;
  }

  function money(value) {
    return clean(value) && Number.isFinite(Number(value))
      ? new Intl.NumberFormat('sq-XK', {style:'currency',currency:'EUR'}).format(Number(value))
      : '';
  }

  function sourceLinks(values) {
    const list = node('ul', undefined, 'atc-drug-sources');
    for (const value of new Set(values.map(clean).filter(value => /^https:\/\//i.test(value)))) {
      const link = node('a', value);
      link.href = value;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const entry = node('li');
      entry.append(link);
      list.append(entry);
    }
    if (!list.childElementCount) return null;
    const section = node('section', undefined, 'atc-drug-section');
    section.append(node('h3', 'Burimet'), list);
    return section;
  }

  function dosageSections(card) {
    const sections = [];
    for (const [key, label] of [['adult','Dozologjia për të rritur'], ['pediatric','Dozologjia pediatrike']]) {
      const extra = Array.isArray(card[key + 'Regimens']) ? card[key + 'Regimens'] : [];
      const section = node('section', undefined, 'atc-drug-section');
      const seen = new Set();
      section.append(node('h3', label));
      for (const regimen of [card[key], ...extra]) {
        if (!regimen || !clean(regimen.dose)) continue;
        const fields = [
          ['Indikacioni',regimen.indication], ['Doza',regimen.dose], ['Rruga',regimen.route],
          ['Frekuenca',regimen.frequency], ['Kohëzgjatja',regimen.duration],
          ['Maksimumi',regimen.maximum], ['Paralajmërimet',regimen.warnings],
          ['Verifikimi',regimen.verification],
        ];
        const signature = JSON.stringify(fields);
        if (seen.has(signature)) continue;
        seen.add(signature);
        section.append(definitionList(fields));
      }
      if (!seen.size) section.append(node('p','Nuk ka dozë të publikuar në kartelë.'));
      sections.push(section);
    }
    return sections;
  }

  function registrySections(detail) {
    return [
      fieldSection('Të dhënat e barit', [
        ['Substanca aktive', detail.activeSubstance], ['Fortësia', detail.strength],
        ['Forma', detail.form], ['Paketimi', detail.packaging], ['Kodi ATC', detail.atc],
        ['Klasa', detail.drugClass], ['Përdorimi', detail.use], ['Popullata e miratuar', detail.approvedPopulation],
        ['Shënimi në recetë', detail.prescriptionNotation],
      ]),
      fieldSection('Regjistrimi dhe çmimi', [
        ['Nr. i regjistrit', detail.registryNumber], ['PDID', detail.pdid],
        ['Prodhuesi', detail.manufacturer], ['Mbajtësi i autorizimit', detail.marketingAuthorizationHolder],
        ['Certifikata', detail.maCertificate], ['Vlefshmëria', detail.validity],
        ['Statusi i produktit', detail.productStatus], ['Statusi i përditësimit', detail.updateStatus],
        ['Çmimi me pakicë', money(detail.retailPrice)], ['Çmimi me shumicë', money(detail.wholesalePrice)],
      ]),
    ].filter(Boolean);
  }

  function clinicalSections(detail, card) {
    const sources = sourceLinks([
      ...(Array.isArray(card?.sources) ? card.sources : []),
      ...(Array.isArray(detail.sourceFields) ? detail.sourceFields.map(field => field?.value) : []),
    ]);
    if (!card) return [node('p', 'Dozologjia dhe profili klinik nuk u ngarkuan.', 'atc-drug-feedback'), sources].filter(Boolean);
    const profile = card.profile || {};
    const profileSection = fieldSection('Profili klinik', [
      ['Përmbledhja', profile.summary], ['Indikacionet', profile.indications],
      ['Kundërindikacionet', profile.contraindications], ['Paralajmërimet', profile.warnings],
      ['Interaksionet', profile.interactions], ['Shtatzënia dhe gjidhënia', profile.pregnancyLactation],
      ['Rregullimi renal', profile.renalAdjustment], ['Rregullimi hepatik', profile.hepaticAdjustment],
      ['Monitorimi', profile.monitoring], ['Administrimi', profile.administrationNotes],
      ['Verifikimi', profile.verificationStatus], ['Rishikuar më', profile.reviewedAt],
    ]);
    return [...dosageSections(card), profileSection, sources].filter(Boolean);
  }

  function create(fetchJson) {
    const get = id => document.getElementById(id);
    const title = get('atcMedicinesTitle');
    const status = get('atcMedicinesStatus');
    const list = get('atcMedicineList');
    const retry = get('atcMedicineRetry');
    const pagination = get('atcMedicinePagination');
    const previous = get('atcMedicinePrevious');
    const next = get('atcMedicineNext');
    const pageLabel = get('atcMedicinePage');
    const drawer = get('atcDrugDrawer');
    const drawerTitle = get('atcDrugTitle');
    const body = get('atcDrugBody');
    let code = '', page = 1, started = false;
    let listController, detailController, returnFocus;

    function reveal() {
      title.focus({ preventScroll:true });
      title.scrollIntoView({ block:'start' });
    }

    function renderRow(row) {
      const item = node('li');
      const button = node('button', undefined, 'atc-medicine-button');
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog');
      const copy = node('span', undefined, 'atc-medicine-copy');
      copy.append(node('strong', row.tradeName));
      const description = [row.activeSubstance, row.strength, row.form].map(clean).filter(Boolean).join(' · ');
      if (description) copy.append(node('small', description));
      const arrow = node('span', '›', 'atc-medicine-arrow');
      arrow.setAttribute('aria-hidden', 'true');
      button.append(copy, arrow);
      button.addEventListener('click', () => void openDetail(row, button));
      item.append(button);
      return item;
    }

    async function loadPage(targetPage = page) {
      listController?.abort();
      const controller = new AbortController();
      listController = controller;
      const selectedCode = code;
      page = targetPage;
      title.textContent = `Barnat · ${selectedCode}`;
      list.replaceChildren();
      list.setAttribute('aria-busy', 'true');
      status.textContent = 'Duke ngarkuar barnat…';
      retry.hidden = true;
      pagination.hidden = true;
      const query = new URLSearchParams({
        view:'registry-page', atc:selectedCode, page:String(page), pageSize:String(PAGE_SIZE), includeTotal:'true', sort:'name',
      });
      try {
        const { payload } = await fetchJson('/api/drug-search?' + query, {signal:controller.signal}, 8500);
        if (controller.signal.aborted) return;
        if (!Array.isArray(payload.rows)) throw new Error('Përgjigjja nuk përmban listën e barnave.');
        const rows = payload.rows.filter(row => clean(row?.id) && clean(row.tradeName) && clean(row.atc).toUpperCase().startsWith(selectedCode));
        const meta = payload.pagination || {};
        list.replaceChildren(...rows.map(renderRow));
        status.textContent = !rows.length ? 'Nuk ka barna të publikuara për këtë kod ATC.'
          : Number.isFinite(meta.total) ? `${meta.total.toLocaleString('sq-XK')} ${meta.total === 1 ? 'bar' : 'barna'} në regjistër` : 'Barnat e publikuara në regjistër';
        previous.disabled = page <= 1;
        next.disabled = !meta.hasNext;
        pageLabel.textContent = Number.isFinite(meta.totalPages) ? `Faqja ${page} / ${meta.totalPages}` : `Faqja ${page}`;
        pagination.hidden = previous.disabled && next.disabled;
      } catch {
        if (controller.signal.aborted) return;
        status.textContent = 'Barnat nuk u ngarkuan.';
        retry.hidden = false;
      } finally {
        if (!controller.signal.aborted) list.removeAttribute('aria-busy');
      }
    }

    async function openDetail(row, trigger) {
      detailController?.abort();
      const controller = new AbortController();
      detailController = controller;
      if (!drawer.open) {
        returnFocus = trigger;
        drawer.showModal();
      }
      drawerTitle.textContent = row.tradeName;
      body.scrollTop = 0;
      const feedback = node('p', 'Duke ngarkuar kartelën…', 'atc-drug-feedback');
      feedback.setAttribute('role', 'status');
      body.replaceChildren(feedback);
      const query = encodeURIComponent(row.id);
      const options = {signal:controller.signal};
      const cardRequest = fetchJson('/api/dosage?view=card&id=' + query, options, 8500).catch(() => null);
      try {
        const { payload } = await fetchJson('/api/drug-search?view=registry-detail&id=' + query, options, 8500);
        if (controller.signal.aborted) return;
        const detail = payload.row;
        if (!detail || clean(detail.id) !== clean(row.id)) throw new Error('Identiteti i barit nuk përputhet.');
        drawerTitle.textContent = clean(detail.tradeName) || row.tradeName;
        body.replaceChildren(...registrySections(detail), feedback);
        feedback.textContent = 'Duke ngarkuar dozologjinë…';
        const result = await cardRequest;
        if (controller.signal.aborted) return;
        const card = result?.payload;
        feedback.replaceWith(...clinicalSections(detail, clean(card?.drugId) === clean(row.id) ? card : null));
        const source = sourceSection(detail);
        if (source) body.append(source);
      } catch {
        if (controller.signal.aborted) return;
        feedback.textContent = 'Kartela nuk u ngarkua.';
        const retryButton = node('button', 'Provo përsëri', 'button button-secondary');
        retryButton.type = 'button';
        retryButton.addEventListener('click', () => void openDetail(row));
        body.append(retryButton);
      }
    }

    retry.addEventListener('click', () => void loadPage());
    previous.addEventListener('click', () => { reveal(); void loadPage(page - 1); });
    next.addEventListener('click', () => { reveal(); void loadPage(page + 1); });
    drawer.addEventListener('click', event => { if (event.target === drawer) drawer.close(); });
    drawer.addEventListener('close', () => {
      if (drawer.open) return;
      detailController?.abort();
      if (returnFocus?.isConnected) returnFocus.focus();
      else title.focus();
      returnFocus = null;
    });

    return {
      reveal,
      select(selectedCode) {
        if (code === selectedCode) return;
        code = selectedCode;
        if (started) void loadPage(1);
      },
      start() {
        started = true;
        if (code) void loadPage(1);
      },
    };
  }

  window.DRxAtcDrugs = Object.freeze({ create });
})();
