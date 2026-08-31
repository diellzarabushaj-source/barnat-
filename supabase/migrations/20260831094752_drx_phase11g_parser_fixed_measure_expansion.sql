
-- DRx Phase 11G: parser expansion for safe, presentation-specific fixed measures.
-- Keeps restriction-only statements blocked and never auto-publishes parsed text.

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
  v_ml_mentions integer := 0;
  v_measure_mentions integer := 0;
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

  if drx_dose.classify_restriction_only_v1(p_dose_text)='RESTRICTION_ONLY' then
    return jsonb_build_object(
      'classification','RESTRICTION_ONLY',
      'calculable',false,
      'confidence',1,
      'reasonCodes',jsonb_build_array('RESTRICTION_ONLY_NO_DOSE_RULE'),
      'rawText',p_dose_text
    );
  end if;

  select count(*) into v_mg_mentions
  from regexp_matches(v_text,'[0-9]+(?:[.,][0-9]+)?[[:space:]]*(?:mg|mcg|µg|g)','g');

  select count(*) into v_ml_mentions
  from regexp_matches(v_text,'[0-9]+(?:[.,][0-9]+)?[[:space:]]*ml','g');

  select count(*) into v_measure_mentions
  from regexp_matches(v_text,'[0-9]+(?:[.,][0-9]+)?[[:space:]]*(?:tablet(?:ë|e|a)?|kapsul(?:ë|e|a)?|pik(?:ë|e|a)?|inhalim(?:e)?|bustin(?:ë|e|a)?|sachet(?:s)?)','g');

  select count(*) into v_age_mentions
  from regexp_matches(v_text,'[0-9]+[[:space:]]*(?:–|-|deri|to|<|≤|>=|≥)?[[:space:]]*[0-9]*[[:space:]]*(?:vjeç|vjec|muaj|months?|years?)','g');

  if v_mg_mentions > 2 then v_flags := array_append(v_flags,'MULTIPLE_DOSE_VALUES'); end if;
  if v_age_mentions > 1 then v_flags := array_append(v_flags,'MULTIPLE_AGE_BANDS'); end if;
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
      v_method := 'dose_per_kg_per_day'; v_basis := 'kg/ditë';
    else
      v_method := 'dose_per_kg_per_dose'; v_basis := 'kg/dozë';
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
        v_method := 'dose_per_m2_per_day'; v_basis := 'm²/ditë';
      else
        v_method := 'dose_per_m2_per_dose'; v_basis := 'm²/dozë';
      end if;
      v_confidence := 0.84;
    end if;
  end if;

  if v_method is null and v_ml_mentions=1 then
    v_match := regexp_match(
      v_text,
      '([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(?:–|-[[:space:]]*)?([0-9]+(?:[.,][0-9]+)?)?[[:space:]]*ml'
    );
    if v_match is not null then
      v_min := replace(v_match[1],',','.')::numeric;
      v_max := coalesce(nullif(replace(v_match[2],',','.'),'')::numeric,v_min);
      v_unit := 'mL';
      v_method := 'fixed_volume';
      v_basis := 'per_dose';
      v_confidence := 0.78;
      v_flags := array_append(v_flags,'PRODUCT_PRESENTATION_SPECIFIC');
    end if;
  end if;

  if v_method is null and v_measure_mentions=1 then
    v_match := regexp_match(
      v_text,
      '([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(?:–|-[[:space:]]*)?([0-9]+(?:[.,][0-9]+)?)?[[:space:]]*(tablet(?:ë|e|a)?|kapsul(?:ë|e|a)?|pik(?:ë|e|a)?|inhalim(?:e)?|bustin(?:ë|e|a)?|sachet(?:s)?)'
    );
    if v_match is not null then
      v_min := replace(v_match[1],',','.')::numeric;
      v_max := coalesce(nullif(replace(v_match[2],',','.'),'')::numeric,v_min);
      v_unit := case
        when v_match[3] like 'tablet%' then 'tablet'
        when v_match[3] like 'kapsul%' then 'capsule'
        when v_match[3] like 'pik%' then 'drop'
        when v_match[3] like 'inhalim%' then 'inhalation'
        else 'sachet'
      end;
      v_method := 'fixed_dose';
      v_basis := 'per_dose';
      v_confidence := 0.76;
      v_flags := array_append(v_flags,'PRODUCT_PRESENTATION_SPECIFIC');
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
    '([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(?:–|-[[:space:]]*)?([0-9]+(?:[.,][0-9]+)?)?[[:space:]]*(?:her(?:ë|e)|x|×)[[:space:]]*(?:në|ne|/)?[[:space:]]*dit(?:ë|e)?'
  );
  if v_sched is not null then
    v_times_min := replace(v_sched[1],',','.')::numeric;
    v_times_max := coalesce(nullif(replace(v_sched[2],',','.'),'')::numeric,v_times_min);
  elsif v_text ~ 'një herë në ditë|nje here ne dite|një herë/ditë|nje here/dite' then
    v_times_min := 1; v_times_max := 1;
  elsif v_text ~ 'dy herë në ditë|dy here ne dite|dy herë/ditë|dy here/dite' then
    v_times_min := 2; v_times_max := 2;
  elsif v_text ~ 'tre herë në ditë|tre here ne dite|tre herë/ditë|tre here/dite' then
    v_times_min := 3; v_times_max := 3;
  elsif v_text ~ 'katër herë në ditë|kater here ne dite|katër herë/ditë|kater here/dite' then
    v_times_min := 4; v_times_max := 4;
  end if;

  v_sched := regexp_match(
    v_text,
    '(?:çdo|cdo)[[:space:]]*([0-9]+(?:[.,][0-9]+)?)[[:space:]]*(?:–|-[[:space:]]*)?([0-9]+(?:[.,][0-9]+)?)?[[:space:]]*or(?:ë|e)'
  );
  if v_sched is not null then
    v_interval_min := replace(v_sched[1],',','.')::numeric;
    v_interval_max := coalesce(nullif(replace(v_sched[2],',','.'),'')::numeric,v_interval_min);
  end if;

  v_duration := regexp_match(
    v_text,
    '(?:jo më gjatë se|jo me gjate se|maksimumi)[[:space:]]*([0-9]+(?:[.,][0-9]+)?)[[:space:]]*dit(?:ë|e)'
  );
  if v_duration is not null then v_duration_max := replace(v_duration[1],',','.')::numeric; end if;

  if v_unit is not null and v_unit <> 'mg' and v_method like 'dose_per_%' then
    v_flags := array_append(v_flags,'NON_MG_WEIGHT_OR_BSA_UNIT_ENGINE_REVIEW');
    v_confidence := least(v_confidence,0.55);
  end if;

  if cardinality(v_flags)>0 then v_confidence := greatest(0.35,v_confidence-0.18); end if;

  if v_method is null then
    return jsonb_build_object(
      'classification','TEXT_ONLY','calculable',false,'confidence',0.20,
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
      case when v_interval_min is not null then 'interval'
           when v_times_min is not null then 'times_per_day'
           else 'manual' end,
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

-- Refresh only still-pending candidates. Reviewed/promoted rows remain untouched.
select public.drx_phase11_refresh_candidates_v1();

create or replace view drx_dose.presentation_specific_candidates_v1 as
select
  candidate_id,legacy_regimen_id,drug_id,registry_number,trade_name,
  target_kind,substance_concept_id,ingredient_set_id,patient_group,
  indication_text,dose_text,parser_confidence,parsed_rule_payload,
  reason_codes,source_url,review_status
from drx_dose.rule_candidate_extractions_v1
where reason_codes @> array['PRODUCT_PRESENTATION_SPECIFIC']::text[];

revoke all on drx_dose.presentation_specific_candidates_v1 from public,anon,authenticated;
grant select on drx_dose.presentation_specific_candidates_v1 to service_role;
