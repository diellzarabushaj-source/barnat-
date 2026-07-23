(() => {
  'use strict';

  const STORAGE_KEY = 'regjistriBarnave_protokollet_v1';
  const INTERNAL_PATIENT_SENTINEL = '\u200B';
  const GROUP_TEMPLATES = {
    oral: { type:'oral', route:'PO', title:'Tableta / kapsula', label:'Tableta / kapsula — bashkë' },
    injectionIV: { type:'injection', route:'IV', title:'Injeksione IV', label:'Injeksione IV — një signaturë' },
    injectionIM: { type:'injection', route:'IM', title:'Injeksione IM', label:'Injeksione IM — një signaturë' },
    injectionSC: { type:'injection', route:'SC', title:'Injeksione SC', label:'Injeksione SC — një signaturë' },
    infusion: { type:'infusion', route:'IV', title:'Infuzion IV / koktej', label:'Infuzion IV / koktej' },
    other: { type:'other', route:'', title:'Administrim i përbashkët', label:'Administrim tjetër' },
  };

  const groups = new Map();
  const assignment = new Map();
  let activeProtocolId = '';
  let previewProtocolId = '';
  let queued = false;
  let sequence = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));
  const text = value => String(value ?? '').trim();
  const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
  const id = () => `rxg_${Date.now().toString(36)}_${(++sequence).toString(36)}`;

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

  function defaultName() {
    return `Recetë – ${new Date().toLocaleDateString('sq-AL')}`;
  }

  function showToast(message) {
    window.showProtocolToast?.(message);
  }

  function installStyles() {
    if (document.getElementById('simplePrescriptionWorkflowStyles')) return;
    const style = document.createElement('style');
    style.id = 'simplePrescriptionWorkflowStyles';
    style.textContent = `
      #protocolsBtn.rx-create-primary{background:linear-gradient(135deg,var(--teal,#155e63),#0d3d40)!important;color:#fff!important;border-color:transparent!important;box-shadow:0 8px 20px rgba(13,61,64,.22)!important;font-weight:850!important}
      #protocolsBtn.rx-create-primary:hover{transform:translateY(-1px)}
      .rx-simple-card{border-color:#bfd0cc!important}.rx-simple-card>h3{display:flex;align-items:center;gap:8px}.rx-step{display:inline-grid;place-items:center;width:25px;height:25px;border-radius:50%;background:var(--teal,#155e63);color:#fff;font:850 .7rem/1 var(--mono,monospace)}
      .rx-advanced{margin-top:10px;border:1px solid var(--line,#d7dcd6);border-radius:10px;background:var(--paper,#fff)}.rx-advanced>summary{cursor:pointer;padding:11px 13px;color:var(--teal-dark,#0d3d40);font-size:.76rem;font-weight:850;list-style:none}.rx-advanced>summary::-webkit-details-marker{display:none}.rx-advanced>summary::after{content:'+';float:right}.rx-advanced[open]>summary::after{content:'−'}.rx-advanced-body{padding:0 12px 12px}.rx-advanced-body .protocol-grid{margin:0}
      .rx-workflow{margin:0 0 12px;padding:12px;border:1px solid var(--line,#d7dcd6);border-radius:12px;background:linear-gradient(135deg,#f8fbfa,#eef5f3)}
      .rx-workflow-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:10px}.rx-workflow-head strong{display:block;color:var(--teal-dark,#0d3d40);font-size:.88rem}.rx-workflow-head p{margin:3px 0 0;color:#667579;font-size:.7rem;line-height:1.42}
      .rx-workflow-add{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.rx-workflow-add select{min-width:220px;height:38px;padding:0 9px;border:1px solid var(--line,#d7dcd6);border-radius:9px;background:#fff;color:var(--ink,#17252a);font:700 .72rem inherit}.rx-workflow-add button,.rx-group button{min-height:36px;padding:0 11px;border:1px solid var(--line,#d7dcd6);border-radius:9px;background:#fff;color:var(--teal-dark,#0d3d40);font-size:.7rem;font-weight:850;cursor:pointer}.rx-workflow-add .primary{background:var(--teal,#155e63);border-color:var(--teal,#155e63);color:#fff}
      .rx-workflow-empty{padding:9px 10px;border-radius:9px;background:#fff;color:#667579;font-size:.7rem}.rx-groups{display:grid;gap:9px;margin-top:10px}
      .rx-group{border:1px solid #b9ceca;border-radius:11px;background:#fff;overflow:hidden}.rx-group-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;background:#edf5f2;border-bottom:1px solid #d7e2df}.rx-group-head strong{font-size:.78rem;color:var(--teal-dark,#0d3d40)}.rx-group-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:22px;padding:0 7px;border-radius:999px;background:var(--teal,#155e63);color:#fff;font:800 .62rem var(--mono,monospace)}.rx-group-fields{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(170px,1fr) minmax(110px,.55fr);gap:8px;padding:10px 11px}.rx-group-field{display:flex;flex-direction:column;gap:4px}.rx-group-field.full{grid-column:1/-1}.rx-group-field label{font-size:.62rem;font-weight:850;color:#627175}.rx-group-field :is(input,select,textarea){width:100%;border:1px solid var(--line,#d7dcd6);border-radius:8px;background:#fff;color:var(--ink,#17252a);font:inherit;font-size:.73rem}.rx-group-field :is(input,select){height:36px;padding:0 9px}.rx-group-field textarea{min-height:65px;padding:9px;resize:vertical}.rx-group-actions{display:flex;gap:6px;flex-wrap:wrap;padding:0 11px 10px}.rx-group-actions .danger{color:#8b3033}.rx-group-safety{margin:0 11px 10px;padding:8px 9px;border-left:3px solid #c77d1f;border-radius:7px;background:#fff7e9;color:#67481d;font-size:.65rem;line-height:1.4}
      .rx-assignment{display:grid;grid-template-columns:minmax(150px,1fr) minmax(115px,.55fr);gap:8px;padding:9px 12px;border-bottom:1px solid var(--line,#d7dcd6);background:#f8fbfa}.rx-assignment label{display:flex;flex-direction:column;gap:4px;color:#617075;font-size:.62rem;font-weight:850}.rx-assignment select{height:36px;padding:0 9px;border:1px solid var(--line,#d7dcd6);border-radius:8px;background:#fff;color:var(--ink,#17252a);font:700 .72rem inherit}.rx-assignment [data-role-wrap][hidden]{display:none}.protocol-drug.rx-grouped{border-color:#9ebfba}.protocol-drug.rx-grouped .protocol-drug-head{background:linear-gradient(90deg,#e8f3f0,#f8fbfa)}.rx-group-badge{display:inline-flex;margin:0 0 5px;padding:3px 7px;border-radius:999px;background:#dcece8;color:#0d4b4f;font-size:.61rem;font-weight:850}.protocol-drug.rx-grouped .protocol-drug-fields>.protocol-field.rx-shared-hidden{display:none!important}.protocol-drug.rx-grouped .protocol-drug-fields{grid-template-columns:repeat(3,minmax(0,1fr))}.protocol-drug.rx-grouped .protocol-field[data-rx-dose]{order:-5}.protocol-drug.rx-grouped .protocol-field[data-rx-prefix]{order:-4}.protocol-drug.rx-grouped .protocol-field[data-rx-quantity]{order:-3}
      .mi-rx-group{border:1px solid #b9cbc7;border-radius:10px;margin:16px 0;padding:0!important;overflow:hidden}.mi-rx-group>.mi-rx-no{margin:14px 0 0 14px}.mi-rx-group-body{padding:14px 16px 16px}.mi-rx-group-head{margin-bottom:10px;padding-bottom:9px;border-bottom:2px solid #155e63}.mi-rx-group-head em{font:italic 25px Georgia;color:#0d3d40}.mi-rx-group-head h3{margin:3px 0 0}.mi-rx-group-line{padding:7px 0;border-bottom:1px dashed #d7e1de;font-weight:700}.mi-rx-group-line:last-of-type{border-bottom:0}.mi-rx-group-warning{margin-top:10px;padding:8px 10px;border-left:3px solid #b87318;background:#fff8ec;color:#67481d;font-size:10px;line-height:1.4}
      html[data-theme=dark] .rx-workflow,html[data-theme=dark] .rx-assignment,html[data-theme=dark] .rx-group-head{background:#162629;color:#e8f0ee}html[data-theme=dark] .rx-group,html[data-theme=dark] .rx-advanced,html[data-theme=dark] .rx-workflow-empty,html[data-theme=dark] .rx-workflow-add select,html[data-theme=dark] .rx-workflow-add button,html[data-theme=dark] .rx-group button,html[data-theme=dark] .rx-group-field :is(input,select,textarea),html[data-theme=dark] .rx-assignment select{background:#101d20;color:#e8f0ee;border-color:#34484b}html[data-theme=dark] .protocol-drug.rx-grouped .protocol-drug-head{background:#1b3033}html[data-theme=dark] .rx-group-badge{background:#1d3d3f;color:#d8efea}html[data-theme=dark] .rx-group-safety,html[data-theme=dark] .mi-rx-group-warning{background:#302719;color:#ead0a5}
      @media(max-width:760px){.rx-workflow-head{flex-direction:column}.rx-workflow-add{width:100%}.rx-workflow-add select{min-width:0;flex:1}.rx-group-fields{grid-template-columns:1fr}.rx-group-field.full{grid-column:auto}.rx-assignment{grid-template-columns:1fr}.protocol-drug.rx-grouped .protocol-drug-fields{grid-template-columns:1fr}.rx-workflow-add button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function prepareSimpleUi() {
    const button = document.getElementById('protocolsBtn');
    if (button && !button.dataset.simpleRx) {
      const count = button.querySelector('.mini-count');
      button.dataset.simpleRx = '1';
      button.classList.add('rx-create-primary');
      button.textContent = 'Krijo recetën ';
      if (count) button.appendChild(count);
    }

    const title = document.getElementById('protocolDrawerTitle');
    setText(title, 'Krijo recetën');
    const description = title?.parentElement?.querySelector('p');
    setText(description, 'Zgjidh barnat, grupoji sipas mënyrës së administrimit dhe shkruaj vetëm një Signaturë për secilin grup.');
    const builderTab = document.querySelector('.protocol-tab[data-tab="builder"]');
    setText(builderTab, 'Krijo recetën');
    const info = document.querySelector('#protocolPaneBuilder .protocol-info');
    setText(info, 'Doza dhe të dhënat e verifikuara mund të paraplotësohen. Barnat që merren bashkë vendosen në një grup dhe përdorin një Signaturë të përbashkët.');

    const reviewLabel = document.querySelector('.rx-review-check span');
    setText(reviewLabel, 'Kam kontrolluar diagnozën, dozën, rrugën, frekuencën, kohëzgjatjen, alergjitë, shtatzëninë, funksionin renal/hepatik dhe kompatibilitetin e përzierjeve. Printimi final lejohet vetëm pas këtij kontrolli.');

    const firstCard = document.querySelector('#protocolPaneBuilder .protocol-card');
    if (firstCard && !firstCard.dataset.simpleRx) {
      firstCard.dataset.simpleRx = '1';
      firstCard.classList.add('rx-simple-card');
      const heading = firstCard.querySelector('h3');
      if (heading) heading.innerHTML = '<span class="rx-step">1</span> Të dhënat kryesore';
      const grid = firstCard.querySelector('.protocol-grid');
      const patientGrid = firstCard.querySelector('.patient-identity-grid');
      const allergyField = patientGrid?.querySelector('#protocolAllergies')?.closest('.protocol-field');
      if (grid && allergyField) grid.appendChild(allergyField);

      const advancedFields = ['protocolPopulation', 'protocolVersion', 'protocolNotes'].map(fieldId => document.getElementById(fieldId)?.closest('.protocol-field')).filter(Boolean);
      const dosageGrid = firstCard.querySelector('.dosage-patient-grid');
      if (grid && (advancedFields.length || dosageGrid)) {
        const details = document.createElement('details');
        details.className = 'rx-advanced';
        details.innerHTML = '<summary>Opsione klinike dhe pediatrike</summary><div class="rx-advanced-body"><div class="protocol-grid"></div></div>';
        const target = details.querySelector('.protocol-grid');
        advancedFields.forEach(field => target.appendChild(field));
        if (dosageGrid) target.appendChild(dosageGrid);
        grid.after(details);
      }
      patientGrid?.remove();
    }

    ensureInternalPatientField();
    const drugCard = document.getElementById('protocolDrugList')?.closest('.protocol-card');
    if (drugCard && !drugCard.dataset.simpleRx) {
      drugCard.dataset.simpleRx = '1';
      drugCard.classList.add('rx-simple-card');
      const heading = drugCard.querySelector('h3');
      if (heading) {
        const count = heading.querySelector('#builderDrugCount');
        heading.innerHTML = '<span class="rx-step">2</span> Barnat dhe mënyra e administrimit ';
        if (count) heading.appendChild(count);
      }
    }
  }

  function ensureInternalPatientField() {
    let input = document.getElementById('protocolPatientName');
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.id = 'protocolPatientName';
      document.getElementById('protocolOverlay')?.appendChild(input);
    }
    input.value = INTERNAL_PATIENT_SENTINEL;
  }

  function ensureDefaultName() {
    const field = document.getElementById('protocolName');
    if (field && !text(field.value)) {
      field.value = defaultName();
      field.dispatchEvent(new Event('input', { bubbles:true }));
    }
    ensureInternalPatientField();
  }

  function cards() {
    return [...document.querySelectorAll('#protocolDrugList .protocol-drug[data-drug-key]')];
  }

  function cardKey(card) {
    return text(card?.dataset?.drugKey);
  }

  function templateOptions() {
    return Object.entries(GROUP_TEMPLATES).map(([value, template]) => `<option value="${esc(value)}">${esc(template.label)}</option>`).join('');
  }

  function groupOptions(current = '') {
    return `<option value="">Veçmas — Signaturë individuale</option>${[...groups.values()].map(group => `<option value="${esc(group.id)}"${group.id === current ? ' selected' : ''}>${esc(group.title)}${group.route ? ` · ${esc(group.route)}` : ''}</option>`).join('')}`;
  }

  function createGroup(templateKey, { assignUngrouped = true } = {}) {
    const template = GROUP_TEMPLATES[templateKey] || GROUP_TEMPLATES.other;
    const groupId = id();
    const number = groups.size + 1;
    const group = {
      id: groupId,
      type: template.type,
      route: template.route,
      title: `${template.title}${groups.size ? ` ${number}` : ''}`,
      frequency: '',
      duration: '',
      signature: template.type === 'infusion'
        ? 'Përzihen dhe administrohen së bashku në të njëjtin infuzion IV.'
        : template.type === 'injection'
          ? 'Administrohen në të njëjtën seancë me rrugën e përcaktuar.'
          : template.type === 'oral'
            ? 'Merren së bashku sipas skemës së përbashkët.'
            : '',
    };
    groups.set(groupId, group);
    if (assignUngrouped) {
      cards().forEach(card => {
        const key = cardKey(card);
        if (key && !assignment.get(key)?.groupId) assignment.set(key, { groupId, role:'additive' });
      });
      const firstKey = cards().map(cardKey).find(key => assignment.get(key)?.groupId === groupId);
      if (template.type === 'infusion' && firstKey) assignment.set(firstKey, { groupId, role:'base' });
    }
    renderWorkflow();
    decorateCards();
    showToast('U shtua grupi i administrimit. Zgjidh barnat që i përkasin këtij grupi.');
    return group;
  }

  function removeGroup(groupId) {
    groups.delete(groupId);
    assignment.forEach((value, key) => {
      if (value.groupId === groupId) assignment.set(key, { groupId:'', role:'additive' });
    });
    renderWorkflow();
    decorateCards();
  }

  function clearGroups() {
    groups.clear();
    assignment.clear();
    renderWorkflow();
    decorateCards();
  }

  function groupCount(groupId) {
    return [...assignment.values()].filter(value => value.groupId === groupId).length;
  }

  function ensureWorkflow() {
    const list = document.getElementById('protocolDrugList');
    if (!list) return null;
    let workflow = document.getElementById('simplePrescriptionWorkflow');
    if (!workflow) {
      workflow = document.createElement('section');
      workflow.id = 'simplePrescriptionWorkflow';
      workflow.className = 'rx-workflow';
      list.parentElement?.insertBefore(workflow, list);
      workflow.addEventListener('click', event => {
        const add = event.target.closest('[data-rx-add-group]');
        if (add) {
          const select = workflow.querySelector('#rxGroupTemplate');
          createGroup(select?.value || 'oral');
          return;
        }
        const clear = event.target.closest('[data-rx-clear-groups]');
        if (clear) { clearGroups(); return; }
        const remove = event.target.closest('[data-rx-remove-group]');
        if (remove) { removeGroup(remove.dataset.rxRemoveGroup); return; }
        const assignAll = event.target.closest('[data-rx-assign-all]');
        if (assignAll) {
          const groupId = assignAll.dataset.rxAssignAll;
          cards().forEach((card, index) => assignment.set(cardKey(card), { groupId, role:groups.get(groupId)?.type === 'infusion' && index === 0 ? 'base' : 'additive' }));
          decorateCards();
          renderWorkflow();
        }
      });
      workflow.addEventListener('input', event => {
        const groupId = event.target.closest('[data-rx-group]')?.dataset.rxGroup;
        const field = event.target.dataset.rxGroupField;
        if (!groupId || !field || !groups.has(groupId)) return;
        groups.get(groupId)[field] = event.target.value;
        syncGroup(groupId);
        updateGroupLabels(groupId);
      });
      workflow.addEventListener('change', event => {
        const groupId = event.target.closest('[data-rx-group]')?.dataset.rxGroup;
        const field = event.target.dataset.rxGroupField;
        if (!groupId || !field || !groups.has(groupId)) return;
        groups.get(groupId)[field] = event.target.value;
        syncGroup(groupId);
        renderWorkflow();
        decorateCards();
      });
    }
    return workflow;
  }

  function renderWorkflow() {
    const workflow = ensureWorkflow();
    if (!workflow) return;
    const groupMarkup = [...groups.values()].map(group => {
      const count = groupCount(group.id);
      return `<article class="rx-group" data-rx-group="${esc(group.id)}">
        <div class="rx-group-head"><strong>${esc(group.title || 'Grup administrimi')}</strong><span class="rx-group-count">${count}</span></div>
        <div class="rx-group-fields">
          <div class="rx-group-field"><label>Emri i grupit<input data-rx-group-field="title" value="${esc(group.title)}" placeholder="p.sh. Infuzion IV"></label></div>
          <div class="rx-group-field"><label>Lloji<select data-rx-group-field="type"><option value="oral"${group.type === 'oral' ? ' selected' : ''}>Tableta / kapsula</option><option value="injection"${group.type === 'injection' ? ' selected' : ''}>Injeksione — një seancë</option><option value="infusion"${group.type === 'infusion' ? ' selected' : ''}>Infuzion / koktej</option><option value="other"${group.type === 'other' ? ' selected' : ''}>Tjetër</option></select></label></div>
          <div class="rx-group-field"><label>Rruga<select data-rx-group-field="route"><option value="">Zgjidhe</option><option value="PO"${group.route === 'PO' ? ' selected' : ''}>PO</option><option value="IV"${group.route === 'IV' ? ' selected' : ''}>IV</option><option value="IM"${group.route === 'IM' ? ' selected' : ''}>IM</option><option value="SC"${group.route === 'SC' ? ' selected' : ''}>SC</option><option value="PR"${group.route === 'PR' ? ' selected' : ''}>PR</option><option value="INH"${group.route === 'INH' ? ' selected' : ''}>INH</option></select></label></div>
          <div class="rx-group-field"><label>Frekuenca<input data-rx-group-field="frequency" value="${esc(group.frequency)}" placeholder="p.sh. një herë"></label></div>
          <div class="rx-group-field"><label>Kohëzgjatja<input data-rx-group-field="duration" value="${esc(group.duration)}" placeholder="p.sh. 1 ditë"></label></div>
          <div class="rx-group-field full"><label>Signatura e përbashkët<textarea data-rx-group-field="signature" placeholder="Shkruhet vetëm një herë për të gjitha barnat e këtij grupi.">${esc(group.signature)}</textarea></label></div>
        </div>
        <div class="rx-group-actions"><button type="button" data-rx-assign-all="${esc(group.id)}">Vendosi të gjitha këtu</button><button class="danger" type="button" data-rx-remove-group="${esc(group.id)}">Hiqe grupin</button></div>
        ${group.type === 'infusion' ? '<div class="rx-group-safety"><strong>Kujdes:</strong> “Koktej” nënkupton një infuzion të përbashkët; kompatibiliteti, stabiliteti, hollimi dhe shpejtësia duhet të verifikohen para administrimit.</div>' : group.type === 'injection' ? '<div class="rx-group-safety"><strong>Kujdes:</strong> grupimi nënkupton të njëjtën seancë dhe një Signaturë të përbashkët; nuk nënkupton automatikisht përzierje në të njëjtën shiringë.</div>' : ''}
      </article>`;
    }).join('');

    const markup = `<div class="rx-workflow-head"><div><strong>Organizo recetën sipas administrimit</strong><p>Krijo aq grupe sa duhen: p.sh. një grup IV dhe një grup IM në të njëjtën recetë. Barnat brenda një grupi marrin vetëm një Signaturë.</p></div></div>
      <div class="rx-workflow-add"><select id="rxGroupTemplate" aria-label="Zgjidh llojin e grupit">${templateOptions()}</select><button class="primary" type="button" data-rx-add-group>Shto grup</button>${groups.size ? '<button type="button" data-rx-clear-groups>Të gjitha veçmas</button>' : ''}</div>
      ${groups.size ? `<div class="rx-groups">${groupMarkup}</div>` : '<div class="rx-workflow-empty">Pa grupim: çdo bar ka Signaturën e vet. Për tableta bashkë, injeksione në një seancë ose infuzion/koktej, shto një grup nga lista.</div>'}`;
    const signature = JSON.stringify([...groups.values()].map(group => ({ ...group, count:groupCount(group.id) })));
    if (workflow.dataset.signature !== signature) {
      workflow.dataset.signature = signature;
      workflow.innerHTML = markup;
    }
  }

  function updateGroupLabels(groupId) {
    const group = groups.get(groupId);
    if (!group) return;
    document.querySelectorAll(`[data-rx-group="${CSS.escape(groupId)}"] .rx-group-head strong`).forEach(node => { node.textContent = group.title || 'Grup administrimi'; });
    cards().forEach(card => {
      const key = cardKey(card);
      if (assignment.get(key)?.groupId !== groupId) return;
      const badge = card.querySelector('.rx-group-badge');
      if (badge) badge.textContent = `${group.title}${group.route ? ` · ${group.route}` : ''}`;
    });
  }

  function fieldWrap(card, fieldName) {
    return card.querySelector(`[data-item-field="${fieldName}"]`)?.closest('.protocol-field') || null;
  }

  function setField(card, fieldName, value) {
    const control = card.querySelector(`[data-item-field="${fieldName}"]`);
    if (!control) return;
    const next = String(value ?? '');
    if (control.value === next) return;
    control.value = next;
    control.dispatchEvent(new Event('input', { bubbles:true }));
  }

  function syncCard(card) {
    const key = cardKey(card);
    if (!key) return;
    const record = assignment.get(key) || { groupId:'', role:'additive' };
    const group = groups.get(record.groupId);
    const grouped = Boolean(group);
    card.classList.toggle('rx-grouped', grouped);

    ['prefix', 'quantity', 'dose'].forEach(name => {
      const wrap = fieldWrap(card, name);
      if (wrap) wrap.dataset[`rx${name[0].toUpperCase()}${name.slice(1)}`] = '1';
    });

    ['route', 'frequency', 'duration', 'instructions'].forEach(name => fieldWrap(card, name)?.classList.toggle('rx-shared-hidden', grouped));
    if (grouped) {
      setField(card, 'route', group.route);
      setField(card, 'frequency', group.frequency);
      setField(card, 'duration', group.duration);
      setField(card, 'instructions', group.signature);
    }

    let assignmentUi = card.querySelector('.rx-assignment');
    if (!assignmentUi) {
      assignmentUi = document.createElement('div');
      assignmentUi.className = 'rx-assignment';
      card.querySelector('.protocol-drug-head')?.after(assignmentUi);
      assignmentUi.addEventListener('change', event => {
        const key = cardKey(card);
        if (event.target.matches('[data-rx-assignment]')) {
          const groupId = event.target.value;
          assignment.set(key, { groupId, role:'additive' });
          const current = groups.get(groupId);
          if (current?.type === 'infusion' && ![...assignment.entries()].some(([otherKey, value]) => otherKey !== key && value.groupId === groupId && value.role === 'base')) assignment.set(key, { groupId, role:'base' });
          renderWorkflow();
          decorateCards();
        }
        if (event.target.matches('[data-rx-role]')) {
          const current = assignment.get(key) || { groupId:'', role:'additive' };
          current.role = event.target.value;
          assignment.set(key, current);
          syncCard(card);
        }
      });
    }

    const roleVisible = grouped && group.type === 'infusion';
    const assignmentMarkup = `<label>Shkruhet te<select data-rx-assignment>${groupOptions(record.groupId)}</select></label><label data-role-wrap${roleVisible ? '' : ' hidden'}>Roli në infuzion<select data-rx-role><option value="base"${record.role === 'base' ? ' selected' : ''}>Bazë / tretës</option><option value="additive"${record.role !== 'base' ? ' selected' : ''}>Bar shtesë</option></select></label>`;
    const assignmentSignature = JSON.stringify({ groupId:record.groupId || '', role:record.role || 'additive', groups:[...groups.values()].map(group => [group.id, group.title, group.route, group.type]) });
    if (assignmentUi.dataset.signature !== assignmentSignature) {
      assignmentUi.dataset.signature = assignmentSignature;
      assignmentUi.innerHTML = assignmentMarkup;
    }

    let badge = card.querySelector('.rx-group-badge');
    if (!grouped) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'rx-group-badge';
      card.querySelector('.protocol-drug-head>div')?.prepend(badge);
    }
    setText(badge, `${group.title}${group.route ? ` · ${group.route}` : ''}`);
  }

  function syncGroup(groupId) {
    cards().forEach(card => {
      if (assignment.get(cardKey(card))?.groupId === groupId) syncCard(card);
    });
    window.MedIndexPrescriptionReview?.render?.();
  }

  function decorateCards() {
    cards().forEach(card => {
      const key = cardKey(card);
      if (!assignment.has(key)) assignment.set(key, { groupId:'', role:'additive' });
      syncCard(card);
    });
  }

  function queueRender() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      prepareSimpleUi();
      renderWorkflow();
      decorateCards();
    });
  }

  function loadProtocolState(protocol) {
    groups.clear();
    assignment.clear();
    activeProtocolId = text(protocol?.id);
    const storedGroups = Array.isArray(protocol?.administrationGroups) ? protocol.administrationGroups : [];
    storedGroups.forEach(group => {
      if (!group?.id) return;
      groups.set(String(group.id), {
        id:String(group.id), type:text(group.type) || 'other', route:text(group.route), title:text(group.title) || 'Grup administrimi',
        frequency:text(group.frequency), duration:text(group.duration), signature:text(group.signature),
      });
    });
    (protocol?.items || []).forEach(item => {
      const key = text(item?.drugKey);
      if (!key) return;
      const groupId = text(item.administrationGroupId || item.mixtureGroupId || item.mixtureGroup);
      if (groupId && !groups.has(groupId)) {
        groups.set(groupId, {
          id:groupId,
          type:text(item.administrationGroupType || item.mixtureType) || 'other',
          route:text(item.administrationRoute || item.route),
          title:text(item.administrationGroupTitle || item.mixtureGroup) || 'Grup administrimi',
          frequency:text(item.sharedFrequency || item.frequency),
          duration:text(item.sharedDuration || item.duration),
          signature:text(item.sharedSignature || item.instructions),
        });
      }
      assignment.set(key, { groupId, role:text(item.mixtureRole) || 'additive' });
    });
    queueRender();
  }

  function itemFromCard(card) {
    const fields = {};
    card.querySelectorAll('[data-item-field]').forEach(control => { fields[control.dataset.itemField] = control.value; });
    const key = cardKey(card);
    const record = assignment.get(key) || {};
    const group = groups.get(record.groupId);
    return {
      drugKey:key,
      tradeName:card.dataset.tradeName || '',
      substance:card.dataset.substance || '',
      strength:card.dataset.strength || '',
      form:card.dataset.form || '',
      atc:card.dataset.atc || '',
      qualityStatus:card.dataset.qualityStatus || 'verified',
      ...fields,
      administrationGroupId:group?.id || '',
      administrationGroupType:group?.type || '',
      administrationGroupTitle:group?.title || '',
      administrationRoute:group?.route || '',
      sharedFrequency:group?.frequency || '',
      sharedDuration:group?.duration || '',
      sharedSignature:group?.signature || '',
      mixtureRole:record.role || 'additive',
    };
  }

  function currentProtocol() {
    const review = window.MedIndexPrescriptionReview?.state?.() || {};
    ensureDefaultName();
    return {
      id:activeProtocolId || `p_${Date.now()}`,
      name:text(document.getElementById('protocolName')?.value) || defaultName(),
      indication:text(document.getElementById('protocolIndication')?.value),
      population:text(document.getElementById('protocolPopulation')?.value),
      patientName:'', birthDate:'', patientId:'',
      allergies:text(document.getElementById('protocolAllergies')?.value),
      patientType:document.getElementById('protocolPatientType')?.value || 'adult',
      ageValue:text(document.getElementById('protocolAgeValue')?.value),
      ageUnit:document.getElementById('protocolAgeUnit')?.value || 'years',
      weightKg:text(document.getElementById('protocolWeightKg')?.value),
      version:text(document.getElementById('protocolVersion')?.value),
      notes:text(document.getElementById('protocolNotes')?.value),
      clinicalReview:Boolean(review.reviewed),
      reviewedAt:review.reviewedAt || '',
      reviewedBy:review.reviewed ? 'Dr. Diellza Rabushaj' : '',
      updatedAt:new Date().toISOString(),
      administrationGroups:[...groups.values()].map(group => ({ ...group })),
      items:cards().map(itemFromCard),
    };
  }

  function patchSavedProtocol(startedAt, expectedName) {
    const protocols = getProtocols();
    if (!protocols.length) return;
    let index = activeProtocolId ? protocols.findIndex(protocol => protocol.id === activeProtocolId) : -1;
    const recentMatch = protocol => {
      const updated = Date.parse(protocol?.updatedAt || 0) || 0;
      return updated >= startedAt - 1200 && (!expectedName || protocol?.name === expectedName);
    };
    if (index < 0 || !recentMatch(protocols[index])) index = protocols.findIndex(recentMatch);
    if (index < 0) return;
    const snapshot = currentProtocol();
    const protocol = protocols[index];
    const byKey = new Map(snapshot.items.map(item => [String(item.drugKey || ''), item]));
    protocol.patientName = '';
    protocol.birthDate = '';
    protocol.patientId = '';
    protocol.administrationGroups = snapshot.administrationGroups;
    protocol.items = (protocol.items || []).map(item => ({ ...item, ...(byKey.get(String(item.drugKey || '')) || {}) }));
    activeProtocolId = protocol.id;
    protocols[index] = protocol;
    setProtocols(protocols);
  }

  function genericName(item) {
    return text(item?.substance || item?.tradeName || 'Bar pa emër');
  }

  function doseText(item) {
    return text(item?.dose || item?.strength);
  }

  function quantityText(item) {
    const quantity = text(item?.quantity);
    if (!quantity) return '';
    return /^a\s/i.test(quantity) ? quantity : `a ${quantity}`;
  }

  function itemLine(item, groupType = '') {
    const parts = [item.prefix, genericName(item), doseText(item)].filter(Boolean);
    if (groupType === 'infusion' && item.mixtureRole === 'base' && item.quantity) parts.push(quantityText(item));
    return parts.join(' ');
  }

  function regimen(item) {
    return [item.dose, item.route, item.frequency, item.duration].filter(Boolean).join(' · ');
  }

  function groupedEntries(protocol) {
    const groupMeta = new Map((protocol.administrationGroups || []).map(group => [String(group.id), group]));
    const entries = [];
    const grouped = new Map();
    (protocol.items || []).forEach(item => {
      const groupId = text(item.administrationGroupId);
      if (!groupId) {
        entries.push({ kind:'single', items:[item] });
        return;
      }
      if (!grouped.has(groupId)) {
        const fallback = {
          id:groupId,
          type:text(item.administrationGroupType) || 'other',
          route:text(item.administrationRoute || item.route),
          title:text(item.administrationGroupTitle) || 'Grup administrimi',
          frequency:text(item.sharedFrequency || item.frequency),
          duration:text(item.sharedDuration || item.duration),
          signature:text(item.sharedSignature || item.instructions),
        };
        const entry = { kind:'group', group:{ ...fallback, ...(groupMeta.get(groupId) || {}) }, items:[] };
        grouped.set(groupId, entry);
        entries.push(entry);
      }
      grouped.get(groupId).items.push(item);
    });
    entries.forEach(entry => {
      if (entry.kind === 'group' && entry.group.type === 'infusion') entry.items.sort((a, b) => (a.mixtureRole === 'base' ? -1 : 0) - (b.mixtureRole === 'base' ? -1 : 0));
    });
    return entries;
  }

  function groupSignature(group) {
    return [group.signature, group.frequency, group.duration].filter(Boolean).join(' · ') || 'Signatura nuk është plotësuar.';
  }

  function protocolToText(protocol) {
    const lines = [];
    lines.push(protocol.name || 'RECETË');
    lines.push('Statusi: ' + (protocol.clinicalReview ? 'E KONTROLLUAR KLINIKISHT' : 'DRAFT'));
    if (protocol.indication) lines.push('Diagnoza / indikacioni: ' + protocol.indication);
    if (protocol.allergies) lines.push('Alergjitë: ' + protocol.allergies);
    if (protocol.population) lines.push('Kushtet klinike: ' + protocol.population);
    lines.push('');

    groupedEntries(protocol).forEach((entry, index) => {
      if (entry.kind === 'single') {
        const item = entry.items[0];
        lines.push(`${index + 1}. Rp. ${itemLine(item)}`);
        if (item.quantity) lines.push('   D. No: ' + item.quantity);
        lines.push('   S. ' + (item.instructions || regimen(item) || 'Nuk është plotësuar.'));
        if (item.clinicalNotes) lines.push('   Vërejtje klinike: ' + item.clinicalNotes.replace(/\n+/g, ' | '));
        return;
      }
      const group = entry.group;
      lines.push(`${index + 1}. Rp.`);
      lines.push(`   ${group.title}${group.route ? ` — ${group.route}` : ''}`);
      entry.items.forEach(item => lines.push('   ' + itemLine(item, group.type)));
      lines.push('   S. ' + groupSignature(group));
      if (group.type === 'infusion') lines.push('   Verifiko kompatibilitetin, stabilitetin, hollimin dhe shpejtësinë e infuzionit.');
      if (group.type === 'injection') lines.push('   Administrohen në të njëjtën seancë; grupimi nuk nënkupton përzierje në të njëjtën shiringë.');
    });

    if (protocol.notes) { lines.push(''); lines.push('Vërejtje / monitorim: ' + protocol.notes); }
    lines.push('');
    lines.push('Shënim: çdo dozë, rrugë dhe përzierje kërkon verifikim klinik para përdorimit individual.');
    return lines.join('\n');
  }

  function itemMarkup(item, groupType) {
    return `<div class="mi-rx-group-line">${esc(itemLine(item, groupType))}</div>`;
  }

  function groupMarkup(entry, index) {
    const group = entry.group;
    return `<section class="mi-rx-item mi-rx-group"><div class="mi-rx-no">${index + 1}</div><div class="mi-rx-group-body"><div class="mi-rx-group-head"><em>Rp.</em><h3>${esc(group.title)}${group.route ? ` · ${esc(group.route)}` : ''}</h3></div>${entry.items.map(item => itemMarkup(item, group.type)).join('')}<div class="mi-sign"><b>Signatura e përbashkët</b><span>${esc(groupSignature(group))}</span></div>${group.type === 'infusion' ? '<div class="mi-rx-group-warning">Verifiko kompatibilitetin, stabilitetin, hollimin dhe shpejtësinë e infuzionit para administrimit.</div>' : group.type === 'injection' ? '<div class="mi-rx-group-warning">Barnat administrohen në të njëjtën seancë; nuk supozohet përzierje në të njëjtën shiringë.</div>' : ''}</div></section>`;
  }

  function singleMarkup(item, index) {
    return `<section class="mi-rx-item"><div class="mi-rx-no">${index + 1}</div><div><em>Rp.</em><h3>${esc(itemLine(item))}</h3>${item.quantity ? `<div class="mi-dispense"><b>Dispenso</b><span>${esc(item.quantity)}</span></div>` : ''}<div class="mi-sign"><b>Signatura</b><span>${esc(item.instructions || regimen(item) || 'Signatura nuk është plotësuar.')}</span></div></div></section>`;
  }

  function refreshPreview() {
    if (!previewProtocolId) return;
    const body = document.getElementById('miBody');
    const protocol = getProtocols().find(item => String(item.id) === String(previewProtocolId));
    const article = body?.querySelector('.mi-rx');
    if (!article || !protocol) return;
    const previewSignature = JSON.stringify({ id:protocol.id, updatedAt:protocol.updatedAt, groups:protocol.administrationGroups, items:(protocol.items || []).map(item => [item.drugKey, item.administrationGroupId, item.sharedSignature, item.route, item.dose, item.quantity]) });
    if (article.dataset.rxWorkflowSignature === previewSignature) return;
    article.dataset.rxWorkflowSignature = previewSignature;
    article.querySelectorAll('.mi-rx-meta span').forEach(node => {
      const label = text(node.querySelector('i')?.textContent);
      if (['Pacienti', 'Datëlindja', 'Nr. personal / ID'].includes(label)) node.remove();
    });
    const entries = groupedEntries(protocol);
    article.querySelectorAll('.mi-rx-item').forEach(node => node.remove());
    const meta = article.querySelector('.mi-rx-meta');
    if (!meta) return;
    let anchor = meta;
    entries.forEach((entry, index) => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = entry.kind === 'group' ? groupMarkup(entry, index) : singleMarkup(entry.items[0], index);
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
      showToast(result.issues?.[0]?.message || 'Receta nuk është gati për printim.');
      return false;
    }
    return true;
  }

  function printProtocol(protocol, currentDraft = false) {
    if (!canPrint(protocol, currentDraft)) return false;
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) { showToast('Shfletuesi e bllokoi dritaren e printimit.'); return false; }
    const content = protocolToText(protocol).split('\n').map(line => `<div>${line ? esc(line) : '&nbsp;'}</div>`).join('');
    popup.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><title>${esc(protocol.name || 'Recetë')}</title><style>body{font-family:Arial,sans-serif;max-width:850px;margin:35px auto;padding:0 24px;color:#17252a;line-height:1.55}div{white-space:pre-wrap}div:first-child{font-size:24px;font-weight:700;margin-bottom:8px}@media print{body{margin:0}}</style></head><body>${content}<script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
    return true;
  }

  function interceptActions() {
    window.addEventListener('click', event => {
      const create = event.target.closest?.('#protocolsBtn');
      if (create) ensureDefaultName();

      const load = event.target.closest?.('[data-load-protocol]');
      if (load) {
        previewProtocolId = load.dataset.loadProtocol || '';
        const protocol = getProtocols().find(item => String(item.id) === String(previewProtocolId));
        if (protocol) loadProtocolState(protocol);
        setTimeout(refreshPreview, 0);
      }

      if (event.target.closest?.('#newProtocolBtn')) {
        activeProtocolId = '';
        groups.clear();
        assignment.clear();
        setTimeout(() => { ensureDefaultName(); queueRender(); }, 0);
      }

      if (event.target.closest?.('#clearSelectionBtn')) {
        groups.clear();
        assignment.clear();
        queueRender();
      }

      if (event.target.closest?.('#saveProtocolBtn')) {
        ensureDefaultName();
        ensureInternalPatientField();
        decorateCards();
        const startedAt = Date.now();
        const expectedName = text(document.getElementById('protocolName')?.value);
        setTimeout(() => patchSavedProtocol(startedAt, expectedName), 0);
      }

      const copySaved = event.target.closest?.('[data-copy-saved]');
      if (copySaved) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const protocol = getProtocols().find(item => String(item.id) === String(copySaved.dataset.copySaved));
        if (protocol) navigator.clipboard?.writeText(protocolToText(protocol)).then(() => showToast('Teksti u kopjua.')).catch(() => {});
        return;
      }

      if (event.target.closest?.('#copyProtocolBtn')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        navigator.clipboard?.writeText(protocolToText(currentProtocol())).then(() => showToast('Teksti u kopjua.')).catch(() => {});
        return;
      }

      if (event.target.closest?.('#printProtocolBtn')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        printProtocol(currentProtocol(), true);
        return;
      }

      const previewAction = event.target.closest?.('#miOverlay [data-a]')?.dataset.a;
      if ((previewAction === 'copy' || previewAction === 'print') && previewProtocolId) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const protocol = getProtocols().find(item => String(item.id) === String(previewProtocolId));
        if (!protocol) return;
        if (previewAction === 'copy') navigator.clipboard?.writeText(protocolToText(protocol)).then(() => showToast('Receta u kopjua.')).catch(() => {});
        else printProtocol(protocol, false);
      }
    }, true);
  }

  function init() {
    if (!document.getElementById('protocolDrugList')) return;
    installStyles();
    prepareSimpleUi();
    interceptActions();
    window.protocolToText = protocolToText;
    window.MedIndexPrescriptionWorkflow = { currentProtocol, groupedEntries, createGroup, clearGroups };
    const observer = new MutationObserver(() => {
      queueRender();
      if (!document.getElementById('miOverlay')?.hidden) setTimeout(refreshPreview, 0);
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    ensureDefaultName();
    queueRender();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
