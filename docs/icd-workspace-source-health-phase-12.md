# ICD-10 — Faza 12: statusi i burimit në workspace

## Qëllimi

Kjo fazë e sjell gjendjen reale të burimit ICD-10 direkt në `icd.html`, aty ku mjeku kërkon dhe zgjedh kodin. Ajo plotëson auditin operacional të detajuar që tashmë ekziston në `sistemi.html`; nuk e zëvendëson dhe nuk e dyfishon atë.

## Gjendjet e dukshme

- `live` — Google Sheet-i publik është lexuar dhe validuar.
- `stale` — po përdoret kopja e fundit e vlefshme sepse rifreskimi i ri dështoi.
- `cached` — metadata e fundit shfaqet menjëherë nga `sessionStorage` derisa kontrolli live përfundon.
- `offline` — browser-i është pa rrjet dhe vazhdon me kontekstin e ruajtur.
- `error` — burimi nuk mund të verifikohet dhe nuk ka metadata të ruajtur.

Paneli shfaq kohën e ngarkimit, madhësinë e CSV-së dhe tetë karakteret e para të revision-it kur këto të dhëna ekzistojnë.

## Arkitektura

- Runtime-i i ri është `icd-workspace-health.js`.
- Përdoret endpoint-i ekzistues dhe i autentikuar `/api/icd?view=meta`.
- Nuk shtohet API route ose Vercel function i ri.
- Metadata ruhet vetëm në `sessionStorage` me kufi 24-orësh.
- Butoni `Rifresko` kontrollon burimin dhe rifreskon tree-n përmes `MedIndexIcdTable.reload()`.
- Dështimi i kontrollit të metadata-s nuk e zbraz tree-n dhe nuk e humb kontekstin klinik ekzistues.

## Retry dhe stabilitet

Kërkesa GET provohet vetëm edhe një herë për:

- `408`;
- `429`;
- `500`, `502`, `503`, `504`;
- gabim rrjeti kur browser-i raporton se është online.

`Retry-After` respektohet deri në tre sekonda. Kur browser-i është offline, nuk krijohet retry loop.

## Aksesueshmëria

- Teksti i statusit përdor `role="status"`, `aria-live="polite"` dhe `aria-atomic="true"`.
- Butoni `Rifresko` mbetet jashtë live region-it.
- `aria-busy` tregon kontrollin aktiv të burimit.
- Mbështeten dark mode, forced colors dhe reduced motion.
- Layout-i mobile nuk krijon horizontal overflow.

## Telemetria lokale

Runtime-i:

- dërgon eventin `medindex:icd-workspace-source-health`;
- regjistron matjen `medindex-icd-workspace-health` në Performance API.

Nuk dërgohen query, kode të zgjedhura ose të dhëna klinike të përdoruesit.

## Auditimi

Kontratat statike verifikojnë HTML-në, ARIA-n, retry/cache-in, moskrijimin e një function-i të ri dhe sintaksën e runtime-it. Playwright verifikon gjendjen `live`, revision-in, kalimin në `offline`, përdorimin e cache-it dhe përshtatjen në ekran 390 × 844 px.
