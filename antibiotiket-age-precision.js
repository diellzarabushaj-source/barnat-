(() => {
  'use strict';

  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  if (!guide?.ageBands) return;

  const clinicalOnlyBands = [
    { id:'1m', label:'1 muaj', months:1, referenceWeightKg:null, referenceWeightLabel:'' },
    { id:'2m', label:'2 muaj', months:2, referenceWeightKg:null, referenceWeightLabel:'' },
    { id:'5y', label:'5 vjeç', months:60, referenceWeightKg:null, referenceWeightLabel:'' },
  ];

  clinicalOnlyBands.forEach(band => {
    if (!guide.ageBands.some(item => item.id === band.id)) guide.ageBands.push(band);
  });
  guide.ageBands.sort((a,b) => a.months - b.months);

  if (typeof document === 'undefined') return;

  const select = document.getElementById('ageSelect');
  if (!select) return;

  const previous = select.value || '';
  select.replaceChildren();
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Pa zgjedhur';
  select.append(blank);

  guide.ageBands.forEach(age => {
    const option = document.createElement('option');
    option.value = age.id;
    option.textContent = Number.isFinite(age.referenceWeightKg)
      ? `${age.label} · ref. ${age.referenceWeightLabel}`
      : age.label;
    select.append(option);
  });
  if ([...select.options].some(option => option.value === previous)) select.value = previous;

  function refineClinicalOnlyCopy() {
    const band = guide.ageBands.find(item => item.id === select.value);
    if (!band || Number.isFinite(band.referenceWeightKg)) return;
    const ageHint = document.getElementById('ageHint');
    const weightHint = document.getElementById('weightHint');
    if (ageHint) ageHint.textContent = 'Kjo moshë përdoret për pragun klinik; nuk i caktohet peshë referuese. Për dozën finale shkruaj peshën reale.';
    const weightRaw = String(document.getElementById('weightInput')?.value || '').trim();
    if (weightHint && !weightRaw) weightHint.textContent = 'Shkruaj peshën reale për llogaritjen e dozës; kjo bandë moshe nuk përdor peshë referuese.';
  }

  select.addEventListener('change', () => window.setTimeout(refineClinicalOnlyCopy, 0));
  document.getElementById('weightInput')?.addEventListener('input', () => window.setTimeout(refineClinicalOnlyCopy, 0));
  window.setTimeout(refineClinicalOnlyCopy, 0);

  window.DRX_ANTIBIOTIC_AGE_PRECISION = Object.freeze({
    version:'2026-09-12-v1',
    clinicalOnlyBands:clinicalOnlyBands.map(item => item.id),
    rule:'Age cutoffs are explicit clinical inputs; clinical-only bands never create a reference weight.'
  });
})();