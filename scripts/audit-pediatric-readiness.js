'use strict';

/* Faza 1 — auditi i gatishmërisë së kalkulatorit pediatrik për barnat 1–300.
 *
 * Klasifikuesi te `lib/pediatric-readiness.js` është rregulli; ky skedar është
 * numëruesi. Lexon fushat `pediatric_*` nga Neon dhe nxjerr raportin: sa barna
 * llogariten sot, sa mbeten tekst, dhe — pjesa më e dobishme — cila fushë
 * mungon më shpesh, që Master Sheet-i të plotësohet aty ku vlen më së shumti.
 *
 * Xhirohet me dorë, jo në ndërtim dhe jo në CI: kërkon kredencialet e Neon-it
 * dhe rregulli vetë mbrohet nga `tests/pediatric-readiness-test.js`, që nuk
 * prek rrjetin.
 *
 *   MEDINDEX_NEON_DATA_API_TOKEN=... node scripts/audit-pediatric-readiness.js
 *   node scripts/audit-pediatric-readiness.js --from 1 --to 300 --json raport.json
 *
 * Lexon vetëm; nuk shkruan asnjë rresht te baza.
 */

const fs = require('node:fs');
const path = require('node:path');

const { neonRequest, dataOf, configuredToken, maximumReadRows } = require('../lib/neon-data-api.js');
const { STATUS, classify, summarize } = require('../lib/pediatric-readiness.js');

const PEDIATRIC_FIELDS = [
  'pediatric_dose_summary', 'pediatric_indication', 'pediatric_use_status',
  'pediatric_min_age_value', 'pediatric_min_age_unit', 'pediatric_max_age_value',
  'pediatric_max_age_unit', 'pediatric_min_weight_kg', 'pediatric_max_weight_kg',
  'pediatric_dose_min', 'pediatric_dose_max', 'pediatric_dose_unit', 'pediatric_dose_basis',
  'pediatric_doses_per_day', 'pediatric_interval_hours', 'pediatric_max_single_value',
  'pediatric_max_single_unit', 'pediatric_max_daily_value', 'pediatric_max_daily_unit',
  'pediatric_route', 'pediatric_restriction', 'pediatric_concentration_value',
  'pediatric_concentration_unit', 'pediatric_concentration_per_value',
  'pediatric_concentration_per_unit', 'pediatric_source_url', 'pediatric_source_section',
  'pediatric_verification_status', 'pediatric_verified_at', 'pediatric_primary_regimen_id',
];
const IDENTITY_FIELDS = ['id', 'registry_number', 'name', 'strength'];

function parseArgs(argv) {
  const args = { from:1, to:300, json:null, verbose:false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--from') args.from = Number(argv[++index]);
    else if (flag === '--to') args.to = Number(argv[++index]);
    else if (flag === '--json') args.json = argv[++index];
    else if (flag === '--verbose') args.verbose = true;
  }
  if (!Number.isFinite(args.from) || !Number.isFinite(args.to) || args.from > args.to) {
    throw new Error('Diapazoni --from/--to nuk është i vlefshëm.');
  }
  return args;
}

/* Porta e egresit te `lib/neon-data-api.js` e ndalon një lexim të gjerë pa
   kufi, dhe me arsye. Prandaj lexohet me faqe brenda kufirit të lejuar. */
async function fetchRange(from, to) {
  const pageSize = Math.min(maximumReadRows(), 200);
  const select = [...IDENTITY_FIELDS, ...PEDIATRIC_FIELDS].join(',');
  const rows = [];
  for (let start = from; start <= to; start += pageSize) {
    const end = Math.min(start + pageSize - 1, to);
    const query = `drugs?select=${select}`
      + `&registry_number=gte.${start}&registry_number=lte.${end}`
      + `&order=registry_number.asc&limit=${pageSize}`;
    const { data } = await neonRequest(query, { timeoutMs:30000, label:'Pediatric readiness audit' });
    const page = dataOf(data);
    if (!Array.isArray(page)) throw new Error('Neon ktheu një përgjigje që nuk është listë rreshtash.');
    rows.push(...page);
    if (page.length < end - start + 1) break;
  }
  return rows;
}

function percent(count, total) {
  return total ? `${((count / total) * 100).toFixed(1)}%` : '0.0%';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!configuredToken()) {
    console.error(
      'Mungon kredenciali i Neon-it. Cakto MEDINDEX_NEON_DATA_API_TOKEN (ose NEON_DATA_API_TOKEN)\n'
      + 'dhe xhiroje sërish. Ky audit lexon të dhëna reale pacientësh-bari, prandaj nuk ka rrugë pa të.',
    );
    process.exitCode = 1;
    return;
  }

  const rows = await fetchRange(args.from, args.to);
  const audit = summarize(rows);
  const expected = args.to - args.from + 1;

  console.log(`\nAudit i gatishmërisë pediatrike — barnat ${args.from}–${args.to}`);
  console.log(`Rreshta të gjetur: ${audit.total} nga ${expected} të pritur.`);
  if (audit.total < expected) {
    console.log(`  ${expected - audit.total} numra regjistri mungojnë te Neon-i në këtë diapazon.`);
  }

  console.log('\nGatishmëria:');
  for (const status of Object.values(STATUS)) {
    const count = audit.counts[status];
    console.log(`  ${status.padEnd(18)} ${String(count).padStart(4)}  ${percent(count, audit.total)}`);
  }
  console.log(`  ${'me paralajmërim'.padEnd(18)} ${String(audit.withWarnings).padStart(4)}  ${percent(audit.withWarnings, audit.total)}`);

  const missing = Object.entries(audit.missingCounts).sort((a, b) => b[1] - a[1]);
  if (missing.length) {
    console.log('\nFushat që mungojnë më shpesh — këtu vlen puna te Master Sheet-i:');
    for (const [field, count] of missing) {
      console.log(`  ${field.padEnd(46)} ${String(count).padStart(4)}`);
    }
  }

  /* Arsyet e grupuara tregojnë nëse pengesa është e dhënë që mungon apo rregull
     klinik. Të dyja kërkojnë veprime krejt të ndryshme. */
  const reasonCounts = new Map();
  for (const { verdict } of audit.results) {
    for (const reason of verdict.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
  }
  if (reasonCounts.size) {
    /* Arsyet mbahen fjalë për fjalë. Provova t'i grupoja duke i zëvendësuar
       vlerat brenda thonjëzave, po ajo i bashkonte "KUNDËRINDIKUAR" me "PA TË
       DHËNA" në një rresht të vetëm — pikërisht dallimi që ka rëndësi. Në vend
       të kësaj, lista pritet te 20 rreshtat më të shpeshtë. */
    const sorted = [...reasonCounts].sort((a, b) => b[1] - a[1]);
    console.log('\nArsyet e bllokimit:');
    for (const [reason, count] of sorted.slice(0, 20)) {
      console.log(`  ${String(count).padStart(4)}  ${reason}`);
    }
    if (sorted.length > 20) console.log(`  … edhe ${sorted.length - 20} arsye të tjera (shih --json).`);
  }

  if (args.verbose) {
    console.log('\nBarnat që nuk llogariten:');
    for (const { row, verdict } of audit.results) {
      if (verdict.readiness === STATUS.CALCULATOR_READY) continue;
      const label = `${row.registry_number ?? '?'}. ${row.name || '(pa emër)'}`;
      console.log(`  ${label} — ${verdict.readiness}`);
      for (const reason of verdict.reasons) console.log(`      ${reason}`);
      /* Një bar i bllokuar vetëm nga fusha bosh nuk ka asnjë "arsye" — pengesa
         e tij është te `missing`. Pa këtë rresht ai dilte si emër i zhveshur,
         pa e thënë fare çka i duhet. */
      if (verdict.missing.length) console.log(`      mungojnë: ${verdict.missing.join(', ')}`);
    }
  }

  if (args.json) {
    const target = path.resolve(process.cwd(), args.json);
    fs.writeFileSync(target, `${JSON.stringify({
      generatedAt:new Date().toISOString(),
      range:{ from:args.from, to:args.to },
      total:audit.total,
      counts:audit.counts,
      withWarnings:audit.withWarnings,
      missingCounts:audit.missingCounts,
      drugs:audit.results.map(({ row, verdict }) => ({
        registryNumber:row.registry_number,
        name:row.name,
        readiness:verdict.readiness,
        reasons:verdict.reasons,
        warnings:verdict.warnings,
        missing:verdict.missing,
        requires:verdict.requires,
      })),
    }, null, 2)}\n`, 'utf8');
    console.log(`\nRaporti u shkrua te ${target}`);
  }

  const ready = audit.counts[STATUS.CALCULATOR_READY];
  console.log(
    `\nPërfundim: ${ready} nga ${audit.total} barna mund të hyjnë sot te kalkulatori. `
    + 'Pjesa tjetër shfaqet si tekst klinik, kurrë si formulë e hamendësuar.\n',
  );
}

main().catch(error => {
  console.error(`Auditi dështoi: ${error.message}`);
  process.exitCode = 1;
});
