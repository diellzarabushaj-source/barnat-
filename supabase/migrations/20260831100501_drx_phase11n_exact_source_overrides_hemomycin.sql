
-- DRx Phase 11N: exact-source override layer + Hemomycin SmPC source replacement.
-- Generic manufacturer indexes remain discovery-only; selected products can point to
-- exact product SmPCs without mutating the legacy registry source column.

create table if not exists drx_dose.candidate_source_overrides_v1 (
  candidate_id uuid primary key
    references drx_dose.rule_candidate_extractions_v1(candidate_id) on delete cascade,
  exact_source_url text not null check (exact_source_url ~ '^https://'),
  override_status text not null default 'IN_REVIEW'
    check (override_status in ('IN_REVIEW','VERIFIED','REJECTED','RETIRED')),
  reason_code text not null,
  evidence_ref text,
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    override_status<>'VERIFIED'
    or (nullif(btrim(verified_by),'') is not null and verified_at is not null)
  )
);

-- Registry 1729 = Hemomycin 250 mg hard capsule.
insert into drx_dose.candidate_source_overrides_v1(
  candidate_id,exact_source_url,override_status,reason_code,evidence_ref,verified_by,verified_at
)
select
  c.candidate_id,
  'https://www.hemofarm.com/docs/products-new/Hemomycin_250mg_kapsula_tvrda_SmPC.pdf',
  'VERIFIED',
  'EXACT_PRODUCT_SMPC_FROM_MANUFACTURER_INDEX',
  'Hemofarm product index links Hemomycin 250 mg hard capsule to this exact Sažetak karakteristika leka PDF.',
  'system:phase11n-public-source-review',
  now()
from drx_dose.rule_candidate_extractions_v1 c
where c.registry_number=1729
on conflict (candidate_id) do update set
  exact_source_url=excluded.exact_source_url,
  override_status=excluded.override_status,
  reason_code=excluded.reason_code,
  evidence_ref=excluded.evidence_ref,
  verified_by=excluded.verified_by,
  verified_at=excluded.verified_at,
  updated_at=now();

-- Registry 1730 = Hemomycin 500 mg film-coated tablet.
insert into drx_dose.candidate_source_overrides_v1(
  candidate_id,exact_source_url,override_status,reason_code,evidence_ref,verified_by,verified_at
)
select
  c.candidate_id,
  'https://www.hemofarm.com/docs/products-new/Hemomycin_500mg_film_tableta_SmPC.pdf',
  'VERIFIED',
  'EXACT_PRODUCT_SMPC_FROM_MANUFACTURER_INDEX',
  'Hemofarm product index links Hemomycin 500 mg film-coated tablet to this exact Sažetak karakteristika leka PDF.',
  'system:phase11n-public-source-review',
  now()
from drx_dose.rule_candidate_extractions_v1 c
where c.registry_number=1730
on conflict (candidate_id) do update set
  exact_source_url=excluded.exact_source_url,
  override_status=excluded.override_status,
  reason_code=excluded.reason_code,
  evidence_ref=excluded.evidence_ref,
  verified_by=excluded.verified_by,
  verified_at=excluded.verified_at,
  updated_at=now();

create or replace view drx_dose.rule_candidate_effective_source_v1 as
select
  c.candidate_id,
  c.drug_id,
  c.registry_number,
  c.trade_name,
  c.source_url as legacy_source_url,
  case when o.override_status='VERIFIED' then o.exact_source_url else c.source_url end as effective_source_url,
  case when o.override_status='VERIFIED' then 'VERIFIED_OVERRIDE' else 'LEGACY_SOURCE' end as source_resolution,
  o.reason_code as override_reason_code,
  o.evidence_ref as override_evidence_ref
from drx_dose.rule_candidate_extractions_v1 c
left join drx_dose.candidate_source_overrides_v1 o on o.candidate_id=c.candidate_id;

-- Hemomycin 250 mg exact SmPC normalized capture.
with payload as (
  select
    $raw$Source: Hemofarm exact SmPC
Product: Hemomycin 250 mg hard capsules
INN: azithromycin
URL: https://www.hemofarm.com/docs/products-new/Hemomycin_250mg_kapsula_tvrda_SmPC.pdf
Capture date: 2026-08-31

Section 2:
One hard capsule contains 250 mg azithromycin in the form of azithromycin dihydrate.

Section 4.1:
Indications include susceptible upper respiratory infections (pharyngitis/tonsillitis, sinusitis, otitis media), lower respiratory infections (acute exacerbation of chronic bronchitis and community-acquired pneumonia), skin/subcutaneous infections including erythema migrans, uncomplicated genital Chlamydia trachomatis infection, and H. pylori-associated gastric/duodenal infection.

Section 4.2 normalized extract:
Adults, older adults and children >45 kg: for upper/lower respiratory and skin/soft-tissue infections except erythema migrans, total azithromycin dose 1500 mg over 3 days as 500 mg once daily.
Erythema migrans: total 3 g; 1 g on day 1, then 500 mg once daily on days 2-5.
Uncomplicated genital Chlamydia trachomatis infection: 1 g as a single dose.
H. pylori gastric/duodenal infection: 1 g daily in combination therapy according to clinician decision.
Renal: no dose adjustment for mild-moderate impairment (GFR 10-80 mL/min); caution if GFR <10 mL/min.
Hepatic: should not be used in severe hepatic impairment.
Administration: once daily; capsules swallowed whole, at least 1 hour before or 2 hours after food.$raw$::text raw_text,
    $s2$One hard capsule contains 250 mg azithromycin in the form of azithromycin dihydrate.$s2$::text section_2,
    $s41$Indications include susceptible upper respiratory infections (pharyngitis/tonsillitis, sinusitis, otitis media), lower respiratory infections (acute exacerbation of chronic bronchitis and community-acquired pneumonia), skin/subcutaneous infections including erythema migrans, uncomplicated genital Chlamydia trachomatis infection, and H. pylori-associated gastric/duodenal infection.$s41$::text section_41,
    $s42$Adults, older adults and children >45 kg: for upper/lower respiratory and skin/soft-tissue infections except erythema migrans, total azithromycin dose 1500 mg over 3 days as 500 mg once daily.
Erythema migrans: total 3 g; 1 g on day 1, then 500 mg once daily on days 2-5.
Uncomplicated genital Chlamydia trachomatis infection: 1 g as a single dose.
H. pylori gastric/duodenal infection: 1 g daily in combination therapy according to clinician decision.
Renal: no dose adjustment for mild-moderate impairment (GFR 10-80 mL/min); caution if GFR <10 mL/min.
Hepatic: should not be used in severe hepatic impairment.
Administration: once daily; capsules swallowed whole, at least 1 hour before or 2 hours after food.$s42$::text section_42
),
h as (
  select *,
    encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') s2hash,
    encode(digest(section_41,'sha256'),'hex') s41hash,
    encode(digest(section_42,'sha256'),'hex') s42hash
  from payload
)
insert into public.dose_source_snapshots_v3(
  snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
  document_type,document_version,document_date,fetched_at,content_type,content_length,
  raw_sha256,parser_version,archive_locator
)
select snapshot_id,'HEMOFARM-HEMOMYCIN-250-SMPC',
  'https://www.hemofarm.com/docs/products-new/Hemomycin_250mg_kapsula_tvrda_SmPC.pdf',
  'https://www.hemofarm.com/docs/products-new/Hemomycin_250mg_kapsula_tvrda_SmPC.pdf',
  'NON_EU_REGULATOR','Hemofarm / ALIMS-approved SmPC','Serbia','SmPC',
  'Hemofarm current web SmPC captured 2026-08-31',null,now(),
  'text/plain; charset=utf-8; profile=drx-normalized-pdf-capture',
  octet_length(raw_text),snapshot_id,'drx-web-normalized-capture-v1',
  'https://www.hemofarm.com/docs/products-new/Hemomycin_250mg_kapsula_tvrda_SmPC.pdf'
from h on conflict (snapshot_id) do nothing;

with p as (
  select
    $raw$Source: Hemofarm exact SmPC
Product: Hemomycin 250 mg hard capsules
INN: azithromycin
URL: https://www.hemofarm.com/docs/products-new/Hemomycin_250mg_kapsula_tvrda_SmPC.pdf
Capture date: 2026-08-31

Section 2:
One hard capsule contains 250 mg azithromycin in the form of azithromycin dihydrate.

Section 4.1:
Indications include susceptible upper respiratory infections (pharyngitis/tonsillitis, sinusitis, otitis media), lower respiratory infections (acute exacerbation of chronic bronchitis and community-acquired pneumonia), skin/subcutaneous infections including erythema migrans, uncomplicated genital Chlamydia trachomatis infection, and H. pylori-associated gastric/duodenal infection.

Section 4.2 normalized extract:
Adults, older adults and children >45 kg: for upper/lower respiratory and skin/soft-tissue infections except erythema migrans, total azithromycin dose 1500 mg over 3 days as 500 mg once daily.
Erythema migrans: total 3 g; 1 g on day 1, then 500 mg once daily on days 2-5.
Uncomplicated genital Chlamydia trachomatis infection: 1 g as a single dose.
H. pylori gastric/duodenal infection: 1 g daily in combination therapy according to clinician decision.
Renal: no dose adjustment for mild-moderate impairment (GFR 10-80 mL/min); caution if GFR <10 mL/min.
Hepatic: should not be used in severe hepatic impairment.
Administration: once daily; capsules swallowed whole, at least 1 hour before or 2 hours after food.$raw$::text raw_text,
    $s2$One hard capsule contains 250 mg azithromycin in the form of azithromycin dihydrate.$s2$::text section_2,
    $s41$Indications include susceptible upper respiratory infections (pharyngitis/tonsillitis, sinusitis, otitis media), lower respiratory infections (acute exacerbation of chronic bronchitis and community-acquired pneumonia), skin/subcutaneous infections including erythema migrans, uncomplicated genital Chlamydia trachomatis infection, and H. pylori-associated gastric/duodenal infection.$s41$::text section_41,
    $s42$Adults, older adults and children >45 kg: for upper/lower respiratory and skin/soft-tissue infections except erythema migrans, total azithromycin dose 1500 mg over 3 days as 500 mg once daily.
Erythema migrans: total 3 g; 1 g on day 1, then 500 mg once daily on days 2-5.
Uncomplicated genital Chlamydia trachomatis infection: 1 g as a single dose.
H. pylori gastric/duodenal infection: 1 g daily in combination therapy according to clinician decision.
Renal: no dose adjustment for mild-moderate impairment (GFR 10-80 mL/min); caution if GFR <10 mL/min.
Hepatic: should not be used in severe hepatic impairment.
Administration: once daily; capsules swallowed whole, at least 1 hour before or 2 hours after food.$s42$::text section_42
), h as (
  select *,encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') s2hash,
    encode(digest(section_41,'sha256'),'hex') s41hash,
    encode(digest(section_42,'sha256'),'hex') s42hash
  from p
)
insert into public.dose_source_sections_v3(
 snapshot_id,section_code,section_key,heading,section_text,section_sha256,extracted_json,parser_version,extraction_status
)
select snapshot_id,x.section_code,'section-'||x.section_code,x.heading,x.section_text,x.section_hash,
       jsonb_build_object('captureMethod','normalized_public_pdf_capture','sourceUrl','https://www.hemofarm.com/docs/products-new/Hemomycin_250mg_kapsula_tvrda_SmPC.pdf'),
       'drx-web-normalized-capture-v1','extracted'
from h
cross join lateral (values
  ('2','Qualitative and quantitative composition',h.section_2,h.s2hash),
  ('4.1','Therapeutic indications',h.section_41,h.s41hash),
  ('4.2','Posology and method of administration',h.section_42,h.s42hash)
) x(section_code,heading,section_text,section_hash)
on conflict (snapshot_id,section_code) do nothing;

-- Hemomycin 500 mg exact SmPC normalized capture.
with payload as (
  select
    $raw$Source: Hemofarm exact SmPC
Product: Hemomycin 500 mg film-coated tablets
INN: azithromycin
URL: https://www.hemofarm.com/docs/products-new/Hemomycin_500mg_film_tableta_SmPC.pdf
Capture date: 2026-08-31

Section 2:
One film-coated tablet contains 500 mg azithromycin in the form of azithromycin dihydrate.

Section 4.1:
Indications include susceptible upper respiratory infections, lower respiratory infections, skin/subcutaneous infections including moderate acne vulgaris and erythema migrans, uncomplicated Chlamydia trachomatis urethritis/cervicitis, and H. pylori-associated gastric/duodenal infection.

Section 4.2 normalized extract:
Adults, older adults and children >45 kg: respiratory and skin/soft-tissue infections except erythema migrans: total 1500 mg over 3 consecutive days as 500 mg once daily.
Moderate acne vulgaris: 500 mg once daily for 3 days, then 500 mg once weekly for the next 9 weeks.
Erythema migrans: 1 g on day 1, then 500 mg once daily on days 2-5.
Uncomplicated Chlamydia trachomatis urethritis/cervicitis: 1 g single dose.
H. pylori gastric/duodenal infection: 1 g/day in combination therapy.
Renal: no adjustment for GFR 10-80 mL/min; caution when GFR <10 mL/min.
Hepatic: should not be given in severe hepatic impairment.
Paediatric: this 500 mg tablet is only for children >45 kg using adult dosing; lighter children should use another formulation.
Administration: one daily dose; swallow whole, with or without food.$raw$::text raw_text,
    $s2$One film-coated tablet contains 500 mg azithromycin in the form of azithromycin dihydrate.$s2$::text section_2,
    $s41$Indications include susceptible upper respiratory infections, lower respiratory infections, skin/subcutaneous infections including moderate acne vulgaris and erythema migrans, uncomplicated Chlamydia trachomatis urethritis/cervicitis, and H. pylori-associated gastric/duodenal infection.$s41$::text section_41,
    $s42$Adults, older adults and children >45 kg: respiratory and skin/soft-tissue infections except erythema migrans: total 1500 mg over 3 consecutive days as 500 mg once daily.
Moderate acne vulgaris: 500 mg once daily for 3 days, then 500 mg once weekly for the next 9 weeks.
Erythema migrans: 1 g on day 1, then 500 mg once daily on days 2-5.
Uncomplicated Chlamydia trachomatis urethritis/cervicitis: 1 g single dose.
H. pylori gastric/duodenal infection: 1 g/day in combination therapy.
Renal: no adjustment for GFR 10-80 mL/min; caution when GFR <10 mL/min.
Hepatic: should not be given in severe hepatic impairment.
Paediatric: this 500 mg tablet is only for children >45 kg using adult dosing; lighter children should use another formulation.
Administration: one daily dose; swallow whole, with or without food.$s42$::text section_42
), h as (
  select *,encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') s2hash,
    encode(digest(section_41,'sha256'),'hex') s41hash,
    encode(digest(section_42,'sha256'),'hex') s42hash
  from payload
)
insert into public.dose_source_snapshots_v3(
  snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
  document_type,document_version,document_date,fetched_at,content_type,content_length,
  raw_sha256,parser_version,archive_locator
)
select snapshot_id,'HEMOFARM-HEMOMYCIN-500-SMPC',
  'https://www.hemofarm.com/docs/products-new/Hemomycin_500mg_film_tableta_SmPC.pdf',
  'https://www.hemofarm.com/docs/products-new/Hemomycin_500mg_film_tableta_SmPC.pdf',
  'NON_EU_REGULATOR','Hemofarm / ALIMS-approved SmPC','Serbia','SmPC',
  'Hemofarm current web SmPC captured 2026-08-31',null,now(),
  'text/plain; charset=utf-8; profile=drx-normalized-pdf-capture',
  octet_length(raw_text),snapshot_id,'drx-web-normalized-capture-v1',
  'https://www.hemofarm.com/docs/products-new/Hemomycin_500mg_film_tableta_SmPC.pdf'
from h on conflict (snapshot_id) do nothing;

with p as (
  select
    $raw$Source: Hemofarm exact SmPC
Product: Hemomycin 500 mg film-coated tablets
INN: azithromycin
URL: https://www.hemofarm.com/docs/products-new/Hemomycin_500mg_film_tableta_SmPC.pdf
Capture date: 2026-08-31

Section 2:
One film-coated tablet contains 500 mg azithromycin in the form of azithromycin dihydrate.

Section 4.1:
Indications include susceptible upper respiratory infections, lower respiratory infections, skin/subcutaneous infections including moderate acne vulgaris and erythema migrans, uncomplicated Chlamydia trachomatis urethritis/cervicitis, and H. pylori-associated gastric/duodenal infection.

Section 4.2 normalized extract:
Adults, older adults and children >45 kg: respiratory and skin/soft-tissue infections except erythema migrans: total 1500 mg over 3 consecutive days as 500 mg once daily.
Moderate acne vulgaris: 500 mg once daily for 3 days, then 500 mg once weekly for the next 9 weeks.
Erythema migrans: 1 g on day 1, then 500 mg once daily on days 2-5.
Uncomplicated Chlamydia trachomatis urethritis/cervicitis: 1 g single dose.
H. pylori gastric/duodenal infection: 1 g/day in combination therapy.
Renal: no adjustment for GFR 10-80 mL/min; caution when GFR <10 mL/min.
Hepatic: should not be given in severe hepatic impairment.
Paediatric: this 500 mg tablet is only for children >45 kg using adult dosing; lighter children should use another formulation.
Administration: one daily dose; swallow whole, with or without food.$raw$::text raw_text,
    $s2$One film-coated tablet contains 500 mg azithromycin in the form of azithromycin dihydrate.$s2$::text section_2,
    $s41$Indications include susceptible upper respiratory infections, lower respiratory infections, skin/subcutaneous infections including moderate acne vulgaris and erythema migrans, uncomplicated Chlamydia trachomatis urethritis/cervicitis, and H. pylori-associated gastric/duodenal infection.$s41$::text section_41,
    $s42$Adults, older adults and children >45 kg: respiratory and skin/soft-tissue infections except erythema migrans: total 1500 mg over 3 consecutive days as 500 mg once daily.
Moderate acne vulgaris: 500 mg once daily for 3 days, then 500 mg once weekly for the next 9 weeks.
Erythema migrans: 1 g on day 1, then 500 mg once daily on days 2-5.
Uncomplicated Chlamydia trachomatis urethritis/cervicitis: 1 g single dose.
H. pylori gastric/duodenal infection: 1 g/day in combination therapy.
Renal: no adjustment for GFR 10-80 mL/min; caution when GFR <10 mL/min.
Hepatic: should not be given in severe hepatic impairment.
Paediatric: this 500 mg tablet is only for children >45 kg using adult dosing; lighter children should use another formulation.
Administration: one daily dose; swallow whole, with or without food.$s42$::text section_42
), h as (
  select *,encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') s2hash,
    encode(digest(section_41,'sha256'),'hex') s41hash,
    encode(digest(section_42,'sha256'),'hex') s42hash
  from p
)
insert into public.dose_source_sections_v3(
 snapshot_id,section_code,section_key,heading,section_text,section_sha256,extracted_json,parser_version,extraction_status
)
select snapshot_id,x.section_code,'section-'||x.section_code,x.heading,x.section_text,x.section_hash,
       jsonb_build_object('captureMethod','normalized_public_pdf_capture','sourceUrl','https://www.hemofarm.com/docs/products-new/Hemomycin_500mg_film_tableta_SmPC.pdf'),
       'drx-web-normalized-capture-v1','extracted'
from h
cross join lateral (values
  ('2','Qualitative and quantitative composition',h.section_2,h.s2hash),
  ('4.1','Therapeutic indications',h.section_41,h.s41hash),
  ('4.2','Posology and method of administration',h.section_42,h.s42hash)
) x(section_code,heading,section_text,section_hash)
on conflict (snapshot_id,section_code) do nothing;

-- Evidence-backed active moiety: azithromycin dihydrate -> azithromycin.
with snap as (
  select s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id and sec.section_code='2' and sec.extraction_status='extracted'
  where s.source_key='HEMOFARM-HEMOMYCIN-250-SMPC'
  order by s.created_at desc limit 1
)
insert into drx_dose.component_moiety_map_v1(
  source_concept_id,dose_moiety_concept_id,mapping_kind,
  source_snapshot_id,source_section_code,source_section_sha256,
  mapping_status,verified_by,verified_at,note
)
select src.concept_id,dst.concept_id,'ACTIVE_MOIETY',
       snap.snapshot_id,'2',snap.section_sha256,
       'VERIFIED','system:phase11n-hemomycin-composition',now(),
       'Hemomycin SmPC states azithromycin strength in the form of azithromycin dihydrate.'
from public.substance_concepts_v1 src
join public.substance_concepts_v1 dst on dst.canonical_key='azithromycin'
cross join snap
where src.canonical_key='azithromycindihydrate'
on conflict (source_concept_id) do update set
  dose_moiety_concept_id=excluded.dose_moiety_concept_id,
  mapping_kind=excluded.mapping_kind,
  source_snapshot_id=excluded.source_snapshot_id,
  source_section_code=excluded.source_section_code,
  source_section_sha256=excluded.source_section_sha256,
  mapping_status=excluded.mapping_status,
  verified_by=excluded.verified_by,
  verified_at=excluded.verified_at,
  note=excluded.note,
  updated_at=now();

update drx_dose.rule_targets_v1 set ingredient_concept_ids=ingredient_concept_ids;

create or replace view drx_dose.source_ingestion_queue_v1 as
select
  es.effective_source_url as source_url,
  count(*) as regimen_count,
  count(distinct c.drug_id) as product_count,
  count(distinct c.candidate_context_key) as context_count,
  max(c.parser_confidence) as max_parser_confidence
from drx_dose.rule_candidate_extractions_v1 c
join drx_dose.rule_candidate_effective_source_v1 es on es.candidate_id=c.candidate_id
left join drx_dose.source_url_classification_v1 cls on cls.source_url=es.effective_source_url
where nullif(btrim(es.effective_source_url),'') is not null
  and not coalesce(cls.classification_status='VERIFIED' and cls.dose_source_eligible=false,false)
  and not exists (
    select 1 from public.dose_source_snapshots_v3 s
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id=s.snapshot_id and sec.section_code='4.2' and sec.extraction_status='extracted'
    where s.source_url=es.effective_source_url or s.final_url=es.effective_source_url
  )
group by es.effective_source_url;

create or replace view drx_dose.source_replacement_queue_v1 as
select
  es.effective_source_url as source_url,
  cls.source_kind,cls.reason_code,cls.evidence_ref,
  count(*) as regimen_count,
  count(distinct c.drug_id) as product_count,
  count(distinct c.candidate_context_key) as context_count,
  count(*) filter (where c.parser_status='STRUCTURED_CANDIDATE') as structured_candidate_rows,
  array_agg(distinct c.registry_number order by c.registry_number) as registry_numbers
from drx_dose.rule_candidate_extractions_v1 c
join drx_dose.rule_candidate_effective_source_v1 es on es.candidate_id=c.candidate_id
join drx_dose.source_url_classification_v1 cls
  on cls.source_url=es.effective_source_url
 and cls.classification_status='VERIFIED'
 and cls.dose_source_eligible=false
group by es.effective_source_url,cls.source_kind,cls.reason_code,cls.evidence_ref;

create or replace view drx_dose.source_discovery_queue_v1 as
select
  es.effective_source_url as discovery_index_url,
  cls.reason_code,
  c.drug_id,c.registry_number,c.trade_name,c.target_kind,c.substance_concept_id,c.ingredient_set_id,
  c.patient_group,c.indication_text,c.dose_text,c.parser_status,c.parser_confidence,
  es.legacy_source_url,
  case
    when cls.reason_code='PRODUCT_INDEX_REQUIRES_EXACT_SMPC_LINK' then 'FIND_EXACT_PRODUCT_SMPC'
    when cls.reason_code in ('PRODUCT_CATALOG_NOT_POSOLOGY_EVIDENCE','REGISTRY_WORKBOOK_NOT_POSOLOGY_EVIDENCE')
      then 'REPLACE_WITH_OFFICIAL_SMPC_OR_LABEL'
    else 'SOURCE_REVIEW'
  end as discovery_action
from drx_dose.rule_candidate_extractions_v1 c
join drx_dose.rule_candidate_effective_source_v1 es on es.candidate_id=c.candidate_id
join drx_dose.source_url_classification_v1 cls
  on cls.source_url=es.effective_source_url
 and cls.classification_status='VERIFIED'
 and cls.dose_source_eligible=false;

drop function if exists public.drx_phase11_status_v1();
drop view if exists drx_dose.phase11_review_queue_v1;
drop view if exists drx_dose.rule_candidate_promotion_queue_v1;

create view drx_dose.rule_candidate_promotion_queue_v1 as
with source_match as (
  select
    c.candidate_id,
    es.effective_source_url,
    count(distinct s.snapshot_id)::integer as matching_snapshot_count,
    min(s.snapshot_id) as single_snapshot_id,
    min(sec.section_sha256) as single_section_sha256
  from drx_dose.rule_candidate_extractions_v1 c
  join drx_dose.rule_candidate_effective_source_v1 es on es.candidate_id=c.candidate_id
  left join public.dose_source_snapshots_v3 s
    on s.source_url=es.effective_source_url or s.final_url=es.effective_source_url
  left join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id and sec.section_code='4.2' and sec.extraction_status='extracted'
  group by c.candidate_id,es.effective_source_url
),
indication_candidates as (
  select c.candidate_id,t.indication_id
  from drx_dose.rule_candidate_extractions_v1 c
  join public.dose_indication_terms_v3 t
    on lower(regexp_replace(btrim(t.term),'[[:space:]]+',' ','g'))
       = lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g'))
   and t.verified_at is not null
  join public.dose_indication_concepts_v3 i on i.indication_id=t.indication_id and i.editorial_status='published'
  union
  select c.candidate_id,b.indication_id
  from drx_dose.rule_candidate_extractions_v1 c
  join drx_dose.indication_text_bindings_v1 b
    on b.normalized_indication_text=lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g'))
   and b.binding_status='VERIFIED'
  join public.dose_indication_concepts_v3 i on i.indication_id=b.indication_id and i.editorial_status='published'
),
indication_match as (
  select candidate_id,count(distinct indication_id)::integer matching_indication_count,
         min(indication_id::text)::uuid single_indication_id
  from indication_candidates group by candidate_id
)
select
  c.candidate_id,c.legacy_regimen_id,c.drug_id,c.registry_number,c.trade_name,
  c.target_kind,c.substance_concept_id,c.ingredient_set_id,c.ingredient_concept_ids,
  c.patient_group,c.normalized_route_keys,c.form_family,c.release_key,
  c.indication_text,c.dose_text,c.source_url,c.parser_status,c.parser_confidence,
  c.parsed_rule_payload,c.reason_codes,
  sm.matching_snapshot_count,sm.single_snapshot_id,sm.single_section_sha256,
  coalesce(im.matching_indication_count,0) matching_indication_count,
  im.single_indication_id,
  array_remove(array[
    case when c.target_kind='UNRESOLVED' then 'INGREDIENT_IDENTITY' end,
    case when c.target_kind='INGREDIENT_SET' then 'COMBINATION_DOSE_BASIS_COMPONENT' end,
    case when cardinality(c.normalized_route_keys)<>1 then 'ROUTE_NORMALIZATION' end,
    case when c.parser_status<>'STRUCTURED_CANDIDATE' then 'STRUCTURED_DOSE_RULE' end,
    case when coalesce(c.parsed_rule_payload->>'frequencyMode','manual')='manual' then 'SCHEDULE_STRUCTURE' end,
    case when cardinality(c.reason_codes)>0 then 'PARSER_COMPLEXITY_REVIEW' end,
    case when exists (
      select 1 from drx_dose.rule_candidate_context_conflicts_v1 x where x.candidate_context_key=c.candidate_context_key
    ) then 'CONTEXT_CONFLICT' end,
    case when sm.matching_snapshot_count<>1 or sm.single_section_sha256 is null then 'EXACT_SOURCE_SECTION_4_2' end,
    case when coalesce(im.matching_indication_count,0)<>1 then 'VERIFIED_INDICATION_BINDING' end,
    case when c.review_status<>'APPROVED' then 'CLINICAL_REVIEW' end
  ],null) promotion_blockers,
  (
    c.target_kind='SUBSTANCE'
    and cardinality(c.normalized_route_keys)=1
    and c.parser_status='STRUCTURED_CANDIDATE'
    and coalesce(c.parsed_rule_payload->>'frequencyMode','manual')<>'manual'
    and cardinality(c.reason_codes)=0
    and not exists (
      select 1 from drx_dose.rule_candidate_context_conflicts_v1 x where x.candidate_context_key=c.candidate_context_key
    )
    and sm.matching_snapshot_count=1 and sm.single_section_sha256 is not null
    and coalesce(im.matching_indication_count,0)=1
    and c.review_status='APPROVED'
  ) promotion_ready,
  false::boolean auto_publish_allowed,
  sm.effective_source_url
from drx_dose.rule_candidate_extractions_v1 c
join source_match sm on sm.candidate_id=c.candidate_id
left join indication_match im on im.candidate_id=c.candidate_id;

create view drx_dose.phase11_review_queue_v1 as
select 'PRODUCT_INGREDIENT_IDENTITY'::text issue_type,p.drug_id entity_id,p.registry_number::text issue_key,
       array['Resolve ingredient identity before rule inheritance']::text[] details
from drx_dose.product_rule_targets_v1 p where not p.ingredient_target_ready
union all
select 'PRODUCT_COMPATIBILITY',p.drug_id,p.registry_number::text,
       array_remove(array[
         case when p.route_status<>'EXACT' then 'route='||coalesce(p.route_status,'NULL') end,
         case when p.population_status<>'EXACT' then 'population='||coalesce(p.population_status,'NULL') end,
         case when p.variant_binding_status<>'BOUND' then 'variant='||coalesce(p.variant_binding_status,'NULL') end,
         case when cardinality(p.variant_anomaly_codes)>0 then 'anomalies='||array_to_string(p.variant_anomaly_codes,',') end
       ],null)
from drx_dose.product_rule_targets_v1 p where p.ingredient_target_ready and not p.strict_autoinherit_ready
union all
select 'DOSE_CANDIDATE',q.candidate_id,q.registry_number::text||':'||q.patient_group,q.promotion_blockers
from drx_dose.rule_candidate_promotion_queue_v1 q where not q.promotion_ready;

create or replace function public.drx_phase11_promote_candidate_to_draft_v1(
  p_candidate_id uuid,
  p_reviewer text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  q record;
  c record;
  s record;
  v_rule_id uuid := gen_random_uuid();
  v_target_id uuid := gen_random_uuid();
  v_rule_key text;
  v_required text[] := '{}'::text[];
  v_method text;
  v_previous text;
begin
  if nullif(btrim(p_reviewer),'') is null then raise exception 'DRX_PHASE11_REVIEWER_REQUIRED'; end if;

  select * into q from drx_dose.rule_candidate_promotion_queue_v1 where candidate_id=p_candidate_id;
  if q.candidate_id is null then raise exception 'DRX_PHASE11_CANDIDATE_NOT_FOUND'; end if;
  if not q.promotion_ready then
    raise exception 'DRX_PHASE11_PROMOTION_BLOCKED: %',array_to_string(q.promotion_blockers,',');
  end if;

  select * into c from drx_dose.rule_candidate_extractions_v1 where candidate_id=p_candidate_id for update;
  if exists (select 1 from drx_dose.candidate_promotions_v1 where candidate_context_key=c.candidate_context_key) then
    raise exception 'DRX_PHASE11_CONTEXT_ALREADY_PROMOTED';
  end if;

  select snap.*,sec.section_sha256 into s
  from public.dose_source_snapshots_v3 snap
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=snap.snapshot_id and sec.section_code='4.2' and sec.extraction_status='extracted'
  where snap.source_url=q.effective_source_url or snap.final_url=q.effective_source_url;

  v_method := c.parsed_rule_payload->>'calculationMethod';
  if v_method in ('dose_per_kg_per_dose','dose_per_kg_per_day') then
    v_required := array['weight_kg'];
  elsif v_method in ('dose_per_m2_per_dose','dose_per_m2_per_day') then
    v_required := array['weight_kg','height_cm'];
  end if;

  v_rule_key := 'RULE-CANDIDATE-'||upper(c.candidate_context_key);

  insert into public.dose_rules_v3(
    rule_id,rule_key,substance_concept_id,indication_id,patient_group,
    calculation_method,dose_min_value,dose_max_value,dose_unit,dose_basis,
    frequency_mode,interval_min_hours,interval_max_hours,
    times_per_day,times_per_day_min,times_per_day_max,
    duration_mode,duration_min_days,duration_max_days,
    route,required_inputs,dose_basis_mode,
    source_key,source_snapshot_id,source_section,source_section_sha256,
    source_evidence_hash,source_document_version,source_document_date,
    confidence_score,review_class,safety_validation_status,
    editorial_status,version_no
  ) values (
    v_rule_id,v_rule_key,c.substance_concept_id,q.single_indication_id,c.patient_group,
    v_method,
    nullif(c.parsed_rule_payload->>'doseMinValue','')::numeric,
    nullif(c.parsed_rule_payload->>'doseMaxValue','')::numeric,
    c.parsed_rule_payload->>'doseUnit',c.parsed_rule_payload->>'doseBasis',
    c.parsed_rule_payload->>'frequencyMode',
    nullif(c.parsed_rule_payload->>'intervalMinHours','')::numeric,
    nullif(c.parsed_rule_payload->>'intervalMaxHours','')::numeric,
    nullif(c.parsed_rule_payload->>'timesPerDay','')::numeric,
    nullif(c.parsed_rule_payload->>'timesPerDayMin','')::numeric,
    nullif(c.parsed_rule_payload->>'timesPerDayMax','')::numeric,
    coalesce(c.parsed_rule_payload->>'durationMode','manual'),
    nullif(c.parsed_rule_payload->>'durationMinDays','')::numeric,
    nullif(c.parsed_rule_payload->>'durationMaxDays','')::numeric,
    c.normalized_route_keys[1],v_required,'single_active',
    s.source_key,s.snapshot_id,'4.2',s.section_sha256,
    s.snapshot_id,s.document_version,s.document_date,
    c.parser_confidence,'candidate_reviewed','pending','draft',1
  );

  insert into drx_dose.rule_targets_v1(
    rule_target_id,rule_id,target_kind,substance_concept_id,ingredient_concept_ids,
    form_family,release_key,route_keys,strength_match_mode,binding_status
  ) values (
    v_target_id,v_rule_id,'SUBSTANCE',c.substance_concept_id,c.ingredient_concept_ids,
    c.form_family,c.release_key,c.normalized_route_keys,'MANUAL_REVIEW','DRAFT'
  );

  v_previous:=c.review_status;
  update drx_dose.rule_candidate_extractions_v1
  set review_status='PROMOTED',reviewed_by=p_reviewer,reviewed_at=now(),updated_at=now()
  where candidate_id=p_candidate_id;

  insert into drx_dose.candidate_review_events_v1(candidate_id,previous_status,new_status,reviewer,note)
  values(p_candidate_id,v_previous,'PROMOTED',p_reviewer,
    'Promoted to DRAFT V3 rule using effective exact source; publication and inheritance remain blocked pending normal V3 gates.');

  insert into drx_dose.candidate_promotions_v1(candidate_context_key,candidate_id,rule_id,rule_target_id,promoted_by)
  values(c.candidate_context_key,p_candidate_id,v_rule_id,v_target_id,p_reviewer);

  return jsonb_build_object(
    'candidateId',p_candidate_id,'ruleId',v_rule_id,'ruleKey',v_rule_key,'ruleTargetId',v_target_id,
    'effectiveSourceUrl',q.effective_source_url,
    'editorialStatus','draft','targetStatus','DRAFT','autoPublished',false,'runtimeServed',false
  );
end;
$$;

alter table drx_dose.candidate_source_overrides_v1 enable row level security;
revoke all on drx_dose.candidate_source_overrides_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_candidate_effective_source_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.candidate_source_overrides_v1 to service_role;
grant select on drx_dose.rule_candidate_effective_source_v1 to service_role;
