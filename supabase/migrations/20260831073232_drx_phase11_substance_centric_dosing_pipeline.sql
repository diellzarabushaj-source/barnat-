-- DRx Phase 11: substance-centric dose architecture.
-- Additive and fail-closed: legacy prose is staged as candidates only.
-- No candidate can auto-publish a clinical rule.

create schema if not exists drx_dose;
revoke all on schema drx_dose from public, anon, authenticated;

create table if not exists drx_dose.rule_targets_v1 (
  rule_target_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete cascade,
  target_kind text not null check (target_kind in ('SUBSTANCE','INGREDIENT_SET')),
  substance_concept_id uuid references public.substance_concepts_v1(concept_id) on delete restrict,
  ingredient_set_id uuid,
  ingredient_concept_ids uuid[] not null default '{}'::uuid[],
  dose_basis_component_concept_id uuid references public.substance_concepts_v1(concept_id) on delete restrict,
  form_family text,
  release_key text,
  route_keys text[] not null default '{}'::text[],
  required_clinical_variant_id uuid references drx_variant.clinical_variants_v1(clinical_variant_id) on delete restrict,
  required_strength_hash text,
  strength_match_mode text not null default 'ANY_COMPATIBLE'
    check (strength_match_mode in ('ANY_COMPATIBLE','EXACT_STRENGTH','EXACT_VARIANT','MANUAL_REVIEW')),
  binding_status text not null default 'DRAFT'
    check (binding_status in ('DRAFT','IN_REVIEW','VERIFIED','REJECTED','RETIRED')),
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_kind='SUBSTANCE' and substance_concept_id is not null)
    or
    (target_kind='INGREDIENT_SET' and ingredient_set_id is not null and cardinality(ingredient_concept_ids) >= 2)
  ),
  check (
    binding_status <> 'VERIFIED'
    or (nullif(btrim(verified_by),'') is not null and verified_at is not null)
  ),
  check (strength_match_mode <> 'EXACT_VARIANT' or required_clinical_variant_id is not null),
  check (strength_match_mode <> 'EXACT_STRENGTH' or nullif(btrim(required_strength_hash),'') is not null)
);

create unique index if not exists rule_targets_v1_identity_uidx
on drx_dose.rule_targets_v1 (
  rule_id,
  target_kind,
  coalesce(substance_concept_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(ingredient_set_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(required_clinical_variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(required_strength_hash, '')
);

create index if not exists rule_targets_v1_rule_idx
on drx_dose.rule_targets_v1(rule_id,binding_status);

create index if not exists rule_targets_v1_substance_idx
on drx_dose.rule_targets_v1(substance_concept_id)
where target_kind='SUBSTANCE' and binding_status='VERIFIED';

create index if not exists rule_targets_v1_ingredient_set_idx
on drx_dose.rule_targets_v1(ingredient_set_id)
where target_kind='INGREDIENT_SET' and binding_status='VERIFIED';

create table if not exists drx_dose.rule_candidate_extractions_v1 (
  candidate_id uuid primary key default gen_random_uuid(),
  legacy_regimen_id uuid not null unique,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  registry_number integer,
  trade_name text,
  target_kind text not null check (target_kind in ('SUBSTANCE','INGREDIENT_SET','UNRESOLVED')),
  substance_concept_id uuid references public.substance_concepts_v1(concept_id) on delete restrict,
  ingredient_set_id uuid,
  ingredient_concept_ids uuid[] not null default '{}'::uuid[],
  ingredient_resolution_status text,
  patient_group text not null check (patient_group in ('adult_only','pediatric_only','manual_review')),
  population_raw text,
  route_raw text,
  normalized_route_keys text[] not null default '{}'::text[],
  form_family text,
  release_key text,
  indication_text text,
  dose_text text not null,
  frequency_text text,
  duration_text text,
  maximum_text text,
  warnings text,
  calculation_status text,
  source_url text,
  source_hash text,
  candidate_context_key text not null,
  parser_version text not null,
  parser_status text not null check (parser_status in ('STRUCTURED_CANDIDATE','TEXT_ONLY','BLOCKED','NEEDS_REVIEW')),
  parser_confidence numeric not null default 0 check (parser_confidence between 0 and 1),
  parsed_rule_payload jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}'::text[],
  auto_publish_allowed boolean not null default false check (auto_publish_allowed=false),
  review_status text not null default 'PENDING' check (review_status in ('PENDING','APPROVED','REJECTED','PROMOTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_kind='SUBSTANCE' and substance_concept_id is not null)
    or (target_kind='INGREDIENT_SET' and ingredient_set_id is not null and cardinality(ingredient_concept_ids) >= 2)
    or target_kind='UNRESOLVED'
  ),
  check (
    review_status not in ('APPROVED','REJECTED','PROMOTED')
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  )
);

create index if not exists rule_candidate_extractions_v1_target_idx
on drx_dose.rule_candidate_extractions_v1(target_kind,substance_concept_id,ingredient_set_id);

create index if not exists rule_candidate_extractions_v1_status_idx
on drx_dose.rule_candidate_extractions_v1(parser_status,review_status);

create index if not exists rule_candidate_extractions_v1_context_idx
on drx_dose.rule_candidate_extractions_v1(candidate_context_key);

create or replace function drx_dose.population_to_patient_group_v1(p_population text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_population,'')))
    when 'adult' then 'adult_only'
    when 'pediatric' then 'pediatric_only'
    when 'paediatric' then 'pediatric_only'
    else 'manual_review'
  end;
$$;

create or replace function drx_dose.parse_legacy_dose_text_v1(
  p_dose_text text,
  p_frequency_text text,
  p_duration_text text,
  p_maximum_text text,
  p_calculation_status text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_text text := lower(regexp_replace(
    concat_ws(' ',coalesce(p_dose_text,''),coalesce(p_frequency_text,''),coalesce(p_duration_text,''),coalesce(p_maximum_text,'')),
    '[[:space:]]+',' ','g'
  ));
  v_status text := lower(btrim(coalesce(p_calculation_status,'')));
  v_match text[];
  v_sched text[];
  v_duration text[];
  v_method text;
  v_basis text;
  v_unit text;
  v_min numeric;
  v_max numeric;
  v_times_min numeric;
  v_times_max numeric;
  v_interval_min numeric;
  v_interval_max numeric;
  v_duration_max numeric;
  v_confidence numeric := 0;
  v_flags text[] := '{}'::text[];
  v_mg_mentions integer := 0;
  v_age_mentions integer := 0;
begin
  if v_status='contraindicated' then
    return jsonb_build_object(
      'classification','CONTRAINDICATED',
      'calculable',false,
      'confidence',1,
      'reasonCodes',jsonb_build_array('LEGACY_CONTRAINDICATED')
    );
  end if;

  if v_status='not_recommended' then
    return jsonb_build_object(
      'classification','NOT_RECOMMENDED',
      'calculable',false,
      'confidence',1,
      'reasonCodes',jsonb_build_array('LEGACY_NOT_RECOMMENDED')
    );
  end if;

  select count(*) into v_mg_mentions
  from regexp_matches(v_text,'[0-9]+(?:[.,][0-9]+)?[[:space:]]*(?:mg|mcg|µg|g)','g');

  select count(*) into v_age_mentions
  from regexp_matches(v_text,'[0-9]+[[:space:]]*(?:–|-|deri|to|<|≤|>=|≥)?[[:space:]]*[0-9]*[[:space:]]*(?:vjeç|vjec|muaj|months?|years?)','g');

  if v_mg_mentions > 2 then
    v_flags := array_append(v_flags,'MULTIPLE_DOSE_VALUES');
  end if;
  if v_age_mentions > 1 then
    v_flags := array_append(v_flags,'MULTIPLE_AGE_BANDS');
  end if;
  if v_text ~ '(titro|titrim|sipas përgjigjes|sipas pergjigjes|individualizo|protokoll|faz[aë]n|mund të rritet|mund te rritet)' then
    v_flags := array_append(v_flags,'CONDITIONAL_OR_TITRATION_TEXT');
  end if;
  if v_text ~ '(^|[^a-z])(ose)([^a-z]|$)' then
    v_flags := array_append(v_flags,'ALTERNATIVE_REGIMENS');
  end if;

  v_match := regexp_match(
    v_text,
    '([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(?:–|-[[:space:]]*)?([0-9]+(?:[.,][0-9]+)?)?[[:space:]]*(mg|mcg|µg|g)[[:space:]]*/[[:space:]]*kg[[:space:]]*/[[:space:]]*(ditë|dite|day|dozë|doze)'
  );

  if v_match is not null then
    v_min := replace(v_match[1],',','.')::numeric;
    v_max := coalesce(nullif(replace(v_match[2],',','.'),'')::numeric,v_min);
    v_unit := case when v_match[3] in ('µg','mcg') then 'mcg' else v_match[3] end;
    if v_match[4] in ('ditë','dite','day') then
      v_method := 'dose_per_kg_per_day';
      v_basis := 'kg/ditë';
    else
      v_method := 'dose_per_kg_per_dose';
      v_basis := 'kg/dozë';
    end if;
    v_confidence := 0.84;
  else
    v_match := regexp_match(
      v_text,
      '([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(?:–|-[[:space:]]*)?([0-9]+(?:[.,][0-9]+)?)?[[:space:]]*(mg)[[:space:]]*/[[:space:]]*(m2|m²)[[:space:]]*/[[:space:]]*(ditë|dite|day|dozë|doze)'
    );
    if v_match is not null then
      v_min := replace(v_match[1],',','.')::numeric;
      v_max := coalesce(nullif(replace(v_match[2],',','.'),'')::numeric,v_min);
      v_unit := 'mg';
      if v_match[4] in ('ditë','dite','day') then
        v_method := 'dose_per_m2_per_day';
        v_basis := 'm²/ditë';
      else
        v_method := 'dose_per_m2_per_dose';
        v_basis := 'm²/dozë';
      end if;
      v_confidence := 0.84;
    end if;
  end if;

  if v_method is null and v_mg_mentions=1 then
    v_match := regexp_match(v_text,'([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(mg)');
    if v_match is not null then
      v_min := replace(v_match[1],',','.')::numeric;
      v_max := v_min;
      v_unit := 'mg';
      v_method := 'fixed_dose';
      v_basis := 'per_dose';
      v_confidence := 0.72;
    end if;
  end if;

  v_sched := regexp_match(
    v_text,
    '([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(?:–|-[[:space:]]*)?([0-9]+(?:[.,][0-9]+)?)?[[:space:]]*her(?:ë|e)[[:space:]]*(?:në|ne)[[:space:]]*dit(?:ë|e)'
  );
  if v_sched is not null then
    v_times_min := replace(v_sched[1],',','.')::numeric;
    v_times_max := coalesce(nullif(replace(v_sched[2],',','.'),'')::numeric,v_times_min);
  elsif v_text ~ 'një herë në ditë|nje here ne dite' then
    v_times_min := 1; v_times_max := 1;
  elsif v_text ~ 'dy herë në ditë|dy here ne dite' then
    v_times_min := 2; v_times_max := 2;
  elsif v_text ~ 'tre herë në ditë|tre here ne dite' then
    v_times_min := 3; v_times_max := 3;
  elsif v_text ~ 'katër herë në ditë|kater here ne dite' then
    v_times_min := 4; v_times_max := 4;
  end if;

  v_sched := regexp_match(
    v_text,
    'çdo[[:space:]]*([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(?:–|-[[:space:]]*)?([0-9]+(?:[.,][0-9]+)?)?[[:space:]]*or(?:ë|e)'
  );
  if v_sched is not null then
    v_interval_min := replace(v_sched[1],',','.')::numeric;
    v_interval_max := coalesce(nullif(replace(v_sched[2],',','.'),'')::numeric,v_interval_min);
  end if;

  v_duration := regexp_match(
    v_text,
    '(?:jo më gjatë se|jo me gjate se|maksimumi)[[:space:]]*([0-9]+(?:[.,][0-9]+)?)[[:space:]]*dit(?:ë|e)'
  );
  if v_duration is not null then
    v_duration_max := replace(v_duration[1],',','.')::numeric;
  end if;

  if v_unit is not null and v_unit <> 'mg' and v_method like 'dose_per_%' then
    v_flags := array_append(v_flags,'NON_MG_WEIGHT_OR_BSA_UNIT_ENGINE_REVIEW');
    v_confidence := least(v_confidence,0.55);
  end if;

  if cardinality(v_flags) > 0 then
    v_confidence := greatest(0.35,v_confidence - 0.18);
  end if;

  if v_method is null then
    return jsonb_build_object(
      'classification','TEXT_ONLY',
      'calculable',false,
      'confidence',0.20,
      'reasonCodes',to_jsonb(array_append(v_flags,'NO_SAFE_TYPED_PATTERN')),
      'rawText',p_dose_text
    );
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'classification','STRUCTURED_CANDIDATE',
    'calculable',false,
    'calculationMethod',v_method,
    'doseMinValue',v_min,
    'doseMaxValue',v_max,
    'doseUnit',v_unit,
    'doseBasis',v_basis,
    'frequencyMode',
      case
        when v_interval_min is not null then 'interval'
        when v_times_min is not null then 'times_per_day'
        else 'manual'
      end,
    'intervalMinHours',v_interval_min,
    'intervalMaxHours',v_interval_max,
    'timesPerDay',case when v_times_min=v_times_max then v_times_min else null end,
    'timesPerDayMin',v_times_min,
    'timesPerDayMax',v_times_max,
    'durationMode',case when v_duration_max is not null then 'range_days' else 'manual' end,
    'durationMaxDays',v_duration_max,
    'confidence',v_confidence,
    'reasonCodes',to_jsonb(v_flags),
    'rawText',p_dose_text
  ));
end;
$$;

create or replace view drx_dose.product_rule_targets_v1 as
select
  d.id as drug_id,
  d.registry_number,
  d.pdid,
  d.trade_name,
  d.active_substance,
  d.atc_code,
  d.pharmaceutical_form,
  d.approved_population,
  r.resolution_status as ingredient_resolution_status,
  case
    when r.resolution_status='RESOLVED_SINGLE' and s.ingredient_count=1 then 'SUBSTANCE'
    when r.resolution_status='RESOLVED_MULTI' and s.ingredient_count>1 then 'INGREDIENT_SET'
    else 'UNRESOLVED'
  end as target_kind,
  case when s.ingredient_count=1 then s.concept_ids[1] end as substance_concept_id,
  s.ingredient_set_id,
  coalesce(s.concept_ids,'{}'::uuid[]) as ingredient_concept_ids,
  coalesce(s.canonical_ingredients,'{}'::text[]) as canonical_ingredients,
  n.normalized_form_key,
  n.form_family,
  n.normalized_release_key as release_key,
  coalesce(n.normalized_route_keys,'{}'::text[]) as route_keys,
  n.population_key,
  n.form_status,
  n.release_status,
  n.route_status,
  n.population_status,
  n.strength_parse,
  m.clinical_variant_id,
  m.strength_hash,
  m.binding_status as variant_binding_status,
  coalesce(m.anomaly_codes,'{}'::text[]) as variant_anomaly_codes,
  (
    r.resolution_status in ('RESOLVED_SINGLE','RESOLVED_MULTI')
    and s.ingredient_set_id is not null
  ) as ingredient_target_ready,
  (
    r.resolution_status in ('RESOLVED_SINGLE','RESOLVED_MULTI')
    and s.ingredient_set_id is not null
    and n.route_status='EXACT'
    and n.population_status='EXACT'
    and m.binding_status='BOUND'
    and cardinality(coalesce(m.anomaly_codes,'{}'::text[]))=0
  ) as strict_autoinherit_ready
from public.drugs d
left join public.product_ingredient_resolution_v1 r on r.source_drug_id=d.id
left join public.medindex_product_ingredient_sets_v1 s on s.source_drug_id=d.id
left join drx_norm.product_normalization_v1 n on n.drug_id=d.id
left join drx_variant.market_products_v1 m on m.product_id=d.id
where d.is_published=true
  and d.editorial_status='published';

create or replace view drx_dose.inherited_rule_matches_v1 as
select
  p.drug_id,
  p.registry_number,
  p.trade_name,
  p.target_kind as product_target_kind,
  t.rule_target_id,
  t.rule_id,
  r.rule_key,
  r.patient_group,
  r.indication_id,
  r.route as rule_route,
  r.pharmaceutical_form as rule_pharmaceutical_form,
  t.strength_match_mode,
  case when t.target_kind='SUBSTANCE' then 'substance_inheritance'
       else 'ingredient_set_inheritance' end as match_method
from drx_dose.product_rule_targets_v1 p
join drx_dose.rule_targets_v1 t
  on t.binding_status='VERIFIED'
 and (
   (t.target_kind='SUBSTANCE' and p.target_kind='SUBSTANCE' and p.substance_concept_id=t.substance_concept_id)
   or
   (t.target_kind='INGREDIENT_SET' and p.target_kind='INGREDIENT_SET' and p.ingredient_set_id=t.ingredient_set_id)
 )
join public.dose_rules_v3 r
  on r.rule_id=t.rule_id
 and r.editorial_status='published'
where p.strict_autoinherit_ready
  and (cardinality(t.route_keys)=0 or t.route_keys && p.route_keys)
  and (t.form_family is null or t.form_family=p.form_family)
  and (t.release_key is null or t.release_key=p.release_key)
  and (
    t.strength_match_mode='ANY_COMPATIBLE'
    or (t.strength_match_mode='EXACT_VARIANT' and t.required_clinical_variant_id=p.clinical_variant_id)
    or (t.strength_match_mode='EXACT_STRENGTH' and t.required_strength_hash=p.strength_hash)
  )
  and (
    (r.patient_group='adult_only' and p.population_key in ('ADULT_ONLY','ADULT_AND_PEDIATRIC'))
    or (r.patient_group in ('pediatric_only','age_band') and p.population_key in ('PEDIATRIC_ONLY','ADULT_AND_PEDIATRIC'))
    or (r.patient_group='pediatric_and_adult' and p.population_key='ADULT_AND_PEDIATRIC')
  );

create or replace function public.drx_phase11_refresh_candidates_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_norm
as $$
declare
  v_rows integer;
begin
  insert into drx_dose.rule_candidate_extractions_v1 (
    legacy_regimen_id,drug_id,registry_number,trade_name,
    target_kind,substance_concept_id,ingredient_set_id,ingredient_concept_ids,
    ingredient_resolution_status,patient_group,population_raw,route_raw,
    normalized_route_keys,form_family,release_key,
    indication_text,dose_text,frequency_text,duration_text,maximum_text,warnings,
    calculation_status,source_url,source_hash,candidate_context_key,
    parser_version,parser_status,parser_confidence,parsed_rule_payload,reason_codes,
    auto_publish_allowed,review_status,updated_at
  )
  select
    p.id,
    p.drug_id,
    d.registry_number,
    d.trade_name,
    case
      when ir.resolution_status='RESOLVED_SINGLE' and s.ingredient_count=1 then 'SUBSTANCE'
      when ir.resolution_status='RESOLVED_MULTI' and s.ingredient_count>1 then 'INGREDIENT_SET'
      else 'UNRESOLVED'
    end,
    case when s.ingredient_count=1 then s.concept_ids[1] end,
    s.ingredient_set_id,
    coalesce(s.concept_ids,'{}'::uuid[]),
    ir.resolution_status,
    drx_dose.population_to_patient_group_v1(p.population),
    p.population,
    p.route,
    coalesce(n.normalized_route_keys,'{}'::text[]),
    n.form_family,
    n.normalized_release_key,
    p.indication_text,
    p.dose_text,
    p.frequency_text,
    p.duration_text,
    p.maximum_text,
    p.warnings,
    p.calculation_status,
    p.source_url,
    p.source_hash,
    md5(concat_ws('|',
      case when s.ingredient_count=1 then s.concept_ids[1]::text else coalesce(s.ingredient_set_id::text,'UNRESOLVED') end,
      drx_dose.population_to_patient_group_v1(p.population),
      coalesce(array_to_string(n.normalized_route_keys,','),coalesce(p.route,'')),
      coalesce(n.form_family,''),
      coalesce(n.normalized_release_key,''),
      regexp_replace(lower(coalesce(p.indication_text,'')),'[[:space:]]+',' ','g')
    )),
    'drx-legacy-dose-parser-v1',
    case
      when ir.resolution_status not in ('RESOLVED_SINGLE','RESOLVED_MULTI') then 'NEEDS_REVIEW'
      when lower(coalesce(p.calculation_status,'')) in ('contraindicated','not_recommended') then 'BLOCKED'
      when coalesce((drx_dose.parse_legacy_dose_text_v1(
        p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.calculation_status
      )->>'classification'),'')='STRUCTURED_CANDIDATE' then 'STRUCTURED_CANDIDATE'
      else 'TEXT_ONLY'
    end,
    coalesce((drx_dose.parse_legacy_dose_text_v1(
      p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.calculation_status
    )->>'confidence')::numeric,0),
    drx_dose.parse_legacy_dose_text_v1(
      p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.calculation_status
    ),
    case
      when ir.resolution_status not in ('RESOLVED_SINGLE','RESOLVED_MULTI')
        then array['INGREDIENT_IDENTITY_REVIEW_REQUIRED']::text[]
      else coalesce(
        array(select jsonb_array_elements_text(
          coalesce(drx_dose.parse_legacy_dose_text_v1(
            p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.calculation_status
          )->'reasonCodes','[]'::jsonb)
        )),
        '{}'::text[]
      )
    end,
    false,
    'PENDING',
    now()
  from public.product_dosage_regimens p
  join public.drugs d on d.id=p.drug_id
  left join public.product_ingredient_resolution_v1 ir on ir.source_drug_id=p.drug_id
  left join public.medindex_product_ingredient_sets_v1 s on s.source_drug_id=p.drug_id
  left join drx_norm.product_normalization_v1 n on n.drug_id=p.drug_id
  where p.editorial_status='published'
    and d.is_published=true
    and d.editorial_status='published'
  on conflict (legacy_regimen_id) do update set
    drug_id=excluded.drug_id,
    registry_number=excluded.registry_number,
    trade_name=excluded.trade_name,
    target_kind=excluded.target_kind,
    substance_concept_id=excluded.substance_concept_id,
    ingredient_set_id=excluded.ingredient_set_id,
    ingredient_concept_ids=excluded.ingredient_concept_ids,
    ingredient_resolution_status=excluded.ingredient_resolution_status,
    patient_group=excluded.patient_group,
    population_raw=excluded.population_raw,
    route_raw=excluded.route_raw,
    normalized_route_keys=excluded.normalized_route_keys,
    form_family=excluded.form_family,
    release_key=excluded.release_key,
    indication_text=excluded.indication_text,
    dose_text=excluded.dose_text,
    frequency_text=excluded.frequency_text,
    duration_text=excluded.duration_text,
    maximum_text=excluded.maximum_text,
    warnings=excluded.warnings,
    calculation_status=excluded.calculation_status,
    source_url=excluded.source_url,
    source_hash=excluded.source_hash,
    candidate_context_key=excluded.candidate_context_key,
    parser_version=excluded.parser_version,
    parser_status=excluded.parser_status,
    parser_confidence=excluded.parser_confidence,
    parsed_rule_payload=excluded.parsed_rule_payload,
    reason_codes=excluded.reason_codes,
    auto_publish_allowed=false,
    updated_at=now()
  where drx_dose.rule_candidate_extractions_v1.review_status='PENDING';

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'refreshed_rows',v_rows,
    'candidate_rows',(select count(*) from drx_dose.rule_candidate_extractions_v1),
    'structured_candidates',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='STRUCTURED_CANDIDATE'),
    'text_only',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='TEXT_ONLY'),
    'blocked',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='BLOCKED'),
    'needs_review',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='NEEDS_REVIEW'),
    'auto_publish_allowed',false
  );
end;
$$;

create or replace view drx_dose.rule_candidate_contexts_v1 as
select
  candidate_context_key,
  target_kind,
  substance_concept_id,
  ingredient_set_id,
  ingredient_concept_ids,
  patient_group,
  normalized_route_keys,
  form_family,
  release_key,
  min(indication_text) as indication_example,
  count(*) as legacy_regimen_count,
  count(distinct drug_id) as product_count,
  count(*) filter (where parser_status='STRUCTURED_CANDIDATE') as structured_candidate_count,
  count(*) filter (where parser_status='TEXT_ONLY') as text_only_count,
  count(*) filter (where parser_status='BLOCKED') as blocked_count,
  count(*) filter (where parser_status='NEEDS_REVIEW') as needs_review_count,
  max(parser_confidence) as max_parser_confidence,
  array_agg(distinct registry_number order by registry_number) as registry_numbers
from drx_dose.rule_candidate_extractions_v1
group by
  candidate_context_key,target_kind,substance_concept_id,ingredient_set_id,
  ingredient_concept_ids,patient_group,normalized_route_keys,form_family,release_key;

insert into drx_dose.rule_targets_v1 (
  rule_id,target_kind,substance_concept_id,ingredient_set_id,ingredient_concept_ids,
  dose_basis_component_concept_id,form_family,release_key,route_keys,
  required_clinical_variant_id,required_strength_hash,strength_match_mode,
  binding_status,verified_by,verified_at
)
select distinct
  r.rule_id,
  case when s.ingredient_count=1 then 'SUBSTANCE' else 'INGREDIENT_SET' end,
  case when s.ingredient_count=1 then s.concept_ids[1] end,
  case when s.ingredient_count>1 then s.ingredient_set_id end,
  coalesce(s.concept_ids,'{}'::uuid[]),
  r.dose_basis_component_concept_id,
  n.form_family,
  n.normalized_release_key,
  case when r.route is null or btrim(r.route)='' then '{}'::text[] else array[upper(btrim(r.route))] end,
  m.clinical_variant_id,
  m.strength_hash,
  'EXACT_VARIANT',
  'VERIFIED',
  coalesce(r.verified_by,rp.verified_by,'system:phase11-backfill'),
  coalesce(r.verified_at,rp.verified_at,now())
from public.dose_rules_v3 r
join public.dose_rule_products_v3 rp on rp.rule_id=r.rule_id and rp.binding_status='verified'
join public.dose_products_v3 dp on dp.product_id=rp.product_id
join public.medindex_product_ingredient_sets_v1 s on s.source_drug_id=dp.drug_id
left join drx_norm.product_normalization_v1 n on n.drug_id=dp.drug_id
left join drx_variant.market_products_v1 m on m.product_id=dp.drug_id
where r.editorial_status in ('verified','published')
  and s.ingredient_count>=1
  and m.clinical_variant_id is not null
on conflict do nothing;

create or replace function public.drx_phase11_product_context_v1(p_drug_id uuid)
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
with p as (
  select * from drx_dose.product_rule_targets_v1 where drug_id=p_drug_id
),
m as (
  select
    x.drug_id,
    jsonb_agg(jsonb_build_object(
      'ruleId',x.rule_id,
      'ruleKey',x.rule_key,
      'indicationId',x.indication_id,
      'patientGroup',x.patient_group,
      'matchMethod',x.match_method,
      'strengthMatchMode',x.strength_match_mode
    ) order by x.rule_key) as rules
  from drx_dose.inherited_rule_matches_v1 x
  where x.drug_id=p_drug_id
  group by x.drug_id
)
select jsonb_build_object(
  'contextVersion','drx-phase11-substance-centric-v1',
  'drugId',p.drug_id,
  'registryNumber',p.registry_number,
  'tradeName',p.trade_name,
  'activeSubstance',p.active_substance,
  'targetKind',p.target_kind,
  'substanceConceptId',p.substance_concept_id,
  'ingredientSetId',p.ingredient_set_id,
  'ingredientConceptIds',to_jsonb(p.ingredient_concept_ids),
  'canonicalIngredients',to_jsonb(p.canonical_ingredients),
  'formFamily',p.form_family,
  'releaseKey',p.release_key,
  'routeKeys',to_jsonb(p.route_keys),
  'populationKey',p.population_key,
  'strengthParse',p.strength_parse,
  'ingredientTargetReady',p.ingredient_target_ready,
  'strictAutoInheritReady',p.strict_autoinherit_ready,
  'rules',coalesce(m.rules,'[]'::jsonb)
)
from p
left join m on m.drug_id=p.drug_id;
$$;

create or replace function public.drx_phase11_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'publishedProducts',(select count(*) from public.drugs where is_published and editorial_status='published'),
  'productTargets',(select count(*) from drx_dose.product_rule_targets_v1),
  'ingredientTargetReady',(select count(*) from drx_dose.product_rule_targets_v1 where ingredient_target_ready),
  'strictAutoInheritReady',(select count(*) from drx_dose.product_rule_targets_v1 where strict_autoinherit_ready),
  'ruleTargets',(select count(*) from drx_dose.rule_targets_v1),
  'verifiedRuleTargets',(select count(*) from drx_dose.rule_targets_v1 where binding_status='VERIFIED'),
  'candidateRows',(select count(*) from drx_dose.rule_candidate_extractions_v1),
  'candidateContexts',(select count(*) from drx_dose.rule_candidate_contexts_v1),
  'structuredCandidates',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='STRUCTURED_CANDIDATE'),
  'textOnly',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='TEXT_ONLY'),
  'blocked',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='BLOCKED'),
  'needsReview',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='NEEDS_REVIEW'),
  'inheritedRuleMatches',(select count(*) from drx_dose.inherited_rule_matches_v1),
  'autoPublishAllowed',false,
  'runtimeServeEnabled',false,
  'model','substance_or_ingredient_set -> verified_rule -> compatible_product'
);
$$;

alter table drx_dose.rule_targets_v1 enable row level security;
alter table drx_dose.rule_candidate_extractions_v1 enable row level security;

revoke all on drx_dose.rule_targets_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_candidate_extractions_v1 from public,anon,authenticated;
revoke all on drx_dose.product_rule_targets_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_candidate_contexts_v1 from public,anon,authenticated;
revoke all on drx_dose.inherited_rule_matches_v1 from public,anon,authenticated;

grant select,insert,update,delete on drx_dose.rule_targets_v1 to service_role;
grant select,insert,update,delete on drx_dose.rule_candidate_extractions_v1 to service_role;
grant select on drx_dose.product_rule_targets_v1 to service_role;
grant select on drx_dose.rule_candidate_contexts_v1 to service_role;
grant select on drx_dose.inherited_rule_matches_v1 to service_role;

revoke all on function drx_dose.population_to_patient_group_v1(text) from public,anon,authenticated;
revoke all on function drx_dose.parse_legacy_dose_text_v1(text,text,text,text,text) from public,anon,authenticated;
grant execute on function drx_dose.population_to_patient_group_v1(text) to service_role;
grant execute on function drx_dose.parse_legacy_dose_text_v1(text,text,text,text,text) to service_role;

revoke all on function public.drx_phase11_refresh_candidates_v1() from public,anon,authenticated;
revoke all on function public.drx_phase11_product_context_v1(uuid) from public,anon,authenticated;
revoke all on function public.drx_phase11_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_refresh_candidates_v1() to service_role;
grant execute on function public.drx_phase11_product_context_v1(uuid) to service_role;
grant execute on function public.drx_phase11_status_v1() to service_role;

select public.drx_phase11_refresh_candidates_v1();

comment on table drx_dose.rule_targets_v1 is
  'Substance/ingredient-set target for a V3 rule. Enables rule reuse without copying dose prose to every brand.';
comment on table drx_dose.rule_candidate_extractions_v1 is
  'Machine-extracted candidates from published legacy dose text. Never auto-publish; explicit review remains mandatory.';
comment on view drx_dose.inherited_rule_matches_v1 is
  'Fail-closed compatibility matches from verified clinical rule targets to strict normalized market products.';
