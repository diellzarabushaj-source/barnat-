# Faza 14 — dokumenti final i recetës me diagnoza

## Qëllimi

Parapamja, kopjimi, eksporti TXT dhe printimi përdorin të njëjtin model dokumenti. Përmbajtja renditet gjithmonë:

1. Diagnoza kryesore.
2. Diagnozat shoqëruese, maksimum pesë.
3. Përmbajtja kanonike e recetës që fillon me `Rp:`.

## Burimi i diagnozave

- Diagnoza kryesore merret nga konteksti i strukturuar ICD i recetës.
- Kur nuk ka kod ICD, përdoret teksti manual i fushës së diagnozës.
- Diagnozat shoqëruese merren nga problem list-i i Fazës 13.
- Kodi kryesor përjashtohet nga lista shoqëruese dhe kodet deduplikohen.
- Drafti i diagnozave shoqëruese respekton skadimin prej shtatë ditësh.

## Pamja dhe printimi

Parapamja shfaq një seksion të dallueshëm për diagnozat para barnave. Printimi krijon dokument A4 me:

- titullin `Recetë`;
- diagnozën kryesore;
- diagnozat shoqëruese;
- tekstin e recetës.

Printimi nuk përdor HTML nga përdoruesi; vlerat vendosen me `textContent`.

## Kopjimi dhe eksporti

- `Kopjo` vendos në clipboard dokumentin e plotë me diagnoza.
- `Eksporto TXT` shkarkon të njëjtën përmbajtje në UTF-8.
- Emri i skedarit përdor datën dhe kodin kryesor, kur kodi ekziston.

## Privatësia

Dokumenti final nuk përmban:

- `source` ose URL të burimit;
- `translationStatus`;
- timestamp-e si `selectedAt`;
- versione runtime ose çelësa storage;
- emër, ID ose datëlindje pacienti.

## Auditimi

- Test statik për normalizim, renditje, deduplikim, kufi, skadim dhe privatësi.
- Playwright për preview, clipboard, eksport TXT, popup-in e printimit dhe mobile overflow.
- CSP mbetet `script-src 'self'`; asset-et e Fazës 14 ngarkohen vetëm nga origjina e aplikacionit.
