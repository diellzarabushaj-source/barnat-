'use strict';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = value => clean(value).toLocaleLowerCase('sq');

const singular = {
  tableta:'tabletë', kapsula:'kapsulë', supozitorë:'supozitor', ovula:'ovul',
  ampula:'ampulë', flakona:'flakon', 'flakona infuzioni':'flakon infuzioni',
  sashe:'sashe', shishe:'shishe', tuba:'tub', blistera:'blister',
  shiringa:'shiringë', 'shiringa të paraplotësuara':'shiringë e paraplotësuar',
  doza:'dozë', flasterë:'flaster', inhalatorë:'inhalator', njësi:'njësi',
};

function unitForCount(count, plural) {
  return Number(count) === 1 ? (singular[plural] || plural) : plural;
}

function normalizeStrength(value) {
  return clean(value)
    .replace(/(\d)\s*(mg|mcg|µg|ug|g|ml|mL|l|L|IU|UI|NJ|%)(?=\b|\/)/gi, '$1 $2')
    .replace(/\bml\b/gi, 'mL')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
}

function effectiveKind(row) {
  const form = lower(row['Forma farmaceutike'] || row.form);
  const trade = lower(row['Emri tregtar'] || row.tradeName);
  if (/infusion|infusionslösung|infundibile/.test(trade)) return 'infusion';
  if (/infus/.test(form) && !/inject/.test(form)) return 'infusion';
  if (/inject|ampoule/.test(form)) return 'injection';
  if (/tablet|lozenge/.test(form)) return 'tablet';
  if (/capsule/.test(form)) return 'capsule';
  return 'other';
}

function prefixFor(row) {
  const form = lower(row['Forma farmaceutike'] || row.form);
  const kind = effectiveKind(row);
  if (kind === 'infusion') return 'Inf.';
  if (kind === 'injection') return 'Amp.';
  if (/vaginal tablet|pessary/.test(form)) return 'Ov.';
  if (/lozenge/.test(form)) return 'Past.';
  if (/tablet/.test(form)) return 'Tab.';
  if (/capsule/.test(form)) return 'Caps.';
  if (/suppository/.test(form)) return 'Supp.';
  if (/ointment/.test(form)) return 'Ung.';
  if (/cream/.test(form)) return 'Cr.';
  if (/syrup/.test(form)) return 'Sir.';
  if (/oral suspension/.test(form)) return 'Susp.';
  if (/oral solution/.test(form)) return 'Sol.';
  if (/powder/.test(form)) return 'Pulv.';
  if (/granule/.test(form)) return 'Gran.';
  if (/drops/.test(form)) return 'Gtt.';
  if (/spray/.test(form)) return 'Spr.';
  if (/inhalation/.test(form)) return 'Inh.';
  if (/gel/.test(form)) return 'Gel.';
  if (/dressing/.test(form)) return 'Garz.';
  if (/medicinal gas/.test(form)) return 'Gas med.';
  return 'Prep.';
}

function explicitRoute(row) {
  const kind = effectiveKind(row);
  if (!['injection', 'infusion'].includes(kind)) return '';
  const source = clean([
    row['Emri tregtar'] || row.tradeName,
    row['Madhësia e paketimit'] || row.packaging,
    row['Klasa / Çka është'],
    row['Përdorimi (fjalë kyçe)'],
  ].filter(Boolean).join(' | '));
  const candidates = [];
  const add = (label, patterns) => {
    const positions = patterns.flatMap(pattern => [...source.matchAll(pattern)].map(match => match.index));
    if (positions.length) candidates.push([Math.min(...positions), label]);
  };
  add('IV', [/\bintravenous\b/gi, /\bIV\b/g, /\bi\.v\.\b/gi]);
  add('IM', [/\bintramuscular\b/gi, /\bIM\b/g, /\bi\.m\.\b/gi]);
  add('SC', [/\bsubcutaneous\b/gi, /\bs\.c\.\b/gi]);
  add('epidurale', [/\bepidural\b/gi]);
  add('intratekale', [/\bintrathecal\b/gi]);
  add('intraartikular', [/\bintra-?articular\b/gi]);
  candidates.sort((a, b) => a[0] - b[0]);
  return [...new Set(candidates.map(item => item[1]))].join('/');
}

function formUnit(row) {
  const form = lower(row['Forma farmaceutike'] || row.form);
  const kind = effectiveKind(row);
  if (kind === 'injection') return 'ampula';
  if (kind === 'infusion') return 'flakona infuzioni';
  if (/vaginal tablet|pessary/.test(form)) return 'ovula';
  if (/lozenge/.test(form)) return 'pastila';
  if (/tablet/.test(form)) return 'tableta';
  if (/capsule/.test(form)) return 'kapsula';
  if (/suppository/.test(form)) return 'supozitorë';
  if (/granule|powder.*oral/.test(form)) return 'sashe';
  if (/patch/.test(form)) return 'flasterë';
  if (/inhalation/.test(form)) return 'doza';
  return 'njësi';
}

function normalizePackage(value) {
  return clean(value)
    .replace(/(\d)\s*ml(?=\b|[x×])/gi, '$1 mL')
    .replace(/(mL|L|g)\s*[x×]\s*(?=\d)/gi, '$1 × ')
    .replace(/(?<=\d)\s*[x×]\s*(?=\d)/gi, ' × ')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, word => ({one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10'})[word.toLowerCase()])
    .replace(/\s+/g, ' ')
    .trim();
}

function packagingSummary(row) {
  const source = normalizePackage(row['Madhësia e paketimit'] || row.packaging);
  const form = lower(row['Forma farmaceutike'] || row.form);
  const kind = effectiveKind(row);
  const unit = formUnit(row);
  let match;

  if ((match = source.match(/\((\d+)\s*(?:film[- ]?coated\s*)?(tablets?|capsules?|suppositories?)\)/i))) {
    const count = Number(match[1]);
    const plural = /caps/i.test(match[2]) ? 'kapsula' : /supp/i.test(match[2]) ? 'supozitorë' : 'tableta';
    return `1 kuti = ${count} ${unitForCount(count, plural)}`;
  }
  if ((match = source.match(/(\d+)\s*(?:blisters?|strips?)\D{0,20}(\d+)\s*(?:tablets?|capsules?)/i))) {
    const a = Number(match[1]); const b = Number(match[2]); const count = a * b;
    const plural = /caps/i.test(match[0]) ? 'kapsula' : 'tableta';
    return `1 kuti = ${count} ${unitForCount(count, plural)} (${a} blistera × ${b})`;
  }
  if ((match = source.match(/(\d+)\s*×\s*([\d.,]+)\s*(mL|L)\b/i))) {
    const count = Number(match[1]);
    const container = kind === 'injection' ? 'ampula' : kind === 'infusion' ? 'flakona infuzioni' : 'shishe';
    return `1 kuti = ${count} ${unitForCount(count, container)} × ${match[2]} ${match[3].toLowerCase() === 'ml' ? 'mL' : 'L'}`;
  }
  if ((match = source.match(/([\d.,]+)\s*mL\s*×\s*(\d+)/i))) {
    const count = Number(match[2]);
    const container = /periton|dialysis/.test(form) ? 'qese' : kind === 'injection' ? 'ampula' : kind === 'infusion' ? 'flakona infuzioni' : 'njësi';
    return `1 kuti = ${count} ${container} × ${match[1]} mL`;
  }
  if ((match = source.match(/(\d+)[^0-9]{0,70}(film[- ]?coated\s*)?table(?:t|te)s?/i))) {
    const count = Number(match[1]); return `1 kuti = ${count} ${unitForCount(count, 'tableta')}`;
  }
  if ((match = source.match(/(\d+)[^0-9]{0,70}(?:hard\s+|soft\s+)?capsules?|\b(\d+)\s*caps\b/i))) {
    const count = Number(match[1] || match[2]); return `1 kuti = ${count} ${unitForCount(count, 'kapsula')}`;
  }
  if ((match = source.match(/(\d+)[^0-9]{0,50}suppositories?/i))) {
    const count = Number(match[1]); return `1 kuti = ${count} ${unitForCount(count, 'supozitorë')}`;
  }
  if ((match = source.match(/(\d+)[^0-9]{0,50}(?:pessaries?|ovules?)/i))) {
    const count = Number(match[1]); return `1 kuti = ${count} ${unitForCount(count, 'ovula')}`;
  }
  if ((match = source.match(/(\d+)[^0-9]{0,60}(ampoules?|ampules?|ampola|amp\b)/i))) {
    const count = Number(match[1]);
    const volume = source.match(/([\d.,]+)\s*mL\b/i);
    return `1 kuti = ${count} ${unitForCount(count, 'ampula')}${volume ? ` × ${volume[1]} mL` : ''}`;
  }
  if ((match = source.match(/(\d+)[^0-9]{0,60}vials?/i))) {
    const count = Number(match[1]); return `1 kuti = ${count} ${unitForCount(count, 'flakona')}`;
  }
  if ((match = source.match(/(\d+)[^0-9]{0,50}(?:sachets?|packets?|bags?)/i))) {
    const count = Number(match[1]); return `1 kuti = ${count} sashe`;
  }
  if ((match = source.match(/([\d.,]+)\s*(mL|L)\b/i))) {
    const amount = match[1]; const measure = match[2].toLowerCase() === 'ml' ? 'mL' : 'L';
    if (kind === 'injection') return `1 ampulë = ${amount} ${measure}`;
    if (kind === 'infusion') return `1 flakon infuzioni = ${amount} ${measure}`;
    if (/solution|syrup|suspension|drops|emulsion/.test(form)) return `1 shishe = ${amount} ${measure}`;
  }
  if ((match = source.match(/([\d.,]+)\s*(?:g|gr|grams?)\b/i)) && /cream|ointment|gel|paste/.test(form)) {
    return `1 tub = ${match[1]} g`;
  }
  if (/\bvial\b/i.test(source)) return '1 kuti = 1 flakon';
  if (/\bampoule\b/i.test(source)) return '1 kuti = 1 ampulë';
  if (/^\d+$/.test(source)) {
    const count = Number(source); return `1 kuti = ${count} ${unitForCount(count, unit)}`;
  }
  return source ? `Paketimi: ${source.slice(0, 140)}` : '';
}

function dispenseFromSummary(summary) {
  if (!summary) return '';
  const human = summary.replace(/^1 kuti\b/, 'Një kuti').replace(/^1 shishe\b/, 'Një shishe').replace(/^1 ampulë\b/, 'Një ampulë').replace(/^1 flakon infuzioni\b/, 'Një flakon infuzioni');
  return `Scat. No I (${human})`;
}

function build(row) {
  const substance = clean(row['Substanca aktive'] || row.substance);
  const strength = normalizeStrength(row['Fortësia'] || row.strength);
  const route = explicitRoute(row);
  const line = `${prefixFor(row)} ${[substance, strength].filter(Boolean).join(' ')}${route ? ` (${route})` : ''}`.trim();
  const packaging = packagingSummary(row);
  return {
    line,
    packaging,
    dispense: dispenseFromSummary(packaging),
    full: [line, packaging].filter(Boolean).join(' — '),
    route,
  };
}

module.exports = { clean, normalizeStrength, effectiveKind, prefixFor, explicitRoute, packagingSummary, dispenseFromSummary, build };
