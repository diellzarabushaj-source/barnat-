-- DRx Phase 11DD: V3 calculator RPC payload hardening.
-- Enriches verified adjustment rows with review provenance and max-daily caps,
-- derives deterministic conversion semantics from verified bindings, and fails
-- closed if any referenced adjustment/binding loses verification provenance.

create or replace function public.medindex_dose_product_fast_path_v4(
  p_product_key text default null,
  p_drug_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
with base as (
  select public.medindex_dose_product_fast_path_v3(p_product_key,p_drug_id) as payload
),
selected_product as (
  select p.product_id
  from public.dose_products_v3 p, base b
  where b.payload is not null
    and p.editorial_status='published'
    and p.product_key=b.payload#>>'{product,productKey}'
  limit 1
),
base_rules as (
  select r.rule, r.ord
  from base b
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(b.payload#>'{product,rules}','[]'::jsonb)
  ) with ordinality as r(rule,ord)
),
rule_guard as (
  select
    br.ord,br.rule,
    bnd.conversion_enabled,bnd.tablet_split_allowed,
    bnd.rounding_increment_value,bnd.rounding_increment_unit,
    bnd.binding_status,
    bnd.verified_by as binding_verified_by,
    bnd.verified_at as binding_verified_at,
    not exists (
      select 1
      from pg_catalog.jsonb_array_elements(coalesce(br.rule->'renalAdjustments','[]'::jsonb)) adj
      left join public.dose_renal_adjustments_v3 a
        on a.adjustment_id::text=adj->>'adjustmentId'
       and a.rule_id::text=br.rule->>'ruleId'
      where a.adjustment_id is null
         or a.review_status<>'verified'
         or nullif(btrim(a.verified_by),'') is null
         or a.verified_at is null
         or a.source_section<>'4.2'
         or a.source_snapshot_id is distinct from adj#>>'{source,snapshotId}'
         or a.source_section_sha256 is distinct from adj#>>'{source,sectionSha256}'
         or a.source_evidence_hash is distinct from adj#>>'{source,evidenceHash}'
         or (a.dose_action='max_daily_cap' and coalesce(a.max_daily_dose_mg,0)<=0)
    ) as renal_valid,
    not exists (
      select 1
      from pg_catalog.jsonb_array_elements(coalesce(br.rule->'hepaticAdjustments','[]'::jsonb)) adj
      left join public.dose_hepatic_adjustments_v3 a
        on a.adjustment_id::text=adj->>'adjustmentId'
       and a.rule_id::text=br.rule->>'ruleId'
      where a.adjustment_id is null
         or a.review_status<>'verified'
         or nullif(btrim(a.verified_by),'') is null
         or a.verified_at is null
         or a.source_section<>'4.2'
         or a.source_snapshot_id is distinct from adj#>>'{source,snapshotId}'
         or a.source_section_sha256 is distinct from adj#>>'{source,sectionSha256}'
         or a.source_evidence_hash is distinct from adj#>>'{source,evidenceHash}'
         or (a.dose_action='max_daily_cap' and coalesce(a.max_daily_dose_mg,0)<=0)
    ) as hepatic_valid
  from base_rules br
  cross join selected_product sp
  left join public.dose_rule_products_v3 bnd
    on bnd.product_id=sp.product_id
   and bnd.rule_id::text=br.rule->>'ruleId'
   and bnd.binding_status='verified'
),
enriched_rules as (
  select jsonb_agg(
    rg.rule || jsonb_build_object(
      'conversion',jsonb_build_object(
        'enabled',rg.conversion_enabled,
        'tabletSplitAllowed',rg.tablet_split_allowed,
        'roundingIncrementValue',rg.rounding_increment_value,
        'roundingIncrementUnit',rg.rounding_increment_unit,
        'status',case when rg.conversion_enabled then 'automatic' else 'not_allowed' end,
        'bindingStatus',rg.binding_status,
        'verifiedBy',rg.binding_verified_by,
        'verifiedAt',rg.binding_verified_at
      ),
      'renalAdjustments',coalesce((
        select jsonb_agg(
          adj || jsonb_build_object(
            'maxDailyDoseMg',a.max_daily_dose_mg,
            'reviewStatus',a.review_status,
            'verifiedBy',a.verified_by,
            'verifiedAt',a.verified_at
          ) order by x.ord
        )
        from pg_catalog.jsonb_array_elements(coalesce(rg.rule->'renalAdjustments','[]'::jsonb))
          with ordinality as x(adj,ord)
        join public.dose_renal_adjustments_v3 a
          on a.adjustment_id::text=adj->>'adjustmentId'
         and a.rule_id::text=rg.rule->>'ruleId'
      ),'[]'::jsonb),
      'hepaticAdjustments',coalesce((
        select jsonb_agg(
          adj || jsonb_build_object(
            'maxDailyDoseMg',a.max_daily_dose_mg,
            'reviewStatus',a.review_status,
            'verifiedBy',a.verified_by,
            'verifiedAt',a.verified_at
          ) order by x.ord
        )
        from pg_catalog.jsonb_array_elements(coalesce(rg.rule->'hepaticAdjustments','[]'::jsonb))
          with ordinality as x(adj,ord)
        join public.dose_hepatic_adjustments_v3 a
          on a.adjustment_id::text=adj->>'adjustmentId'
         and a.rule_id::text=rg.rule->>'ruleId'
      ),'[]'::jsonb)
    ) order by rg.ord
  ) as rules,
  bool_and(
    rg.renal_valid
    and rg.hepatic_valid
    and rg.binding_status='verified'
    and nullif(btrim(rg.binding_verified_by),'') is not null
    and rg.binding_verified_at is not null
  ) as valid
  from rule_guard rg
)
select case
  when b.payload is null then null
  when coalesce(er.valid,false) is not true then null
  else jsonb_set(
    jsonb_set(b.payload,'{product,rules}',coalesce(er.rules,'[]'::jsonb),false),
    '{meta}',
    coalesce(b.payload->'meta','{}'::jsonb)
      || jsonb_build_object(
        'runtimeModel','v3-rpc-v4',
        'adjustmentReviewProvenanceRequired',true,
        'conversionContract','automatic-or-not-allowed'
      ),
    false
  )
end
from base b
cross join enriched_rules er;
$$;

revoke all on function public.medindex_dose_product_fast_path_v4(text,uuid)
  from public,anon,authenticated;
grant execute on function public.medindex_dose_product_fast_path_v4(text,uuid)
  to service_role;
