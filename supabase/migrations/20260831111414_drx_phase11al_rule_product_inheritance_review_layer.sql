
-- DRx Phase 11AL: product inheritance review layer.
-- Purpose: show exactly which products can reuse an already-reviewed rule and
-- which compatibility fact still blocks inheritance. Runtime is unchanged.

create table if not exists drx_dose.rule_product_compatibility_reviews_v1 (
  rule_target_id uuid not null
    references drx_dose.rule_targets_v1(rule_target_id) on delete cascade,
  drug_id uuid not null
    references public.drugs(id) on delete cascade,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','RETIRED')),
  reviewed_route_compatible boolean,
  reviewed_form_compatible boolean,
  reviewed_release_compatible boolean,
  reviewed_strength_compatible boolean,
  reviewed_population_compatible boolean,
  evidence_note text,
  evidence_urls text[] not null default '{}'::text[],
  reviewed_by text,
  reviewed_at timestamptz,
  auto_apply_allowed boolean not null default false check (auto_apply_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (rule_target_id,drug_id),
  check (
    review_status<>'APPROVED'
    or (
      reviewed_route_compatible is true
      and reviewed_form_compatible is true
      and reviewed_release_compatible is true
      and reviewed_strength_compatible is true
      and reviewed_population_compatible is true
      and nullif(btrim(reviewed_by),'') is not null
      and reviewed_at is not null
    )
  )
);

create index if not exists rule_product_compatibility_reviews_v1_status_idx
  on drx_dose.rule_product_compatibility_reviews_v1(review_status,drug_id);

create or replace view drx_dose.rule_product_inheritance_review_v1 as
with base as (
  select
    p.drug_id,p.registry_number,p.trade_name,p.pharmaceutical_form,
    p.target_kind as product_target_kind,
    p.dose_moiety_key,p.dose_moiety_concept_ids,
    p.form_family as product_form_family,
    p.release_key as product_release_key,
    p.release_status as product_release_status,
    p.route_keys as product_route_keys,
    p.route_status as product_route_status,
    p.population_key as product_population_key,
    p.population_status as product_population_status,
    p.strength_hash as product_strength_hash,
    p.clinical_variant_id as product_clinical_variant_id,
    p.variant_binding_status,p.variant_anomaly_codes,
    p.strict_autoinherit_ready,
    t.rule_target_id,t.rule_id,t.target_kind as rule_target_kind,
    t.form_family as rule_form_family,t.release_key as rule_release_key,
    t.route_keys as rule_route_keys,t.strength_match_mode,
    t.required_strength_hash,t.required_clinical_variant_id,t.binding_status,
    r.rule_key,r.patient_group,r.indication_id,r.route as rule_route,
    r.pharmaceutical_form as rule_pharmaceutical_form,r.editorial_status,
    (
      cardinality(t.route_keys)=0
      or t.route_keys && p.route_keys
    ) as route_compatible,
    (
      t.form_family is null
      or t.form_family=p.form_family
    ) as form_compatible,
    (
      t.release_key is null
      or (
        p.release_status<>'UNRESOLVED'
        and t.release_key=p.release_key
      )
    ) as release_compatible,
    (
      t.strength_match_mode='ANY_COMPATIBLE'
      or (
        t.strength_match_mode='EXACT_VARIANT'
        and t.required_clinical_variant_id=p.clinical_variant_id
      )
      or (
        t.strength_match_mode='EXACT_STRENGTH'
        and t.required_strength_hash=p.strength_hash
      )
    ) as strength_compatible,
    (
      (r.patient_group='adult_only'
        and p.population_key in ('ADULT_ONLY','ADULT_AND_PEDIATRIC'))
      or
      (r.patient_group in ('pediatric_only','age_band')
        and p.population_key in ('PEDIATRIC_ONLY','ADULT_AND_PEDIATRIC'))
      or
      (r.patient_group='pediatric_and_adult'
        and p.population_key='ADULT_AND_PEDIATRIC')
    ) as population_compatible
  from drx_dose.product_dose_moiety_targets_v1 p
  join drx_dose.rule_targets_v1 t
    on t.binding_status='VERIFIED'
   and t.dose_moiety_key is not null
   and t.dose_moiety_key=p.dose_moiety_key
   and t.target_kind=p.target_kind
  join public.dose_rules_v3 r
    on r.rule_id=t.rule_id
   and r.editorial_status='published'
)
select
  b.*,
  array_remove(array[
    case when not b.route_compatible then 'ROUTE_MISMATCH' end,
    case when not b.form_compatible then 'FORM_MISMATCH' end,
    case when b.product_route_status<>'EXACT' then 'ROUTE_UNRESOLVED' end,
    case when b.product_population_status<>'EXACT' then 'POPULATION_UNRESOLVED' end,
    case when b.product_release_status='UNRESOLVED' then 'RELEASE_UNRESOLVED' end,
    case when not b.release_compatible then 'RELEASE_MISMATCH' end,
    case when not b.strength_compatible then 'STRENGTH_MISMATCH' end,
    case when not b.population_compatible then 'POPULATION_MISMATCH' end,
    case when b.variant_binding_status<>'BOUND' then 'VARIANT_NOT_BOUND' end,
    case when cardinality(coalesce(b.variant_anomaly_codes,'{}'::text[]))>0 then 'VARIANT_ANOMALY' end
  ],null) as blocker_codes,
  coalesce(cr.review_status,'PENDING') as compatibility_review_status,
  coalesce(cr.auto_apply_allowed,false) as auto_apply_allowed,
  case
    when b.strict_autoinherit_ready
      and b.route_compatible and b.form_compatible and b.release_compatible
      and b.strength_compatible and b.population_compatible
      then 'STRICT_MATCH'
    when b.route_compatible and b.form_compatible and b.strength_compatible
      and b.population_compatible
      and b.product_route_status='EXACT'
      and b.product_population_status='EXACT'
      then 'COMPATIBILITY_REVIEW_GAP'
    else 'INCOMPATIBLE_OR_UNRESOLVED'
  end as inheritance_status
from base b
left join drx_dose.rule_product_compatibility_reviews_v1 cr
  on cr.rule_target_id=b.rule_target_id
 and cr.drug_id=b.drug_id;

create or replace view drx_dose.rule_product_inheritance_gap_summary_v1 as
select
  rule_key,
  count(*) as candidate_products,
  count(*) filter (where inheritance_status='STRICT_MATCH') as strict_matches,
  count(*) filter (where inheritance_status='COMPATIBILITY_REVIEW_GAP') as review_gaps,
  count(*) filter (where inheritance_status='INCOMPATIBLE_OR_UNRESOLVED') as incompatible_or_unresolved,
  count(*) filter (where blocker_codes @> array['RELEASE_UNRESOLVED']::text[]) as release_unresolved,
  count(*) filter (where blocker_codes @> array['STRENGTH_MISMATCH']::text[]) as strength_mismatch,
  count(*) filter (where blocker_codes @> array['FORM_MISMATCH']::text[]) as form_mismatch,
  count(*) filter (where blocker_codes @> array['ROUTE_MISMATCH']::text[]) as route_mismatch,
  count(*) filter (where compatibility_review_status='APPROVED') as reviewed_approved,
  false::boolean as runtime_auto_apply
from drx_dose.rule_product_inheritance_review_v1
group by rule_key;

create or replace view drx_dose.rule_product_inheritance_action_queue_v1 as
select
  x.rule_target_id,x.rule_id,x.rule_key,
  x.drug_id,x.registry_number,x.trade_name,x.pharmaceutical_form,
  x.dose_moiety_key,x.product_form_family,x.product_release_key,x.product_release_status,
  x.product_route_keys,x.product_population_key,x.strength_match_mode,
  x.blocker_codes,x.inheritance_status,x.compatibility_review_status,
  case
    when x.inheritance_status='STRICT_MATCH' then 'NO_REVIEW_NEEDED'
    when x.inheritance_status='COMPATIBILITY_REVIEW_GAP'
      and x.blocker_codes <@ array['RELEASE_UNRESOLVED','VARIANT_NOT_BOUND','VARIANT_ANOMALY']::text[]
      then 'REVIEW_RELEASE_AND_VARIANT_COMPATIBILITY'
    when x.inheritance_status='COMPATIBILITY_REVIEW_GAP'
      then 'REVIEW_PRODUCT_COMPATIBILITY'
    else 'DO_NOT_INHERIT'
  end as next_action,
  false::boolean as runtime_auto_apply
from drx_dose.rule_product_inheritance_review_v1 x;

alter table drx_dose.rule_product_compatibility_reviews_v1 enable row level security;
revoke all on drx_dose.rule_product_compatibility_reviews_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_product_inheritance_review_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_product_inheritance_gap_summary_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_product_inheritance_action_queue_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.rule_product_compatibility_reviews_v1 to service_role;
grant select on drx_dose.rule_product_inheritance_review_v1 to service_role;
grant select on drx_dose.rule_product_inheritance_gap_summary_v1 to service_role;
grant select on drx_dose.rule_product_inheritance_action_queue_v1 to service_role;
