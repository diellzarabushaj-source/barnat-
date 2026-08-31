
-- DRx Phase 11BE: promote the already-staged co-amoxiclav paediatric DOSE_BASIS
-- component values into the main calculable step shape.
-- No new clinical numbers are introduced: values come from the existing
-- amoxicillin DOSE_BASIS component rows.

update drx_dose.source_regimen_steps_v1 s
set
  calculation_method='dose_per_kg_per_day',
  dose_min_value=c.dose_min_value,
  dose_max_value=c.dose_max_value,
  dose_unit=c.dose_unit
from drx_dose.source_regimen_step_components_v1 c
where s.regimen_key in (
    'SRC-COAMOX-PED-STANDARD-RANGE',
    'SRC-COAMOX-PED-HIGHER-RANGE'
  )
  and c.regimen_key=s.regimen_key
  and c.branch_no=s.branch_no
  and c.step_no=s.step_no
  and c.component_role='DOSE_BASIS'
  and c.dose_basis='kg/day'
  and c.dose_min_value is not null
  and c.dose_max_value is not null
  and c.dose_unit='mg';

create or replace view drx_dose.source_regimen_non_calculable_disposition_v1 as
select
  r.regimen_key,
  r.dose_moiety_key,
  r.indication_label,
  r.patient_group,
  count(*) as step_count,
  count(*) filter (where s.calculation_method='manual_only') as manual_only_steps,
  case
    when count(*) filter (where s.calculation_method='manual_only')=count(*)
      then 'REVIEWED_TEXT_ONLY_TARGET'
    when count(*) filter (where s.calculation_method='manual_only')>0
      then 'MIXED_CALCULATOR_AND_MANUAL_TARGET'
    else 'CALCULATOR_TARGET'
  end as intended_runtime_mode,
  false::boolean as auto_publish_allowed
from drx_dose.source_regimen_candidates_v1 r
join drx_dose.source_regimen_steps_v1 s on s.regimen_key=r.regimen_key
group by r.regimen_key,r.dose_moiety_key,r.indication_label,r.patient_group;

revoke all on drx_dose.source_regimen_non_calculable_disposition_v1 from public,anon,authenticated;
grant select on drx_dose.source_regimen_non_calculable_disposition_v1 to service_role;
