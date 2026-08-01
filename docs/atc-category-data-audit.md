# Auditimi i kategorive ATC

Data e auditimit: 2026-08-01  
Burimi: tabela `public.drugs` në Neon, vetëm rreshtat me `is_published = true`.

## Përmbledhja

- Produkte të publikuara: **4012**
- Produkte me kod ATC bosh: **0**
- Produkte me kod standard ATC: **4006**
- Produkte me kod legacy jo-standard, por me kategori të përcaktueshme: **5**
- Produkte pa klasifikim ATC: **1**
- Grupe kryesore në katalog: **14**
- Kategori terapeutike në katalog: **81**
- Kategori terapeutike me zero produkte: **0**
- Mbulimi i produkteve nga një kategori ATC: **4011 / 4012 (99.975%)**

## Kodet legacy të përcaktueshme

Këto kode nuk plotësojnë formatin strikt ATC, por prefiksi i tyre i kategorisë është i qartë dhe duhet të filtrohet normalisht:

| Kodi | Produkte | Kategoria |
|---|---:|---|
| `R02AAXX` | 3 | `R02 — Barna për fytin` |
| `R05CAXX` | 2 | `R05 — Barna kundër kollës dhe ftohjes` |

Matcher-i i MedIndex i trajton si `nonstandard-resolvable`, prandaj produktet nuk humbin nga kategoritë R02 dhe R05.

## Produkti pa klasifikim

| Kodi | Produkti | Statusi |
|---|---|---|
| `N/A` | `NoNausea® Bustine` | Pa klasifikim ATC |

Ky produkt mbetet i dukshëm te lista e plotë e Barnave, por nuk caktohet me hamendje në një kategori ATC.

## Rregullat e mbrojtura nga testet

- 14 grupet kryesore duhet të ekzistojnë dhe të ruajnë rendin e katalogut.
- 81 kategoritë duhet të kenë kod valid, emër jo-bosh dhe grup prind.
- Çdo grup duhet të ketë të paktën një kategori.
- Kodet standarde filtrohen normalisht.
- Kodet legacy me prefiks valid nuk përjashtohen nga kategoria.
- Kodet `N/A`, të pavlefshme, me grup të panjohur ose kategori të panjohur raportohen veçmas.
- Ndryshimet në katalog ose matcher kontrollohen nga `tests/atc-category-data-audit-test.js`.

## Vendimi i kësaj etape

Nuk ndryshohet databaza automatikisht. Etapa siguron që UI-ja të paraqesë saktë 4011 produktet e klasifikueshme dhe ta mbajë produktin e vetëm pa ATC jashtë kategorive, pa e humbur nga tabela e përgjithshme.
