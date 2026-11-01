# Antibiotic ATC / exact-product review — 2026-11-01

Scope: antibiotic class navigation, registry provenance and the exact Ospen
products used by the sinusitis calculator. No patient records or database
mutations are included.

## Classification and registry

- Classification reference: [WHO ATC J01](https://atcddd.fhi.no/atc_ddd_index/?code=J01&showdescription=yes).
  The existing registry query scopes are shared by server and browser. Actual
  product ATC codes are retained in the response. Topical D06 products remain
  distinct. DDD values never determine a patient's dose.
- Navigation points to complete existing cards. It does not reorder first-line
  treatment, split combined regimens or remove escalation / allergy messages.
- Exact AKKPM identities already read from the published registry on 2026-10-30:
  OSPEN 1.0 registry 2947, UUID `237f3733-de55-486a-9309-a357f87e2daa`;
  OSPEN 1.5 registry 2946, UUID `069016da-1fa5-432b-87c2-ab6a9b558241`.
  Identity, substance, form, strength and population must all match. Similar names
  and other IU products do not inherit this product verification.

## Product and complete clinical protocol

- [Austrian Ospen SmPC, December 2025](https://medikamente.basg.gv.at/documents/15535__DOTC_FACH_INFO.pdf):
  1.0 and 1.5 million IU tablets have approximately 590 and 885 mg of
  phenoxymethylpenicillin respectively. Equal halves are supported for these
  exact tablets. These mass values are informational, not a universal conversion
  or a way to round the fixed NICE dose. Product age/weight boundaries remain
  enforced; young children should preferentially use suitable liquids.
- [Danish acute sinusitis handbook, updated 2026-10-07](https://www.sundhed.dk/sundhedsfaglig/laegehaandbogen/oere-naese-hals/tilstande-og-sygdomme/naese-og-bihuler/bihulebetaendelse-akut/):
  use the IU arm only: adults 1 million IU four times daily; children
  50,000–100,000 IU/kg/day in three or four doses, for 5–7 days. The program sets
  five days for uncomplicated sinusitis. Reassessment is required if improvement
  is absent after 3–5 days. Pediatric bounds are intersected with the exact product
  SmPC; four doses are preferred if representable, otherwise three. No dose is
  rounded outside the resulting limits.
- [Official regional primary-care antibiotic guide, November 2025](https://www.sundhed.dk/content/cms/21/103521_20251125-antibiotikavejledning-for-primrsektoren.pdf),
  acute sinusitis: independently supports the adult IU schedule with five days.
- [NICE NG79](https://www.nice.org.uk/guidance/ng79/chapter/recommendations)
  remains a separate mg-based protocol. Selecting a verified Ospen product
  deliberately switches the Penicillin V card to the complete Danish IU
  protocol, including its frequency and automatic course. Alternatives retain
  their explicitly labelled source. No NICE dose is relabelled as an IU dose.
- Adult Ospen 1.0 yields one tablet per dose and 20 tablets for this course.
  Ospen 1.5 cannot represent that fixed dose with verified whole/half tablets;
  automatic prescription is blocked. Existing GAS courses remain ten days.

## Verification

Regression coverage includes exact identities, unsupported products, fixed and
pediatric bounds, whole/half tablet representability, automatic duration resistant
to caller override, source switching, ATC navigation without therapeutic
reordering, and 320/390/1440px Chromium and WebKit layouts. Unavailable evidence
remains blocked rather than being presented as a verified calculation.
