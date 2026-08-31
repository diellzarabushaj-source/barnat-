
-- DRx Phase 11BM: completion model v3 + compact operational review dashboard.
-- Complex products are dispositioned explicitly instead of falsely requiring all
-- 4,013 products to fit the standard substance-dose inheritance model.

create or replace view drx_dose.phase11_completion_checklist_v3 as
with old as (
  select check_key,stage,current_value,target_value,ready,meaning,auto_override_allowed
  from drx_dose.phase11_completion_checklist_v2
  where check_key not in ('PRODUCT_IDENTITY_COVERAGE','UNRESOLVED_PRODUCT_IDENTITY')
),
disp as (
  select
    count(*)::numeric as all_products,
    count(*) filter (
      where identity_disposition in (
        'STANDARD_DOSE_MODEL_READY',
        'STANDARD_IDENTITY_REVIEW',
        'SPECIAL_MODEL_ROUTED',
        'EXCLUDED_FROM_STANDARD_DOSE_MODEL'
      )
    )::numeric as dispositioned_products,
    count(*) filter (where identity_disposition='STANDARD_IDENTITY_REVIEW')::numeric
      as standard_identity_review_remaining,
    count(*) filter (where identity_disposition='SPECIAL_MODEL_ROUTED')::numeric
      as special_model_products,
    count(*) filter (where identity_disposition='EXCLUDED_FROM_STANDARD_DOSE_MODEL')::numeric
      as excluded_products
  from drx_dose.product_identity_disposition_v3
),
batch as (
  select count(*)::numeric review_batches
  from drx_dose.ingredient_identity_review_batches_v1
)
select * from old
union all
select
  'PRODUCT_DISPOSITION_COVERAGE','foundation',
  disp.dispositioned_products,disp.all_products,
  disp.dispositioned_products=disp.all_products,
  'Every published product has an explicit standard/review/special/excluded dose-model disposition.',
  false
from disp
union all
select
  'STANDARD_IDENTITY_REVIEW_REMAINING','foundation',
  disp.standard_identity_review_remaining,0::numeric,
  disp.standard_identity_review_remaining=0,
  'Only normal products intended for standard substance/ingredient-set dose inheritance must reach canonical ingredient identity.',
  false
from disp
union all
select
  'SPECIAL_MODEL_ROUTING','foundation',
  disp.special_model_products,25::numeric,
  disp.special_model_products=25,
  'Homeopathic complexes, vaccines/biologics and parenteral-nutrition products are routed away from standard dose inheritance.',
  false
from disp
union all
select
  'EXCLUDED_PRODUCT_DISPOSITION','foundation',
  disp.excluded_products,1::numeric,
  disp.excluded_products=1,
  'Explicitly excluded non-standard registry item remains outside the standard dose model.',
  false
from disp
union all
select
  'IDENTITY_REVIEW_BATCHES','foundation',
  batch.review_batches,0::numeric,
  batch.review_batches=0,
  'Remaining standard identity reviews are batched by identical composition expression.',
  false
from batch;

create or replace view drx_dose.phase11_completion_summary_v3 as
select
  bool_and(ready) filter (where stage='foundation') as foundation_complete,
  bool_and(ready) filter (where stage='clinical_review') as clinical_review_complete,
  bool_and(ready) filter (where stage='promotion') as promotion_complete,
  bool_and(ready) filter (where stage='runtime') as runtime_complete,
  count(*) filter (where stage='foundation' and not ready) as foundation_blockers,
  count(*) filter (where stage='clinical_review' and not ready) as clinical_review_blockers,
  count(*) filter (where stage='promotion' and not ready) as promotion_blockers,
  count(*) filter (where stage='runtime' and not ready) as runtime_blockers,
  array_agg(check_key order by stage,check_key) filter (where not ready) as blocking_checks,
  false::boolean as auto_finish_allowed
from drx_dose.phase11_completion_checklist_v3;

create or replace view drx_dose.phase11_review_workbench_summary_v1 as
select
  'IDENTITY_BATCH'::text as work_type,
  composition_signature as work_key,
  array_to_string(trade_names,' / ') as label,
  product_count::bigint as affected_products,
  'REVIEW_CANONICAL_INGREDIENTS'::text as next_action,
  false::boolean as auto_approve_allowed
from drx_dose.ingredient_identity_review_batches_v1

union all

select
  'CLINICAL_BATCH',
  dose_moiety_key,
  review_target_name,
  represented_product_count::bigint,
  next_action,
  false
from drx_dose.clinical_review_batch_summary_v1

union all

select
  'PRODUCT_SHELL_SOURCE',
  drug_id::text,
  concat_ws(' — ',trade_name,pharmaceutical_form),
  1::bigint,
  next_action,
  false
from drx_dose.product_shell_provisioning_queue_v1;

create or replace view drx_dose.phase11_review_workbench_counts_v1 as
select
  work_type,
  count(*) as work_items,
  coalesce(sum(affected_products),0) as affected_products
from drx_dose.phase11_review_workbench_summary_v1
group by work_type;

revoke all on drx_dose.phase11_completion_checklist_v3 from public,anon,authenticated;
revoke all on drx_dose.phase11_completion_summary_v3 from public,anon,authenticated;
revoke all on drx_dose.phase11_review_workbench_summary_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_review_workbench_counts_v1 from public,anon,authenticated;

grant select on drx_dose.phase11_completion_checklist_v3 to service_role;
grant select on drx_dose.phase11_completion_summary_v3 to service_role;
grant select on drx_dose.phase11_review_workbench_summary_v1 to service_role;
grant select on drx_dose.phase11_review_workbench_counts_v1 to service_role;
