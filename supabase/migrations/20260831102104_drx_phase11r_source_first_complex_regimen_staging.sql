
-- DRx Phase 11R: source-first complex regimen staging.
-- Supports multi-step regimens and weight bands without forcing unsafe flat rules.
-- All rows remain draft/review-only; nothing is published or runtime-served.

create table if not exists drx_dose.source_regimen_candidates_v1 (
  regimen_key text primary key,
  substance_concept_id uuid not null
    references public.substance_concepts_v1(concept_id) on delete restrict,
  indication_key_candidate text not null,
  indication_label text not null,
  patient_group text not null
    check (patient_group in ('adult_only','pediatric_only','pediatric_and_adult','age_band')),
  route_key text not null,
  form_family text,
  regimen_kind text not null
    check (regimen_kind in ('single_step','sequence','weight_band','conditional','sequence_and_band')),
  source_snapshot_id text not null
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section_code text not null default '4.2' check (source_section_code='4.2'),
  source_section_sha256 text not null check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  source_url text not null check (source_url ~ '^https://'),
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','PROMOTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  auto_publish_allowed boolean not null default false check (auto_publish_allowed=false),
  runtime_eligible boolean not null default false check (runtime_eligible=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    review_status not in ('APPROVED','PROMOTED')
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  )
);

create table if not exists drx_dose.source_regimen_steps_v1 (
  regimen_key text not null
    references drx_dose.source_regimen_candidates_v1(regimen_key) on delete cascade,
  branch_no integer not null default 1 check (branch_no >= 1),
  step_no integer not null check (step_no >= 1),
  start_day numeric,
  end_day numeric,
  min_age_months numeric,
  max_age_months numeric,
  min_weight_kg numeric,
  max_weight_kg numeric,
  calculation_method text not null
    check (calculation_method in (
      'fixed_dose','fixed_volume','dose_per_kg_per_dose','dose_per_kg_per_day',
      'dose_per_m2_per_dose','dose_per_m2_per_day','age_band_fixed','manual_only'
    )),
  dose_min_value numeric,
  dose_max_value numeric,
  dose_unit text,
  frequency_mode text not null
    check (frequency_mode in ('interval','times_per_day','single','manual')),
  interval_min_hours numeric,
  interval_max_hours numeric,
  times_per_day numeric,
  duration_min_days numeric,
  duration_max_days numeric,
  max_single_dose_mg numeric,
  max_daily_dose_mg numeric,
  condition_text text,
  source_note text,
  created_at timestamptz not null default now(),
  primary key (regimen_key,branch_no,step_no),
  check (start_day is null or end_day is null or start_day <= end_day),
  check (min_age_months is null or max_age_months is null or min_age_months <= max_age_months),
  check (min_weight_kg is null or max_weight_kg is null or min_weight_kg <= max_weight_kg),
  check (dose_min_value is null or dose_max_value is null or dose_min_value <= dose_max_value),
  check (
    calculation_method='manual_only'
    or (dose_min_value is not null and nullif(btrim(dose_unit),'') is not null)
  ),
  check (
    frequency_mode<>'times_per_day' or times_per_day is not null
  ),
  check (
    frequency_mode<>'interval' or interval_min_hours is not null
  )
);

create index if not exists source_regimen_candidates_v1_substance_idx
  on drx_dose.source_regimen_candidates_v1(substance_concept_id,review_status);
create index if not exists source_regimen_steps_v1_weight_idx
  on drx_dose.source_regimen_steps_v1(regimen_key,min_weight_kg,max_weight_kg);
create index if not exists source_regimen_steps_v1_sequence_idx
  on drx_dose.source_regimen_steps_v1(regimen_key,branch_no,step_no);

create or replace view drx_dose.source_regimen_candidate_readiness_v1 as
with stats as (
  select
    r.regimen_key,
    count(s.*)::integer as step_count,
    count(*) filter (
      where s.calculation_method<>'manual_only'
        and (s.dose_min_value is null or nullif(btrim(s.dose_unit),'') is null)
    )::integer as incomplete_dose_steps,
    count(*) filter (
      where s.frequency_mode='times_per_day' and s.times_per_day is null
    )::integer as incomplete_frequency_steps,
    count(*) filter (
      where s.frequency_mode='interval' and s.interval_min_hours is null
    )::integer as incomplete_interval_steps
  from drx_dose.source_regimen_candidates_v1 r
  left join drx_dose.source_regimen_steps_v1 s on s.regimen_key=r.regimen_key
  group by r.regimen_key
)
select
  r.*,
  st.step_count,
  st.incomplete_dose_steps,
  st.incomplete_frequency_steps,
  st.incomplete_interval_steps,
  (
    st.step_count>0
    and st.incomplete_dose_steps=0
    and st.incomplete_frequency_steps=0
    and st.incomplete_interval_steps=0
    and exists (
      select 1
      from public.dose_source_snapshots_v3 snap
      join public.dose_source_sections_v3 sec
        on sec.snapshot_id=snap.snapshot_id
       and sec.section_code='4.2'
       and sec.section_sha256=r.source_section_sha256
       and sec.extraction_status='extracted'
      where snap.snapshot_id=r.source_snapshot_id
    )
  ) as structurally_complete,
  false::boolean as publication_ready,
  false::boolean as runtime_ready
from drx_dose.source_regimen_candidates_v1 r
join stats st on st.regimen_key=r.regimen_key;

-- Seed source-backed rivaroxaban complex regimen drafts.
with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in (
    'EMC-PRODUCT-101914-SMPC',
    'EMC-PRODUCT-101915-SMPC',
    'EMC-PRODUCT-101916-SMPC'
  )
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='rivaroxaban'
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status
)
select * from (
  select
    'SRC-RIVA-NVAF-ADULT'::text,sub.concept_id,
    'rivaroxaban-nvaf-stroke-systemic-embolism-prevention',
    'Prevention of stroke and systemic embolism in non-valvular atrial fibrillation',
    'adult_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING'
  from sub join src on src.source_key='EMC-PRODUCT-101916-SMPC'

  union all

  select
    'SRC-RIVA-DVTPE-ADULT-SEQUENCE',sub.concept_id,
    'rivaroxaban-dvt-pe-treatment',
    'Treatment of DVT/PE with initial and continued treatment phases',
    'adult_only','PO','oral_solid','sequence',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING'
  from sub join src on src.source_key='EMC-PRODUCT-101916-SMPC'

  union all

  select
    'SRC-RIVA-DVTPE-EXTENDED-ADULT',sub.concept_id,
    'rivaroxaban-dvt-pe-recurrence-prevention-extended',
    'Extended prevention of recurrent DVT/PE after completed initial treatment',
    'adult_only','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING'
  from sub join src on src.source_key='EMC-PRODUCT-101914-SMPC'

  union all

  select
    'SRC-RIVA-PED-VTE-WEIGHT-BANDS',sub.concept_id,
    'rivaroxaban-pediatric-vte-treatment-recurrence-prevention',
    'Paediatric VTE treatment and recurrence prevention after initial parenteral anticoagulation',
    'pediatric_only','PO','oral_solid','weight_band',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING'
  from sub join src on src.source_key='EMC-PRODUCT-101915-SMPC'

  union all

  select
    'SRC-RIVA-ORTHO-VTE-HIP',sub.concept_id,
    'rivaroxaban-vte-prophylaxis-elective-hip-replacement',
    'VTE prophylaxis after elective major hip replacement surgery',
    'adult_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING'
  from sub join src on src.source_key='EMC-PRODUCT-101914-SMPC'

  union all

  select
    'SRC-RIVA-ORTHO-VTE-KNEE',sub.concept_id,
    'rivaroxaban-vte-prophylaxis-elective-knee-replacement',
    'VTE prophylaxis after elective major knee replacement surgery',
    'adult_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING'
  from sub join src on src.source_key='EMC-PRODUCT-101914-SMPC'
) x(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status
)
on conflict (regimen_key) do nothing;

insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,start_day,end_day,min_age_months,max_age_months,
  min_weight_kg,max_weight_kg,calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,times_per_day,duration_min_days,duration_max_days,
  max_single_dose_mg,max_daily_dose_mg,condition_text,source_note
) values
  -- NVAF standard adult regimen.
  ('SRC-RIVA-NVAF-ADULT',1,1,null,null,null,null,null,null,
   'fixed_dose',20,20,'mg','times_per_day',1,null,null,20,20,
   'Standard adult NVAF dose; renal dose modification is staged separately.',
   'Source-backed normalized §4.2 value.'),

  -- Acute DVT/PE sequence.
  ('SRC-RIVA-DVTPE-ADULT-SEQUENCE',1,1,1,21,null,null,null,null,
   'fixed_dose',15,15,'mg','times_per_day',2,21,21,15,30,
   'Initial treatment phase days 1-21.',
   'Source-backed normalized §4.2 value.'),
  ('SRC-RIVA-DVTPE-ADULT-SEQUENCE',1,2,22,null,null,null,null,null,
   'fixed_dose',20,20,'mg','times_per_day',1,null,null,20,20,
   'Continued treatment from day 22 onward.',
   'Source-backed normalized §4.2 value.'),

  -- Extended recurrence prevention: two clinically conditional alternatives.
  ('SRC-RIVA-DVTPE-EXTENDED-ADULT',1,1,null,null,null,null,null,null,
   'fixed_dose',10,10,'mg','times_per_day',1,null,null,10,10,
   'After at least 6 months treatment when extended recurrence prevention is indicated.',
   'Source-backed normalized §4.2 standard extended-prevention dose.'),
  ('SRC-RIVA-DVTPE-EXTENDED-ADULT',2,1,null,null,null,null,null,null,
   'fixed_dose',20,20,'mg','times_per_day',1,null,null,20,20,
   'Alternative when recurrence risk is considered high; requires clinician selection.',
   'Source-backed normalized §4.2 conditional alternative.'),

  -- Paediatric weight bands after >=5 days initial parenteral anticoagulation.
  ('SRC-RIVA-PED-VTE-WEIGHT-BANDS',1,1,null,null,null,215.999,30,49.999,
   'fixed_dose',15,15,'mg','times_per_day',1,90,365,15,15,
   'Body weight 30 to <50 kg; after at least 5 days initial parenteral anticoagulation.',
   'Source-backed normalized §4.2 weight band.'),
  ('SRC-RIVA-PED-VTE-WEIGHT-BANDS',2,1,null,null,null,215.999,50,null,
   'fixed_dose',20,20,'mg','times_per_day',1,90,365,20,20,
   'Body weight >=50 kg; after at least 5 days initial parenteral anticoagulation.',
   'Source-backed normalized §4.2 weight band.'),

  -- Orthopaedic prophylaxis.
  ('SRC-RIVA-ORTHO-VTE-HIP',1,1,null,null,null,null,null,null,
   'fixed_dose',10,10,'mg','times_per_day',1,35,35,10,10,
   'First dose 6-10 hours after surgery once haemostasis is established.',
   'Major hip surgery: source-backed normalized §4.2 duration.'),
  ('SRC-RIVA-ORTHO-VTE-KNEE',1,1,null,null,null,null,null,null,
   'fixed_dose',10,10,'mg','times_per_day',1,14,14,10,10,
   'First dose 6-10 hours after surgery once haemostasis is established.',
   'Major knee surgery: source-backed normalized §4.2 duration.')
on conflict (regimen_key,branch_no,step_no) do nothing;

alter table drx_dose.source_regimen_candidates_v1 enable row level security;
alter table drx_dose.source_regimen_steps_v1 enable row level security;
revoke all on drx_dose.source_regimen_candidates_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_steps_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_candidate_readiness_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.source_regimen_candidates_v1 to service_role;
grant select,insert,update,delete on drx_dose.source_regimen_steps_v1 to service_role;
grant select on drx_dose.source_regimen_candidate_readiness_v1 to service_role;
