const MAX_INPUT_CHARS = 12000;
const MAX_SELECTED_DRUGS = 30;
const REQUEST_TIMEOUT_MS = 30000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Titull i shkurtër në shqip.' },
    diagnosis: { type: 'string', description: 'Diagnoza identike me atë që ka shkruar mjeku.' },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['oral', 'injection', 'infusion', 'topical', 'inhalation', 'other'] },
          route: { type: 'string' },
          sharedSignature: { type: 'string' },
          sharedSignatureGenerated: { type: 'boolean' },
          medications: {
            type: 'array',
            minItems: 1,
            maxItems: 30,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                form: { type: 'string' },
                name: { type: 'string' },
                dose: { type: 'string' },
                quantity: { type: 'string', description: 'Sasi inline si a 250 ml; bosh kur nuk është shkruar.' },
                dispenseQuantity: { type: 'string', description: 'Sasia e dispensimit pas etiketës Sasia:, p.sh. Scat. No I (Një kuti).' },
                other: { type: 'string' },
                individualSignature: { type: 'string' },
                signatureGenerated: { type: 'boolean' }
              },
              required: ['form', 'name', 'dose', 'quantity', 'dispenseQuantity', 'other', 'individualSignature', 'signatureGenerated']
            }
          }
        },
        required: ['title', 'type', 'route', 'sharedSignature', 'sharedSignatureGenerated', 'medications']
      }
    },
    notes: { type: 'array', maxItems: 12, items: { type: 'string' } },
    missing: { type: 'array', maxItems: 20, items: { type: 'string' } }
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

function parseJson(value) {
  const source = clean(value, 40000)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
    throw new Error('Gemini nuk ktheu JSON të vlefshëm.');
  }
}

function validateResult(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.sections) || !value.sections.length) {
    throw new Error('Gemini nuk ktheu strukturë të vlefshme.');
  }

  value.title = clean(value.title, 180) || 'Recetë';
  value.diagnosis = clean(value.diagnosis, 500);
  value.notes = Array.isArray(value.notes) ? value.notes.map(item => clean(item, 500)).filter(Boolean).slice(0, 12) : [];
  value.missing = Array.isArray(value.missing) ? value.missing.map(item => clean(item, 300)).filter(Boolean).slice(0, 20) : [];

  let generatedSignature = false;
  value.sections = value.sections.slice(0, 12).map((section, sectionIndex) => {
    const normalized = {
      title: clean(section?.title, 160) || `Grupi ${sectionIndex + 1}`,
      type: ['oral', 'injection', 'infusion', 'topical', 'inhalation', 'other'].includes(section?.type) ? section.type : 'other',
      route: clean(section?.route, 30),
      sharedSignature: clean(section?.sharedSignature, 1200),
      sharedSignatureGenerated: Boolean(section?.sharedSignatureGenerated),
      medications: Array.isArray(section?.medications) ? section.medications.slice(0, 30).map(item => ({
        form: clean(item?.form, 80),
        name: clean(item?.name, 220),
        dose: clean(item?.dose, 160),
        quantity: clean(item?.quantity, 120),
        dispenseQuantity: clean(item?.dispenseQuantity, 180),
        other: clean(item?.other, 500),
        individualSignature: clean(item?.individualSignature, 1200),
        signatureGenerated: Boolean(item?.signatureGenerated),
      })).filter(item => item.name) : [],
    };

    if (normalized.sharedSignatureGenerated) generatedSignature = true;
    if (normalized.medications.some(item => item.signatureGenerated)) generatedSignature = true;
    return normalized;
  }).filter(section => section.medications.length);

  if (!value.sections.length) throw new Error('Gemini nuk identifikoi asnjë bar të vlefshëm.');

  if (generatedSignature && !value.notes.some(note => /propozuar nga Gemini/i.test(note))) {
    value.notes.unshift('Signaturat e propozuara nga Gemini kërkojnë verifikim klinik para përdorimit.');
  }

  return value;
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function buildPrompt({ input, diagnosis, selectedDrugs, generateMissingSignatures }) {
  return `
Ti je asistent për strukturimin e recetave në MedIndex. Përgjigju vetëm me JSON sipas skemës.

QËLLIMI:
- Ruaj barnat, fortësitë, sasitë dhe tekstin e mjekut.
- Ktheje recetën në format të pastër:
  Rp:
  Emri Fortësia (Forma)
  Sasia: ...
  S (Signatura): ...

RREGULLA:
1. Mos shto dhe mos hiq barna.
2. Mos ndrysho emrin, fortësinë apo formën e një bari të zgjedhur ose të shkruar.
3. "Sasia:" është sasi dispensimi. Kopjoje vetëm kur është shkruar qartë. Mos shpik numër kutish.
4. Nëse mjeku ka shkruar Signaturën, ruaje; ajo ka përparësi absolute dhe signatureGenerated=false.
5. Nëse Signatura mungon, generateMissingSignatures=${generateMissingSignatures ? 'true' : 'false'}.
6. Kur generateMissingSignatures=true, mund të propozosh VETËM Signaturën, vetëm nëse diagnoza është dhënë dhe bari me fortësinë/formën është i qartë.
7. Signatura e propozuar duhet të jetë në shqip, e qartë dhe praktike, por duhet shënuar signatureGenerated=true.
8. Nëse mungon diagnoza, fortësia, forma ose konteksti i nevojshëm, lëre Signaturën bosh dhe shënoje te missing.
9. Mos shpik alergji, shtatzëni, funksion renal/hepatik, moshë, peshë ose të dhëna të pacientit.
10. Për një bar të vetëm përdor individualSignature.
11. Kur disa barna kanë një udhëzim të vetëm të përbashkët, përdor sharedSignature vetëm një herë.
12. Infuzioni bazë me ampulat që përzihen bashkë është një seksion type="infusion".
13. Injeksionet me një udhëzim të përbashkët janë type="injection"; kjo nuk nënkupton përzierje në të njëjtën shiringë.
14. Për formatin "Amoxicillin / Clavulanic acid 875 mg / 125 mg (Tableta)", form="Tableta", name="Amoxicillin / Clavulanic acid", dose="875 mg / 125 mg".
15. Për "Sasia: Scat. No I (Një kuti)", dispenseQuantity="Scat. No I (Një kuti)".
16. Mos vendos "Rp:" brenda emrit ose Signaturës.

DIAGNOZA:
${diagnosis || '(nuk është dhënë)'}

BARNAT E ZGJEDHURA NGA REGJISTRI:
${selectedDrugs.length ? JSON.stringify(selectedDrugs) : '(asnjë)'}

TEKSTI I MJEKUT:
${input || '(nuk është shkruar tekst; përdor vetëm barnat e zgjedhura dhe diagnozën, pa ndryshuar emrin/fortësinë/formën)'}
`;
}

async function callGemini({ apiKey, prompt, useSchema, signal }) {
  const generationConfig = {
    temperature: 0.1,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (useSchema) generationConfig.responseSchema = responseSchema;

  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });
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

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      code: 'GEMINI_NOT_CONFIGURED',
      error: 'Gemini nuk është konfiguruar. Shto GEMINI_API_KEY në Vercel dhe bëj redeploy.'
    });
  }

  const input = clean(req.body?.input);
  const diagnosis = clean(req.body?.diagnosis, 500);
  const generateMissingSignatures = req.body?.generateMissingSignatures !== false;
  const selectedDrugs = Array.isArray(req.body?.selectedDrugs)
    ? req.body.selectedDrugs.slice(0, MAX_SELECTED_DRUGS).map(normalizeDrug).filter(item => item.substance || item.tradeName)
    : [];

  if (!input && !selectedDrugs.length) {
    return res.status(400).json({ error: 'Shkruaj recetën ose zgjidh së paku një bar.' });
  }

  const prompt = buildPrompt({ input, diagnosis, selectedDrugs, generateMissingSignatures });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response = await callGemini({ apiKey, prompt, useSchema: true, signal: controller.signal });
    let payload = await response.json().catch(() => ({}));

    const schemaProblem = response.status === 400 && /schema|responseSchema|structured/i.test(String(payload?.error?.message || ''));
    if (schemaProblem) {
      response = await callGemini({ apiKey, prompt, useSchema: false, signal: controller.signal });
      payload = await response.json().catch(() => ({}));
    }

    if (!response.ok) {
      const remoteMessage = String(payload?.error?.message || '');
      console.error('Gemini API error:', response.status, remoteMessage || payload);
      const code = response.status === 429
        ? 'GEMINI_RATE_LIMIT'
        : [401, 403].includes(response.status)
          ? 'GEMINI_AUTH'
          : response.status === 404
            ? 'GEMINI_MODEL'
            : 'GEMINI_ERROR';

      const messages = {
        GEMINI_RATE_LIMIT: 'Gemini ka arritur limitin e përkohshëm. Provo përsëri pas pak.',
        GEMINI_AUTH: 'Gemini API key nuk u pranua.',
        GEMINI_MODEL: 'Modeli Gemini i konfiguruar nuk u gjet.',
        GEMINI_ERROR: 'Gemini nuk e përpunoi recetën.',
      };
      return res.status(response.status === 429 ? 429 : 502).json({ code, error: messages[code] });
    }

    const rawText = extractText(payload);
    const result = validateResult(parseJson(rawText));
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
