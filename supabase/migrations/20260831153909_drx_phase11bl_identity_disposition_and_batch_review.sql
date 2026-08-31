
-- DRx Phase 11BL: route complex/non-standard products away from the standard
-- dose-target model and batch the remaining identity reviews by identical
-- composition expression. No unresolved ingredient identity is auto-resolved.

create or replace view drx_dose.product_identity_disposition_v3 as
select
  q.drug_id,q.registry_number,q.pdid,q.trade_name,q.active_substance,q.atc_code,
  q.pharmaceutical_form,q.ingredient_resolution_status,q.suggested_disposition,
  case
    when q.ingredient_resolution_status in ('RESOLVED_SINGLE','RESOLVED_MULTI')
      then 'STANDARD_DOSE_MODEL_READY'
    when q.ingredient_resolution_status='EXCLUDED'
      then 'EXCLUDED_FROM_STANDARD_DOSE_MODEL'
    when q.suggested_disposition in (
      'HOMEOPATHIC_COMPLEX_SPECIAL_MODEL',
      'VACCINE_OR_BIOLOGIC_SPECIAL_MODEL',
      'PARENTERAL_NUTRITION_COMPLEX'
    )
      then 'SPECIAL_MODEL_ROUTED'
    else 'STANDARD_IDENTITY_REVIEW'
  end as identity_disposition,
  case
    when q.suggested_disposition='HOMEOPATHIC_COMPLEX_SPECIAL_MODEL' then 'HOMEOPATHIC_COMPLEX'
    when q.suggested_disposition='VACCINE_OR_BIOLOGIC_SPECIAL_MODEL' then 'VACCINE_OR_BIOLOGIC'
    when q.suggested_disposition='PARENTERAL_NUTRITION_COMPLEX' then 'PARENTERAL_NUTRITION'
    else null
  end as special_model_kind,
  false::boolean as auto_dose_inheritance_allowed
from (
  select
    p.drug_id,p.registry_number,p.pdid,p.trade_name,p.active_substance,p.atc_code,
    p.pharmaceutical_form,p.ingredient_resolution_status,
    coalesce(u.suggested_disposition,'RESOLVED') as suggested_disposition
  from drx_dose.product_rule_targets_v1 p
  left join drx_dose.unresolved_product_disposition_queue_v1 u
    on u.drug_id=p.drug_id
) q;

create or replace view drx_dose.product_identity_disposition_summary_v1 as
select
  identity_disposition,
  count(*) as product_count,
  count(distinct md5(lower(regexp_replace(btrim(active_substance),'\s+',' ','g'))))
    as composition_signature_count
from drx_dose.product_identity_disposition_v3
group by identity_disposition;

create or replace view drx_dose.ingredient_identity_review_batches_v1 as
with q as (
  select
    p.*,
    lower(regexp_replace(btrim(p.active_substance),'\s+',' ','g')) as normalized_composition,
    md5(lower(regexp_replace(btrim(p.active_substance),'\s+',' ','g'))) as composition_signature
  from drx_dose.product_identity_disposition_v3 p
  where p.identity_disposition='STANDARD_IDENTITY_REVIEW'
)
select
  composition_signature,
  max(normalized_composition) as normalized_composition,
  count(*) as product_count,
  array_agg(drug_id order by registry_number nulls last,drug_id) as drug_ids,
  array_agg(registry_number order by registry_number nulls last) as registry_numbers,
  array_agg(trade_name order by registry_number nulls last,trade_name) as trade_names,
  array_agg(distinct suggested_disposition order by suggested_disposition) as review_classes,
  false::boolean as auto_resolve_allowed
from q
group by composition_signature;

create or replace view drx_dose.special_model_product_queue_v1 as
select
  drug_id,registry_number,pdid,trade_name,active_substance,atc_code,
  pharmaceutical_form,special_model_kind,
  'KEEP_OUT_OF_STANDARD_SUBSTANCE_DOSE_INHERITANCE'::text as routing_action,
  false::boolean as auto_dose_inheritance_allowed
from drx_dose.product_identity_disposition_v3
where identity_disposition='SPECIAL_MODEL_ROUTED';

alter table public.product_ingredients_v1
  drop constraint if exists product_ingredients_v1_method_check,
  add constraint product_ingredients_v1_method_check check (
    resolution_method in (
      'SINGLE_CANONICAL','DELIMITER_EXACT','DELIMITER_DEDUP','AND_EXACT',
      'REVIEWED_BATCH'
    )
  );

create table if not exists drx_dose.ingredient_identity_batch_decisions_v1 (
  decision_id uuid primary key default gen_random_uuid(),
  composition_signature text not null,
  normalized_composition text not null,
  concept_ids uuid[] not null check (cardinality(concept_ids) >= 1),
  reviewer text not null check (nullif(btrim(reviewer),'') is not null),
  review_note text,
  affected_drug_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

create or replace function public.drx_phase11_apply_ingredient_identity_batch_v1(
  p_composition_signature text,
  p_concept_ids uuid[],
  p_reviewer text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_batch drx_dose.ingredient_identity_review_batches_v1%rowtype;
  v_ids uuid[];
  v_missing integer;
  v_drug uuid;
  v_expression text;
  v_source_count integer;
  v_status text;
  v_affected uuid[] := '{}'::uuid[];
  v_concept uuid;
  v_ordinal integer;
begin
  if nullif(btrim(p_composition_signature),'') is null then
    raise exception 'composition_signature is required';
  end if;
  if nullif(btrim(p_reviewer),'') is null then
    raise exception 'reviewer is required';
  end if;
  if cardinality(coalesce(p_concept_ids,'{}'::uuid[])) < 1 then
    raise exception 'At least one canonical concept_id is required';
  end if;

  select array_agg(x order by x::text)
    into v_ids
  from (select distinct unnest(p_concept_ids) x) s;

  select count(*) into v_missing
  from unnest(v_ids) x
  left join public.substance_concepts_v1 c on c.concept_id=x
  where c.concept_id is null;
  if v_missing>0 then
    raise exception 'One or more concept_ids do not exist in substance_concepts_v1';
  end if;

  select * into v_batch
  from drx_dose.ingredient_identity_review_batches_v1
  where composition_signature=p_composition_signature;

  if not found then
    raise exception 'No active standard identity-review batch for signature %',p_composition_signature;
  end if;

  v_status := case when cardinality(v_ids)=1 then 'RESOLVED_SINGLE' else 'RESOLVED_MULTI' end;

  foreach v_drug in array v_batch.drug_ids loop
    if exists (select 1 from public.product_ingredients_v1 i where i.source_drug_id=v_drug) then
      raise exception 'Drug % already has ingredient rows; refusing to overwrite',v_drug;
    end if;

    select d.active_substance,
           coalesce(r.source_component_count,r.expected_component_count,cardinality(v_ids))
      into v_expression,v_source_count
    from public.drugs d
    join public.product_ingredient_resolution_v1 r on r.source_drug_id=d.id
    where d.id=v_drug
      and r.resolution_status='NEEDS_REVIEW';

    if not found then
      raise exception 'Drug % is no longer NEEDS_REVIEW',v_drug;
    end if;

    v_ordinal := 0;
    foreach v_concept in array v_ids loop
      v_ordinal := v_ordinal + 1;
      insert into public.product_ingredients_v1(
        source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,
        resolution_method,confidence,source_occurrence_count,source_terms
      )
      select
        v_drug,v_ordinal,c.concept_id,v_expression,
        public.medindex_normalize_substance_term_v1(c.canonical_name),
        'REVIEWED_BATCH',1.0,1,array[v_expression]
      from public.substance_concepts_v1 c
      where c.concept_id=v_concept;
    end loop;

    update public.product_ingredient_resolution_v1 r
    set
      resolution_status=v_status,
      expected_component_count=cardinality(v_ids),
      resolved_component_count=cardinality(v_ids),
      reason_codes='{}'::text[],
      source_expression=v_expression,
      reviewed_at=now(),
      duplicate_component_count=greatest(coalesce(v_source_count,cardinality(v_ids))-cardinality(v_ids),0),
      updated_at=now()
    where r.source_drug_id=v_drug
      and r.resolution_status='NEEDS_REVIEW';

    v_affected := array_append(v_affected,v_drug);
  end loop;

  insert into drx_dose.ingredient_identity_batch_decisions_v1(
    composition_signature,normalized_composition,concept_ids,reviewer,review_note,affected_drug_ids
  ) values (
    p_composition_signature,v_batch.normalized_composition,v_ids,btrim(p_reviewer),
    p_review_note,v_affected
  );

  return jsonb_build_object(
    'compositionSignature',p_composition_signature,
    'conceptIds',v_ids,
    'affectedProducts',cardinality(v_affected),
    'resolutionStatus',v_status,
    'autoResolved',false,
    'reviewer',btrim(p_reviewer)
  );
end;
$$;

alter table drx_dose.ingredient_identity_batch_decisions_v1 enable row level security;

revoke all on drx_dose.product_identity_disposition_v3 from public,anon,authenticated;
revoke all on drx_dose.product_identity_disposition_summary_v1 from public,anon,authenticated;
revoke all on drx_dose.ingredient_identity_review_batches_v1 from public,anon,authenticated;
revoke all on drx_dose.special_model_product_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.ingredient_identity_batch_decisions_v1 from public,anon,authenticated;

grant select on drx_dose.product_identity_disposition_v3 to service_role;
grant select on drx_dose.product_identity_disposition_summary_v1 to service_role;
grant select on drx_dose.ingredient_identity_review_batches_v1 to service_role;
grant select on drx_dose.special_model_product_queue_v1 to service_role;
grant select on drx_dose.ingredient_identity_batch_decisions_v1 to service_role;

revoke all on function public.drx_phase11_apply_ingredient_identity_batch_v1(text,uuid[],text,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_apply_ingredient_identity_batch_v1(text,uuid[],text,text)
  to service_role;
