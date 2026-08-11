'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'registry-unified-table.js');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Personal note column patch could not find ${label}.`);
  return source.replace(before, after);
}

let source = fs.readFileSync(TARGET, 'utf8');

source = replaceOnce(
  source,
  "    'clinical-action', 'dose-calculator',\n  ]);",
  "    'clinical-action', 'dose-calculator', 'personal-note',\n  ]);",
  'FULL_ORDER tail'
);

source = replaceOnce(
  source,
  "    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator',\n  ]);",
  "    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator', 'personal-note',\n  ]);",
  'CLINICAL_ORDER tail'
);

source = replaceOnce(
  source,
  "    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator',\n  ]);\n  const CLINICAL_BASE_KEYS",
  "    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator', 'personal-note',\n  ]);\n  const CLINICAL_BASE_KEYS",
  'DYNAMIC_KEYS tail'
);

source = replaceOnce(
  source,
  "    'clinical-status':'Verifikimi', 'clinical-action':'Redakto', 'dose-calculator':'Doza',\n  });",
  "    'clinical-status':'Verifikimi', 'clinical-action':'Redakto', 'dose-calculator':'Doza',\n    'personal-note':'Shënime personale',\n  });",
  'LABEL_BY_KEY'
);

source = replaceOnce(
  source,
  "    'dose-calculator':128,\n  });",
  "    'dose-calculator':128, 'personal-note':220,\n  });",
  'WIDTHS'
);

source = replaceOnce(
  source,
  "    kalkulatori:'dose-calculator', kalkulatoridozes:'dose-calculator',\n  });",
  "    kalkulatori:'dose-calculator', kalkulatoridozes:'dose-calculator',\n    shenimepersonale:'personal-note', shenime:'personal-note',\n  });",
  'LABEL_KEYS'
);

fs.writeFileSync(TARGET, source);
console.log('Native personal-note unified registry column contract applied.');
