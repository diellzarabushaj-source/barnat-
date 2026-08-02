# Faza 13 — lista e diagnozave shoqëruese ICD në recetë

## Qëllimi

Receta ruan një diagnozë kryesore të qartë, por mjeku mund të lidhë edhe diagnoza shoqëruese të strukturuara ICD-10. Lista nuk ndryshon automatikisht indikacionin kryesor dhe nuk vendos diagnoza.

## Sjellja klinike

- Diagnoza kryesore vazhdon të menaxhohet nga `diagnosisCoding`.
- Lejohen maksimum 5 diagnoza shoqëruese.
- Pranohen vetëm nivelet `category` dhe `subcategory`.
- Kodi kryesor përjashtohet automatikisht nga lista shoqëruese.
- Kodet deduplikohen sipas kodit ICD-10.
- Një diagnozë shoqëruese bëhet kryesore vetëm me veprimin eksplicit `Bëje kryesore`.
- Gjatë promovimit, diagnoza e vjetër kryesore kalon në listën shoqëruese kur është e vlefshme.

## Rrjedha ICD → Recetë

Paneli ekzistues i detajeve ICD merr veprimin `Shto si shoqëruese`, krahas `Përdore në recetë`. Handoff-i përdor `sessionStorage` dhe konsumohet vetëm një herë në `recetat.html`.

Diagnozat e fundit marrin një veprim të veçantë `Shoqëruese`. Butoni lidhet me kodin e dukshëm të kartelës dhe çaktivizohet kur kodi është tashmë diagnoza kryesore.

## Ruajtja

- Drafti lokal përdor `medindex_rx_problem_list_draft_v1` dhe skadon pas 7 ditësh.
- Recetat e ruajtura përdorin `secondaryDiagnosisCoding` me `version: 1`.
- Kartela e recetës së ruajtur shfaq badge `+N ICD`.
- Hapja e një recete të ruajtur rikthen listën përkatëse.
- Lista pastrohet me `Recetë e re` ose `Pastro`.

## Privatësia dhe siguria

- Payload-i përmban vetëm kodin, nivelin, termat SQ/EN, statusin terminologjik, numrin e nënkodeve dhe timestamp-in.
- Nuk ruhet emër pacienti, ID pacienti, tekst diagnostik i lirë ose terapi.
- Nuk shtohet endpoint ose Vercel function i ri.
- Mjeku mbetet përgjegjës për përzgjedhjen dhe specifikën e kodit.

## UI dhe aksesueshmëria

- Lista përdor `role=list` dhe `role=listitem`.
- Çdo heqje ka etiketë të plotë me kodin.
- Veprimet punojnë me tastierë.
- Mbështeten desktop, tablet, mobile, dark mode dhe forced colors.
- Në mobile veprimet kalojnë në rreshta të plotë dhe nuk krijojnë horizontal overflow.

## Auditimi

- Test statik për validimin e kodit, nivelet, deduplikimin, kufirin 5, skadimin dhe privatësinë.
- Playwright për diagnozën kryesore + shoqëruese, promovimin, handoff-in ICD → Recetë dhe butonat e diagnozave të fundit.
- Playwright mobile për kufirin, heqjen, pastrimin dhe viewport-in.
