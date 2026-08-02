# Faza 10 — Besueshmëria e terminologjisë dhe paneli klinik ICD

Data: 2026-08-02

## Qëllimi

Paneli i një kodi ICD-10 duhet të dallojë qartë mes:

- termit të verifikuar;
- termit të standardizuar editorialisht;
- draftit automatik;
- kodit pa përkthim shqip.

Kodi ICD-10 dhe titulli zyrtar anglisht mbeten referenca kryesore. Statusi `standardized` nuk paraqitet si verifikim profesional përfundimtar.

## Sjellja e re

- Përgjigjja `resolve` lexohet nga një shtresë e izoluar e panelit.
- `machine-draft` shfaqet si **Draft automatik**, jo si status i papërcaktuar.
- `missing` shfaqet si **Vetëm anglisht**.
- Paneli tregon statusin, rishikimin, versionin terminologjik dhe gjendjen e burimit të dataset-it.
- Karta shpjegon kur termi kërkon rishikim dhe kur nuk ekziston përkthim shqip.
- Kopjimi përfshin kodin, titullin shqip, titullin zyrtar anglisht dhe statusin e termit.
- Gjatë kalimit në recetë ruhen metadata shtesë të provenance-it dhe nevoja për rishikim terminologjik.

## Kufiri i sigurisë

Shtresa:

- nuk shpik status `verified`;
- nuk e ndryshon kodin ICD-10;
- nuk vendos diagnozë;
- nuk bllokon mjekun nga zgjedhja e kodit;
- nuk e paraqet standardizimin editorial si verifikim profesional.

## Performanca dhe arkitektura

- Nuk shtohet Vercel function i ri.
- Nuk bëhet kërkesë e dytë API; përdoret kloni i përgjigjes ekzistuese `resolve`.
- Dekorimi është idempotent dhe nuk krijon cikël `MutationObserver`.
- CSS mbështet desktop, mobile, dark mode dhe forced colors.

## Testet

- kontrata statike për statuset dhe kufirin e verifikimit;
- Playwright për draft automatik në desktop;
- Playwright për mungesë përkthimi në mobile;
- kopjim bilingual;
- kontroll i viewport-it dhe overflow-it;
- testet ekzistuese të recetës dhe hierarkisë vazhdojnë të mbeten aktive.
