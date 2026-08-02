# ICD-10 — Faza 10: production hardening

## Qëllimi

Kjo fazë e bën të dukshme dhe të kontrollueshme gjendjen reale të burimit të hierarkisë së plotë ICD-10, pa shtuar Vercel function të ri dhe pa ndryshuar motorin e kërkimit ose tree browser-in.

## Statusi i burimit

Workspace-i shfaq një status kompakt me gjendjet:

- `live` — Google Sheet-i publik është lexuar dhe validuar;
- `stale` — po përdoret kopja e fundit e vlefshme sepse rifreskimi i ri dështoi;
- `cached` — metadata e fundit po shfaqet menjëherë nga session cache;
- `offline` — browser-i është pa rrjet dhe vazhdon me kontekstin e ruajtur;
- `error` — burimi nuk mund të verifikohet dhe nuk ka metadata të ruajtur.

Statusi përfshin kohën e ngarkimit, madhësinë e CSV-së dhe tetë karakteret e para të revision-it kur këto të dhëna ekzistojnë.

## Retry dhe cache

- Përdoret endpoint-i ekzistues `/api/icd?view=meta`.
- Kërkesat GET provohen vetëm edhe një herë për `408`, `429`, `5xx` ose gabim rrjeti.
- `Retry-After` respektohet deri në tre sekonda.
- Metadata e fundit ruhet vetëm në `sessionStorage` për 24 orë.
- Butoni `Rifresko` kontrollon burimin dhe rifreskon tree-n përmes `MedIndexIcdTable.reload()`.
- Offline nuk shkakton retry loop.

## Aksesueshmëria

- Teksti i statusit përdor `role="status"`, `aria-live="polite"` dhe `aria-atomic="true"`.
- Butoni i rifreskimit mbetet kontroll interaktiv jashtë live region-it.
- Gjatë rifreskimit përdoret `aria-busy`.
- Mbështeten dark mode, forced colors dhe reduced motion.

## Telemetria lokale

Runtime-i dërgon eventin `medindex:icd-source-health` dhe regjistron matjen `medindex-icd-source-health` në Performance API. Nuk dërgohen të dhëna klinike ose query të përdoruesit.

## Kufijtë

- Nuk shtohet API route ose Vercel function i ri.
- Nuk ndryshohet dataset-i ICD-10.
- Nuk ndryshohet renditja klinike e kërkimit.
- Nuk bëhet redeploy artificial gjatë build-rate-limit të Vercel.
