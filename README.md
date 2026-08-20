# MedIndex — regjistri klinik i barnave

MedIndex është një aplikacion i lehtë për kërkimin e barnave, klasifikimeve ATC/ICD, dozologjisë, protokolleve, analizave dhe përgatitjen e recetave. Ndërfaqja është statike dhe e shpejtë; funksionet private ekspozohen si API të vogla serverless.

Në regjistrin e barnave, qelizat me tekst të prerë mund të zgjerohen brenda vetë rreshtit të tabelës. Nuk hapet modal i veçantë; klikimi i dytë e kthen rreshtin në pamjen kompakte.

Verifikimi për të rritur dhe fëmijë është fail-closed: `Po` kërkon dozë të publikuar, rrugë administrimi dhe burim HTTPS; `Jo` kërkon vendim eksplicit të dokumentuar; kur evidenca nuk mjafton shfaqet `Pa të dhëna`.

Faqja **Sistemi** përmban edhe Media Library të lidhur me Vercel Blob. Ajo përdoret vetëm për logo, imazhe të ndërfaqes dhe materiale vizuale publike; dokumentet e pacientëve dhe të dhënat sensitive nuk duhet të ngarkohen aty.

## Nisja lokale

Kërkohen Node.js 24 dhe pnpm 10+.

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
| `lib/` | Logjika e përbashkët për autentikim, të dhëna, media dhe Gemini |
| `data/` | Të dhënat lokale dhe metadata e cilësisë |
| `scripts/` | Build-i dhe sinkronizimi i të dhënave |
| `tests/` | Testet statike, klinike dhe browser smoke |

Rrjedha kryesore është e thjeshtë:

1. `auth-client.js` verifikon sesionin me `/api/auth`.
2. Faqja e regjistrit lexon së pari kopjen lokale, pastaj `/api/registry`.
3. Service worker-i ruan shell-in dhe të dhënat private vetëm pas autentikimit.
4. Kërkimi, filtrimi dhe formatimi bazë i recetës punojnë lokalisht.
5. Funksionet që kërkojnë rrjet, si sugjerimi me AI dhe Media Library, shënohen qartë.

## API-të

| Endpoint | Çfarë bën |
| --- | --- |
| `/api/auth` | Hap, verifikon ose mbyll sesionin |
| `/api/registry` | Jep regjistrin e validuar të barnave |
| `/api/drug-search` | Kërkim i kufizuar në server |
| `/api/dosage` | Jep dozologjinë dhe kartelat klinike |
| `/api/icd` | Jep të dhënat ICD dhe laboratorike |
| `/api/protocol-document` | Jep dokumentin e një protokolli |
| `/api/media` | Liston, ngarkon ose fshin media publike në Vercel Blob |
| `/api/gemini-prescription` | Sugjerime opsionale për fushat që mungojnë në recetë |

Endpoint-et private përdorin `Cache-Control: private, no-store`; autentikimi dhe përgjigjet e AI-së nuk ruhen në cache.

## Konfigurimi

Kopjo `.env.example` në konfigurimin e ambientit të Vercel-it. Minimumi i nevojshëm:

```text
SESSION_SECRET=<vlerë e rastësishme, së paku 32 karaktere>
GOOGLE_CLIENT_ID=<Google Web Client ID>
MEDINDEX_SUPABASE_URL=https://ftuchtmolddhhsdcwnqe.supabase.co
MEDINDEX_SUPABASE_PUBLISHABLE_KEY=<publishable key>
MEDINDEX_SUPABASE_SECRET_KEY=<server-only secret key>
```

Për Media Library, lidhe një **Public Vercel Blob store** me projektin `barnat`. Vercel krijon automatikisht:

```text
BLOB_READ_WRITE_TOKEN=<tokeni i menaxhuar nga Vercel>
```

`ACCESS_CODE` ose `ACCESS_CODE_SCRYPT` mund të përdoret vetëm si hyrje emergjente e pronarit; llogaritë normale autorizohen nga profili live në Supabase. `GEMINI_API_KEY` dhe parametrat e sinkronizimit janë opsionalë. Sekretet nuk duhet të futen në skedarët e frontend-it apo në Git.

Supabase është i vetmi database/runtime provider. Neon nuk përdoret nga aplikacioni, build-i ose komandat e publikimit. Emri historik `lib/neon-data-api.js` mbetet vetëm si adapter kompatibil dhe testet garantojnë se asnjë flag ambienti nuk mund ta riaktivizojë Neon-in.

Regjistrimet e reja krijohen `pending`. Para shqyrtimit duhet të dërgohet një PDF/JPEG/PNG profesional deri në 3 MB. Dokumenti ruhet në bucket privat, admini e hap vetëm me URL 60-sekondëshe dhe çdo hapje auditohet. Aktivizimi pa dokument bllokohet në transaksionin e databazës.

## Offline dhe internet i dobët

- Pas vizitës së parë të autentikuar ruhen faqet, asetet kryesore dhe dataset-et klinike të lejuara.
- Faqja shfaq kopjen lokale menjëherë dhe rifreskon të dhënat në prapavijë kur rrjeti është i disponueshëm.
- Receta mund të formatohet lokalisht; AI dhe Media Library kërkojnë internet.
- Dalja nga llogaria fshin cache-et dhe të dhënat private lokale.
- Një instalim i ri pa vizitë të parë online nuk mund të ketë ende dataset-et private.

## Përditësimi i të dhënave

```bash
pnpm sync:protocols
pnpm sync:supabase
pnpm sync:all
```

Këto komanda ndryshojnë të dhëna klinike dhe duhen ekzekutuar vetëm me kredencialet e duhura. Pas sinkronizimit, ekzekuto gjithmonë `pnpm test`.

## Shënim klinik

Përmbajtja ndihmon kërkimin dhe dokumentimin. Ajo nuk zëvendëson SmPC-në, fletëudhëzimin zyrtar, protokollet e institucionit apo gjykimin klinik. Statusi i burimit duhet kontrolluar para përdorimit.
