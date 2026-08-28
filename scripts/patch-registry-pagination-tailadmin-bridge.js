'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');

function verifySingleRegistryCss() {
  const index = read('index.html');
  const tools = read('registry-table-tools.css');
  const hrefs = [...index.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(match => match[1]);
  const registryCss = hrefs.filter(href => /^registry-.*\.css/i.test(href));
  if (registryCss.length !== 1 || !registryCss[0].startsWith('registry-table-tools.css')) {
    throw new Error(`Registry must load exactly one stylesheet authority; found ${registryCss.join(', ') || 'nothing'}.`);
  }
  const professionalIndex = hrefs.findIndex(href => href.startsWith('tailadmin-professional.css'));
  if (professionalIndex < 0) throw new Error('TailAdmin Professional stylesheet is missing from index.html.');
  const afterProfessional = hrefs.slice(professionalIndex + 1);
  if (afterProfessional.length !== 1 || !afterProfessional[0].startsWith('registry-table-tools.css')) {
    throw new Error(`Registry final CSS must be the only stylesheet after TailAdmin; found ${afterProfessional.join(', ') || 'nothing'}.`);
  }
  if (/@import\s+url\([^)]*registry-/i.test(tools)) throw new Error('Final registry CSS must not import another registry stylesheet.');
  if (!tools.includes('consolidated from registry-pagination-v2.css')) throw new Error('Pagination rules are not materialized inside the final registry stylesheet.');
  if (!tools.includes('Stripe Clinical Table v1')) throw new Error('Stripe clinical final layer is missing from the single registry stylesheet.');
}

verifySingleRegistryCss();
console.log('Single registry CSS authority verified: pagination and final clinical rules are materialized in registry-table-tools.css.');
