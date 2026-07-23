(() => {
  'use strict';

  const STORAGE_KEY = 'regjistriBarnave_protokollet_v1';
  const draftMeta = new Map();
  let activeProtocolId = '';
  let decorating = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function protocols() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveProtocols(value) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
  }

  function newestProtocol() {
    return [...protocols()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
  }

  function itemKey(card, index) {
    return card?.dataset.drugKey || `index:${index}`;
  }

  function savedMetadata(index, card) {
    const protocol = protocols().find(item => String(item.id) === String(activeProtocolId));
    const item = protocol?.items?.[index];
    if (item) return item;
    return draftMeta.get(itemKey(card, index)) || {};
  }

  function controlsMarkup(index, metadata) {
    const linked = Boolean(metadata.mixWithPrevious);
    const checked = Boolean(metadata.mixtureCompatibilityConfirmed);
    return `<section class="cocktail-controls" aria-label="Administrimi i përbashkët">
      ${index > 0 ? `<label class="cocktail-link"><input type="checkbox" data-cocktail-field="mixWithPrevious" ${linked ? 'checked' : ''}><span>Përzieje ose administroje bashkë me barin sipër</span></label>` : '<div class="cocktail-leader-label">Përgatitje e përbashkët / koktej</div>'}
      <div class="cocktail-grid">
        <label><span>Emri i përgatitjes</span><input type="text" data-cocktail-field="mixtureName" value="${esc(metadata.mixtureName || '')}" placeholder="p.sh. Infuzion 1"></label>
        <label class="cocktail-confirm"><input type="checkbox" data-cocktail-field="mixtureCompatibilityConfirmed" ${checked ? 'checked' : ''}><span>Kompatibiliteti fizik, farmaceutik dhe i linjës IV është verifikuar</span></label>
      </div>
      <p>Përzierja nuk verifikohet automatikisht nga MedIndex. Konfirmimi kërkohet para ruajtjes.</p>
    </section>`;
  }

  function decorateBuilder() {
    if (decorating) return;
    const cards = [...document.querySelectorAll('#protocolDrugList .protocol-drug')];
    if (!cards.length) return;
    decorating = true;
    cards.forEach((card, index) => {
      if (card.querySelector('.cocktail-controls')) return;
      const metadata = savedMetadata(index, card);
      card.insertAdjacentHTML('beforeend', controlsMarkup(index, metadata));
      card.querySelectorAll('[data-cocktail-field]').forEach(control => {
        const update = () => {
          const key = itemKey(card, index);
          const current = draftMeta.get(key) || {};
          current[control.dataset.cocktailField] = control.type === 'checkbox' ? control.checked : control.value;
          draftMeta.set(key, current);
          card.dataset[control.dataset.cocktailField] = String(current[control.dataset.cocktailField]);
          updateGroupStates();
        };
        control.addEventListener(control.type === 'checkbox' ? 'change' : 'input', update);
        update();
      });
    });
    updateGroupStates();
    decorating = false;
  }

  function cardMetadata(card, index) {
    const key = itemKey(card, index);
    const stored = draftMeta.get(key) || {};
    return {
      mixWithPrevious: index > 0 && Boolean(stored.mixWithPrevious),
      mixtureName: String(stored.mixtureName || '').trim(),
      mixtureCompatibilityConfirmed: Boolean(stored.mixtureCompatibilityConfirmed),
    };
  }

  function updateGroupStates() {
    const cards = [...document.querySelectorAll('#protocolDrugList .protocol-drug')];
    cards.forEach((card, index) => {
      const metadata = cardMetadata(card, index);
      const next = cards[index + 1] ? cardMetadata(cards[index + 1], index + 1) : null;
      card.classList.toggle('is-cocktail-member', metadata.mixWithPrevious);
      card.classList.toggle('is-cocktail-leader', Boolean(next?.mixWithPrevious));
      const leaderControls = card.querySelector('.cocktail-grid');
      if (leaderControls) leaderControls.hidden = metadata.mixWithPrevious;
    });
  }

  function currentCocktailMetadata() {
    return [...document.querySelectorAll('#protocolDrugList .protocol-drug')].map((card, index) => cardMetadata(card, index));
  }

  function validateCocktails() {
    const metadata = currentCocktailMetadata();
    for (let index = 1; index < metadata.length; index++) {
      if (!metadata[index].mixWithPrevious) continue;
      let leaderIndex = index - 1;
      while (leaderIndex > 0 && metadata[leaderIndex].mixWithPrevious) leaderIndex--;
      if (!metadata[leaderIndex].mixtureCompatibilityConfirmed) {
        const card = document.querySelectorAll('#protocolDrugList .protocol-drug')[leaderIndex];
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card?.querySelector('[data-cocktail-field="mixtureCompatibilityConfirmed"]')?.focus();
        window.showProtocolToast?.('Verifiko dhe konfirmo kompatibilitetin e përzierjes para ruajtjes.');
        return false;
      }
    }
    return true;
  }

  function patchSavedProtocol() {
    const all = protocols();
    const target = activeProtocolId ? all.find(item => String(item.id) === String(activeProtocolId)) : newestProtocol();
    if (!target) return;
    const metadata = currentCocktailMetadata();
    target.items = (target.items || []).map((item, index) => ({ ...item, ...(metadata[index] || {}) }));
    const targetIndex = all.findIndex(item => String(item.id) === String(target.id));
    if (targetIndex >= 0) all[targetIndex] = target;
    saveProtocols(all);
    activeProtocolId = String(target.id);
  }

  function formValue(id) {
    return document.getElementById(id)?.value?.trim?.() || '';
  }

  function currentProtocolSnapshot() {
    const latest = activeProtocolId ? protocols().find(item => String(item.id) === String(activeProtocolId)) : newestProtocol();
    const cards = [...document.querySelectorAll('#protocolDrugList .protocol-drug')];
    const items = cards.map((card, index) => {
      const field = name => card.querySelector(`[data-item-field="${name}"]`)?.value?.trim?.() || '';
      return {
        ...(latest?.items?.[index] || {}),
        tradeName: card.dataset.tradeName || latest?.items?.[index]?.tradeName || '',
        substance: card.dataset.substance || latest?.items?.[index]?.substance || '',
        strength: card.dataset.strength || latest?.items?.[index]?.strength || '',
        form: card.dataset.form || latest?.items?.[index]?.form || '',
        atc: card.dataset.atc || latest?.items?.[index]?.atc || '',
        prefix: field('prefix'), quantity: field('quantity'), dose: field('dose'), route: field('route'),
        frequency: field('frequency'), duration: field('duration'), instructions: field('instructions'),
        clinicalNotes: field('clinicalNotes'), ...cardMetadata(card, index),
      };
    });
    return {
      ...(latest || {}),
      name: formValue('protocolName') || latest?.name || 'RECETË',
      indication: formValue('protocolIndication') || latest?.indication || '',
      population: formValue('protocolPopulation') || latest?.population || '',
      patientName: formValue('protocolPatientName') || latest?.patientName || '',
      version: formValue('protocolVersion') || latest?.version || '',
      notes: formValue('protocolNotes') || latest?.notes || '',
      items,
    };
  }

  function drugLine(item) {
    const name = String(item.substance || item.tradeName || 'Bar pa emër').trim();
    const dose = String(item.dose || '').trim();
    const strength = String(item.strength || '').trim();
    const displayDose = dose || strength;
    return [item.prefix, name, displayDose].filter(Boolean).join(' ');
  }

  function groupedItems(items) {
    const groups = [];
    (items || []).forEach((item, index) => {
      if (index > 0 && item.mixWithPrevious && groups.length) groups[groups.length - 1].items.push(item);
      else groups.push({ leader: item, items: [item] });
    });
    return groups;
  }

  function cocktailText(protocol) {
    const lines = [protocol.name || 'RECETË'];
    if (protocol.patientName) lines.push('Pacienti: ' + protocol.patientName);
    if (protocol.indication) lines.push('Diagnoza / indikacioni: ' + protocol.indication);
    lines.push('');
    groupedItems(protocol.items).forEach((group, index) => {
      const isCocktail = group.items.length > 1;
      lines.push((index + 1) + '. Rp:');
      group.items.forEach(item => lines.push('   ' + drugLine(item)));
      if (isCocktail) {
        lines.push('   Përgatitja: ' + (group.leader.mixtureName || 'Përzierje e përbashkët'));
        lines.push('   Kompatibiliteti: ' + (group.leader.mixtureCompatibilityConfirmed ? 'I verifikuar klinikisht/farmaceutikisht' : 'NUK ËSHTË KONFIRMUAR'));
      }
      const regimen = [group.leader.route, group.leader.frequency, group.leader.duration].filter(Boolean).join(' · ');
      const instruction = group.leader.instructions || regimen;
      if (instruction) lines.push('   S. ' + instruction);
      if (group.leader.quantity) lines.push('   D. No: ' + group.leader.quantity);
      group.items.forEach(item => { if (item.clinicalNotes) lines.push('   Vërejtje: ' + item.clinicalNotes.replace(/\n+/g, ' | ')); });
      lines.push('');
    });
    if (protocol.notes) lines.push('Vërejtje/monitorim: ' + protocol.notes);
    lines.push('Shënim: Përzierja e barnave kërkon verifikim të kompatibilitetit, stabilitetit, hollimit, linjës IV dhe protokollit institucional.');
    return lines.join('\n');
  }

  async function copyText(protocol) {
    const value = cocktailText(protocol);
    try { await navigator.clipboard.writeText(value); }
    catch {
      const area = document.createElement('textarea');
      area.value = value; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    window.showProtocolToast?.('Receta me përgatitjet e përbashkëta u kopjua.');
  }

  function printText(protocol) {
    if (!validateCocktails()) return;
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) return window.showProtocolToast?.('Shfletuesi e bllokoi dritaren e printimit.');
    const content = esc(cocktailText(protocol)).replace(/\n/g, '<br>');
    popup.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><title>${esc(protocol.name || 'Recetë')}</title><style>body{font-family:Arial,sans-serif;max-width:850px;margin:32px auto;padding:0 24px;color:#17282d;line-height:1.55}h1{font-family:Georgia,serif;color:#0d474b;border-bottom:3px solid #155f64;padding-bottom:12px}.rx{white-space:normal;font-size:14px}.warning{margin-top:24px;padding:10px 12px;border-left:4px solid #b87318;background:#fff7e9;font-size:12px}@media print{body{margin:0}}</style></head><body><h1>MedIndex · Recetë / protokoll</h1><div class="rx">${content}</div><div class="warning">Përzierjet janë dokumentuar nga përdoruesi; MedIndex nuk verifikon automatikisht kompatibilitetin.</div><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  function decoratePreview() {
    const body = document.getElementById('miBody');
    if (!body || body.dataset.cocktailDecorated === activeProtocolId) return;
    const protocol = protocols().find(item => String(item.id) === String(activeProtocolId));
    if (!protocol) return;
    const groups = groupedItems(protocol.items);
    const nodes = [...body.querySelectorAll('.mi-rx-item')];
    let nodeIndex = 0;
    groups.forEach(group => {
      if (group.items.length < 2) { nodeIndex += group.items.length; return; }
      const first = nodes[nodeIndex];
      if (!first) return;
      const wrapper = document.createElement('section');
      wrapper.className = 'mi-cocktail-preview';
      wrapper.innerHTML = `<header><b>${esc(group.leader.mixtureName || 'Përgatitje e përbashkët')}</b><span>Kompatibiliteti i konfirmuar</span></header>`;
      first.before(wrapper);
      group.items.forEach(() => { const node = nodes[nodeIndex++]; if (node) wrapper.appendChild(node); });
    });
    body.dataset.cocktailDecorated = activeProtocolId;
  }

  function installStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #protocolDrugList .protocol-drug-fields{display:grid}
      #protocolDrugList [data-item-field="dose"]{font-weight:800}
      #protocolDrugList .protocol-field:has([data-item-field="dose"]){order:-30;grid-column:1/-1}
      #protocolDrugList .protocol-field:has([data-item-field="prefix"]){order:-20}
      #protocolDrugList .protocol-field:has([data-item-field="quantity"]){order:-10}
      .cocktail-controls{margin:0 12px 12px;padding:11px;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--paper) 92%,var(--teal) 8%)}
      .cocktail-controls label{font-size:.73rem}.cocktail-link,.cocktail-confirm{display:flex!important;align-items:flex-start;gap:8px;font-weight:800}.cocktail-controls input[type="checkbox"]{width:17px;height:17px;flex:0 0 17px;margin:1px 0}.cocktail-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:9px}.cocktail-grid>label:first-child{display:flex;flex-direction:column;gap:5px}.cocktail-grid input[type="text"]{height:38px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink)}.cocktail-controls p{margin:8px 0 0;color:var(--muted);font-size:.65rem}.cocktail-leader-label{font-size:.69rem;font-weight:900;color:var(--teal-dark);text-transform:uppercase;letter-spacing:.04em}.protocol-drug.is-cocktail-member{margin-top:-11px;border-top-style:dashed;border-top-left-radius:0;border-top-right-radius:0}.protocol-drug.is-cocktail-leader{border-bottom:3px solid var(--teal)}.mi-cocktail-preview{margin:14px 0;border:2px solid #155e63;border-radius:10px;overflow:hidden}.mi-cocktail-preview>header{display:flex!important;justify-content:space-between!important;padding:9px 11px!important;background:#e8f2f0;border:0!important;color:#0d474b}.mi-cocktail-preview>header span{font-size:10px}.mi-cocktail-preview .mi-rx-item{padding-left:11px;padding-right:11px}.mi-cocktail-preview .mi-rx-item:last-child{border-bottom:0}@media(max-width:700px){.cocktail-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function bindEvents() {
    window.addEventListener('click', event => {
      const load = event.target.closest('[data-load-protocol]');
      if (load) {
        activeProtocolId = String(load.dataset.loadProtocol || '');
        setTimeout(decorateBuilder, 30);
        setTimeout(decoratePreview, 60);
      }

      if (event.target.closest('#newProtocolBtn')) {
        activeProtocolId = '';
        draftMeta.clear();
        setTimeout(decorateBuilder, 30);
      }

      if (event.target.closest('#saveProtocolBtn') && !validateCocktails()) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);

    window.addEventListener('click', event => {
      if (event.target.closest('#saveProtocolBtn')) setTimeout(patchSavedProtocol, 0);
    });

    window.addEventListener('click', event => {
      const savedCopy = event.target.closest('[data-copy-saved]');
      const modalCopy = event.target.closest('#miOverlay [data-a="copy"]');
      const builderCopy = event.target.closest('#copyProtocolBtn');
      const builderPrint = event.target.closest('#printProtocolBtn');
      const modalPrint = event.target.closest('#miOverlay [data-a="print"]');
      if (!(savedCopy || modalCopy || builderCopy || builderPrint || modalPrint)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      let protocol = currentProtocolSnapshot();
      if (savedCopy) protocol = protocols().find(item => String(item.id) === String(savedCopy.dataset.copySaved)) || protocol;
      if (modalCopy || modalPrint) protocol = protocols().find(item => String(item.id) === String(activeProtocolId)) || protocol;
      if (builderPrint || modalPrint) printText(protocol); else copyText(protocol);
    }, true);
  }

  function init() {
    installStyles();
    bindEvents();
    new MutationObserver(() => {
      decorateBuilder();
      decoratePreview();
    }).observe(document.documentElement, { childList: true, subtree: true });
    decorateBuilder();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
