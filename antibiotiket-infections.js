(() => {
  'use strict';
  const picker = document.getElementById('indicationPicker');
  const choices = document.getElementById('indicationChoice');
  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  if (!picker || !choices || !guide || choices.dataset.organized) return;
  const labels = [...choices.querySelectorAll('label.abx-chip')];
  if (!labels.length) return;
  choices.dataset.organized = 'true';

  // Navigation metadata only. Keep the original radios, selection handlers,
  // regimen IDs and all clinical decisions owned by antibiotiket.js.
  const groups = [
    { id:'respiratory', label:'Frymëmarrja dhe ORL', ids:['aom','gas','pneumonia','sinusitis'] },
    { id:'urinary', label:'Rrugët urinare', ids:['uti-cystitis','uti-pyelo'] },
    { id:'skin', label:'Lëkura dhe indet e buta', ids:['impetigo','cellulitis','wound-cut','abscess','preseptal','bite','lymphadenitis'] },
    { id:'other', label:'Të tjera', ids:[] },
  ];
  const hints = {
    aom:'Veshi i mesëm', gas:'Fyti · streptokoku i grupit A', pneumonia:'Pneumoni komunitare', sinusitis:'Sinuset',
    'uti-cystitis':'Cistit · pa ethe', 'uti-pyelo':'Infeksion urinar me ethe',
    impetigo:'Lëkura', cellulitis:'Lëkura dhe indet nënlëkurore', 'wound-cut':'Plagë / prerje', abscess:'Absces i lëkurës',
    preseptal:'Zona rreth syrit · preseptal', bite:'Kafshime nga gjitarët', lymphadenitis:'Nyjet limfatike të qafës',
  };
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const items = labels.map(label => {
    const input = label.querySelector('input');
    const item = guide.indications.find(item => item.id === input.value);
    const group = groups.find(group => group.ids.includes(input.value)) || groups.at(-1);
    const title = item?.short || label.textContent.trim();
    input.setAttribute('aria-label', title);
    const hint = create('small','abx-infection-hint',hints[input.value] || item?.label || title);
    hint.id = 'infection-hint-' + input.value;
    input.setAttribute('aria-describedby',hint.id);
    label.append(hint,create('span','abx-infection-check','✓'));
    label.lastElementChild.setAttribute('aria-hidden','true');
    return { label, input, group, text:normalize([title,item?.label,hint.textContent,group.label].join(' ')) };
  });
  let category = items.find(item => item.input.checked)?.group.id || 'all';
  const toolbar = create('div','abx-infection-tools');
  const searchWrap = create('div','abx-infection-search');
  const searchLabel = create('label','sr-only','Kërko infeksionin');
  searchLabel.htmlFor = 'infectionSearch';
  const search = create('input','');
  Object.assign(search,{id:'infectionSearch',type:'search',placeholder:'Kërko infeksionin…',autocomplete:'off'});
  search.spellcheck = false;
  const clear = create('button','abx-infection-clear','×');
  clear.type = 'button'; clear.setAttribute('aria-label','Pastro kërkimin'); clear.hidden = true;
  searchWrap.append(searchLabel,search,clear);
  const filters = create('div','abx-infection-filters');
  filters.setAttribute('role','group'); filters.setAttribute('aria-label','Kategoritë e infeksioneve');
  const usedGroups = groups.filter(group => items.some(item => item.group === group));
  const buttons = [{id:'all',label:'Të gjitha'},...usedGroups].map(group => {
    const count = items.filter(item => group.id === 'all' || item.group.id === group.id).length;
    const button = create('button','abx-infection-filter',group.label);
    button.type = 'button'; button.dataset.infectionGroup = group.id;
    const number = create('span','',String(count)); number.setAttribute('aria-hidden','true');
    button.append(number);
    button.addEventListener('click',() => { category = group.id; search.value = ''; apply(); });
    filters.append(button); return button;
  });
  toolbar.append(searchWrap,filters);
  choices.before(toolbar);
  choices.classList.add('abx-infection-results');
  const sections = usedGroups.map(group => {
    const section = create('div','abx-infection-group');
    const heading = create('p','abx-infection-group-title',group.label);
    const grid = create('div','abx-infection-grid');
    const members = items.filter(item => item.group === group);
    grid.append(...members.map(item => item.label)); section.append(heading,grid); choices.append(section);
    return { section, members };
  });
  const status = create('p','abx-infection-count');
  status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  toolbar.append(status);
  const empty = create('div','abx-infection-empty');
  empty.append(create('p','','Nuk u gjet infeksion për këtë kërkim.'));
  const reset = create('button','','Shfaq të gjitha infeksionet');
  reset.type = 'button';
  reset.addEventListener('click',() => { category = 'all'; search.value = ''; apply(); search.focus(); });
  empty.append(reset); choices.after(empty);

  function apply() {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    let count = 0;
    items.forEach(item => {
      const visible = (category === 'all' || item.group.id === category) && terms.every(term => item.text.includes(term));
      item.label.hidden = !visible;
      if (visible) count++;
    });
    sections.forEach(({section,members}) => { section.hidden = members.every(item => item.label.hidden); });
    buttons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.infectionGroup === category)));
    clear.hidden = !search.value;
    empty.hidden = count > 0;
    status.textContent = count + (count === 1 ? ' infeksion' : ' infeksione');
  }
  search.addEventListener('input',() => { category = 'all'; apply(); });
  clear.addEventListener('click',() => { search.value = ''; apply(); search.focus(); });
  search.addEventListener('keydown',event => {
    if (event.key !== 'Escape') return;
    if (search.value) { search.value = ''; apply(); }
    else if (matchMedia('(max-width:760px)').matches) { picker.open = false; picker.querySelector('summary').focus(); }
  });
  choices.addEventListener('change',event => {
    const selected = items.find(item => item.input === event.target);
    if (!selected) return;
    category = selected.group.id; search.value = ''; apply();
    if (!picker.open) picker.querySelector('summary').focus({preventScroll:true});
  });
  apply();
})();
