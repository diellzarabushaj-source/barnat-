# Sistemi i plotë ICD-10 në shqip — plan fazor

## Burimi i ri

- Google Sheet: `ICD-10 WHO 2019 — Anglisht & Shqip • Hierarki e plotë`
- Spreadsheet ID: `1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0`
- Sheet: `ICD-10 EN-SQ`
- Madhësia e eksportit CSV gjatë auditimit: rreth 3.38 MB.
- Struktura e deklaruar dhe e verifikuar:
  - 22 kapituj
  - 274 blloqe
  - 2,050 kategori
  - 10,196 nënkategori
  - 12,542 nyje gjithsej

## Gjendja e përkthimit

Kolona shqip përdor formula `GOOGLETRANSLATE`. Gjatë auditimit u vunë re mijëra vlera `Loading...`; numri ndryshonte ndërmjet leximeve sepse formulat po rillogariteshin. U gjetën gjithashtu përkthime jo të përshtatshme klinikisht, p.sh. përsëritje fjalësh.

Për këtë arsye:

- vlera `Loading...`, bosh ose error klasifikohet `missing`;
- çdo vlerë tjetër automatike klasifikohet `machine-draft`;
- asnjë përkthim nuk klasifikohet `verified` pa kontroll terminologjik;
- UI-ja finale nuk duhet ta quajë draftin automatik “përkthim zyrtar”.

## Faza 1 — baza dhe auditimi

- Parser i plotë për kapitull → bllok → kategori → nënkategori.
- Validim i kodeve unike dhe lidhjeve prind–fëmijë.
- Numërime të detyrueshme 22 / 274 / 2050 / 10196.
- Fallback i sigurt te titulli anglisht kur shqipja mungon.
- Raport i mbulimit dhe statusit të përkthimit.
- Teste të kërkimit bazë dhe renditjes së kodit.

## Faza 2 — tabela e vetme dhe sidebar-i

- Hiqen hero-ja dhe kartelat e vjetra të ICD-së.
- Sidebar nested me 22 kapituj dhe blloqet përkatëse.
- Vetëm një tabelë ICD me kolonat: kodi, titulli shqip, titulli anglisht, niveli, kapitulli, blloku, prindi dhe statusi i përkthimit.
- URL state për `chapter`, `block`, `parent`, `level`, `q`, `page`, `pageSize`.

## Faza 3 — kërkimi dhe sugjerimet e avancuara

- Kërkim sipas kodit të plotë dhe prefiksit.
- Kërkim në shqip dhe anglisht.
- Normalizim pa diakritika.
- Sinonime dhe terma të zakonshëm klinikë në shqip.
- Fuzzy matching për gabime të vogla shkrimi.
- Rezultate të grupuara sipas hierarkisë.
- Sugjerimet tregojnë burimin e përputhjes: kod, titull, sinonim ose term më i ngushtë.
- Sistemi ndihmon në gjetjen e kodit; nuk jep diagnozë automatike nga simptomat.

## Faza 4 — përkthimi terminologjik

- Glosar i kontrolluar EN → SQ për terminologjinë e përsëritur.
- Përkthim me batch-e sipas kapitujve.
- Kontroll automatik për përsëritje, përkthim të fjalëpërfjalshëm, terma të papërkthyer dhe mospërputhje prind–fëmijë.
- Status për çdo rresht: `missing`, `machine-draft`, `reviewed`, `verified`.
- Rishikim klinik para publikimit si shqip i verifikuar.

## Faza 5 — detajet e kodit dhe workflow klinik

- Panel detaji me hierarkinë e plotë.
- Link direkt në WHO ICD-10 Browser 2019.
- Kopjim kodi dhe titulli.
- “Përdore në recetë” pa humbur draftin ekzistues.
- Historik i kodeve të fundit dhe të preferuarat personale.

## Faza 6 — mobile, performance dhe QA finale

- Virtualizim/paginim për 12,542 nyje.
- Cache me revision dhe stale fallback.
- Teste për të gjitha kapitujt, blloqet, kategoritë dhe nënkategoritë.
- Screenshot audit desktop/tablet/mobile/dark mode.
- Accessibility, keyboard navigation dhe 44 px touch targets.
- Verifikim që asnjë `Loading...` ose error nuk shfaqet si titull klinik.

## Parimi i saktësisë

Burimi zyrtar për kodin dhe titullin anglisht është WHO ICD-10 Version 2019. Përkthimi shqip është shtresë e MedIndex-it dhe duhet të ketë status të dukshëm të verifikimit. Për kodim përfundimtar përdoruesi duhet ta zgjedhë kodin më specifik dhe të konsultojë udhëzimet, përfshirjet dhe përjashtimet përkatëse.
