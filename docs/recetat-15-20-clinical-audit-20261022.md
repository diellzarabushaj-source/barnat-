# Recetat: clinical reconciliation for chapters 15–20

Checked on 22 October 2026. All 140 published guide revisions match the read-only source snapshot. A format-preserving DOCX comparison covered 3,334 source paragraphs and found zero guide changes required. The book's clinical annotations and current primary guidance were reconciled separately from the original prescription wording.

## Coverage and behavior

| Chapter | Source guides | Treatment of this release |
| --- | ---: | --- |
| 15, Psychiatry | 24 | Existing clinical overlay checked against the matching source revision and NICE guidance; retained |
| 16, Dermatology | 44 | 41 clinical overlays; 3 pending editorial guides remain pending |
| 17, Surgery | 14 | 14 clinical overlays |
| 18, Ophthalmology | 15 | 15 clinical overlays |
| 19, ENT | 26 | 26 clinical overlays |
| 20, Spine/neurosurgery | 17 | 17 clinical overlays |

Across these chapters, 57 plans contain structured treatment or supportive steps and 80 require patient-specific planning. The latter open an empty treatment draft; they never copy the original regimen as a prescription. Three pending source guides are not activated. Existing patient drafts remain protected from replacement.

The new chapters 16–20 dataset contains 113 overlays, including 50 structured plans and 63 individual plans. Runtime composition uses these instead of the 14 overlapping legacy records. The existing public legacy dataset and its 44 chapter 21–22 corrections are retained unchanged. Canonical IDs, source paragraphs, source order, connectors and editorial status are unchanged. Clinical enrichment remains conditional on both an exact semantic source fingerprint and verified editorial status; changed or pending sources fail closed. Editorial fidelity is not independent clinical certification.

## Material corrections

- Severe acne 16.4 is correctly associated with isotretinoin assessment, replacing the earlier erroneous atopic-dermatitis clarification. Isotretinoin and tetracyclines are not combined. Acne 16.3 explicitly combines its selected topical and oral treatment.
- Scabies regimens distinguish ordinary and crusted disease. Antihistamines are not routinely duplicated. Nail courses distinguish fingers and toes; topical/systemic formulations, steroid strength, skin site and follow-up are explicit.
- Anal fissure treatment identifies glyceryl trinitrate 4 mg/g (0.4%), the measured application, interval, maximum course and nitrate/PDE5 contraindications. Acute-abdominal plans separate source control from antibiotic selection and remove routine laxatives/prokinetics in suspected mechanical obstruction.
- Ophthalmic plans distinguish eye and skin formulations, exact concentrations and frequencies. Aciclovir eye ointment continues after healing. Chemical injury irrigation follows stable physiological pH; emergency glaucoma remains specialist-led.
- ENT plans separate penicillin alternatives, antibiotic eligibility, nasal micrograms, eye/ear routes and tympanic-membrane assessment. The specified ciprofloxacin/dexamethasone otic product uses four drops twice daily for seven days and its leaflet's five-minute position after instillation.
- Low-back/sciatica plans prioritize activity and review, without automatic oral steroids, gabapentinoids or benzodiazepines. Cervical radiculopathy is considered separately. Cranial emergencies, aneurysmal versus traumatic SAH, brain abscess and hydrocephalus retain explicit specialist scope.

## Primary references

Each overlay links its relevant primary references in the closed question-mark disclosure. Representative references are [NICE acne NG198](https://www.nice.org.uk/guidance/ng198/chapter/Recommendations), [Rectogesic SmPC](https://www.medicines.org.uk/emc/product/3933/smpc), [moxifloxacin eye-drop SmPC](https://www.medicines.org.uk/emc/product/14019/smpc), [mometasone nasal SmPC](https://www.medicines.org.uk/emc/product/5224/smpc), [otic-product leaflet](https://www.medicines.org.uk/emc/product/101381/pil), [CDC streptococcal pharyngitis](https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html), [NICE sinusitis NG79](https://www.nice.org.uk/guidance/ng79/chapter/Recommendations), [NICE sciatica NG59](https://www.nice.org.uk/guidance/ng59/chapter/Recommendations), [Brain Trauma Foundation](https://braintrauma.org/coma/guidelines/severe-tbi) and [ESCMID brain abscess guidance](https://doi.org/10.1016/j.cmi.2023.08.016).

## Validation

- 140 real-source revision and semantic-fingerprint checks; zero source edits, three pending guides unchanged.
- 212 automated test files passed; a new clinical regression suite checks concentrations, routes, phase doses, OR/AND, confirmation, individualized drafts and source-change gates.
- 96 browser cases passed across Chromium and WebKit at 320, 390 and 1440 pixels, including six new chapter 16–20 scenarios per engine.
- Production build passed. Technical provenance remains inside the closed question-mark disclosure.

Full private source exports, source document URLs, patient data, browser authentication state and local audit evidence are excluded from this repository. This release is a documented software/content reconciliation and still requires clinical judgment for each patient.
