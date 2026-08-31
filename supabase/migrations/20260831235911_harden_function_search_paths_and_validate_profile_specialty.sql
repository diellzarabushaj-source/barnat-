alter function drx_dose.population_to_patient_group_v1(text)
  set search_path = pg_catalog, drx_dose, public;

alter function drx_dose.parse_legacy_dose_text_v1(text, text, text, text, text)
  set search_path = pg_catalog, drx_dose, public;

alter function drx_dose.classify_restriction_only_v1(text)
  set search_path = pg_catalog, drx_dose, public;

alter function drx_dose.resolve_dose_moiety_ids_v1(uuid[])
  set search_path = pg_catalog, drx_dose, public;

alter function public.drx_normalize_indication_search_v1(text)
  set search_path = pg_catalog, public;

alter table public.profiles
  validate constraint profiles_specialist_requires_specialty;
