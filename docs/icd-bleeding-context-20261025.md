# Blood-origin context in ICD description retrieval

The reported regressions were `pershtyme me gjak` incorrectly returned as haematemesis and `gjakderdhje ne feces` returned without suggestions. Canonical code/title validation alone cannot detect a model misunderstanding the input.

The new server layer recognizes bounded Albanian spelling variants and English terms for bloody sputum/cough, saliva/spit, vomiting, oral bleeding and faecal bleeding. It considers nearby blood terms, clause boundaries and local negation. It does not infer an underlying disease or replace clinical assessment. Unknown formulations retain normal AI retrieval; this is not a comprehensive natural-language safety system.

For short recognized descriptions, catalog suggestions and a reviewed clarification are returned without contacting either model. Blood in saliva alone yields conditional R04.2 retrieval plus a respiratory-versus-mouth/gum question. It does not establish haemoptysis and cannot become K92.0 without a positive vomiting context. Oral bleeding does not itself establish a respiratory source. Explicit coughing/bloody sputum and explicit bloody vomiting remain separate, and coexisting positive descriptions may retain both.

Unspecified faecal bleeding yields conditional K62.5 and K92.1 retrieval choices, with a question about fresh red blood, black/tarry stool or occult testing. It does not assert melaena or occult bleeding from the generic phrase. Specific reviewed descriptions distinguish fresh rectal blood, melaena and occult blood (R19.5). Titles remain owned by the active WHO ICD-10 2019 catalog. The layer does not diagnose haemorrhoids, ulcers, cancer or other causes.

Longer descriptions still use the existing consented Gemini/Groq flow. The same context constraints run after code/title validation, remove contradictory bleeding codes and restore the appropriate catalog symptom candidate if the model omits it. Reviewed rows have their own provenance, conditional text and labels; they are not marked as AI-generated or clinically verified. All results remain unselected. No aliases, patient records, database writes or provider configuration changes are added. A new cache namespace excludes earlier incorrect AI answers.

Regression coverage includes both screenshots, diacritics/typos, oral-versus-respiratory ambiguity, vomiting, local negation, coexisting symptoms, stool colour/occult distinctions, hostile or misleading model output, no provider call for reviewed short phrases, no automatic choice, consent/owner guards and phone/desktop rendering.

References checked on 2026-10-25:

- [NHS tabular R04.2: haemoptysis, blood-stained sputum and cough with haemorrhage](https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-r00-r09.htm).
- [NHS tabular K92.0/K92.1 and occult-blood exclusion](https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-k90-k93.htm).
- [NHS tabular K62.5](https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-k55-k64.htm).
- [Healthdirect: distinguish haemoptysis from oral bleeding and vomiting blood](https://www.healthdirect.gov.au/symptoms/haemoptysis-coughing-up-blood).
- [NIDDK: visible red/black stool and occult gastrointestinal bleeding](https://www.niddk.nih.gov/health-information/digestive-diseases/gastrointestinal-bleeding/symptoms-causes).
