'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'registry-v2.js');
const MARKER = 'registry-prescription-derived-notation-v1';

let source = fs.readFileSync(target, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const anchor = '\n  function renderRows() {';
  if (!source.includes(anchor)) throw new Error('Registry prescription notation anchor missing: renderRows');

  const helper = `
  const PRESCRIPTION_NOTATION_FALLBACK = '${MARKER}';

  function prescriptionFormPrefix(formValue) {
    const form = clean(formValue).toLocaleLowerCase('sq');
    if (!form) return '';
    if (/vaginal tablet|pessary|ovul/.test(form)) return 'Ov.';
    if (/lozenge|pastill/.test(form)) return 'Past.';
    if (/infus|infuz/.test(form) && !/inject/.test(form)) return 'Inf.';
    if (/inject|ampou?le|ampul/.test(form)) return 'Amp.';
    if (/tablet|tabletë|tableta/.test(form)) return 'Tab.';
    if (/capsule|kapsul/.test(form)) return 'Caps.';
    if (/suppository|supoz/.test(form)) return 'Sup.';
    if (/ointment|unguent/.test(form)) return 'Ung.';
    if (/cream|krem/.test(form)) return 'Cr.';
    if (/gel|xhel|zhel/.test(form)) return 'Gel.';
    if (/syrup|sirup/.test(form)) return 'Sir.';
    if (/drops|pika/.test(form)) return 'Gtt.';
    if (/spray|sprej|spraj/.test(form)) return 'Spr.';
    if (/inhalation|inhalacion/.test(form)) return 'Inh.';
    if (/oral suspension|suspension/.test(form)) return 'Susp.';
    if (/oral solution|solution|solucion/.test(form)) return 'Sol.';
    if (/powder|pluhur/.test(form)) return 'Pulv.';
    if (/granule|granula/.test(form)) return 'Gran.';
    if (/implant/.test(form)) return 'Impl.';
    if (/shampoo|shampo/.test(form)) return 'Shamp.';
    return '';
  }

  function prescriptionNotationFor(row) {
    const explicit = clean(row?.prescriptionNotation);
    if (explicit) return explicit;
    const prefix = prescriptionFormPrefix(row?.form);
    const identity = [clean(row?.activeSubstance), clean(row?.strength)].filter(Boolean).join(' ');
    const line = [prefix, identity].filter(Boolean).join(' ');
    return line ? `Rp.: ${line}` : '—';
  }
`;

  source = source.replace(anchor, `${helper}${anchor}`);

  const legacy = "escapeHtml(row.prescriptionNotation || 'Nuk është plotësuar në burim')";
  const occurrences = source.split(legacy).length - 1;
  if (occurrences !== 2) {
    throw new Error(`Registry prescription notation expected 2 legacy fallbacks, found ${occurrences}.`);
  }
  source = source.split(legacy).join('escapeHtml(prescriptionNotationFor(row))');

  if (!source.includes("return 'Tab.';")
      || !source.includes("return 'Amp.';")
      || !source.includes("return 'Caps.';")
      || !source.includes("return 'Ung.';")
      || !source.includes("return 'Gel.';")
      || !source.includes('Rp.: ${line}')
      || source.includes('Nuk është plotësuar në burim')) {
    throw new Error('Registry prescription notation fallback was not materialized correctly.');
  }

  fs.writeFileSync(target, source, 'utf8');
}

console.log('Materialized Registry prescription notation fallback with Rp. + form + active substance + strength.');
