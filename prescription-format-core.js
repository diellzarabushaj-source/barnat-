(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexPrescriptionFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORM_LABELS = {
    tab:'Tableta', tablet:'Tableta', tableta:'Tableta', 'tabletë':'Tableta',
    caps:'Kapsula', capsule:'Kapsula', capsules:'Kapsula', kapsula:'Kapsula', 'kapsulë':'Kapsula',
    amp:'Ampulë', ampoule:'Ampulë', ampoules:'Ampulë', ampula:'Ampulë', 'ampulë':'Ampulë',
    inj:'Ampulë', injection:'Ampulë', injectable:'Ampulë',
    inf:'Infuzion', infusion:'Infuzion', infuzion:'Infuzion',
    ung:'Unguentum', ointment:'Unguentum', unguentum:'Unguentum',
    cream:'Krem', krem:'Krem',
    gel:'Gel',
    sol:'Solucion', solution:'Solucion', solucion:'Solucion',
    suspension:'Suspension', susp:'Suspension',
    sir:'Sirup', syrup:'Sirup', sirup:'Sirup',
    sup:'Supozitor', supp:'Supozitor', suppository:'Supozitor', supozitor:'Supozitor',
    ov:'Ovul', ovule:'Ovul', pessary:'Ovul', vaginal:'Ovul',
    gtt:'Pika', drops:'Pika', pika:'Pika',
    spray:'Spray',
    inh:'Inhalacion', inhalation:'Inhalacion', inhalacion:'Inhalacion',
    powder:'Pluhur', pulv:'Pluhur',
    granule:'Granula', granules:'Granula',
    lozenge:'Pastilë', pastille:'Pastilë',
    fl:'Flakon', vial:'Flakon', flakon:'Flakon',
    dressing:'Garzë', gauze:'Garzë',
    'medicinal gas':'Gaz medicinal',
  };
  const FORM_PREFIXES = {
    Tableta:'Tab.', Kapsula:'Caps.', Ampulë:'Amp.', Infuzion:'Inf.',
    Unguentum:'Ung.', Krem:'Cr.', Gel:'Gel.', Solucion:'Sol.', Suspension:'Susp.',
    Sirup:'Sir.', Supozitor:'Sup.', Ovul:'Ov.', Pika:'Gtt.', Spray:'Spr.',
    Inhalacion:'Inh.', Pluhur:'Pulv.', Granula:'Gran.', Pastilë:'Past.',
    Flakon:'Fl.', Garzë:'Garz.', 'Gaz medicinal':'Gas med.',
  };
  const EXACT_FORM_PREFIXES = Object.freeze({
    'capsule, soft': 'Caps. soft.',
    'chewable tablet': 'Tab. përtyp.',
  });
  const RX_PREFIX_PATTERN = /^(?:Tab\.\s*përtyp\.|Caps\.\s*soft\.|Tab\.|Caps\.|Amp\.|Inf\.|Ung\.|Cr\.|Sol\.|Sir\.|Susp\.|Sup\.|Supp\.|Ov\.|Gtt\.|Spr\.|Inh\.|Inj\.|Pulv\.|Gran\.|Past\.|Gel\.|Fl\.|Vial\.|Garz\.|Gas\s+med\.|Prep\.)\s*/i;

  const text = value => String(value ?? '').trim();
  const formKey = value => text(value)
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('sq');

  function formLabel(value) {
    const raw = text(value).replace(/[().]/g, '').toLocaleLowerCase('sq');
    if (!raw) return '';
    const direct = FORM_LABELS[raw];
    if (direct) return direct;
    const match = Object.entries(FORM_LABELS).find(([key]) => raw.includes(key));
    return match?.[1] || text(value).replace(/[().]/g, '');
  }

  function normalizeDrug(item) {
    const tradeName = text(item?.tradeName || item?.trade_name || item?.['Emri tregtar']);
    const substance = text(item?.substance || item?.activeSubstance || item?.active_substance || item?.['Substanca aktive']);
    const strength = text(item?.strength || item?.dose || item?.['Fortësia']);
    const form = text(item?.form || item?.pharmaceuticalForm || item?.pharmaceutical_form || item?.['Forma farmaceutike'] || item?.['Forma']);
    return {
      key: text(item?.key || item?.drugKey || `${item?.pdid || item?.PDID || ''}|${tradeName}|${strength}`),
      id: text(item?.id || item?.drugId),
      drugId: text(item?.drugId || item?.id),
      tradeName,
      substance,
      strength,
      form,
      atc: text(item?.atc || item?.atcCode || item?.atc_code || item?.['ATC Code']),
      pdid: text(item?.pdid),
      regimenId: text(item?.regimenId),
      dosageStatus: text(item?.dosageStatus),
      dosagePopulation: text(item?.dosagePopulation),
      indication: text(item?.indication),
      route: text(item?.route),
      frequency: text(item?.frequency),
      duration: text(item?.duration),
      dispense: text(item?.dispense),
      signatura: text(item?.signatura),
      warnings: text(item?.warnings),
      sourceUrl: text(item?.sourceUrl),
      matchKey: text(item?.matchKey),
      verificationStatus: text(item?.verificationStatus),
    };
  }

  function prefixForForm(value) {
    const raw = text(value);
    if (!raw) return '';
    const exact = EXACT_FORM_PREFIXES[formKey(raw)];
    if (exact) return exact;

    // Already-normalized labels (e.g. "Kapsula"/"Ampulë") must resolve too.
    if (FORM_PREFIXES[raw]) return FORM_PREFIXES[raw];

    const label = formLabel(raw);
    if (FORM_PREFIXES[label]) return FORM_PREFIXES[label];

    // Fail closed: only known pharmaceutical-form wording may emit a prefix.
    const normalized = formKey(raw);
    const ordered = [
      [/(?:vaginal\s+tablet|pessary|ovul)/, 'Ov.'],
      [/(?:lozenge|pastill)/, 'Past.'],
      [/(?:infusion|infuz)/, 'Inf.'],
      [/(?:injection|injectable|ampou?le|ampul)/, 'Amp.'],
      [/(?:capsule|kapsul)/, 'Caps.'],
      [/(?:tablet|tabletë|tableta)/, 'Tab.'],
      [/(?:suppository|supoz)/, 'Sup.'],
      [/(?:ointment|unguent)/, 'Ung.'],
      [/(?:cream|krem)/, 'Cr.'],
      [/(?:gel)/, 'Gel.'],
      [/(?:oral\s+suspension|suspension)/, 'Susp.'],
      [/(?:oral\s+solution|solution|solucion)/, 'Sol.'],
      [/(?:syrup|sirup)/, 'Sir.'],
      [/(?:drops|pika)/, 'Gtt.'],
      [/(?:spray)/, 'Spr.'],
      [/(?:inhalation|inhalacion)/, 'Inh.'],
      [/(?:powder|pluhur)/, 'Pulv.'],
      [/(?:granule|granula)/, 'Gran.'],
      [/(?:vial|flakon)/, 'Fl.'],
      [/(?:dressing|gauze|garz)/, 'Garz.'],
      [/(?:medicinal\s+gas|gaz\s+medicinal)/, 'Gas med.'],
    ];
    return ordered.find(([pattern]) => pattern.test(normalized))?.[1] || '';
  }

  function ensurePrescriptionPrefix(rawLine, form) {
    let line = text(rawLine).replace(/^Rp\s*:\s*/i, '');
    if (!line) return '';
    const prefix = prefixForForm(form);
    if (!prefix) return line;
    line = text(line.replace(RX_PREFIX_PATTERN, ''));
    return `${prefix} ${line}`.trim();
  }

  function selectedDrugLine(item) {
    const drug = normalizeDrug(item);
    const name = drug.substance;
    if (!name) return '';
    const main = [name, drug.strength].filter(Boolean).join(' ');
    const form = formLabel(drug.form);
    const prefix = prefixForForm(form);
    return `${prefix ? `${prefix} ` : ''}${main}${form ? ` (${form})` : ''}`.trim();
  }

  function parseMedicationLine(rawLine) {
    let line = text(rawLine).replace(/^Rp\s*:\s*/i, '');
    if (!line || /^(?:Sasia|Doza|Tjetër|S(?:\s*\(Signatura\))?\.?|Signatura)\s*:/i.test(line)) return null;

    let prefixForm = '';
    const prefixMatch = line.match(/^(Tab\.?|Caps\.?|Amp\.?|Inf\.?|Ung\.?|Sol\.?|Sir\.?|Sup\.?|Gtt\.?|Inh\.?|Inj\.?|Fl\.?|Vial\.?)\s+(.+)$/i);
    if (prefixMatch) {
      prefixForm = formLabel(prefixMatch[1]);
      line = text(prefixMatch[2]);
    }

    let parentheticalForm = '';
    const formMatch = line.match(/\s*\(([^()]*(?:tablet|kapsul|ampul|infuz|unguent|krem|solucion|sirup|supoz|pika|inhal|spray|flakon)[^()]*)\)\s*$/i);
    if (formMatch) {
      parentheticalForm = formLabel(formMatch[1]);
      line = text(line.slice(0, formMatch.index));
    }

    let inlineQuantity = '';
    const inlineMatch = line.match(/\s+a\s+([\d.,]+\s*(?:ml|mL|l|L|g|tableta?|kapsula?|ampula?))\s*$/i);
    if (inlineMatch) {
      inlineQuantity = `a ${inlineMatch[1].replace(/([\d.,])([a-zA-Z])/g, '$1 $2')}`;
      line = text(line.slice(0, inlineMatch.index));
    }

    const doseMatch = line.match(/\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ug|ml|mL|IU|UI|NJ|%)/i);
    const dose = doseMatch ? text(line.slice(doseMatch.index)) : '';
    const name = doseMatch ? text(line.slice(0, doseMatch.index)) : line;
    if (!name) return null;

    return {
      form: parentheticalForm || prefixForm,
      name,
      dose,
      quantity: inlineQuantity,
      dispenseQuantity: '',
      other: '',
      individualSignature: '',
      signatureGenerated: false,
    };
  }

  function inferType(medications, signature) {
    const forms = medications.map(item => text(item.form).toLocaleLowerCase('sq'));
    const sign = text(signature).toLocaleLowerCase('sq');
    if (forms.some(form => form.includes('infuz')) || /infuzion|përzi|perzi|tretës|tretes/.test(sign)) return 'infusion';
    if (forms.length && forms.every(form => /ampul|flakon|inj/.test(form))) return 'injection';
    if (forms.length && forms.every(form => /tablet|kapsul|sirup|solucion|pika/.test(form))) return 'oral';
    if (forms.some(form => /unguent|krem/.test(form))) return 'topical';
    if (forms.some(form => /inhal|spray/.test(form))) return 'inhalation';
    return 'other';
  }

  function inferRoute(type, signature, lines) {
    const value = `${signature} ${lines.join(' ')}`.toUpperCase();
    for (const route of ['IV', 'IM', 'SC', 'PO', 'PR', 'INH']) {
      if (new RegExp(`\\b${route}\\b`).test(value)) return route;
    }
    if (type === 'infusion') return 'IV';
    if (type === 'oral') return 'PO';
    return '';
  }

  function parseBlock(lines, index, missing) {
    const medications = [];
    const signatureEvents = [];
    let activeSignature = null;

    lines.forEach(raw => {
      const line = text(raw).replace(/^Rp\s*:\s*/i, '');
      if (!line) return;

      const doseMatch = line.match(/^Doza\s*:\s*(.*)$/i);
      if (doseMatch) {
        if (medications.length) medications.at(-1).dose = text(doseMatch[1]);
        else missing.push(`Grupi ${index + 1}: Doza nuk është lidhur me asnjë bar.`);
        activeSignature = null;
        return;
      }

      const quantityMatch = line.match(/^Sasia\s*:\s*(.*)$/i);
      if (quantityMatch) {
        if (medications.length) medications.at(-1).dispenseQuantity = text(quantityMatch[1]);
        else missing.push(`Grupi ${index + 1}: Sasia nuk është lidhur me asnjë bar.`);
        activeSignature = null;
        return;
      }

      const signatureMatch = line.match(/^(?:S(?:\s*\(Signatura\))?\.?|Signatura)\s*:\s*(.*)$/i);
      if (signatureMatch) {
        activeSignature = { afterMedicationCount: medications.length, value: text(signatureMatch[1]) };
        signatureEvents.push(activeSignature);
        return;
      }

      const otherMatch = line.match(/^Tjetër\s*:\s*(.*)$/i);
      if (otherMatch) {
        if (medications.length) medications.at(-1).other = text(otherMatch[1]);
        activeSignature = null;
        return;
      }

      const medication = parseMedicationLine(line);
      if (medication) {
        medications.push(medication);
        activeSignature = null;
        return;
      }

      if (activeSignature) activeSignature.value = text(`${activeSignature.value} ${line}`);
      else if (medications.length) medications.at(-1).other = text([medications.at(-1).other, line].filter(Boolean).join(' · '));
    });

    if (!medications.length) return null;

    const allSignatureText = signatureEvents.map(event => event.value).filter(Boolean).join(' ');
    const preliminaryType = inferType(medications, allSignatureText);
    const onlySignature = signatureEvents[0];
    const explicitlyShared = /përzi|perzi|së bashku|se bashku|bashkë|bashke|njëjt(?:in|ën) infuzion|njejt(?:in|en) infuzion/i.test(onlySignature?.value || '');
    const canUseSharedSignature = signatureEvents.length === 1
      && medications.length > 1
      && onlySignature.afterMedicationCount === medications.length
      && (preliminaryType === 'infusion' || preliminaryType === 'injection' || explicitlyShared);

    let sharedSignature = '';
    if (canUseSharedSignature) {
      sharedSignature = onlySignature.value;
    } else {
      signatureEvents.forEach(event => {
        const target = medications[Math.max(0, event.afterMedicationCount - 1)];
        if (target) target.individualSignature = event.value;
      });
    }

    const signatureForInference = sharedSignature || medications.map(item => item.individualSignature).filter(Boolean).join(' ');
    const type = inferType(medications, signatureForInference);
    const route = inferRoute(type, signatureForInference, lines);

    medications.forEach((item, medicationIndex) => {
      if (!item.dose) missing.push(`${item.name || `Bari ${medicationIndex + 1}`}: mungon doza/fortësia.`);
    });
    if (!sharedSignature && medications.every(item => !item.individualSignature)) {
      missing.push(`Grupi ${index + 1}: mungon Signatura; mund ta shkruash vetë ose ta propozosh me Gemini.`);
    }

    const titles = {
      infusion: 'Infuzion', injection: 'Injeksione', oral: 'Barna orale',
      topical: 'Përdorim lokal', inhalation: 'Inhalim', other: 'Administrim'
    };

    return {
      title: `${titles[type]}${route ? ` ${route}` : ''}`,
      type,
      route,
      sharedSignature,
      sharedSignatureGenerated: false,
      medications,
    };
  }

  function parse(input, diagnosis = '') {
    const raw = String(input || '').replace(/\r/g, '').trim();
    if (!raw) return null;
    const missing = [];
    const blocks = raw
      .split(/\n\s*\n+|(?=^\s*Rp\s*:)/gim)
      .map(block => block.split('\n'))
      .filter(block => block.some(line => text(line).replace(/^Rp\s*:\s*/i, '')));

    const sections = blocks.map((block, index) => parseBlock(block, index, missing)).filter(Boolean);
    if (!sections.length) {
      const fallback = parseBlock(raw.split('\n'), 0, missing);
      if (fallback) sections.push(fallback);
    }
    if (!sections.length) return null;

    return {
      title: text(diagnosis) ? `Recetë – ${text(diagnosis)}` : `Recetë – ${new Date().toLocaleDateString('sq-AL')}`,
      diagnosis: text(diagnosis),
      sections,
      notes: [],
      missing: [...new Set(missing)],
    };
  }

  function normalizeResult(value) {
    if (!value || typeof value !== 'object') return null;
    const sections = Array.isArray(value.sections) ? value.sections.map(section => ({
      title: text(section?.title) || 'Administrim',
      type: ['oral', 'injection', 'infusion', 'topical', 'inhalation', 'other'].includes(section?.type) ? section.type : 'other',
      route: text(section?.route),
      sharedSignature: text(section?.sharedSignature),
      sharedSignatureGenerated: Boolean(section?.sharedSignatureGenerated),
      medications: Array.isArray(section?.medications) ? section.medications.map(item => ({
        form: formLabel(item?.form),
        name: text(item?.name),
        dose: text(item?.dose),
        quantity: text(item?.quantity),
        dispenseQuantity: text(item?.dispenseQuantity),
        other: text(item?.other),
        individualSignature: text(item?.individualSignature),
        signatureGenerated: Boolean(item?.signatureGenerated),
      })).filter(item => item.name) : [],
    })).filter(section => section.medications.length) : [];
    if (!sections.length) return null;
    return {
      title: text(value.title) || 'Recetë',
      diagnosis: text(value.diagnosis),
      sections,
      notes: Array.isArray(value.notes) ? value.notes.map(text).filter(Boolean) : [],
      missing: Array.isArray(value.missing) ? value.missing.map(text).filter(Boolean) : [],
    };
  }

  function medicationLine(item) {
    const main = [text(item?.name), text(item?.dose)].filter(Boolean).join(' ');
    const inline = text(item?.quantity) ? ` ${text(item.quantity)}` : '';
    const form = formLabel(item?.form);
    const prefix = prefixForForm(form);
    return `${prefix ? `${prefix} ` : ''}${main}${inline}${form ? ` (${form})` : ''}`.trim();
  }

  function formatText(result) {
    const normalized = normalizeResult(result);
    if (!normalized) return '';
    const lines = ['Rp:'];
    normalized.sections.forEach((section, sectionIndex) => {
      if (sectionIndex) lines.push('');
      section.medications.forEach((item, itemIndex) => {
        if (itemIndex && !section.sharedSignature) lines.push('');
        lines.push(medicationLine(item));
        if (item.dispenseQuantity) lines.push(`Sasia: ${item.dispenseQuantity}`);
        if (item.other) lines.push(`Tjetër: ${item.other}`);
        if (item.individualSignature) lines.push(`S (Signatura): ${item.individualSignature}`);
      });
      if (section.sharedSignature) lines.push(`S (Signatura): ${section.sharedSignature}`);
    });
    if (normalized.notes.length) {
      lines.push('');
      normalized.notes.forEach(note => lines.push(`Shënim: ${note}`));
    }
    return lines.join('\n');
  }

  function hasGeneratedSignature(result) {
    const normalized = normalizeResult(result);
    return Boolean(normalized?.sections.some(section => section.sharedSignatureGenerated || section.medications.some(item => item.signatureGenerated)));
  }

  return {
    formLabel,
    prefixForForm,
    ensurePrescriptionPrefix,
    normalizeDrug,
    selectedDrugLine,
    parseMedicationLine,
    parse,
    normalizeResult,
    medicationLine,
    formatText,
    hasGeneratedSignature,
  };
});
