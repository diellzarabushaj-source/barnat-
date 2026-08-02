# ICD-10 — statusi operacional në workspace

## Qëllimi

Kjo shtresë e zgjeron badge-in ekzistues `Burimi: live/cache` në `icd.html` me informata dhe kontrolle operacionale që i duhen mjekut gjatë përdorimit. Auditi i thellë me 12,542 nyje dhe smoke-probes mbetet në dashboard-in privat `sistemi.html`.

## Bashkëpunimi me kërkimin dhe recetën

- `icd-advanced-search.js` mbetet pronari i statusit bazë `#icdSourceStatus`.
- `icd-workspace-health.js` e vëzhgon të njëjtin badge dhe nuk e zëvendëson race-guard-in ose kontrolluesin e sugjerimeve.
- `icd-fetch-capture.js` vazhdon të sigurojë transportin native.
- `icd-prescription-roundtrip.js` dhe transferi Recetë ↔ ICD mbeten aktivë dhe të testuar.
- Terminologjia dhe provenance mbeten të paprekura.

## Gjendjet

- `live` — burimi publik është lexuar dhe validuar.
- `stale` — po përdoret cache-i i fundit i vlefshëm.
- `cached` — metadata e ruajtur në session shfaqet derisa kontrolli live përfundon.
- `offline` — browser-i është pa rrjet; tree dhe konteksti i fundit mbeten të përdorshëm.
- `unknown` / `error` — burimi nuk dha metadata të plota ose nuk u verifikua.

Detaji shfaq kohën e ngarkimit, madhësinë e CSV-së dhe revision-in kur ato janë të disponueshme.

## Retry dhe rifreskimi

- Përdoret vetëm `/api/icd?view=meta`; nuk shtohet Vercel function i ri.
- Ka maksimum dy tentime: kërkesa fillestare dhe një retry.
- Retry lejohet për `408`, `429`, `500`, `502`, `503`, `504` ose gabim rrjeti.
- `Retry-After` respektohet deri në tre sekonda.
- Çdo tentim ka URL unik `attempt=1/2`, që shmang bashkimin nga cache ose service worker.
- Butoni `Rifresko` kontrollon metadata-n dhe thërret `MedIndexIcdTable.reload()`.
- Offline nuk krijon retry loop.

## Cache dhe privatësia

- Metadata ruhet në `sessionStorage` për maksimum 24 orë.
- Nuk ruhen query, kodet e zgjedhura, diagnoza ose të dhëna të pacientit.
- Eventi lokal `medindex:icd-workspace-source-health` dhe matja `medindex-icd-workspace-health` nuk dërgojnë të dhëna jashtë browser-it.

## Aksesueshmëria

- Badge-i ruan `role="status"`, `aria-live="polite"` dhe `aria-atomic="true"`.
- Wrapper-i përdor `aria-busy` gjatë kontrollit.
- Butoni i rifreskimit mbetet jashtë live region-it.
- Mbështeten keyboard focus, dark mode, forced colors dhe reduced motion.
- Mobile audit kontrollon horizontal overflow në 390 × 844 px.

## Auditimi

- Kontrata statike verifikon HTML, script order, retry/cache, moskrijimin e API route-it të ri dhe sintaksën e runtime-it.
- Playwright verifikon `live → offline/cache → online`.
- Një test i dytë simulon `503`, kërkon saktësisht një retry dhe konfirmon që tree dhe round-trip-i Recetë ↔ ICD mbeten të përdorshëm.
