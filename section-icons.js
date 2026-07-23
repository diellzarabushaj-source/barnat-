(() => {
  'use strict';

  const ICD_ICON_BY_ROMAN = {
    I:'bacteria', II:'oncology', III:'blood', IV:'endocrine', V:'brain', VI:'brain', VII:'eye', VIII:'ear',
    IX:'heart', X:'lungs', XI:'digestive', XII:'skin', XIII:'bone', XIV:'kidney', XV:'pregnancy', XVI:'baby',
    XVII:'dna', XVIII:'stethoscope', XIX:'injury', XX:'external', XXI:'shield', XXII:'code'
  };
  let frame = 0;

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  }

  function labIcon(value) {
    const text = normalize(value);
    if (/eritrocit|hemoglobin|hematokrit/.test(text)) return 'blood';
    if (/leukocit|formula leukocitare/.test(text)) return 'microscope';
    if (/trombocit/.test(text)) return 'platelet';
    if (/koagul|hemostaz/.test(text)) return 'coagulation';
    if (/renal|veshk|urine|urines/.test(text)) return 'kidney';
    if (/hepat|melci|bilirubin/.test(text)) return 'liver';
    if (/glukoz|diabet|insulin/.test(text)) return 'glucose';
    if (/lipid|kolesterol|triglicer/.test(text)) return 'lipid';
    if (/pankreas|amilaz|lipaz/.test(text)) return 'pancreas';
    if (/inflam|crp|sediment/.test(text)) return 'inflammation';
    if (/hormon|endokrin|tiroide/.test(text)) return 'endocrine';
    if (/infektiv|mikrobiolog|bakter/.test(text)) return 'bacteria';
    return 'flask';
  }

  function addStyles() {
    if (document.getElementById('medIndexSectionIconStyles')) return;
    const style = document.createElement('style');
    style.id = 'medIndexSectionIconStyles';
    style.textContent = `
      .lab-category-symbol,.icd-chapter-symbol{display:grid;place-items:center;flex:0 0 auto;border:1px solid rgba(21,94,99,.15);background:linear-gradient(145deg,#f8fcfa,#eaf4f1);color:#0d6266;box-shadow:0 6px 15px rgba(13,61,64,.06)}
      .lab-category-symbol{width:38px;height:38px;border-radius:11px}.lab-category-symbol svg{width:23px;height:23px}
      .icd-chapter-symbol{width:42px;height:42px;border-radius:12px;margin-right:auto}.icd-chapter-symbol svg{width:25px;height:25px}
      .icd-chapter-head{align-items:center}.lab-category-head{grid-template-columns:auto auto minmax(0,1fr) auto!important}
      html[data-theme=dark] .lab-category-symbol,html[data-theme=dark] .icd-chapter-symbol{background:#172b2e;border-color:#385053;color:#83cbcd;box-shadow:none}
      @media(max-width:650px){.lab-category-symbol{width:34px;height:34px}.lab-category-head{grid-template-columns:auto auto 1fr!important}.lab-category-head>span:last-child{grid-column:2/-1;margin-left:0!important}.icd-chapter-symbol{width:38px;height:38px}}
    `;
    document.head.appendChild(style);
  }

  function decorateLabs() {
    document.querySelectorAll('.lab-category-head').forEach(head => {
      if (head.querySelector('.lab-category-symbol')) return;
      const title = head.querySelector('h2')?.textContent || head.textContent;
      const icon = document.createElement('span');
      icon.className = 'lab-category-symbol';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = window.MedIndexIcons?.svg(labIcon(title)) || '';
      head.prepend(icon);
    });
  }

  function decorateIcd() {
    document.querySelectorAll('.icd-chapter-card').forEach(card => {
      const head = card.querySelector('.icd-chapter-head');
      if (!head || head.querySelector('.icd-chapter-symbol')) return;
      const roman = String(card.querySelector('.icd-roman')?.textContent || '').trim().toUpperCase();
      const icon = document.createElement('span');
      icon.className = 'icd-chapter-symbol';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = window.MedIndexIcons?.svg(ICD_ICON_BY_ROMAN[roman] || 'stethoscope') || '';
      const code = head.querySelector('.med-card-code');
      head.insertBefore(icon, code || null);
    });
  }

  function decorate() {
    frame = 0;
    addStyles();
    decorateLabs();
    decorateIcd();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(decorate);
  }

  function init() {
    decorate();
    ['labSections', 'chapterGrid'].forEach(id => {
      const node = document.getElementById(id);
      if (node) new MutationObserver(schedule).observe(node, { childList:true, subtree:true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
