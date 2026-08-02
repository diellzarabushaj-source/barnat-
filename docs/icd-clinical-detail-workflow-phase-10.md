# Faza 10 — paneli klinik ICD dhe handoff-i në recetë

## Qëllimi

Zgjedhja e një kodi ICD-10 nuk duhet të reduktohet në kopjim teksti. Faza 10 ruan kodin, nivelin, terminologjinë, burimin dhe kohën e zgjedhjes gjatë kalimit nga shfletuesi ICD te receta.

## Paneli i kodit

Paneli shfaq:

- kodin dhe nivelin;
- titullin shqip dhe titullin zyrtar anglisht;
- statusin editorial të termit shqip;
- kapitullin, bllokun, prindin dhe hierarkinë e plotë;
- numrin e nënkodeve direkte;
- paralajmërim kur ekziston nivel më specifik;
- burimin HTTPS në WHO ICD-10 Browser;
- veprimin për kopjim dhe transferim në recetë.

Kapitujt dhe blloqet mbeten vetëm nivele navigimi. Vetëm `category` dhe `subcategory` lejohen të transferohen si diagnozë.

## Payload-i i transferimit

Payload-i `version: 2` përmban:

- `system: ICD-10-WHO 2019`;
- `code`;
- `level`;
- `titleSq` dhe `titleEn`;
- `translationStatus`;
- `sourceUrl`, vetëm nga `https://icd.who.int`;
- `childCount`;
- `selectedAt`.

Payload-et më të vjetra se 30 minuta, me timestamp në të ardhmen, me nivel jo-diagnostik ose me kod të pavlefshëm refuzohen.

## Sjellja në recetë

- Diagnoza bosh plotësohet automatikisht.
- Diagnoza ekzistuese nuk mbishkruhet. Kodi shfaqet si kontekst në pritje dhe kërkon klikim të mjekut.
- Kartela `Nga ICD-10` tregon kodin, titullin, nivelin, statusin terminologjik dhe lidhjen WHO.
- Editimi manual i diagnozës e heq menjëherë lidhjen e strukturuar.
- Gjatë ruajtjes, metadata ruhet si `diagnosisCoding`.
- Hapja e një recete të ruajtur rikthen kartelën ICD vetëm kur diagnoza përputhet me metadata.
- Recetat e ruajtura me provenance ICD marrin badge me kodin.

## Siguria

- Nuk kryhet inferencë diagnostike.
- Handoff-i nuk zgjedh vetë kod më specifik.
- Titujt dhe atributet HTML escapohen.
- URL-të e provenance kufizohen në hostin zyrtar WHO.
- Payload-i hiqet nga `sessionStorage` pas leximit.
- Metadata e vjetër fshihet kur teksti ndryshohet.

## Auditimi

Merge-i kërkon:

- testin statik të kontratës së Fazës 10;
- auditin ekzistues cross-page;
- validimin e plotë MedIndex;
- Playwright për transferim, konflikt, ruajtje, editim manual dhe mobile viewport;
- auditin privat të dataset-it ICD.
