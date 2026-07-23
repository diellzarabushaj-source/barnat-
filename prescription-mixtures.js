(() => {
  'use strict';

  const STORAGE_KEY = 'regjistriBarnave_protokollet_v1';
  const MIX_TYPES = {
    infusion: 'Infuzion i përzier',
    injectionSession: 'Injeksione në të njëjtën seancë',
  };
  const state = new Map();
  let activeProtocolId = '';
  let previewProtocolId = '';
  let renderQueued = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));

  function installStyles() {
    if (document.getElementById('prescriptionMixtureStyles')) return;
    const style = document.createElement('style');
    style.id = 'prescriptionMixtureStyles';
    style.textContent = `
      .mixture-builder{margin:0 0 11px;padding:11px;border:1px solid var(--line);border-radius:11px;background:linear-gradient(135deg,#f7faf9,#edf4f2)}
      .mixture-builder-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:9px}.mixture-builder-head strong{display:block;color:var(--teal-dark);font-size:.82rem}.mixture-builder-head span{display:block;margin-top:2px;color:#68777b;font-size:.68rem;line-height:1.4}
      .mixture-builder-actions{display:flex;flex-wrap:wrap;gap:7px}.mixture-builder-actions button{min-height:35px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font-size:.7rem;font-weight:800;cursor:pointer}.mixture-builder-actions button[data-mixture-all="infusion"]{background:var(--teal);border-color:var(--teal);color:#fff}.mixture-builder-actions button:hover{border-color:var(--teal)}
      .mixture-config{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(150px,1fr) minmax(130px,.72fr);gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);background:#f8fbfa}.mixture-config label{display:flex;flex-direction:column;gap:4px;color:#5f6f73;font-size:.64rem;font-weight:800}.mixture-config :is(select,input){width:100%;height:36px;padding:0 9px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font:inherit;font-size:.72rem}.protocol-drug.is-mixture-member{border-color:#9fbdb8}.protocol-drug.is-mixture-member .protocol-drug-head{background:linear-gradient(90deg,#e8f3f0,#f7faf9)}.mixture-group-badge{display:inline-flex;align-items:center;margin:0 0 5px;padding:3px 7px;border-radius:999px;background:#dfeeea;color:#0d4b4f;font-size:.62rem;font-weight:850}.mixture-safety{margin-top:8px;padding:8px 10px;border-left:3px solid #b87318;border-radius:7px;background:#fff8ec;color:#67481d;font-size:.66rem;line-height:1.45}
      .mi-rx-mixture{border:1px solid #b9cbc7;border-radius:10px;margin:16px 0;padding:0!important;overflow:hidden}.mi-rx-mixture>.mi-rx-no{margin:14px 0 0 14px}.mi-rx-mixture-body{padding:14px 16px 16px}.mi-rx-mixture-head{margin-bottom:10px;padding-bottom:9px;border-bottom:2px solid #155e63}.mi-rx-mixture-head em{font:italic 25px Georgia;color:#0d3d40}.mi-rx-mixture-head h3{margin:3px 0 0}.mi-rx-mixture-line{display:grid;grid-template-columns:auto 1fr;gap:9px;padding:7px 0;border-bottom:1px dashed #d7e1de}.mi-rx-mixture-line:last-of-type{border-bottom:0}.mi-rx-mixture-line b{min-width:52px;color:#0d3d40}.mi-rx-mixture-warning{margin-top:10px;padding:8px 10px;border-left:3px solid #b87318;background:#fff8ec;color:#67481d;font-size:10px;line-height:1.4}
      html[data-theme="dark"] .mixture-builder,html[data-theme="dark"] .mixture-config{background:#162629;color:#e8f0ee}html[data-theme="dark"] .mixture-builder-actions button,html[data-theme="dark"] .mixture-config :is(select,input){background:#101d20;color:#e8f0ee;border-color:#34484b}html[data-theme="dark"] .protocol-drug.is-mixture-member .protocol-drug-head{background:#1b3033}html[data-theme="dark"] .mixture-group-badge{background:#1d3d3f;color:#d8efea}html[data-theme="dark"] .mixture-safety,html[data-theme="dark"] .mi-rx-mixture-warning{background:#302719;color:#ead0a5}
      @media(max-width:700px){.mixture-builder-head{flex-direction:column}.mixture-config{grid-template-columns:1fr}.mixture-builder-actions button{flex:1 1 145px}}
    `;
    document.head.appendChild(style);
  }

  function getProtocols() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function setProtocols(protocols) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(protocols)); } catch {}
  }

  function nextGroupLabel(type) {
    const base = type === 'infusion' ? 'Infuzion' : 'Injeksione';
    const existing = new Set([...state.values()].map(value => value.group).filter(Boolean));
    let index = 1;
    while (existing.has(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
  }

  function recordFor(key) {
    if (!state.has(key)) state.set(key, { type:'', group:'', role:'additive' });
    return state.get(key);
  }

  function loadProtocolState(protocol) {
    state.clear();
    activeProtocolId = protocol?.id || '';
    (protocol?.items || []).forEach(item => {
      if (!item?.drugKey) return;
      state.set(String(item.drugKey), {
        type: String(item.mixtureType || ''),
        group: String(item.mixtureGroup || ''),
        role: String(item.mixtureRole || 'additive'),
      });
    });
    queueDecorate();
  }

  function currentCards() {
    return [...document.querySelectorAll('#protocolDrugList .protocol-drug[data-drug-key]')];
  }

  function cardKey(card) { return String(card?.dataset?.drugKey || ''); }

  function setAll(type) {
    const cards = currentCards();
    if (!cards.length) return;
    const group = nextGroupLabel(type);
    cards.forEach((card, index) => {
      const record = recordFor(cardKey(card));
      record.type = type;
      record.group = group;
      record.role = type === 'infusion' && index === 0 ? 'base' : 'additive';
    });
    decorate();
  }

  function clearAll() {
    currentCards().forEach(card => state.delete(cardKey(card)));
    decorate();
  }

  function ensureBuilder() {
    const list = document.getElementById('protocolDrugList');
    if (!list || document.getElementById('mixtureBuilder')) return;
    const builder = document.createElement('section');
    builder.id = 'mixtureBuilder';
    builder.className = 'mixture-builder';
    builder.innerHTML = `
      <div class="mixture-builder-head"><div><strong>Përzierje dhe administrim i përbashkët</strong><span>Grupo infuzionet që përzihen në të njëjtën qese ose injeksionet që administrohen në të njëjtën seancë.</span></div></div>
      <div class="mixture-builder-actions">
        <button type="button" data-mixture-all="infusion">Krijo koktell / infuzion</button>
        <button type="button" data-mixture-all="injectionSession">Grupo injeksionet</button>
        <button type="button" data-mixture-clear>Hiq grupimin</button>
      </div>
      <div class="mixture-safety"><strong>Kontroll klinik:</strong> grupimi dokumenton mënyrën e planifikuar të administrimit; nuk konfirmon automatikisht kompatibilitetin, stabilitetin ose sigurinë e përzierjes.</div>`;
    list.parentElement?.insertBefore(builder, list);
    builder.addEventListener('click', event => {
      const type = event.target.closest('[data-mixture-all]')?.dataset.mixtureAll;
      if (type) setAll(type);
      if (event.target.closest('[data-mixture-clear]')) clearAll();
    });
  }

  function option(value, label, current) {
    return `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(label)}</option>`;
  }

  function decorateCard(card) {
    const key = cardKey(card);
    if (!key) return;
    const record = recordFor(key);
    let config = card.querySelector('.mixture-config');
    if (!config) {
      config = document.createElement('div');
      config.className = 'mixture-config';
      const fields = card.querySelector('.protocol-drug-fields');
      card.insertBefore(config, fields || null);
    }

    const signature = JSON.stringify(record);
    if (config.dataset.signature !== signature) {
      config.dataset.signature = signature;
      config.innerHTML = `
        <label>Lloji i administrimit<select data-mixture-field="type">
          ${option('', 'Veçmas', record.type)}
          ${option('infusion', 'Infuzion i përzier', record.type)}
          ${option('injectionSession', 'Injeksione në të njëjtën seancë', record.type)}
        </select></label>
        <label>Emri i grupit<input data-mixture-field="group" value="${esc(record.group)}" placeholder="p.sh. Infuzion 1"></label>
        <label>Roli në grup<select data-mixture-field="role">
          ${option('base', 'Tretës / bazë', record.role)}
          ${option('additive', 'Bar shtesë', record.role)}
        </select></label>`;

      config.querySelectorAll('[data-mixture-field]').forEach(control => {
        control.disabled = !record.type && control.dataset.mixtureField !== 'type';
        control.addEventListener('change', () => {
          const field = control.dataset.mixtureField;
          record[field] = control.value;
          if (field === 'type' && control.value && !record.group) record.group = nextGroupLabel(control.value);
          if (field === 'type' && !control.value) {
            record.group = '';
            record.role = 'additive';
          }
          decorate();
        });
        if (control.tagName === 'INPUT') {
          control.addEventListener('input', () => {
            record[control.dataset.mixtureField] = control.value;
            config.dataset.signature = JSON.stringify(record);
            updateCardState(card, record);
          });
        }
      });
    }

    const fields = card.querySelector('.protocol-drug-fields');
    const dose = [...(fields?.children || [])].find(node => /Doza për marrje/i.test(node.querySelector('label')?.textContent || ''));
    if (fields && dose && fields.firstElementChild !== dose) fields.insertBefore(dose, fields.firstElementChild);
    updateCardState(card, record);
  }

  function updateCardState(card, record) {
    const active = Boolean(record.type && record.group);
    card.classList.toggle('is-mixture-member', active);
    const existing = card.querySelector('.mixture-group-badge');
    if (!active) {
      existing?.remove();
      return;
    }
    const label = `${record.group} · ${MIX_TYPES[record.type] || 'Grup'}`;
    if (existing?.textContent === label) return;
    const badge = existing || document.createElement('span');
    badge.className = 'mixture-group-badge';
    badge.textContent = label;
    if (!existing) card.querySelector('.protocol-drug-head>div')?.prepend(badge);
  }

  function decorate() {
    ensureBuilder();
    currentCards().forEach(decorateCard);
  }

  function queueDecorate() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      decorate();
    });
  }

  function itemFromCard(card) {
    const fields = {};
    card.querySelectorAll('[data-item-field]').forEach(control => { fields[control.dataset.itemField] = control.value; });
    const mixture = state.get(cardKey(card)) || {};
    return {
      drugKey: cardKey(card),
      tradeName: card.dataset.tradeName || '',
      substance: card.dataset.substance || '',
      strength: card.dataset.strength || '',
      form: card.dataset.form || '',
      atc: card.dataset.atc || '',
      qualityStatus: card.dataset.qualityStatus || 'verified',
      ...fields,
      mixtureType: mixture.type || '',
      mixtureGroup: mixture.group || '',
      mixtureRole: mixture.role || 'additive',
    };
  }

  function currentProtocol() {
    const review = window.MedIndexPrescriptionReview?.state?.() || {};
    return {
      id: activeProtocolId || `p_${Date.now()}`,
      name: document.getElementById('protocolName')?.value.trim() || '',
      indication: document.getElementById('protocolIndication')?.value.trim() || '',
      population: document.getElementById('protocolPopulation')?.value.trim() || '',
      patientName: document.getElementById('protocolPatientName')?.value.trim() || '',
      birthDate: document.getElementById('protocolBirthDate')?.value || '',
      patientId: document.getElementById('protocolPatientId')?.value.trim() || '',
      allergies: document.getElementById('protocolAllergies')?.value.trim() || '',
      patientType: document.getElementById('protocolPatientType')?.value || 'adult',
      ageValue: document.getElementById('protocolAgeValue')?.value || '',
      ageUnit: document.getElementById('protocolAgeUnit')?.value || 'years',
      weightKg: document.getElementById('protocolWeightKg')?.value || '',
      version: document.getElementById('protocolVersion')?.value.trim() || '',
      notes: document.getElementById('protocolNotes')?.value.trim() || '',
      clinicalReview: Boolean(review.reviewed),
      reviewedAt: review.reviewedAt || '',
      reviewedBy: review.reviewed ? 'Dr. Diellza Rabushaj' : '',
      updatedAt: new Date().toISOString(),
      items: currentCards().map(itemFromCard),
    };
  }

  function patchSavedProtocol(startedAt, expectedName) {
    const protocols = getProtocols();
    if (!protocols.length) return;
    let index = activeProtocolId ? protocols.findIndex(protocol => protocol.id === activeProtocolId) : -1;
    const isRecentMatch = protocol => {
      const updated = Date.parse(protocol?.updatedAt || 0) || 0;
      return updated >= startedAt - 1000 && (!expectedName || protocol?.name === expectedName);
    };
    if (index < 0 || !isRecentMatch(protocols[index])) index = protocols.findIndex(isRecentMatch);
    if (index < 0) return;
    const protocol = protocols[index];
    const byKey = new Map(currentCards().map(card => [cardKey(card), state.get(cardKey(card)) || {}]));
    protocol.items = (protocol.items || []).map(item => {
      const mixture = byKey.get(String(item.drugKey || '')) || {};
      return { ...item, mixtureType:mixture.type || '', mixtureGroup:mixture.group || '', mixtureRole:mixture.role || 'additive' };
    });
    activeProtocolId = protocol.id;
    protocols[index] = protocol;
    setProtocols(protocols);
  }

  function genericName(item) { return String(item?.substance || item?.tradeName || 'Bar pa emër').trim(); }
  function doseText(item) { return String(item?.dose || item?.strength || '').trim(); }
  function rxLine(item, inlineQuantity = false) {
    const parts = [item.prefix, genericName(item), doseText(item)].filter(Boolean);
    if (inlineQuantity && item.quantity) parts.push(/^a\s/i.test(item.quantity) ? item.quantity : `a ${item.quantity}`);
    return parts.join(' ');
  }
  function regimen(item) { return [item.dose, item.route, item.frequency, item.duration].filter(Boolean).join(' · '); }

  function groupedEntries(items) {
    const entries = [];
    const groups = new Map();
    (items || []).forEach(item => {
      if (!item.mixtureType || !item.mixtureGroup) {
        entries.push({ type:'single', items:[item] });
        return;
      }
      const key = `${item.mixtureType}::${item.mixtureGroup}`;
      if (!groups.has(key)) {
        const entry = { type:'mixture', mixtureType:item.mixtureType, mixtureGroup:item.mixtureGroup, items:[] };
        groups.set(key, entry);
        entries.push(entry);
      }
      groups.get(key).items.push(item);
    });
    entries.forEach(entry => {
      if (entry.type === 'mixture') entry.items.sort((a, b) => (a.mixtureRole === 'base' ? -1 : 0) - (b.mixtureRole === 'base' ? -1 : 0));
    });
    return entries;
  }

  function patientSummary(protocol) {
    const parts = [protocol.patientType === 'pediatric' ? 'Pediatrik' : protocol.patientType === 'manual' ? 'Manual' : 'I rritur'];
    if (protocol.ageValue) parts.push(`Mosha: ${protocol.ageValue}${protocol.ageUnit === 'months' ? ' muaj' : ' vjeç'}`);
    if (protocol.weightKg) parts.push(`Pesha: ${protocol.weightKg} kg`);
    return parts.join(' · ');
  }

  function protocolToText(protocol) {
    const lines = [];
    lines.push(protocol.name || 'RECETË');
    lines.push('Statusi: ' + (protocol.clinicalReview ? 'E KONTROLLUAR KLINIKISHT' : 'DRAFT'));
    if (protocol.patientName) lines.push('Pacienti: ' + protocol.patientName);
    if (protocol.birthDate) lines.push('Datëlindja: ' + protocol.birthDate);
    if (protocol.patientId) lines.push('Nr. personal / ID: ' + protocol.patientId);
    if (protocol.allergies) lines.push('Alergjitë: ' + protocol.allergies);
    if (protocol.indication) lines.push('Diagnoza / indikacioni: ' + protocol.indication);
    if (protocol.population) lines.push('Grupi: ' + protocol.population);
    lines.push('Profili: ' + patientSummary(protocol));
    if (protocol.version) lines.push('Versioni/Data: ' + protocol.version);
    lines.push('');

    groupedEntries(protocol.items).forEach((entry, index) => {
      if (entry.type === 'single') {
        const item = entry.items[0];
        lines.push(`${index + 1}. Rp. ${rxLine(item)}`);
        if (item.quantity) lines.push('   D. No: ' + item.quantity);
        lines.push('   S. ' + (item.instructions || regimen(item) || 'Nuk është plotësuar.'));
        if (item.clinicalNotes) lines.push('   Vërejtje klinike: ' + item.clinicalNotes.replace(/\n+/g, ' | '));
        return;
      }

      lines.push(`${index + 1}. Rp: ${entry.mixtureGroup} — ${MIX_TYPES[entry.mixtureType] || 'Grup administrimi'}`);
      entry.items.forEach(item => lines.push('   ' + rxLine(item, entry.mixtureType === 'infusion')));
      lines.push(entry.mixtureType === 'infusion'
        ? '   Përzihen dhe administrohen së bashku në të njëjtin infuzion.'
        : '   Administrohen në të njëjtën seancë sipas rrugës së përcaktuar për secilin bar.');
      const signatura = entry.items.map(item => item.instructions || regimen(item)).filter(Boolean).join(' | ');
      if (signatura) lines.push('   S. ' + signatura);
      lines.push('   Verifiko kompatibilitetin, stabilitetin, hollimin, rrugën dhe shpejtësinë para administrimit.');
    });

    if (protocol.notes) { lines.push(''); lines.push('Vërejtje/monitorim: ' + protocol.notes); }
    lines.push('');
    lines.push('Shënim: Grupimi nuk konfirmon automatikisht kompatibilitetin ose sigurinë e përzierjes; kërkohet verifikim klinik dhe farmaceutik.');
    return lines.join('\n');
  }

  function itemMarkup(item) {
    const scheme = regimen(item);
    return `<div class="mi-rx-mixture-line"><b>${esc(item.prefix || (item.mixtureRole === 'base' ? 'Inf.' : 'Amp.'))}</b><span>${esc([genericName(item), doseText(item), item.mixtureType === 'infusion' && item.quantity ? (/^a\s/i.test(item.quantity) ? item.quantity : 'a ' + item.quantity) : ''].filter(Boolean).join(' '))}${scheme ? `<small style="display:block;color:#68777b;margin-top:2px">${esc(scheme)}</small>` : ''}</span></div>`;
  }

  function mixtureMarkup(entry, index) {
    return `<section class="mi-rx-item mi-rx-mixture"><div class="mi-rx-no">${index + 1}</div><div class="mi-rx-mixture-body"><div class="mi-rx-mixture-head"><em>Rp.</em><h3>${esc(entry.mixtureGroup)} · ${esc(MIX_TYPES[entry.mixtureType] || 'Grup administrimi')}</h3></div>${entry.items.map(itemMarkup).join('')}<div class="mi-sign"><b>Administrimi</b><span>${entry.mixtureType === 'infusion' ? 'Përzihen dhe administrohen së bashku në të njëjtin infuzion.' : 'Administrohen në të njëjtën seancë sipas rrugës së përcaktuar për secilin bar.'}</span></div><div class="mi-rx-mixture-warning">Verifiko kompatibilitetin, stabilitetin, hollimin, rrugën dhe shpejtësinë para administrimit.</div></div></section>`;
  }

  function refreshPreview() {
    if (!previewProtocolId) return;
    const body = document.getElementById('miBody');
    const protocol = getProtocols().find(item => String(item.id) === String(previewProtocolId));
    const article = body?.querySelector('.mi-rx');
    if (!article || !protocol || article.querySelector('.mi-rx-mixture')) return;
    const entries = groupedEntries(protocol.items);
    if (!entries.some(entry => entry.type === 'mixture')) return;
    article.querySelectorAll('.mi-rx-item').forEach(node => node.remove());
    const meta = article.querySelector('.mi-rx-meta');
    if (!meta) return;
    let anchor = meta;
    entries.forEach((entry, index) => {
      const wrapper = document.createElement('div');
      if (entry.type === 'mixture') wrapper.innerHTML = mixtureMarkup(entry, index);
      else {
        const item = entry.items[0];
        wrapper.innerHTML = `<section class="mi-rx-item"><div class="mi-rx-no">${index + 1}</div><div><em>Rp.</em><h3>${esc(rxLine(item))}</h3>${item.quantity ? `<div class="mi-dispense"><b>Dispenso</b><span>${esc(item.quantity)}</span></div>` : ''}<div class="mi-sign"><b>Signatura</b><span>${esc(item.instructions || regimen(item) || 'Signatura nuk është plotësuar.')}</span></div></div></section>`;
      }
      const node = wrapper.firstElementChild;
      anchor.after(node);
      anchor = node;
    });
  }

  function canPrint(protocol, currentDraft = false) {
    const result = currentDraft
      ? window.MedIndexPrescriptionReview?.validateForPrint?.()
      : window.MedIndexPrescriptionReview?.validateProtocol?.(protocol, { requireReview:true });
    if (result && !result.ok) {
      window.showProtocolToast?.(result.issues?.[0]?.message || 'Receta nuk është gati për printim.');
      return false;
    }
    return true;
  }

  function printProtocol(protocol, currentDraft = false) {
    if (!canPrint(protocol, currentDraft)) return false;
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) {
      window.showProtocolToast?.('Shfletuesi e bllokoi dritaren e printimit.');
      return false;
    }
    const content = protocolToText(protocol).split('\n').map(line => `<div>${line ? esc(line) : '&nbsp;'}</div>`).join('');
    popup.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><title>${esc(protocol.name || 'Recetë')}</title><style>body{font-family:Arial,sans-serif;max-width:850px;margin:35px auto;padding:0 24px;color:#17252a;line-height:1.55}div{white-space:pre-wrap}div:first-child{font-size:24px;font-weight:700;margin-bottom:8px}@media print{body{margin:0}}</style></head><body>${content}<script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
    return true;
  }

  function interceptActions() {
    window.addEventListener('click', event => {
      const load = event.target.closest?.('[data-load-protocol]');
      if (load) {
        previewProtocolId = load.dataset.loadProtocol || '';
        const protocol = getProtocols().find(item => String(item.id) === String(previewProtocolId));
        if (protocol) loadProtocolState(protocol);
        setTimeout(refreshPreview, 0);
      }

      if (event.target.closest?.('#newProtocolBtn')) {
        activeProtocolId = '';
        state.clear();
        queueDecorate();
      }

      if (event.target.closest?.('#saveProtocolBtn')) {
        const startedAt = Date.now();
        const expectedName = document.getElementById('protocolName')?.value.trim() || '';
        setTimeout(() => patchSavedProtocol(startedAt, expectedName), 0);
      }

      if (event.target.closest?.('#copyProtocolBtn')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const protocol = currentProtocol();
        navigator.clipboard?.writeText(protocolToText(protocol)).catch(() => {});
        window.showProtocolToast?.('Teksti u kopjua me grupimin e përzierjeve.');
      }

      if (event.target.closest?.('#printProtocolBtn')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        printProtocol(currentProtocol(), true);
      }

      const previewAction = event.target.closest?.('#miOverlay [data-a]')?.dataset.a;
      if (previewAction === 'print' && previewProtocolId) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const protocol = getProtocols().find(item => String(item.id) === String(previewProtocolId));
        if (protocol) printProtocol(protocol, false);
      }
    }, true);
  }

  function init() {
    if (!document.getElementById('protocolDrugList')) return;
    installStyles();
    interceptActions();
    window.protocolToText = protocolToText;
    const observer = new MutationObserver(() => {
      queueDecorate();
      if (!document.getElementById('miOverlay')?.hidden) setTimeout(refreshPreview, 0);
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    queueDecorate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
