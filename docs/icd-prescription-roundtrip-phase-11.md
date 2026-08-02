# Faza 11 — ICD ↔ Recetë round-trip

## Qëllimi

Kjo fazë e bën rrjedhën klinike të kthyeshme: mjeku mund të nisë një recetë, të hapë kodin ICD në hierarki dhe të kthehet pa humbur draftin. Ajo ndërtohet mbi handoff-in e strukturuar të Fazës 10 dhe nuk ndryshon rregullat e kodimit apo vendimmarrjen klinike.

## Çfarë shtohet

- Ruajtje e kufizuar e draftit para navigimit të brendshëm nga Receta në ICD.
- Parametri `return=recetat`, i cili ruhet gjatë ndryshimit të kodit në tree dhe kërkim.
- Veprimi `Kthehu te receta` në toolbar dhe panelin e detajeve ICD.
- Veprimi `Hape në ICD` te diagnoza aktive dhe te recetat e ruajtura me `diagnosisCoding`.
- Histori lokale e gjashtë diagnozave ICD të fundit, me ripërdorim të kontrolluar.

## Kufijtë e të dhënave

- Drafti i recetës: maksimum 20,000 karaktere.
- Diagnoza e draftit: maksimum 1,000 karaktere.
- Historia: maksimum 6 kode, e deduplikuar sipas kodit.
- Afati i historisë: 180 ditë.
- Pranohen vetëm nivelet `category` dhe `subcategory` me kod ICD diagnostik të vlefshëm.
- Të dhënat ruhen vetëm në browser-in e përdoruesit; nuk shtohet endpoint ose Vercel function i ri.

## Siguria klinike

- Historia e fundit nuk vendos diagnozë vetë; aplikimi kërkon klikim të mjekut.
- Përdoret API-ja ekzistuese `MedIndexPrescriptionIcdContext.apply`, prandaj konflikti me një diagnozë ekzistuese vazhdon të kërkojë konfirmim.
- Ndryshimi manual i diagnozës vazhdon ta heqë lidhjen e vjetër `diagnosisCoding`.
- Transferimi ruan kodin, nivelin, titullin dhe statusin terminologjik; nuk zgjedh trajtim ose dozë.

## Testet

- Kontratë statike për versionin, kufijtë, deduplikimin, asset order dhe accessibility CSS.
- Playwright për Recetë → ICD → Recetë me ruajtje drafti.
- Playwright për ruajtjen e `return=recetat` gjatë navigimit në një kod tjetër.
- Playwright mobile për maksimum gjashtë diagnoza, ripërdorim dhe mungesë overflow-i.
