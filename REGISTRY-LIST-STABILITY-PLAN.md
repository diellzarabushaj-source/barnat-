# Registry List Stability Plan

Qëllimi: kalimi **Tabelë → Listë → Tabelë** të ketë gjithmonë vetëm një pronar të UI-së, pa toolbar të dyfishtë, pa kontrolle të pafiltruara nga CSS dhe pa ndryshim të pamjes gjatë handoff-it të dataset-it.

## Faza 0 — Baseline dhe izolimi
**Status:** Përfunduar

- Punohet nga `main` aktual, jo nga branch-i i vjetër i PR #189.
- Branch i izoluar: `fix/registry-list-single-owner`.
- Dozimi dhe të dhënat klinike nuk preken.

## Faza 1 — Single-owner fail-safe
**Status:** Në implementim

Objektivi: sapo `data-mi-registry-view="list"`, toolbar-i i tabelës nuk duhet të mund të shfaqet as për një frame.

- CSS guard i ngarkuar në `<head>` dhe i kufizuar vetëm në desktop/table breakpoint.
- `#registryViewToolbar` fshihet në List mode me `display:none !important`.
- `#registryContent` dhe `#pagination` mbeten të fshehura në List mode.
- Search/filter panel nuk fshihet; lista vazhdon të përdorë të njëjtin search.
- JS ownership guard sinkronizon `hidden`, `aria-hidden` dhe `inert` kur toolbar-i krijohet pas handoff-it.
- Observer i kufizuar te prindi i Registry-t; jo observer global i kushtueshëm.
- Build-time audit dështon nëse guard assets nuk injektohen saktë.

**Kriteri i kalimit:** në List mode `Filtrat / Fokus klinik / Tabela e plotë` nuk mund të bëhen të dukshme, pavarësisht rendit të eventeve.

## Faza 2 — Data handoff ≠ UI handoff
**Status:** Planifikuar

- `medindex:registry-full-dataset-needed` duhet të sigurojë dataset-in e plotë pa e marrë automatikisht pronësinë vizuale të faqes.
- Full runtime mund të ngarkohet për të dhënat, por nuk duhet të aktivizojë surface-in e tabelës kur owner është `list`.
- Ruhet query, filters, scroll dhe rreshti i hapur gjatë `partial → full`.

**Kriteri i kalimit:** `registry-ready` nuk ndryshon view dhe nuk krijon chrome të tabelës mbi listë.

## Faza 3 — Controller-level ownership
**Status:** Planifikuar

- `registry-unified-table.js` merr guard të drejtpërdrejtë në `ensureShell`, `reconcile`, `schedule` dhe event callbacks.
- Controller-i i tabelës nuk ndërton toolbar dhe nuk bën punë DOM të panevojshme kur owner është `list`.
- Kur kthehet në `table`, controller-i rikthehet në mënyrë deterministe.

**Kriteri i kalimit:** jo vetëm vizualisht, por edhe në runtime ekziston një pronar aktiv i surface-it.

## Faza 4 — Cache dhe version coherence
**Status:** Planifikuar

- List JS/CSS/owner guard marrin release/version të koordinuar.
- Offline manifest përfshin automatikisht guard assets.
- Kontrollohet që service worker/browser cache të mos përziejë JS të ri me CSS të vjetër.

**Kriteri i kalimit:** hard refresh, warm cache dhe offline shell japin të njëjtën pamje.

## Faza 5 — Regression test i bug-ut real
**Status:** Planifikuar

Skenari i detyrueshëm:

1. Desktop nis me 50 barna lightweight.
2. Klikohet `Listë`.
3. Niset full-dataset handoff.
4. Përfundon `registry-ready`.
5. Assert gjatë gjithë tranzicionit:
   - `registryListView` visible;
   - `registryContent` hidden;
   - `pagination` hidden;
   - `registryViewToolbar` hidden ose absent;
   - search mbetet visible.

Testohet edhe Table → List → Table → List, refresh me preferencë `list`, slow response dhe resize.

## Faza 6 — Polish dhe merge
**Status:** Planifikuar

- Testet e plota.
- Preview Vercel.
- Kontroll vizual në 1366, 1440, 1680 px dhe tablet breakpoint.
- Vetëm pasi të kalojnë kriteret më sipër bëhet merge në `main`.
