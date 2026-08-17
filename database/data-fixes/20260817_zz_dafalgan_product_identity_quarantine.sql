-- 2026-08-17 — corrective product-identity quarantine for registry #4013.
--
-- The prior activation used the French same-CIS historical DAFALGAN -> EFFERALGAN
-- 30 mg/mL product (3–32 kg). However the currently marketed Belgian product with
-- the exact name DAFALGAN PEDIATRIE 30 mg/mL has a different product population.
-- The MedIndex registry row currently has no manufacturer / MA-holder identity.
-- Therefore the row must fail closed until the local product/market is identified.
--
-- Sources:
-- French BDPM / historical DAFALGAN identity:
-- https://base-donnees-publique.medicaments.gouv.fr/medicament/63390065/extrait
-- Current Belgian DAFALGAN product information:
-- https://dafalgan.be/nl/dafalgan-voor-babys-en-kinderen/

BEGIN;

UPDATE public.drugs
SET pediatric_verification_status = 'in_review',
    pediatric_verified_at = NULL,
    pediatric_restriction = 'KËRKON IDENTIFIKIM TË PRODUKTIT/TREGUT para kalkulimit automatik. Formulimi francez historikisht i lidhur me DAFALGAN/EFFERALGAN 30 mg/mL përdor kufirin 3–32 kg, ndërsa DAFALGAN PEDIATRIE 30 mg/mL i tregut belg jep kufi tjetër peshe. Derisa regjistri vendor të ketë manufacturer/MA holder/packaging të identifikueshëm, mos përdor kalkulator automatik për këtë rresht.',
    pediatric_source_url = 'https://base-donnees-publique.medicaments.gouv.fr/medicament/63390065/extrait; https://dafalgan.be/nl/dafalgan-voor-babys-en-kinderen/'
WHERE registry_number = 4013
  AND trade_name = 'DAFALGAN PEDIATRIE';

UPDATE public.dosage_regimens
SET editorial_status = 'in_review',
    reviewed_at = NULL,
    warnings = 'Identiteti i tregut/packaging-ut nuk është i verifikuar. Burimi francez historik DAFALGAN→EFFERALGAN 30 mg/mL dhe DAFALGAN PEDIATRIE belg kanë kufij të ndryshëm peshe; mos e përdor këtë regjim për kalkulim automatik derisa produkti vendor të identifikohet.',
    source_url = 'https://base-donnees-publique.medicaments.gouv.fr/medicament/63390065/extrait; https://dafalgan.be/nl/dafalgan-voor-babys-en-kinderen/',
    updated_at = NOW()
WHERE source_key = 'extra-4013-pediatric'
  AND drug_id = (SELECT id FROM public.drugs WHERE registry_number = 4013);

COMMIT;
