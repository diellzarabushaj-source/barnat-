# MedIndex — Neon-first Performance Plan

## Vendimi

**Neon Postgres do të bëhet burimi kryesor i leximit në production.**

Google Sheets/Drive mbetet burim editorial dhe sinkronizimi, jo burim runtime për çdo përdorues.

Rrjedha e synuar:

```text
Google Sheets / Drive
        ↓ sync i kontrolluar
Neon Postgres
        ↓ API server-side me Vercel OIDC
MedIndex API
        ↓ cache privat + payload i kompresuar
Web Worker / IndexedDB
        ↓
UI interaktive
```

## Pse kjo është më e shpejtë

Gjendja aktuale kërkon që disa API të shkarkojnë workbook-a Excel nga Google, t'i lexojnë me `xlsx`, t'i normalizojnë dhe t'i kompresojnë para përgjigjes. Ky proces është më i ngadalshëm, më pak i parashikueshëm dhe varet nga Google Drive/Sheets.

Neon e eliminon këtë punë nga rruga kritike. Të dhënat janë tashmë të strukturuara në tabela dhe mund të lexohen direkt me query të kufizuara, indekse, renditje dhe filtra.

## Gjendja aktuale e Neon

Projekti: `MedIndex`

Tabela kryesore:

- `drugs` — 4,006 rreshta
- `dosage_regimens` — 1,470 rreshta
- `icd_codes` — 701 rreshta
- `lab_tests` — 111 rreshta
- `lab_categories`
- `drug_indications`
- `clinical_sources`
- `content_versions`
- `sync_runs`
- `audit_logs`

Lidhja server-side ekziston përmes `lib/neon-data-api.js` dhe përdor Vercel OIDC. Nuk do të ekspozohet connection string ose token në browser.

## Arkitektura e re

### 1. Feature flag i burimit

Vendoset:

```env
MEDINDEX_DATA_SOURCE=hybrid
```

Vlerat:

- `neon` — vetëm Neon
- `hybrid` — Neon first, Google fallback
- `sheets` — mënyra e vjetër vetëm për rollback

Rollout-i fillon me `hybrid` dhe kalon në `neon` pasi auditimet përputhen.

### 2. Pa funksione të reja Vercel

Nuk shtohen route të reja. Modifikohen vetëm route-et ekzistuese:

- `/api/registry`
- `/api/dosage`
- `/api/icd`
- burimi i analizave
- `/api/drug-search`

Kjo mban projektin brenda kufirit të Vercel Hobby.

### 3. Neon read layer

Krijohet `lib/neon-clinical-reader.js` me funksione të përbashkëta:

```js
getPublishedDrugs()
getPublishedDosageRegimens()
getPublishedIcdCodes()
getPublishedLabTests()
getContentVersion(scope)
```

Rregullat:

- vetëm `is_published = true`;
- `editorial_status = published` kur kolona ekziston;
- renditje deterministe;
- pagination server-side për query të mëdha;
- timeout i kufizuar;
- validim i numrit minimal të rreshtave;
- asnjë query nga browser-i direkt në Neon.

### 4. Registry Neon-first

`/api/registry` do të:

1. verifikojë sesionin;
2. lexojë `drugs` nga Neon;
3. mapojë kolonat në kontratën ekzistuese të UI-së;
4. aplikojë të njëjtat quality rules dhe prescription notation;
5. gjenerojë të njëjtin payload të kompresuar që pret Web Worker-i;
6. ruajë payload-in në memory cache;
7. përdorë ETag dhe `304 Not Modified`;
8. përdorë Google vetëm si fallback në `hybrid`.

UI-ja dhe worker-i nuk ndryshojnë kontratë.

### 5. Dosage Neon-first

`/api/dosage` do të lexojë nga `dosage_regimens`:

- `population = adult`;
- `population = pediatric`;
- vetëm regjime të publikuara dhe të verifikuara;
- ruhet forma aktuale e output-it që përdor `dosage-engine.js`;
- nuk lejohet krijim ose plotësim automatik i dozave që mungojnë.

Google Sheets mbetet burim i sinkronizimit dhe fallback i përkohshëm.

### 6. ICD dhe analiza

- ICD lexohet nga `icd_codes`.
- Analizat lexohen nga `lab_tests` me join te `lab_categories`.
- Dataset-et statike aktuale mbeten fallback offline derisa të provohet Neon-first production.

### 7. Cache dhe performance

Server-side:

- memory cache sipas scope-it;
- ETag nga `content_versions` ose hash i payload-it;
- `Server-Timing` për Neon query, mapping dhe compression;
- stale-if-error vetëm për payload server-side të verifikuar;
- asnjë workbook parsing në request normal.

Client-side:

- vazhdon Service Worker v3;
- vazhdon IndexedDB;
- vazhdon Web Worker për registry parsing;
- payload i ri zëvendëson cache-in vetëm pasi kalon quality gate.

### 8. Sinkronizimi

Komandat ekzistuese ruhen:

```bash
npm run sync:neon
npm run sync:all
```

Sinkronizimi duhet të:

1. krijojë rekord në `sync_runs`;
2. shkarkojë burimet editoriale;
3. validojë kolonat dhe minimumin e rreshtave;
4. bëjë upsert me `source_hash`;
5. mos mbishkruajë `editorial_override = true`;
6. përditësojë `content_versions` vetëm pas suksesit të plotë;
7. dështojë pa publikuar version të pjesshëm.

## Plan implementimi

### Faza 1 — Read layer dhe audit kontrate

- [ ] Krijo `lib/neon-clinical-reader.js`.
- [ ] Shto timeout, pagination dhe row-count gates.
- [ ] Shto mapper-a Neon → kontrata aktuale.
- [ ] Shto teste që krahasojnë Neon me output-in aktual.
- [ ] Mos ndrysho ende production source.

### Faza 2 — Registry hybrid

- [ ] Modifiko `/api/registry` me Neon first.
- [ ] Fallback në Sheets vetëm kur `MEDINDEX_DATA_SOURCE=hybrid`.
- [ ] Shto header `X-MedIndex-Data-Source: neon|sheets-fallback`.
- [ ] Ruaj payload-in ekzistues të kompresuar.
- [ ] Testo 4,006 barna në Chromium.

### Faza 3 — Dosage hybrid

- [ ] Modifiko `/api/dosage` me Neon first.
- [ ] Verifiko 1,470 regjime.
- [ ] Krahaso adult/pediatric counts dhe match keys.
- [ ] Mos publiko rreshta jo të verifikuar.

### Faza 4 — ICD dhe analiza

- [ ] Kalimi i ICD te `icd_codes`.
- [ ] Kalimi i analizave te `lab_tests` + `lab_categories`.
- [ ] Testo 701 kode ICD dhe 111 analiza.
- [ ] Ruaj fallback offline lokal.

### Faza 5 — Production rollout

- [ ] Deploy me `MEDINDEX_DATA_SOURCE=hybrid`.
- [ ] Monitoro `Server-Timing`, statuset dhe fallback-et.
- [ ] Kërko zero mospërputhje klinike në audit.
- [ ] Kalo në `MEDINDEX_DATA_SOURCE=neon`.
- [ ] Mbaj `sheets` si rollback për një periudhë tranzicioni.

## Quality gates të detyrueshme

Build-i duhet të dështojë kur:

- Neon kthen më pak se minimumi i pritur;
- ka duplikata në çelësat unikë;
- ndryshon kontrata e UI-së;
- publikohen regjime dozimi jo të verifikuara;
- rreshtat Neon dhe Sheets nuk përputhen gjatë fazës hybrid;
- një query kërkon credential në browser;
- shtohen serverless functions mbi buxhetin Hobby;
- registry performance ose browser interaction audit dështon.

## Objektivat e matshme

Objektiva, jo pretendime për gjendjen aktuale:

- shell interaktiv pa pritur databazën;
- registry warm API dukshëm më i shpejtë se workbook parsing;
- zero parsing Excel në request-et normale production;
- zero freeze të main thread gjatë 4,006 barnave;
- fallback i kontrolluar, jo silent;
- offline navigation për faqet e vizituara dhe të precache-uara;
- burim i identifikueshëm për çdo përgjigje API.

## Renditja e rekomanduar

1. Registry
2. Dosage
3. ICD
4. Analizat
5. Drug search dhe query të specializuara

Registry jep përfitimin më të madh sepse është dataset-i më i madh dhe aktualisht kërkon workbook download, Excel parsing, normalizim dhe compression.

## Përfundimi

Zgjedhja optimale është **Neon-first me rollout hybrid**. Kjo e bën aplikacionin më të shpejtë pa rrezikuar humbje funksioni: Neon shërben runtime-in, Google Sheets mbetet burim editorial dhe fallback i kontrolluar, ndërsa Service Worker/IndexedDB vazhdojnë ta mbrojnë përdorimin me internet të dobët.
