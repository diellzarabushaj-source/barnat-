# MedIndex — regjistri klinik i barnave

MedIndex është një aplikacion i lehtë për kërkimin e barnave, klasifikimeve ATC/ICD, dozologjisë, protokolleve, analizave dhe përgatitjen e recetave. Ndërfaqja është statike dhe e shpejtë; funksionet private ekspozohen si API të vogla serverless.

Në regjistrin e barnave, qelizat me tekst të prerë mund të zgjerohen brenda vetë rreshtit të tabelës. Nuk hapet modal i veçantë; klikimi i dytë e kthen rreshtin në pamjen kompakte.

## Nisja lokale

Kërkohen Node.js 22 dhe pnpm 10.

```bash
pnpm install
pnpm preview
```

Hape `http://127.0.0.1:4173`. Preview-i përdor dy barna testuese dhe një sesion lokal të simuluar, prandaj funksionon pa kredenciale dhe pa prekur të dhënat e prodhimit.

Para publikimit:

```bash
pnpm test
```

`pnpm test` rigjeneron runtime-et, kontrollon sintaksën, sigurinë, kontratat klinike, performancën, PWA/offline dhe UI-në responsive.

## Si është organizuar

| Pjesa | Përgjegjësia |
| --- | --- |
| `*.html`, `*.css`, `*.js` | Faqet dhe ndërfaqja që ekzekutohet në shfletues |
| `app-parts/` | Burimi i ndarë i regjistrit; build-i gjeneron `app-runtime.js` |
| `api/` | Endpoint-et e vogla serverless |
| `lib/` | Logjika e përbashkët për autentikim, të dhëna dhe Gemini |
| `data/` | Të dhënat lokale dhe metadata e cilësisë |
| `scripts/` | Build-i dhe sinkronizimi i të dhënave |
| `tests/` | Testet statike, klinike dhe browser smoke |

Rrjedha kryesore është e thjeshtë:

1. `auth-client.js` verifikon sesionin me `/api/auth`.
2. Faqja e regjistrit lexon së pari kopjen lokale, pastaj `/api/registry`.
3. Service worker-i ruan shell-in dhe të dhënat private vetëm pas autentikimit.
4. Kërkimi, filtrimi dhe formatimi bazë i recetës punojnë lokalisht.
5. Funksionet që kërkojnë rrjet, si sugjerimi me AI, shënohen qartë dhe mbeten opsionale.

## API-të

| Endpoint | Çfarë bën |
| --- | --- |
| `/api/auth` | Hap, verifikon ose mbyll sesionin |
| `/api/registry` | Jep regjistrin e validuar të barnave |
| `/api/drug-search` | Kërkim i kufizuar në server |
| `/api/dosage` | Jep dozologjinë dhe kartelat klinike |
| `/api/icd` | Jep të dhënat ICD dhe laboratorike |
| `/api/protocol-document` | Jep dokumentin e një protokolli |
| `/api/gemini-prescription` | Sugjerime opsionale për fushat që mungojnë në recetë |

Endpoint-et private përdorin `Cache-Control: private, no-store`; autentikimi dhe përgjigjet e AI-së nuk ruhen në cache.

## Konfigurimi

Kopjo `.env.example` në konfigurimin e ambientit të Vercel-it. Minimumi i nevojshëm:

```text
SESSION_SECRET=<vlerë e rastësishme, së paku 32 karaktere>
ACCESS_CODE=<kodi privat i qasjes>
```

Mund të përdoret `ACCESS_CODE_SCRYPT` në vend të `ACCESS_CODE`. `GEMINI_API_KEY` dhe parametrat e sinkronizimit janë opsionalë. Sekretet nuk duhet të futen në skedarët e frontend-it apo në Git.

## Offline dhe internet i dobët

- Pas vizitës së parë të autentikuar ruhen faqet, asetet kryesore dhe dataset-et klinike të lejuara.
- Faqja shfaq kopjen lokale menjëherë dhe rifreskon të dhënat në prapavijë kur rrjeti është i disponueshëm.
- Receta mund të formatohet lokalisht; AI kërkon internet.
- Dalja nga llogaria fshin cache-et dhe të dhënat private lokale.
- Një instalim i ri pa vizitë të parë online nuk mund të ketë ende dataset-et private.

## Përditësimi i të dhënave

```bash
pnpm sync:protocols
pnpm sync:neon
pnpm sync:all
```

Këto komanda ndryshojnë të dhëna klinike dhe duhen ekzekutuar vetëm me kredencialet e duhura. Pas sinkronizimit, ekzekuto gjithmonë `pnpm test`.

## Shënim klinik

Përmbajtja ndihmon kërkimin dhe dokumentimin. Ajo nuk zëvendëson SmPC-në, fletëudhëzimin zyrtar, protokollet e institucionit apo gjykimin klinik. Statusi i burimit duhet kontrolluar para përdorimit.
