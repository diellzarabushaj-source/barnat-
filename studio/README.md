# DRx Medical Hub Studio

Ky Studio është ambienti i ri i autorimit për librat e Medical Hub. Ai përdor të njëjtin projekt Sanity dhe dataset si aplikacioni publik, por ka një workspace të veçantë me vetëm tre dokumente kryesore:

1. `medicalBook` — libri dhe PDF-ja kryesore në Google Drive.
2. `medicalChapter` — kapitujt e librit.
3. `medicalTopic` — temat/nënkapitujt që shkruhen nga fillimi, të ndara në seksione dhe blloqe klinike.

Modeli i vjetër (`learningTopic`, `prescriptionGuide`) nuk fshihet dhe nuk shfaqet në këtë Studio. Frontendi kalon te modeli i ri sapo të ketë tema me status `I verifikuar`; publikimi i një drafti ose teme në rishikim nuk e nxjerr atë si përmbajtje klinike.

## Nisja lokale

```powershell
pnpm install
pnpm dev
```

## Rendi i punës

1. Krijo librin dhe vendos ID-në/lidhjen e PDF-së kryesore.
2. Krijo kapitujt dhe lidhi me librin.
3. Krijo temat, lidhi me kapitullin dhe shto seksionet në rendin e librit.
4. Mbaji temat si `Draft` gjatë shkrimit; kaloji në `Në rishikim`, pastaj `I verifikuar`.
5. Plotëso emrin e verifikuesit dhe datën, vendos statusin `I verifikuar`, pastaj publiko dokumentin.

Mos kopjo tekst automatikisht nga PDF-ja ose dokumentet e recetave. Këto fusha janë ndërtuar për autorim editorial nga zero, me vendndodhjen e burimit të ruajtur veçmas.
