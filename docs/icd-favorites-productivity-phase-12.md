# Faza 12 — Kodet e preferuara ICD dhe qasja e shpejtë

## Qëllimi

Kjo fazë e shkurton navigimin e përditshëm për mjekun pa ndryshuar kërkimin, hierarkinë ose vendimmarrjen klinike. Një kategori ose nënkategori ICD-10 mund të ruhet si shortcut lokal dhe të hapet përsëri në të njëjtin tree dhe panel detajesh.

## Funksionaliteti

- Veprim `Shto te të preferuarat` në panelin ekzistues të detajeve.
- Panel i palosshëm `Të preferuarat` mbi tree-n ICD.
- Hapje e kodit të ruajtur përmes `MedIndexIcdTable.revealCode` dhe panelit ekzistues të detajeve.
- Heqje individuale dhe pastrim i plotë me konfirmim.
- Sinkronizim ndërmjet tab-eve të të njëjtit browser përmes eventit `storage`.
- Ruajtje e qëndrueshme pas reload-it.

## Kufijtë

- Pranohen vetëm nivelet `category` dhe `subcategory`.
- Maksimum 24 kode.
- Deduplikim sipas kodit.
- Renditje sipas ruajtjes më të fundit.
- Skadim pas 365 ditësh.
- Titujt dhe statuset kufizohen në gjatësi para ruajtjes.

## Privatësia dhe siguria klinike

- Ruajtja bëhet vetëm në `localStorage` të browser-it.
- Nuk ruhet emër pacienti, ID pacienti, diagnozë e lirë, draft recete ose terapi.
- Favoritet janë shortcut-e të zgjedhura nga mjeku; nuk sugjerojnë, vendosin ose aplikojnë diagnozë automatikisht.
- Për transferim në recetë vazhdojnë të përdoren rregullat ekzistuese të panelit ICD dhe `diagnosisCoding`.

## UI dhe accessibility

- Butoni kryesor ka `aria-expanded`, `aria-controls` dhe numër të dukshëm të kodeve.
- Butoni në detaje përdor `aria-pressed` për gjendjen e ruajtur.
- Lista përdor role list/listitem dhe çdo heqje ka etiketë të plotë.
- `Escape` mbyll panelin dhe kthen fokusin te butoni.
- Mbështeten desktop, tablet, mobile, dark mode dhe forced colors.

## Testet

- Validim dhe normalizim i kodeve.
- Refuzim i kapitujve, blloqeve dhe kodeve të pavlefshme.
- Deduplikim, skadim dhe kufi 24.
- Verifikim që payload-i nuk mban fusha pacienti ose diagnozë të lirë.
- Playwright për ruajtje, reload, hapje në tree, heqje dhe mobile pa overflow.

Nuk shtohet endpoint ose Vercel function i ri.
