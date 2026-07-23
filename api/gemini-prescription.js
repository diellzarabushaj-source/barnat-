const MAX_INPUT_CHARS = 12000;
const MAX_SELECTED_DRUGS = 30;
const REQUEST_TIMEOUT_MS = 22000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'A short Albanian title for the prescription.' },
    diagnosis: { type: 'string', description: 'Diagnosis exactly as supplied by the clinician; empty when absent.' },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Short group title such as Infuzion IV, Injeksione IM, or Barna orale.' },
          type: { type: 'string', enum: ['oral', 'injection', 'infusion', 'topical', 'inhalation', 'other'] },
          route: { type: 'string', description: 'Route explicitly present in the input, such as PO, IV, IM, SC, PR, INH; empty if absent.' },
          sharedSignature: { type: 'string', description: 'One shared signatura only when the input clearly applies it to all medications in this section; otherwise empty.' },
          medications: {
            type: 'array',
            minItems: 1,
            maxItems: 30,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                form: { type: 'string', description: 'Prescription form/prefix exactly or safely normalized, e.g. Amp., Inf., Tab., Caps., Ung.' },
                name: { type: 'string', description: 'Medication or active substance from the clinician input or selected registry items.' },
                dose: { type: 'string', description: 'Strength or dose exactly supplied; empty if absent.' },
                quantity: { type: 'string', description: 'Volume, package quantity, or solvent amount exactly supplied; empty if absent.' },
                other: { type: 'string', description: 'Other explicit preparation or administration detail; empty if absent.' },
                individualSignature: { type: 'string', description: 'Only an explicitly supplied individual signatura; empty when the section uses a shared signatura.' }
              },
              required: ['form', 'name', 'dose', 'quantity', 'other', 'individualSignature']
            }
          }
        },
        required: ['title', 'type', 'route', 'sharedSignature', 'medications']
      }
    },
    notes: { type: 'array', maxItems: 12, items: { type: 'string' } },
    missing: { type: 'array', maxItems: 20, items: { type: 'string' }, description: 'Important fields that were not explicitly provided and must be completed by the clinician.' }
  },
  required: ['title', 'diagnosis', 'sections', 'notes', 'missing']
};

function clean(value, max = MAX_INPUT_CHARS) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizeDrug(item) {
  return {
    tradeName: clean(item?.tradeName, 180),
    substance: clean(item?.substance, 180),
    strength: clean(item?.strength, 100),
    form: clean(item?.form, 120),
    atc: clean(item?.atc, 30),
  };
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
}

function validateResult(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.sections) || !value.sections.length) {
    throw new Error('Gemini nuk ktheu strukturë të vlefshme.');
  }
  value.title = clean(value.title, 180) || 'Recetë';
  value.diagnosis = clean(value.diagnosis, 500);
  value.notes = Array.isArray(value.notes) ? value.notes.map(item => clean(item, 500)).filter(Boolean).slice(0, 12) : [];
  value.missing = Array.isArray(value.missing) ? value.missing.map(item => clean(item, 300)).filter(Boolean).slice(0, 20) : [];
  value.sections = value.sections.slice(0, 12).map((section, sectionIndex) => ({
    title: clean(section?.title, 160) || `Grupi ${sectionIndex + 1}`,
    type: ['oral', 'injection', 'infusion', 'topical', 'inhalation', 'other'].includes(section?.type) ? section.type : 'other',
    route: clean(section?.route, 30),
    sharedSignature: clean(section?.sharedSignature, 1200),
    medications: Array.isArray(section?.medications) ? section.medications.slice(0, 30).map(item => ({
      form: clean(item?.form, 60),
      name: clean(item?.name, 220),
      dose: clean(item?.dose, 120),
      quantity: clean(item?.quantity, 120),
      other: clean(item?.other, 500),
      individualSignature: clean(item?.individualSignature, 1200),
    })).filter(item => item.name) : [],
  })).filter(section => section.medications.length);
  if (!value.sections.length) throw new Error('Gemini nuk identifikoi asnjë bar të vlefshëm.');
  return value;
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metoda nuk lejohet.' });
  }
  if (!(await authorized(req))) return res.status(401).json({ error: 'Kërkohet autentikim.' });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ code: 'GEMINI_NOT_CONFIGURED', error: 'Gemini nuk është konfiguruar ende në Vercel.' });
  }

  const input = clean(req.body?.input);
  const diagnosis = clean(req.body?.diagnosis, 500);
  const selectedDrugs = Array.isArray(req.body?.selectedDrugs)
    ? req.body.selectedDrugs.slice(0, MAX_SELECTED_DRUGS).map(normalizeDrug).filter(item => item.substance || item.tradeName)
    : [];
  if (!input && !selectedDrugs.length) return res.status(400).json({ error: 'Shkruaj recetën ose zgjidh së paku një bar.' });

  const prompt = `
Ti je formatues klinik për MedIndex. Detyra jote është VETËM të strukturosh tekstin e shkruar nga mjeku në format recete.

RREGULLA TË DETYRUESHME:
1. Mos rekomando trajtim dhe mos vendos vendime klinike.
2. Mos shto asnjë bar, dozë, frekuencë, kohëzgjatje, rrugë ose indikacion që nuk është shkruar qartë nga mjeku ose nuk gjendet në listën e barnave të zgjedhura.
3. Barnat e zgjedhura nga regjistri mund t'i përdorësh vetëm si emra/fortësi/forma; nuk duhet t'u shpikësh skemë dozimi.
4. Kur disa rreshta barnash ndiqen nga vetëm një rresht “S:” ose një udhëzim i përbashkët, vendosi në NJË seksion dhe përdor vetëm sharedSignature. Mos e përsërit signaturën te secili bar.
5. Infuzioni bazë dhe ampulat që mjeku ka shkruar se përzihen bashkë duhet të jenë një seksion type="infusion".
6. Injeksionet me të njëjtën signaturë/rrugë mund të jenë një seksion type="injection". Kjo nuk nënkupton automatikisht përzierje në të njëjtën shiringë.
7. Nëse informacioni mungon, lëre fushën bosh dhe vendose te “missing”. Mos plotëso nga njohuritë e tua.
8. Ruaj gjuhën shqipe dhe përmbajtjen klinike të mjekut. Normalizo vetëm formatin, hapësirat dhe shkurtesat e dukshme si Amp., Inf., Tab., Caps., Ung.

DIAGNOZA E SHKRUAR:
${diagnosis || '(nuk është dhënë)'}

BARNAT E ZGJEDHURA NGA REGJISTRI:
${selectedDrugs.length ? JSON.stringify(selectedDrugs) : '(asnjë)'}

TEKSTI I MJEKUT:
${input || '(bazoju vetëm barnave të zgjedhura; fushat e paspecifikuara duhet të mbeten bosh)'}
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.05,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Gemini API error:', response.status, payload?.error?.message || payload);
      return res.status(response.status === 429 ? 429 : 502).json({
        code: response.status === 429 ? 'GEMINI_RATE_LIMIT' : 'GEMINI_ERROR',
        error: response.status === 429 ? 'Gemini ka arritur limitin e përkohshëm. Provo përsëri pas pak.' : 'Gemini nuk e përpunoi recetën.'
      });
    }

    const rawText = extractText(payload);
    const result = validateResult(JSON.parse(rawText));
    res.setHeader('Server-Timing', `gemini;dur=${Date.now() - startedAt}`);
    return res.status(200).json({ ok: true, model: MODEL, data: result });
  } catch (error) {
    console.error('Gemini prescription formatter error:', error);
    const timeout = error?.name === 'AbortError';
    return res.status(timeout ? 504 : 502).json({
      code: timeout ? 'GEMINI_TIMEOUT' : 'GEMINI_ERROR',
      error: timeout ? 'Gemini zgjati më shumë se kufiri i lejuar.' : 'Receta nuk u strukturua nga Gemini.'
    });
  } finally {
    clearTimeout(timer);
  }
};
