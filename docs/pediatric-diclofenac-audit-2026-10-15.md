# Diclofenac formulation and indication audit — 2026-10-15

The 50 mg oral choice in the reported screenshot came from unit-dose powders in sachets. It was incorrectly grouped under syrup/oral suspension. Unit-dose oral powder/granules in sachet packaging without an mL denominator now use a whole-sachet formulation. Multidose powder for suspension with an explicit mg/mL strength remains a liquid; a sachet never acquires an inferred mL concentration.

The reported 12 kg, 24 month patient selected the base postoperative option. That existing option is for ages 6–12, while juvenile arthritis is a distinct indication. The original source options and their numerical boundaries remain immutable. Their restrictions are now visible beside the selected indication and returned in the server's eligibility error.

## Product-specific additions

1. **Voltaren 12.5 mg suppositories, registry 2489.** The Malta regulator's June 2024 SmPC provides acute POP/ENT dosing from age two and 13 kg, including the 13–19 kg / 2–5 year band. The added option is limited to 24–<72 months and 13–<20 kg, with one whole 12.5 mg suppository per administration. It is for pain with inflammation after surgery or in ENT; fever alone is excluded. The source's 2 mg/kg/day ceiling and whole-unit constraint produce a conservative maximum of two administrations below 18.75 kg and three from 18.75 kg. This threshold is an implementation derivation, not an additional source age/weight band. Contraindication confirmation is required. The 12 kg example remains outside this option.

Source: https://medicinesauthority.gov.mt/file.ashx?f=3D8AF585FC0135353842E97B262BC199B2BFC8669CFDD15C

2. **VOLTFAST 50 mg powder for oral solution, registry 2492.** The manufacturer information provides adolescent dosing from age 14: 50–100 mg/day in one or two administrations. The option uses one whole 50 mg sachet per administration, 1–2/day, with a 100 mg daily ceiling, within the calculator's age range through 18 years. It excludes adolescent migraine, does not infer mL or partial sachets, and includes short-course preparation instructions and contraindication confirmation.

Source: https://prod1.novartis.com/sg-en/sites/novartis_sg/files/Voltfast-Aug2025.SIN-app281125-pdf.pdf
Supporting regulator formulary: https://www.ndf.gov.sg/about-drugs/product-information/sin13913p/

## Scope and verification

These are international product references linked to matching AKKPM registry identities, not a declaration of Kosovo label authorization. Both audits require the exact UUID, registry number, name, active substance, ATC, strength, form, packaging and recorded population tag. VOLTFAST's broad `Adult only` registry tag is retained; an explicit product-specific adolescent evidence note explains the exception. No other product inherits it. Republishing or changing the identity invalidates that option. No published database rows or immutable clinical source tables were changed.

Tests cover whole-sachet versus multidose-liquid classification; the reported age/weight rejection with a precise explanation; separate arthritis/postoperative indications; 2-year/13 kg and 14-year boundaries; the 18.75 kg frequency threshold and daily cap; actual-age and contraindication confirmations; altered product fields; route isolation; and mobile/desktop presentation.
