# Faza 10 — ICD production health dhe audit operacional

## Qëllimi

Kjo fazë e bën shëndetin e burimit ICD dhe të kërkimit klinik të dukshëm në dashboard-in privat `sistemi.html`, pa shtuar një Vercel function të ri.

## Arkitektura

- `lib/icd-health-audit.js` kryen auditin e hierarkisë dhe smoke-probes e kërkimit.
- Auditi cache-ohet me `WeakMap` sipas identitetit të dataset-it; 12,542 nyjet nuk skanohen përsëri në çdo rifreskim 30-sekondësh.
- `api/neon-status.js` përdor të njëjtin endpoint privat dhe të autentikuar që ekzistonte për Neon-in.
- Dështimi i Google Sheet-it kthehet si status ICD `error` ose `stale`; nuk e rrëzon leximin e Neon-it.
- Projekti mbetet brenda buxhetit 11/12 Vercel functions.

## Baseline i detyrueshëm

- 22 kapituj.
- 274 blloqe.
- 2,050 kategori.
- 10,196 nënkategori.
- 12,542 nyje gjithsej.
- `dataset.nodes.length` duhet të jetë 12,542.

Nëse një nga këto vlera ndryshon, dashboard-i shfaq `Kontrollo ICD` dhe nuk e quan burimin healthy.

## Smoke-probes klinike

1. `A001` duhet të hapë `A00.1` si `code-normalized`.
2. `I10I15` duhet të hapë `I10-I15` si `code-normalized`.
3. `tension i lartë` duhet të rendisë `I10` të parin.
4. `hipertensjon` duhet të rendisë `I10` të parin.
5. `dhimbje gjoksi` duhet të rendisë një kod `R07*` dhe nuk duhet të sugjerojë `I21`.

Këto prova kontrollojnë navigimin dhe sigurinë e kërkimit; ato nuk vendosin diagnozë.

## Gjendjet e burimit

- `healthy`: dataset-i është live, numrat janë të plotë dhe 5/5 probes kalojnë.
- `stale`: shërbehet cache-i i fundit i vlefshëm sepse burimi live nuk u rifreskua.
- `warning`: dataset-i u lexua, por integriteti ose një probe dështoi.
- `error`: burimi nuk u lexua dhe nuk ekziston cache i vlefshëm.

## Dashboard-i

Paneli i ri shfaq:

- statusin live/stale/error;
- numrin real të nyjeve;
- fingerprint-in e CSV-së;
- kohën e ngarkimit;
- madhësinë e CSV-së;
- rezultatin e probes;
- rezultatin individual të secilit kërkim.

UI mbështet desktop, tablet, mobile, dark mode dhe forced colors. Browser audit ruan screenshot-e për gjendjen live desktop dhe stale mobile.
