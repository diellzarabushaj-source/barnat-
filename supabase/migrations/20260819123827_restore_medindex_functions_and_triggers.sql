-- Synced from Supabase production migration history.
-- version: 20260819123827
-- name: restore_medindex_functions_and_triggers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$ begin new.updated_at = now(); return new; end $$;

create or replace function public.medindex_numeric_or_null(value text)
returns numeric
language plpgsql
immutable
as $$
declare v text;
begin
  v := replace(btrim(coalesce(value,'')), ',', '.');
  if v = '' or v !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' then return null; end if;
  return v::numeric;
exception when others then return null;
end;
$$;

create or replace function public.medindex_timestamp_or_null(value text)
returns timestamp with time zone
language plpgsql
stable
as $$
declare v text;
begin
  v := btrim(coalesce(value,''));
  if v = '' then return null;
  elsif v ~ '^\d{4}-\d{2}-\d{2}' then return v::timestamptz;
  elsif v ~ '^\d{2}[./-]\d{2}[./-]\d{4}$' then
    return to_timestamp(replace(replace(v,'/','.'),'-','.'), 'DD.MM.YYYY');
  end if;
  return null;
exception when others then return null;
end;
$$;

create or replace function public.medindex_sync_drug_pediatric_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.source_payload is not distinct from old.source_payload then return new; end if;
  new.pediatric_dose_summary := nullif(btrim(new.source_payload->>'Doza pediatrike — përmbledhje'),'');
  new.pediatric_indication := nullif(btrim(new.source_payload->>'Indikacioni pediatrik'),'');
  new.pediatric_use_status := nullif(btrim(new.source_payload->>'Statusi i përdorimit pediatrik'),'');
  new.pediatric_min_age_value := public.medindex_numeric_or_null(new.source_payload->>'Mosha minimale — vlerë');
  new.pediatric_min_age_unit := nullif(btrim(new.source_payload->>'Mosha minimale — njësi'),'');
  new.pediatric_max_age_value := public.medindex_numeric_or_null(new.source_payload->>'Mosha maksimale — vlerë');
  new.pediatric_max_age_unit := nullif(btrim(new.source_payload->>'Mosha maksimale — njësi'),'');
  new.pediatric_min_weight_kg := public.medindex_numeric_or_null(new.source_payload->>'Pesha minimale (kg)');
  new.pediatric_max_weight_kg := public.medindex_numeric_or_null(new.source_payload->>'Pesha maksimale (kg)');
  new.pediatric_dose_min := public.medindex_numeric_or_null(new.source_payload->>'Doza pediatrike — min');
  new.pediatric_dose_max := public.medindex_numeric_or_null(new.source_payload->>'Doza pediatrike — max');
  new.pediatric_dose_unit := nullif(btrim(new.source_payload->>'Njësia e dozës'),'');
  new.pediatric_dose_basis := nullif(btrim(new.source_payload->>'Baza e dozës'),'');
  new.pediatric_doses_per_day := public.medindex_numeric_or_null(new.source_payload->>'Nr. dozave / ditë');
  new.pediatric_interval_hours := public.medindex_numeric_or_null(new.source_payload->>'Intervali (orë)');
  new.pediatric_max_single_value := public.medindex_numeric_or_null(new.source_payload->>'Maks. për dozë — vlerë');
  new.pediatric_max_single_unit := nullif(btrim(new.source_payload->>'Maks. për dozë — njësi'),'');
  new.pediatric_max_daily_value := public.medindex_numeric_or_null(new.source_payload->>'Maks. në 24h — vlerë');
  new.pediatric_max_daily_unit := nullif(btrim(new.source_payload->>'Maks. në 24h — njësi'),'');
  new.pediatric_route := nullif(btrim(new.source_payload->>'Rruga pediatrike'),'');
  new.pediatric_restriction := nullif(btrim(new.source_payload->>'Kufizim / mos-përdorim pediatrik'),'');
  new.pediatric_concentration_value := public.medindex_numeric_or_null(new.source_payload->>'Koncentrimi — sasia');
  new.pediatric_concentration_unit := nullif(btrim(new.source_payload->>'Koncentrimi — njësi'),'');
  new.pediatric_concentration_per_value := public.medindex_numeric_or_null(new.source_payload->>'Koncentrimi për — sasia');
  new.pediatric_concentration_per_unit := nullif(btrim(new.source_payload->>'Koncentrimi për — njësi'),'');
  new.pediatric_source_url := nullif(btrim(new.source_payload->>'Burimi pediatrik'),'');
  new.pediatric_source_section := nullif(btrim(new.source_payload->>'Seksioni i burimit pediatrik'),'');
  new.pediatric_verification_status := nullif(btrim(new.source_payload->>'Statusi i verifikimit pediatrik'),'');
  new.pediatric_verified_at := public.medindex_timestamp_or_null(new.source_payload->>'Verifikuar më');
  new.pediatric_primary_regimen_id := nullif(btrim(new.source_payload->>'Regimen ID kryesor'),'');
  return new;
end;
$$;

create trigger dosage_regimens_updated_at before update on public.dosage_regimens for each row execute function public.set_updated_at();
create trigger drug_indications_updated_at before update on public.drug_indications for each row execute function public.set_updated_at();
create trigger drugs_sync_pediatric_fields_from_source_payload before insert or update of source_payload on public.drugs for each row execute function public.medindex_sync_drug_pediatric_fields();
create trigger drugs_updated_at before update on public.drugs for each row execute function public.set_updated_at();
create trigger icd_codes_updated_at before update on public.icd_codes for each row execute function public.set_updated_at();
create trigger lab_categories_updated_at before update on public.lab_categories for each row execute function public.set_updated_at();
create trigger lab_tests_updated_at before update on public.lab_tests for each row execute function public.set_updated_at();
