# Faza 17 — konteksti klinik MF/urgjencë dhe kodimi i sigurt

## Qëllimi

Faza 17 lidh dy burime të ndryshme pa i përzier rolet e tyre:

1. **Hierarkia e plotë ICD-10-WHO 2019** për kapitullin, bllokun, kategorinë, nënkategorinë, paraardhësit dhe specifikësinë strukturore.
2. **Google Sheet-i klinik i përdorueses** `ICD-10 – Kodet kryesore për Mjekësi Familjare dhe Urgjencë` për rëndësinë praktike në mjekësinë familjare, urgjencë, prioritetin, përdorimin tipik, fjalët kyçe dhe shenjat alarmuese.

Spreadsheet ID:

`19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw`

Tab-et e përdorura nga backend-i ekzistues:

- `Të gjitha kodet` (`gid 1504864603`)
- `Mjekësi urgjente` (`gid 285385409`)
- `Kodet kritike` (`gid 255407421`)

Faza 17 nuk shton serverless endpoint të ri. Ajo përdor `/api/icd`, i cili tashmë merr dataset-in klinik nga Google Sheets ose nga kopja e publikuar dhe e sinkronizuar në Neon.

## Paneli klinik

Për kodin aktiv në Coding Workspace shfaqen:

- rëndësia në mjekësinë familjare;
- rëndësia në urgjencë;
- prioriteti i dokumentimit;
- përdorimi tipik;
- shenjat alarmuese / kujdesi;
- fjalët kyçe;
- shënimet e kodimit;
- provenienca e dataset-it klinik.

Prioriteti i shfaqur është kontekst i listës klinike dhe nuk është protokoll automatik triazhimi, diagnoze ose trajtimi.

## Përputhja exact dhe trashëgimi i kontrolluar

- Nëse kodi aktiv ekziston në listën klinike, përdoret përputhja e drejtpërdrejtë.
- Nëse një nënkategori nuk ka rresht të veçantë, mund të trashëgojë vetëm kontekstin e kategorisë së vet me tre karaktere.
- Trashëgimi shënohet qartë në UI dhe në tekstin e kopjuar.
- Kodet jashtë setit klinik nuk marrin prioritet, rëndësi MF ose urgjence të sajuar.

## Shënimet zyrtare të kodimit

Moduli njeh katër lloje të strukturuara nëse bëhen të disponueshme në burim:

- `Përfshin`
- `Përjashton`
- `Kodifiko së pari`
- `Përdor kod shtesë`

Dataset-i aktual nuk i përmban këto fusha si shënime zyrtare të strukturuara. Prandaj paneli tregon qartë se ato nuk janë të disponueshme dhe nuk i fabrikon.

`Shënim kodimi` nga Google Sheet-i shfaqet veçmas dhe nuk etiketohet si shënim zyrtar WHO.

## Privatësia dhe siguria

- Nuk ruhet asnjë e dhënë pacienti.
- Nuk përdoret `localStorage` ose `sessionStorage`.
- Dataset-i klinik ruhet vetëm në memorien e faqes dhe ngarkohet një herë për sesionin e faqes.
- Clipboard-i nuk përmban ID burimi, timestamp, metadata runtime ose fusha pacienti.
- Dështimi i dataset-it klinik nuk bllokon hierarkinë, kërkimin, workspace-in ose transferimin ICD në recetë.

## Deep audit

### Kontrata statike

- ID dhe `gid` e Google Sheet-it ekzistues verifikohen.
- Normalizimi i kodeve dhe deduplikimi verifikohen.
- Përputhja exact dhe kategori→nënkod verifikohen.
- Kodet jashtë listës nuk marrin kontekst të rremë.
- Shënimet zyrtare nuk fabrikohen.
- Clipboard-i nuk përmban metadata teknike ose të dhëna pacienti.
- CSS verifikohet për mobile, `forced-colors` dhe tekst të gjatë.

### Chromium

- kod kritik exact nga lista e urgjencës;
- nënkod me kontekst të trashëguar nga kategoria;
- vetëm një fetch i dataset-it gjatë ndërrimit të kodeve;
- kod jashtë listës pa prioritet të sajuar;
- dështim i burimit klinik pa bllokuar workspace-in;
- panel me tekst të gjatë në viewport 390 px pa overflow horizontal;
- kopjim pa metadata teknike.
