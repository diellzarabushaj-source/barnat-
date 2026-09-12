(() => {
  'use strict';

  const config = window.DRX_ANTIBIOTIC_PARENTERAL_PREP;
  if (!config) return;

  // HOSPITAL_IV_IM and IV_IM_PREPARATION use the same canonical Drug_ID but
  // different display-order wording for benzathine penicillin G. Normalize the
  // runtime display key without changing the source label provenance.
  const aliases = Object.freeze({
    'Penicillin G benzathine':'Benzathine penicillin G'
  });

  for (const prep of config.preparations || []) {
    const canonicalDisplay = aliases[prep.drug];
    if (!canonicalDisplay) continue;
    prep.sourceDrugName = prep.drug;
    prep.drug = canonicalDisplay;
  }

  const note = document.querySelector('.abx-hospital-prep-note');
  if (note) {
    note.textContent = 'Përgatitja produkt-specifike është e palosur brenda secilës kartë te “Si përgatitet”. mL shfaqet vetëm pas verifikimit të produktit, route dhe koncentrimit të lejuar.';
  }
})();