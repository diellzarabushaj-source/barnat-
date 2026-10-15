# Pediatric formulation verification · 15 October 2026

The searchable drug, form, strength and indication controls are live in PR #464. This follow-up adds independently sourced formulation-specific rules and explains each remaining unavailable choice.

## Coverage and limits

After adding the six requested medicines and all 69 vitamin products, the published AKKPM fixture contains **897 products, 386 formulation choices: 206 with active calculation schemes and 180 without automatic calculation**. All 180 have a source-review reason and direct authoritative links. This is **not** a claim that all local product labels are verified: product-unconfirmed and incomplete records remain unresolved and cannot calculate. Source review never overrides a population, component, route, formulation or exact-product gate.

`node scripts/audit-pediatric-market-formulations.js` reproduces the current inventory. An optional `--baseline <file>` matches every product in the previous 100 unavailable choices to its current status. The generated full baseline comparison is saved with the task outputs. Counts describe the fixture date, not sales, availability or future registry updates.

## Added rules and conservative automation boundaries

- Co-amoxiclav oral 4:1: lower and higher daily-dose ranges split three times; higher range starts at 2 years. Automation conservatively starts at 3 months, 2 to under 40 kg and normal renal function. This is a narrower cohort than the whole SmPC, not a newly claimed label limit. [SmPC](https://www.medicines.org.uk/emc/product/6671/smpc).
- ES 600/42.9 mg per 5 mL: separate 14:1 scheme, restricted to recurrent/persistent acute otitis with the label's risk criteria, 3 months through completed age 12 and up to 40 kg. It cannot reuse 4:1/7:1 dosing or a record missing its mL denominator. [FDA label](https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=59979859-8c9b-4173-a5e3-2e6312fd9d79).
- Chlorphenamine 4 mg tablet: whole tablets only, over 12 years, with daily ceiling and sedation/interaction confirmation. The scored Piriton label does not establish that another brand can be halved. [SmPC](https://www.medicines.org.uk/emc/product/3927/smpc).
- Salbutamol oral 2 mg/5 mL: minimum starting doses from age 2, only when the inhaler cannot be used; no automatic escalation. Nebulizer and inhaler regimens remain separate. [Ventolin syrup SmPC](https://www.medicines.org.uk/emc/product/854/smpc).
- SALBUTAMOL ALDO-UNION 100 mcg/dose: exact product identity, one inhalation and the product's pediatric ceiling of four inhalations/day. Automation is conservatively limited to age 4+. [AEMPS](https://cima.aemps.es/cima/dochtml/ft/65850/FichaTecnica_65850.html).
- SALRES 100 mcg: exact product identity, 1–2 inhalations, at most four uses/eight inhalations per day, age 2+, with device/spacer checks. Its ceiling does not transfer to Aldo-Unión. [Manufacturer SmPC](https://devacomtr.s3.eu-west-2.amazonaws.com/urunler/kub/salres-100-mcg-spc.pdf).
- KLACID LA 500 mg: exact modified-release product; once daily with food, swallowed whole, over age 12. Standard and severe-infection options remain separate; no immediate-release twice-daily transfer. [HPRA 18 July 2024](https://assets.hpra.ie/products/Human/30069/Licence_PA23355-013-004_18072024151857.pdf).
- EFFERALGAN 150 mg rectal: exact product, weight 8–12 kg; conservative automation starts at 3 months. Whole suppositories and the usual 60 mg/kg/day ceiling yield at most three doses below 10 kg and four from 10 kg. These frequency bands are implementation limits derived from the ceiling, not copied age bands. The label's approximate ages do not establish a patient's actual age. [ANSM](https://base-donnees-publique.medicaments.gouv.fr/medicament/64675665/extrait).
- Paracetamol 250 mg rectal: source age/weight bands and whole units; conservative minimum six-hour interval. In the 10–12-year / 30–40-kg band, two suppositories become available only from 100/3 kg so four daily doses stay within 60 mg/kg/day. Lower weights retain one. These are conservative automation limits, not a new label weight band. No automatic splitting. [SmPC](https://www.medicines.org.uk/emc/product/15386/smpc).

These are international clinical formulation references. Exact product identity is enforced for device-specific, modified-release and brand-specific additions; generic formulation guidance does not certify the legal Kosovo indication of every brand. Existing source tables and database snapshots remain unchanged.

## Parsing corrections

Explicit and consistent declarations such as `80 mg/2 mL (40 mg/mL)`, `4 mg/tab`, `2.5 mg/2. 5ml` and correctly grouped million-IU values can now be read. Inconsistent repeated values, malformed commas, missing mL denominators, percentages and unqualified elemental content stay blocked. Colistin vial IU do not become a guessed reconstitution volume. A diclofenac record stating `100 g` is explicitly flagged rather than silently converted to `100 mg`.

The additional 19 entries and their route/age restrictions are documented in [the additions audit](pediatric-market-additions-2026-10-15.md). The original 50-drug source and database audit remain intact.

## Remaining choices

Every choice below remains unavailable for automatic calculation. Source review does not confirm an unavailable local product SmPC, missing composition, or missing clinical context. Vitamin nutrition references do not establish therapeutic injection doses.


### Amoxicillin + Clavulanic

Raporti amoksicilinë/klavulanat ndryshon skemën. Fortësia pa vëllim dhe tabletat pa udhëzim të produktit nuk marrin skemën e suspensionit.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/6671/smpc), [Reference 2](https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=59979859-8c9b-4173-a5e3-2e6312fd9d79).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 875 mg+125 mg | Tabletë | Klavux, AVEGGIO, AMOKSIKLAV ® 2X, Betaklav®, CLAVOMED, Betamox Plus | Pa skemë për produktin |
| 500 mg+125 mg | Tabletë | MOXTIKLAV-BID, DUOCLAV, Co-amoxiclav 500 mg/125 mg film-coated Tablets, AMOKLAVIN BID, PANKLAV | Pa skemë për produktin |
| 1000 mg | Tabletë | Klamoks BID | Të dhëna të paplota |
| 500 mg+125 mg | Tabletë | AMOKSIKLAV® 2X | Pa skemë për produktin |
| 400 mg/57 mg | Shurup / suspension oral | KLAVUNAT BID Fort, Klamoks BID Fort | Të dhëna të paplota |
| 200 mg/28 mg | Shurup / suspension oral | KLAVUNAT BID | Të dhëna të paplota |
| 200 mg+28 mg | Shurup / suspension oral | AMOKLAVIN BID | Të dhëna të paplota |
| (400 mg+57 mg)/5 ml | Shurup / suspension oral | Betaklav® | Pa skemë për produktin |
| 600 mg+42.9 mg | Shurup / suspension oral | Amoklavin ES | Të dhëna të paplota |

### Penicillin G

Prokainë / benzatinë dhe benzilpenicilina e tretshme nuk ndërrohen. Produkti i kombinuar kërkon skemë specifike dhe rrugë IM të konfirmuar.

Sources: [Reference 1](https://sps.nhs.uk/articles/managing-the-risk-of-confusion-between-injectable-penicillin-salts/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 600000 IU+200000 IU | Flakon · pluhur për injeksion | IECILLINE 800.000 IU vial, IECILLINE | Të dhëna të paplota |
| 800000 IU | Flakon · pluhur për injeksion | DEVAPEN | Rrugë / përgatitje specifike |

### Piperacillin + Tazobactam

Totali 2,25 g ose 4,5 g nuk përdoret si masë piperaciline. Duhet konfirmuar përmbajtja e secilit komponent në produktin konkret dhe indikacioni / funksioni renal.

Sources: [Reference 1](https://labeling.pfizer.com/ShowLabeling.aspx?id=16374).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 4.5 g | Flakon · pluhur për injeksion | TAZERACIN, Piperacillin and Tazobactam for injection USP | Të dhëna të paplota |
| 2.25 g | Flakon · pluhur për injeksion | TAZERACIN | Të dhëna të paplota |

### Azithromycin

SmPC i azitromicinës IV nuk përcakton efikasitet / siguri pediatrike. Skema orale nuk transferohet te flakoni IV.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/1276/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 500mg/vial | Flakon · pluhur për injeksion | ZITHROTEL, Azithromycin/Vocate | Përdorim pediatrik i kufizuar |

### Levofloxacin

SmPC evropian e kundërindikon te fëmijët dhe adoleshentët në rritje. Përdorimet e posaçme në udhëzime të tjera nuk janë skemë rutinë pediatrike për këto produkte.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/12130/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 500 mg | Tabletë | Amesol, Levofloxacina Loxadin, Vivex, Levoximed, LEXUR, WOFF, Fovelid®, ALVOLAMID T 500mg, Vivex, LEVONAT, Levofloxacina Aurovitas, FLOXILEVO, EPIFLOXIN, Leflogal, Levo-Denk 500, ravivo, TRISSIL, Fovelid®, Levofloxacina Loxadin, Levofloxacin Aristo 500mg filmtabletten | Përdorim pediatrik i kufizuar |
| 250 mg | Tabletë | ALVOLAMID T 250mg, WOFF, Fovelid®, Fovelid® | Përdorim pediatrik i kufizuar |
| 750 mg | Tabletë | FLOXILEVO, LEBEL, LEXUR | Përdorim pediatrik i kufizuar |
| 5 mg/1 ml | Solucion për infuzion IV | Levofloxacin Kabi 5mg/ml infusionlösung, Levofloxacino NORMON, VLOFINOX, LEVOXIMED, Levoflox-Denk 5 mg/ml | Përdorim pediatrik i kufizuar |
| 500 mg/100 ml | Solucion për infuzion IV | Ravivo | Përdorim pediatrik i kufizuar |

### Cefixime

400 mg mund të përdoret në grupmoshë / peshë të caktuar në etiketën FDA. Etiketa e NEOCEF në regjistër është për të rritur; fletëudhëzimi i këtij produkti nuk është konfirmuar.

Sources: [Reference 1](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b5a3c547-3bc7-4856-af9c-1bead294f5d9).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 400 mg | Tabletë | NEOCEF | Pa skemë për produktin |

### Ceftriaxone

Tretësi me lidokainë përdoret vetëm për IM, asnjëherë IV. Kompleti, përqendrimi pas përgatitjes dhe rruga kërkojnë udhëzimin e produktit.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/15101/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 1 g/3.5 ml | Flakon · pluhur për injeksion | SIRTAP, Valexime, FRINEG, BIXON | Rrugë / përgatitje specifike |
| 1 g | Flakon · pluhur për injeksion | MEDAXONE, MEDAXONE, Rotacef | Rrugë / përgatitje specifike |
| 1 g | Flakon · pluhur për injeksion | DESEFIN, VERACOL 1g IM | Rrugë / përgatitje specifike |
| 0.5 g | Flakon · pluhur për injeksion | DESEFIN | Rrugë / përgatitje specifike |

### Colistin

Nebulizimi dhe IV kanë skema dhe përgatitje të ndryshme. IU për flakon nuk përcakton mL pas rikonstituimit për produktin e inhaluar.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/1094/smpc), [Reference 2](https://www.medicines.org.uk/emc/product/4/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 1000000 IU | Solucion për nebulizim | Colistin/Norma | Të dhëna të paplota |

### Linezolid

Ekziston skemë pediatrike IV në etiketën FDA; kjo nuk konfirmon automatikisht fletëudhëzimin e çdo marke lokale të etiketuar për të rritur.

Sources: [Reference 1](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=870c9600-04d5-4b44-a5b5-02252a310f22).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 2 mg/ml | Solucion për infuzion IV | LINODRIP, LINEZAN | Pa skemë për produktin |

### Diclofenac

Kufijtë ndryshojnë sipas produktit, rrugës, moshës dhe indikacionit. Skema e supozitorit 12,5 / 25 mg nuk transferohet te 50 / 100 mg, tableta gastrorezistente ose ampula.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/1044/smpc), [Reference 2](https://medicinesauthority.gov.mt/file.ashx?f=3D8AF585FC0135353842E97B262BC199B2BFC8669CFDD15C).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 100 mg | Supozitor | Diclo-Denk 100 Rectal, VURDON, Diclofenak, FLOGOFEN, Voltaren, DIKLOFENAK | Pa skemë për produktin |
| 50 mg | Supozitor | VURDON, Diclofenak, Voltaren | Pa skemë për produktin |
| 100 g | Supozitor | Diclofenac Dr. Müller Pharma 100 mg suppositories | Fortësi e pasaktë |
| 75 mg/3 ml (25 mg/ml) | Solucion për injeksion | DICLOFENAC SODIUM INJECTION 75MG/3ML, NAKLOFEN ®, DICLOFENAC SODIUM INJECTION, Diklofen, DICLOFENAC, DIKLOFENAK, Voltaren, Dits-25 | Pa skemë për produktin |
| 75 mg/3 ml | Solucion për injeksion | DIKLORON, VURDON, ALMIRAL, ALMIRAL | Pa skemë për produktin |
| 75 mg/3 ml | Solucion për injeksion | Diklofenak HF, Diclofenac Sodium Injection | Pa skemë për produktin |
| 100 mg | Tabletë me çlirim të zgjatur | Diclo-Denk 100 Retard, Difen®, DICLOFENAC RETARD, Diclofen® Retard, DIKLOFEN RETARD, Diklofen | Pa skemë për produktin |
| 50 mg | Tabletë gastrorezistente | Diklofenak HF, Voltaren | Pa skemë për produktin |
| 50 mg | Tabletë gastrorezistente | DICLOFEN | Pa skemë për produktin |
| 100 mg | Tabletë gastrorezistente | Difenak | Pa skemë për produktin |
| 50 mg | Tabletë | DIKLOFENAK FORTE | Pa skemë për produktin |
| 75 mg | Tabletë | Dikloron SR | Pa skemë për produktin |
| 100 mg | Tabletë | DIKLOFENAK RETARD | Pa skemë për produktin |
| 75 mg | Tabletë me çlirim të modifikuar | Rapten duo, Voltaren SR | Pa skemë për produktin |
| 100 mg | Tabletë me çlirim të modifikuar | Diklofenak forte HF | Pa skemë për produktin |
| 75 mg | Kapsulë · çlirim i modifikuar | DICLO RAPID®, DICLO DUO® | Pa skemë për produktin |
| 75 mg | Kapsulë | NAKLOFEN DUO, DICLONAC DUO | Pa skemë për produktin |
| 50 mg | Pluhur për tretje · qese | Clofast | Pa skemë për produktin |
| 100 mg | Tabletë me çlirim të modifikuar | Vurdon, DIKLORON | Pa skemë për produktin |
| 50 mg | Tabletë gastrorezistente | DIKLORON | Pa skemë për produktin |
| 50 mg/ml | Shurup / suspension oral | Eminocs | Pa skemë për produktin |

### Ibuprofen

Formulimi dhe fortësia përcaktojnë kufijtë. Skema e shurupit nuk konfirmon automatikisht tabletën 800 mg ose kapsulën 600 mg; duhet SmPC i produktit.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/1730/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 400 mg | Tabletë | BlokMax® Rapid, BlokMax® Rapid | Pa skemë për produktin |
| 800 mg | Tabletë | Ibuprofen Atid | Pa skemë për produktin |
| 600 mg | Kapsulë | IBUM SUPERMAX | Pa skemë për produktin |

### Paracetamol

Supozitorët kanë kufij të veçantë peshe dhe përdoren të plotë. Paketimet IV kanë kufij të veçantë; një përqendrim i njëjtë nuk konfirmon çdo markë / paketim.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/15386/smpc), [Reference 2](https://base-donnees-publique.medicaments.gouv.fr/medicament/64675665/extrait), [Reference 3](https://www.medicines.org.uk/emc/product/15148/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 80mg | Supozitor | PARACETAMOL, EFFERALGAN | Pa skemë për produktin |
| 300 mg | Supozitor | Termostop, PARAMOL | Pa skemë për produktin |
| 500 mg | Supozitor | ARFEN, TACHIPIRINA | Pa skemë për produktin |
| 100 mg | Supozitor | Termostop | Pa skemë për produktin |
| 150mg | Supozitor | PARACETAMOL | Pa skemë për produktin |
| 750 mg | Tabletë | TERMOSTOP FORTE, Dolofix Forte | Pa skemë për produktin |
| 1000 mg | Tabletë | ben-u-ron® 1000 mg Tabletten | Pa skemë për produktin |
| 1 g/100 ml | Solucion për infuzion IV | PARTEMOL, PARACETAMOL KABI, Paracetamol Solution for Intravenous Infusion, Neximol, PARACEROL, Apotel Max | Pa skemë për produktin |
| 10 mg/ ml | Solucion për infuzion IV | PAROL | Pa skemë për produktin |
| 10 mg/1 ml | Solucion për infuzion IV | PARACETAMOL KABI | Pa skemë për produktin |
| 600 mg/5 g | Pluhur për tretje · qese | Grippostad Heißgetränk | Të dhëna të paplota |

### Ketoprofen

Ketonal forte 100 mg ka skemë për të rritur; vetëm në 18 vjeç këtu. Fortësitë e kripës lysine dhe produktet e tjera nuk marrin automatikisht këtë skemë. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://halmed.hr/upl/lijekovi/SPC/Ketonal-forte-SPC.pdf).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 80 mg | Pluhur për tretje · qese | KELIS, Fans, PRO ®, Okidol | Pa skemë për produktin |
| 40 mg | Granula orale · qese | OKITASK, OKITASK | Pa skemë për produktin |
| 50 mg | Granula orale · qese | Ketonal Akut Rapid, Dolpirinn | Pa skemë për produktin |
| 80 mg | Pluhur për tretje · qese | Ardbeg | Pa skemë për produktin |
| 100mg/2ml | Solucion për injeksion | Ketoprofen | Pa skemë për produktin |
| 100 mg/2 ml | Solucion për injeksion | Ketoprofen Rompharm | Pa skemë për produktin |
| 160 mg/2 ml | Solucion për injeksion | Dolomed | Pa skemë për produktin |
| 160 mg/2 ml | Solucion për injeksion | ARTROSILENE | Pa skemë për produktin |
| 80 mg | Shurup / suspension oral | OKI | Të dhëna të paplota |
| 100 mg | Supozitor | KETONAL ® | Pa skemë për produktin |
| 100 mg/2 ml | Solucion për injeksion / infuzion | KETONAL ® | Pa skemë për produktin |
| 50 mg | Kapsulë | KETONAL ® | Pa skemë për produktin |

### Ketorolac

Dozë fillestare parenterale pas operacionit nga 16 vjeç, në spital. Jo përdorim rutinë pediatrik ose transferim te forma orale. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://www.medicines.org.uk/emc/files/pil.11547.pdf).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 30 mg/1 ml | Solucion për injeksion | BENKETOL, Ketromine, Kevindol | Pa skemë për produktin |
| 30 mg/1 ml | Solucion për injeksion | Zodol | Pa skemë për produktin |
| 30 mg/1 ml | Solucion për injeksion | EUMAT | Pa skemë për produktin |
| 10 mg | Tabletë | Ketorol | Pa skemë për produktin |
| 10 mg | Tabletë | Zodol | Pa skemë për produktin |
| 20 mg/1 ml | Pika orale | BENKETOL | Pa skemë për produktin |

### Domperidone

Përdorimi kërkon njëkohësisht moshën ≥12 vjeç dhe peshën ≥35 kg, me kufizime kardiake / ndërveprimesh. Fletëudhëzimi i PEPTOMET duhet konfirmuar veçmas.

Sources: [Reference 1](https://www.gov.uk/drug-safety-update/domperidone-for-nausea-and-vomiting-lack-of-efficacy-in-children-reminder-of-contraindications-in-adults-and-adolescents).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 10 mg | Tabletë | Peptomet | Pa skemë për produktin |

### Chloropyramine hydrochloride

Suprastin dhe Synopen kanë përqendrime dhe skema të veçanta. Nuk është chlorphenamine / CPM; nuk është trajtimi i parë i anafilaksisë. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ogyei.gov.hu/kiseroirat/ah/ah_0000010622_20240129155938.doc), [Reference 2](https://halmed.hr/upl/lijekovi/SPC/SPC_UP-I-530-09-17-02-197.pdf).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 10 mg/1 ml | Solucion për injeksion | Allergosan 10mg/ml solution for injection | Pa skemë për produktin |

### Acyclovir

Etiketa FDA përfshin variçelën nga 2 vjeç. Produkti HERPEX 400 mg mbetet pa fletëudhëzim të konfirmuar; rruga, indikacioni, njësitë e plota dhe funksioni renal duhen verifikuar.

Sources: [Reference 1](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=37a51d9c-1f39-4065-8c7d-6528ac6de91c).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 400 mg | Tabletë | Herpex | Pa skemë për produktin |

### Salbutamol

Shurupi, tableta, nebulizimi dhe inhalatori nuk ndërrohen. Pajisja duhet identifikuar saktë; dy inhalatorë 100 mcg mund të kenë kufij të ndryshëm ditorë.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/854/smpc), [Reference 2](https://cima.aemps.es/cima/dochtml/ft/65850/FichaTecnica_65850.html), [Reference 3](https://devacomtr.s3.eu-west-2.amazonaws.com/urunler/kub/salres-100-mcg-spc.pdf).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 5MG/ML | Inhalator | Broncholin S Respiratory Solution | Pa skemë për produktin |
| 2 mg | Tabletë | Salbutamol, Ontril | Pa skemë për produktin |

### Montelukast

Etiketa e kontrolluar për 10 mg është nga 15 vjeç dhe përfshin paralajmërime neuropsikiatrike. Fletëudhëzimi i MONTOL 10 mg nuk është konfirmuar; nuk përdoret për krizë akute.

Sources: [Reference 1](https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6d69e73a-76cb-4ece-9cf9-e9adb4f523b4).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 10 mg | Tabletë | Montol | Pa skemë për produktin |

### Dexamethasone

Skema të veçanta për krup. Doza shprehet si bazë; ampulat e fosfatit kërkojnë ekuivalencë të konfirmuar për produktin. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://www.rch.org.au/clinicalguide/guideline_index/Croup_Laryngotracheobronchitis/), [Reference 2](https://www.medicines.org.uk/emc/product/11015/smpc), [Reference 3](https://cima.aemps.es/cima/dochtml/ft/67455/FT_67455.html), [Reference 4](https://www.alims.gov.rs/doc_file/lekovi/pil/000010495%202024%2059010%20007%20000%20515%20002%2004%20001.pdf), [Reference 5](https://www.leedsformulary.nhs.uk/docs/Dexamethasone%20Medusa%20Poster%20-%20paediatric%20oncology.pdf).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 4 mg/1 ml | Solucion për injeksion | WYNFLADEX-4, DEXAMETHASONE SODIUM PHOSPHATE INJECTION USP, Dexamethasone Sodium Phosphate Injection USP, Dexametcare, Dexadron, DEXAMETHASON | Pa skemë për produktin |
| 8 mg/2 ml | Solucion për injeksion | DEKORT, DEXON, PRODEXA 4, Dexamethasone Sodium Phosphate Injection BP | Pa skemë për produktin |
| 8 mg/2 ml | Solucion për injeksion | Onadron | Pa skemë për produktin |
| 10 mg/5 ml (2 mg/ml) | Shurup / suspension oral | SUOMICON | Pa skemë për produktin |
| 20 mg/5 ml (4 mg/ml) | Shurup / suspension oral | SUOMICON | Pa skemë për produktin |
| 0.5 mg | Tabletë | DEKORT | Pa skemë për produktin |
| 4 mg/ml | Solucion për injeksion / infuzion | Dexamethason Krka, DEXAMED | Pa skemë për produktin |
| 2 mg/1 ml | Pika orale | DECADRON | Pa skemë për produktin |

### Methylprednisolone

Astmë: kurs oral i shkurtër dhe dozë fillestare IV janë skema të ndara; sodium succinate nuk zëvendësohet me acetate / depot. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://www.nhlbi.nih.gov/sites/default/files/media/docs/asthgdln_1.pdf), [Reference 2](https://cps.ca/uploads/documents/Table_2._Medications_and_dosages_for_acute_asthma_treatments_by_health_care_providers_in_children_older_than_1_year_.docx_.pdf), [Reference 3](https://labeling.pfizer.com/showlabeling.aspx?id=648).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 40 mg | Flakon · pluhur për injeksion | PREDNOL-L, URBASON, Lemod solu | Pa skemë për produktin |
| 20 mg | Flakon · pluhur për injeksion | PREDNOL-L | Pa skemë për produktin |
| 20 mg/1 ml | Flakon · pluhur për injeksion | LEMOD SOLU | Pa skemë për produktin |
| 40 mg | Flakon · pluhur për injeksion | METHYLPREDNISOLONE CIRON | Pa skemë për produktin |
| 40 mg/vial | Flakon · pluhur për injeksion | LYO-DROL | Pa skemë për produktin |
| 125 mg/vial | Flakon · pluhur për injeksion | LYO-DROL | Pa skemë për produktin |
| 500 mg/vial | Flakon · pluhur për injeksion | LYO-DROL | Pa skemë për produktin |
| 1000 mg/vial | Flakon · pluhur për injeksion | LYO-DROL | Pa skemë për produktin |

### Pantoprazole

Tableta gastrorezistente dhe IV kanë kufij të ndryshëm. Për IV nuk është përcaktuar skemë pediatrike në SmPC e kontrolluar; tabletat kërkojnë udhëzimin e produktit.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/11068/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 40 mg | Tabletë gastrorezistente | PANTAP, PANCLEUS, Pantrazol, Pantorex, Panto-Denk 40, Pantactive, PANDEV, INIPANT, FENIX, Pantoprazol Aristo 40 mg magensaftresistente Tabletten, PANDEV, Pepticaid, Pantoprazol Genericon 40mg, ULSEPAN, Pantoprazol PharmaS, Pantoprazole 40mg Gastro-resistant Tablets, Pantoprazol Aristo 40 mg magensaftresistente Tabletten, Protech, PROTOPEN, ACIPAN, Panthec-sanovel, ULCOREKS | Pa skemë për produktin |
| 20 mg | Tabletë gastrorezistente | Panthec-sanovel, PANDEV, Pantoprazol PharmaS, Pantoprazole 20mg Gastro-resistant Tablets, Pantrazol, Pantoprazol Aristo 20 mg magensaftresistente Tabletten, Panto-Denk 20, PROTOPEN, ACIPAN, Pepticaid, Pantoprazol Aristo 20 mg magensaftresistente Tabletten, FENIX | Pa skemë për produktin |
| 20 mg | Tabletë gastrorezistente | PANTOPRAZOL | Pa skemë për produktin |
| 40 mg | Flakon · pluhur për injeksion | Umepenta-40, Pantoprazole Sodium, Pantoprazol, Pandev, PantopraCare, ULSEPAN, Pantoprazol Normogen, ZYGOSIS 40 mg, PROGAS, Nolpaza®, Ulceron, PANTOPRAZOL Azevedos | Përdorim pediatrik i kufizuar |
| 40 mg | Flakon · pluhur për injeksion | PANTOZOL | Përdorim pediatrik i kufizuar |
| 40 mg | Flakon · pluhur për injeksion | Panonex | Përdorim pediatrik i kufizuar |
| 40 mg/10 ml | Flakon · pluhur për injeksion | Pantraz BPL | Përdorim pediatrik i kufizuar |
| 40 mg | Tabletë | PROTONEX | Pa skemë për produktin |

### Lansoprazole

SmPC evropian i kontrolluar nuk e rekomandon te fëmijët për mungesë të dhënash. Etiketat ndërkombëtare të produkteve të tjera nuk autorizojnë automatikisht këto kapsula ose IV.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/14550/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 30 mg | Kapsulë | DEGASTROL, LANZUL®, LANSOR-SANOVEL | Përdorim pediatrik i kufizuar |
| 15 mg | Kapsulë | LANZUL® S, DEGASTROL | Përdorim pediatrik i kufizuar |
| 30 mg | Kapsulë · çlirim i modifikuar | PRALANZO, LANCIPROL, PROLANZOL | Përdorim pediatrik i kufizuar |
| 15 mg | Kapsulë · çlirim i modifikuar | PRALANZO | Përdorim pediatrik i kufizuar |
| 30mg | Flakon · pluhur për injeksion | Lansoprazol for injection | Përdorim pediatrik i kufizuar |

### Iron

Doza llogaritet me hekurin elementar. HEFEROL 350 mg përmban 115 mg Fe; kjo përmbajtje nuk transferohet te markat, kripërat ose kombinimet e tjera.

Sources: [Reference 1](https://www.halmed.hr/upl/lijekovi/SPC/Heferol-SPC.pdf), [Reference 2](https://www.uni-pharma.gr/en/nonprescriptive/hemafer-5/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 350 mg | Kapsulë | HEFEROL ® | Të dhëna të paplota |
| 50 mg+30 mg | Kapsulë | Timoferol | Të dhëna të paplota |
| 100 mg | Tabletë përtypëse | Hemafer | Të dhëna të paplota |
| 50 mg/5 mL | Shurup / suspension oral | Hemoferin | Të dhëna të paplota |
| 100 mg | Tabletë | Ferro AIWA 100 mg Filmtabletten | Të dhëna të paplota |

### Calcium

Kalciumi glukonat nuk barazohet me kalciumin elementar. Doza IV kërkon indikacion, analiza, hollim, ritëm dhe monitorim EKG; pesha e vetme nuk mjafton.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/6264/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 0.1 | Solucion për injeksion | Calcium Gluconate / cooper | Të dhëna të paplota |
| 1000 mg/10 mL (100 mg/mL) | Solucion për injeksion | GLUKAPRO | Kërkon monitorim |
| 10 % | Solucion për injeksion / infuzion | Calcium ' Fresenius' | Të dhëna të paplota |

### Multivitamins + minerals

Multivitamina me / pa minerale; produktet kanë përbërje të ndryshme, prandaj doza është specifike për produktin. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/MVMS-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 900 IU+100 IU+50 mg+1 mg+1 mg+0.60 mg+5 mg+2 mg+1 mcg | Shurup / suspension oral | PIKOVIT ® | Skemë për kombinimin |
| / | Tabletë | DUOVIT® | Skemë për kombinimin |

### Vitamin D3 · Cholecalciferol

D3: profilaksia dhe trajtimi i mungesës janë skema të ndryshme. Vetëm pikatori i produktit të konfirmuar jep numër pikash. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://medikamente.basg.gv.at/documents/10989__DOTC_GEBR_INFO.pdf), [Reference 2](https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 25,000 IU/ml | Shurup / suspension oral | CONTRESOL, CONTRESOL | Pa skemë për produktin |
| 100,000 IU/ml | Shurup / suspension oral | CONTRESOL, CONTRESOL | Pa skemë për produktin |
| 25000 IU/2.5 ml | Shurup / suspension oral | ANNISTER, ANNISTER | Pa skemë për produktin |
| 50000I.U/5.0 ml | Shurup / suspension oral | ANNISTER | Të dhëna të paplota |
| 25,000 IU | Shurup / suspension oral | Dipront | Të dhëna të paplota |
| 50.0000 U.I. | Shurup / suspension oral | MEDIVID | Të dhëna të paplota |
| 250000 IU/1 ml | Shurup / suspension oral | LECALCIF | Pa skemë për produktin |
| 14400 I.U/ml | Pika orale | VITAMINA D3 | Të dhëna të paplota |
| 10.000 IU/ML | Pika orale | CONTRESOL | Të dhëna të paplota |
| 15000 IU/1 ml | Pika orale | Coledan | Pa skemë për produktin |
| 50000 IU/15 ml | Pika orale | Devit-3 | Pa skemë për produktin |
| 1000 IU | Kapsulë | DEVIT-3 | Pa skemë për produktin |
| 2000 IU | Kapsulë | DEVIT-3 | Pa skemë për produktin |
| 10000 IU | Kapsulë | DEVIT-3 | Pa skemë për produktin |
| 20000 IU | Kapsulë | DEVIT-3 | Pa skemë për produktin |
| 50000 IU | Kapsulë | DEVIT-3 | Pa skemë për produktin |
| 200 000 I.U/ml | Solucion për injeksion | VITAMINA D3 | Të dhëna të paplota |
| 300 000 IU/ml | Solucion për injeksion | VITAMINA D3 | Të dhëna të paplota |
| 300000 IU / mL | Solucion për injeksion | DEVIT-3 | Pa skemë për produktin |

### Calcitriol · vitamin D active

Kalcitrioli është vitaminë D aktive, jo suplement D3; kërkon kalcium / fosfat, funksion renal dhe monitorim specialistik. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 1 mcg/1 ml | Solucion për injeksion | OSTRIOL | Kërkon protokoll specifik |
| 2 mcg/1 ml | Solucion për injeksion | OSTRIOL | Kërkon protokoll specifik |
| 0.25 mcg | Kapsulë | Qalyviz | Kërkon protokoll specifik |
| 0.5 mcg | Kapsulë | Qalyviz | Kërkon protokoll specifik |

### Vitamin B1 · Thiamine

Tiamina: mungesa ushqyese dhe indikacionet neurologjike kanë skema të ndryshme. Injeksioni kërkon protokoll specifik. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/Thiamin-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 5 % | Solucion për injeksion | VITAMINE B1 | Të dhëna të paplota |

### Vitamins B1 + B6 + B12

Kombinime me doza të larta; jo të këmbyeshme me vitamina individuale. Disa ampula përmbajnë edhe lidokainë. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/VitaminB6-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 0.3 mg+100 mg+200 mg | Tabletë | Ancopir | Skemë për kombinimin |
| 100 mg+200 mg+0.2 mg | Tabletë | Neuromultivit | Skemë për kombinimin |
| 250 mg+250 mg+1 mg | Tabletë | 3BE | Skemë për kombinimin |
| 250 mg+250 mg+500 mcg | Tabletë | VITAGOBENS | Skemë për kombinimin |
| 1 mg+50 mg+200 mg+10 mg | Solucion për injeksion | Ancopir | Skemë për kombinimin |

### Vitamin B complex

B-kompleks: përbërja ndryshon sipas produktit; mL ose numri i ampulave nuk llogaritet nga një vitaminë e vetme. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/Thiamin-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| (10 mg+4 mg+4 mg+40 mg+6 mg)/2 ml | Solucion për injeksion | Evaton-B | Skemë për kombinimin |
| (20 mg + 2 mg + 2 mg + 30 mg + 1 mg)/2 mL | Solucion për injeksion | Vitamin B Complex | Skemë për kombinimin |
| (50 mg+4 mg+10 mg+100 mg+5 mg)/2 ml | Solucion për injeksion | Combivit Injection | Skemë për kombinimin |
| 11 mg+3.8 mg+110 mg+6 mg+3.8 mg | Solucion për injeksion | Multivit-B-forte | Skemë për kombinimin |
| 2 ml | Solucion për injeksion | Vitamin B Complex Injection | Skemë për kombinimin |
| 5.5 mg +0.95 mg+ 27.5 mg+2.0 mg+1.9 mg | Solucion për injeksion | Multivit-B | Skemë për kombinimin |
| 4 mg+5 mg+2 mg+0.001 mg+5 mg+25 mg | Tabletë | B-complex | Skemë për kombinimin |
| 5 mg+2 mg+2 mg+30mg | Tabletë | Vitamin B Kompleks | Skemë për kombinimin |
| 40 mg+4 mg+8 mg+100 mg+10 mg+0.004 mg | Flakon · pluhur për injeksion | Beviplex | Skemë për kombinimin |

### Vitamin C · Ascorbic acid

Vitamina C: doza varet nga indikacioni dhe rruga; mos e barazo nevojën ditore ushqyese me dozën terapeutike IV. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 100 mg/1 ml | Solucion për injeksion | Cevital, Vitamin C, Acmel 500 mg/5 ml IM/IV, VITAMINE C, Brucee-500 | Pa skemë për produktin |
| 100 mg/2 ml | Solucion për injeksion | VITAMINE C | Pa skemë për produktin |
| 500 mg/2 ml | Solucion për injeksion | VitCCare | Pa skemë për produktin |
| 50 mg | Tabletë | VITAMIN C | Pa skemë për produktin |
| 500 mg | Tabletë | VITAMIN C | Pa skemë për produktin |
| 500 mg | Tabletë gastrorezistente | VITAMIN C | Pa skemë për produktin |
| 50 mg/5 ml | Shurup / suspension oral | vitamin c | Pa skemë për produktin |

### Vitamin B6 · Pyridoxine

B6: doza varet nga shkaku i mungesës dhe terapia shoqëruese; përdorimi i lartë / afatgjatë mund të shkaktojë neuropati. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/VitaminB6-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 20 mg | Tabletë | Bedoxin | Pa skemë për produktin |
| 25 mg | Tabletë | VITAMINA B6 | Pa skemë për produktin |
| 5% (50 mg/mL; 100 mg/2 mL) | Solucion për injeksion | VITAMINA B6 | Të dhëna të paplota |
| 50 mg/2 ml | Solucion për injeksion | Bedoxin | Pa skemë për produktin |

### Calcium + vitamin D3

Kombinim kalciumi / D3 me popullatë për të rritur në regjistër; jo skemë pediatrike e përgjithshme sipas peshës. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 1,000 mg/22 microgram | Tabletë eferveshente | Calci D3-Denk 1000 mg / 880 I.E. Brausetabletten | Skemë për kombinimin |
| 500 mg+400 IU | Tabletë përtypëse | IDEOS | Skemë për kombinimin |

### Vitamin K1 · Phytomenadione

K1: profilaksia neonatale, gjakderdhja dhe antagonizimi i antikoagulantëve janë protokolle të ndryshme; kërkohet formulimi / rruga e saktë. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/VitaminK-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 10 mg/1 ml | Solucion për injeksion | Synervita | Kërkon protokoll specifik |

### Vitamin B12 · Cyanocobalamin

B12: trajtimi varet nga diagnoza, shkaku, neurologjia dhe skema e mirëmbajtjes; nuk përcaktohet vetëm nga pesha. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 500 mcg/1 ml | Solucion për injeksion | VITAMIN B12 ALKALOID®, VITAMINE B12 | Pa skemë për produktin |
| 100 mcg/1 ml | Solucion për injeksion | VITAMIN B12 | Pa skemë për produktin |

### Vitamin B12 · Hydroxocobalamin

Hidroksokobalamina nuk merr automatikisht skemën e cianokobalaminës; kërkohet diagnoza dhe protokolli i produktit. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 2500 mcg/2 ml | Solucion për injeksion | OHB12 | Pa skemë për produktin |

### Vitamin B9 · Folic acid

Acidi folik: skemë për mungesë të konfirmuar, pasi është vlerësuar mungesa e vitaminës B12; jo dozë e përgjithshme suplementimi. Për variantet pa skemë aktive kërkohet udhëzimi i produktit dhe konteksti klinik; nuk jepet një dozë e hamendësuar.

Sources: [Reference 1](https://www.medicines.org.uk/emc/product/6998/smpc).

| Strength | Form | Product(s) | Outcome |
|---|---|---|---|
| 5 mg | Tabletë | FOLACIN | Pa skemë për produktin |

## Validation

Local build passed; all 204 test files passed, including 8,394 original-rule parity points and the new additions tests. All 20 AKKPM browser scenarios passed in Chromium and WebKit (40 executions), including 320/390px phone and 1440px desktop flows. Publication additionally requires the repository CI checks.
