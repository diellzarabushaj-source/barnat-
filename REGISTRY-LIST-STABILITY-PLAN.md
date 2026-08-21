# Registry List Stability Plan

Qëllimi: kalimi **Tabelë → Listë → Tabelë** të ketë gjithmonë vetëm një pronar të UI-së, pa toolbar të dyfishtë, pa kontrolle të pafiltruara nga CSS dhe pa ndryshim të pamjes gjatë marrjes së dataset-it të Listës.

## Faza 0 — Baseline dhe izolimi
**Status:** Përfunduar

- Punohet nga `main` aktual, jo nga branch-i i vjetër i PR #189.
- Branch i izoluar: `fix/registry-list-single-owner`.
- Dozimi dhe të dhënat klinike nuk preken.

## Faza 1 — Single-owner fail-safe
**Status:** Implementuar · regression gate aktiv

Objektivi: sapo `data-mi-registry-view="list"`, toolbar-i i tabelës nuk duhet të mund të shfaqet as për një frame.

- CSS guard ngarkohet në `<head>` dhe kufizohet vetëm në desktop/table breakpoint.
- `#registryViewToolbar` fshihet në List mode me `display:none !important`.
- `#registryContent` dhe `#pagination` fshihen në List mode.
- Search/filter panel nuk fshihet; lista vazhdon të përdorë të njëjtin search.
- JS ownership guard sinkronizon `hidden`, `aria-hidden` dhe `inert` edhe kur toolbar-i krijohet me vonesë.
- Observer-i është i kufizuar te prindi i Registry-t dhe atributi i view-it.
- Build-time audit dështon nëse guard assets mungojnë ose dyfishohen.

**Kriteri:** në List mode `Filtrat / Fokus klinik / Tabela e plotë` nuk mund të bëhen të dukshme, pavarësisht rendit të eventeve.

## Faza 2 — Data handoff ≠ UI handoff
**Status:** Implementuar · regression gate aktiv

Vendimi final: Lista **nuk e zgjon më full-table runtime për të dhëna**.

- `registry-list-view.js` emeton `medindex:registry-list-dataset-needed`, jo handoff-in e full table.
- `registry-list-data-bridge.js` merr dataset-in e publikuar nga Neon në faqe të kufizuara (`400` rreshta, maksimum `500` në server, concurrency `3`).
- Dataset-i publikohet vetëm në namespace-in e Listës: `MEDINDEX_REGISTRY_LIST_ROWS`.
- `MEDINDEX_REGISTRY_ROWS` i tabelës nuk mbishkruhet.
- Çdo rresht duhet të ketë UUID stabile; dataset-i jo i plotë, UUID e dyfishuar ose identitet i pavlefshëm dështon mbyllur.
- API përdor projekcion të përcaktuar, jo `SELECT *` dhe jo `source_payload` masiv.
- Nëse përdoruesi kthehet te Tabela gjatë ngarkimit, kërkesat e Listës anulohen.

**Kriteri:** marrja e të gjitha barnave për Listë nuk mund të aktivizojë UI-n e full table.

## Faza 3 — Controller-level ownership
**Status:** Implementuar · regression gate aktiv

- `registry-unified-table.js` merr guard të drejtpërdrejtë në `ensureShell`, `reconcile`, `schedule` dhe `observeTable`.
- Kur owner është `list`, controller-i i tabelës nuk ndërton toolbar, nuk riorganizon DOM-in e tabelës dhe shkëput observer-in e vet.
- Nëse full runtime ka ekzistuar më herët, toolbar-i ekzistues bëhet `hidden + aria-hidden + inert`.
- Kur kthehet në `table`, toolbar-i, observer-i dhe reconcile rikthehen në mënyrë deterministe nga ndryshimi i `data-mi-registry-view`.

**Kriteri:** jo vetëm vizualisht, por edhe në runtime ekziston një pronar aktiv i surface-it.

## Faza 4 — Cache dhe version coherence
**Status:** Implementuar · verifikimi final në preview në pritje

- Të gjitha asetet e Registry List mbajnë një release marker të përbashkët: `rlv=registry-list-stable-v1`.
- `index.html` deklaron një `medindex-registry-list-release` unik.
- Ruhet versioni primar ekzistues i secilit asset që patch-et e vjetra të mos humbin anchor-at e tyre.
- Offline manifest nxirret pasi Phase 19–22 përfundojnë dhe kërkon shprehimisht owner guard, data bridge, List view dhe dosage detail runtime.

**Kriteri:** browseri nuk duhet të kombinojë kontrollor të ri me stylesheet të vjetër; offline shell duhet të ketë të njëjtin set funksional.

## Faza 5 — Regression test i bug-ut real
**Status:** Implementuar · ekzekutohet në çdo build

`tests/registry-list-single-owner-test.js` riprodhon incidentin, jo vetëm source-code regex:

1. List mode është aktive.
2. Tabela dhe pagination janë semantikisht të fshehura.
3. `registryViewToolbar` **nuk ekziston ende**.
4. Toolbar-i injektohet me vonesë — pikërisht race-i i screenshot-it.
5. MutationObserver-i i owner guard duhet menjëherë ta bëjë `hidden`, `aria-hidden` dhe `inert`.
6. Table mode duhet ta rikthejë.
7. Table → List për herë të dytë duhet ta fshehë përsëri.

Gate-i verifikon gjithashtu:
- data-only handoff dhe mungesën e full-runtime dispatch nga List;
- endpoint-in e kufizuar `registry-browse-page`;
- ruajtjen e UUID-së së saktë;
- refuzimin e dataset-it jo të plotë / UUID-ve të dyfishta;
- controller-level ownership;
- release marker të njëjtë në të gjitha asetet e Listës.

`patch-phase22-registry-list-release-gate.js` e ekzekuton testin në çdo `build:runtime`, para ngrirjes së offline manifest-it.

## Faza 6 — Preview, polish dhe merge
**Status:** Në verifikim

- Presim Vercel preview të **head-it final**, jo një commit të ndërmjetëm. Git integration kishte prodhuar një preview `READY` për commit-in e hershëm të data bridge, por jo ende për kompletimin e Phase 19–22; ai preview i hershëm nuk llogaritet si verifikim final.
- Kontrollohen build logs dhe full test suite.
- Kontrollohet në preview: Listë, Tabelë, Table → List → Table → List, hard refresh me List të ruajtur dhe loading i dataset-it.
- Kontrollohen desktop widths 1366, 1440, 1680 px dhe tablet breakpoint.
- Acceptance final: asnjë frame me `registryViewToolbar` të dukshëm kur owner=`list`, asnjë `medindex:request-full-registry` nga List data path, dataset List i plotë me UUID stabile dhe kthim determinist te Table.
- Vetëm pasi head-i final të jetë `READY` dhe regression gate të kalojë bëhet PR ready/merge në `main`.
