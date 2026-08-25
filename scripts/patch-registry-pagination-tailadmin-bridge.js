'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

const PAGINATION_IMPORT = '@import url("registry-pagination-v2.css?v=20260825-1");';

function bridgePaginationStyles() {
  let index = read('index.html');
  index = index.replace(/\s*<link rel="stylesheet" href="registry-pagination-v2\.css\?v=[^"]+"[^>]*>\s*/g, '\n');
  write('index.html', index);

  let tools = read('registry-table-tools.css');
  if (!tools.includes(PAGINATION_IMPORT)) tools = `${PAGINATION_IMPORT}\n\n${tools}`;
  write('registry-table-tools.css', tools);
}

function verifyTailAdminOrder() {
  const index = read('index.html');
  const tools = read('registry-table-tools.css');
  const hrefs = [...index.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(match => match[1]);
  const professionalIndex = hrefs.findIndex(href => href.startsWith('tailadmin-professional.css'));
  if (professionalIndex < 0) throw new Error('TailAdmin Professional stylesheet is missing from index.html.');
  const afterProfessional = hrefs.slice(professionalIndex + 1);
  if (afterProfessional.length !== 1 || !afterProfessional[0].startsWith('registry-table-tools.css')) {
    throw new Error(`Registry pagination must stay inside the single table-tools layer after TailAdmin; found ${afterProfessional.join(', ') || 'nothing'}.`);
  }
  if (index.includes('registry-pagination-v2.css')) throw new Error('Registry pagination must not be a second stylesheet after TailAdmin.');
  if (!tools.startsWith(PAGINATION_IMPORT)) throw new Error('Registry pagination stylesheet is not imported by registry-table-tools.css.');
}

bridgePaginationStyles();
verifyTailAdminOrder();
console.log('Registry pagination v2 TailAdmin bridge passed: the numbered pagination stays inside the single authorized table-tools stylesheet layer.');
