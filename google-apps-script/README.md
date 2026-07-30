# MedIndex · Google Sheet ↔ Neon

Për spreadsheet-in aktual të dozologjisë përdoren vetëm këta dy skedarë:

1. `medindex-current-sync-standalone.gs`
2. `medindex-perfect-sync-launcher.gs`

Spreadsheet-i i synuar:

`1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo`

## Aktivizimi

1. Hape spreadsheet-in aktual.
2. Zgjidh **Extensions → Apps Script**.
3. Shto përmbajtjen e dy skedarëve të mësipërm në projektin Apps Script.
4. Ekzekuto vetëm funksionin:

```text
setupMedIndexPerfectSync
```

5. Prano lejet e Google dhe vendos çelësin privat kur kërkohet.

Launcher-i heq trigger-at e vjetër dhe krijon vetëm këta trigger-a:

- pas çdo editimi: Google Sheet → Neon;
- çdo 5 minuta: kontroll pajtueshmërie dhe rikuperim i ndryshimeve të humbura;
- çdo 1 minutë: Neon/editor → Google Sheet.

## Kontrolli

Nga menuja **MedIndex Sync** në spreadsheet mund të përdoren:

- **Kontrollo tani**;
- **Shfaq statusin**;
- **Ndalo sinkronizimin**.

Tab-i `NEON_SYNC` ruan statusin e sinkronizimit. Tab-i i fshehur `NEON_SYNC_STATE` ruan vetëm hash-et e rreshtave për të parandaluar sinkronizimin e panevojshëm dhe loop-et.

## Shënim sigurie

Çelësi privat ruhet vetëm në **Script Properties**. Ai nuk vendoset në kod, në GitHub ose në Vercel.

Skedarët e tjerë në këtë folder ruhen vetëm për histori/migrim dhe nuk duhet të përdoren për instalimin e ri.
