-- DRx Phase 8W: model the current two review-only clinical references
-- into the Phase 6 provenance model. No review decision or publication is made.

with refs as (
  select cr.drug_id,cr.source_key,cr.source_snapshot_id
  from drx_dose.phase8_pilot_clinical_references_v1 cr
  where cr.drug_id in (
    'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
    '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
  )
    and cr.source_status='INGESTED'
    and cr.presentation_match_status='MATCHED'
),
bundles as (
  select s.*,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
     where sec.snapshot_id=s.snapshot_id and sec.section_code='2'
       and sec.extraction_status='extracted' limit 1) s2,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
     where sec.snapshot_id=s.snapshot_id and sec.section_code='4.1'
       and sec.extraction_status='extracted' limit 1) s41,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
     where sec.snapshot_id=s.snapshot_id and sec.section_code='4.2'
       and sec.extraction_status='extracted' limit 1) s42,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
     where sec.snapshot_id=s.snapshot_id and sec.section_code='4.3'
       and sec.extraction_status='extracted' limit 1) s43,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
     where sec.snapshot_id=s.snapshot_id and sec.section_code='4.4'
       and sec.extraction_status='extracted' limit 1) s44,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
     where sec.snapshot_id=s.snapshot_id and sec.section_code='4.5'
       and sec.extraction_status='extracted' limit 1) s45,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
     where sec.snapshot_id=s.snapshot_id and sec.section_code='4.6'
       and sec.extraction_status='extracted' limit 1) s46
  from refs r
  join public.dose_source_snapshots_v3 s
    on s.snapshot_id=r.source_snapshot_id and s.source_key=r.source_key
)
insert into drx_clinical.source_documents_v1(
  source_document_id,source_key,snapshot_id,authority_key,authority_rank,
  source_url,final_url,source_tier,authority,jurisdiction,document_type,
  document_version,document_date,fetched_at,raw_sha256,archive_locator,
  source_snapshot_created_at,section_2_sha256,section_4_1_sha256,section_4_2_sha256,
  section_4_3_sha256,section_4_4_sha256,section_4_5_sha256,section_4_6_sha256,
  evidence_status,publication_eligible
)
select
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://drx.local/source-document/' || snapshot_id
  ),
  source_key,snapshot_id,'EMC',20,source_url,final_url,source_tier,authority,jurisdiction,
  document_type,document_version,document_date,fetched_at,raw_sha256,archive_locator,
  created_at,s2,s41,s42,s43,s44,s45,s46,
  case when s43 is not null and s44 is not null and s45 is not null and s46 is not null
       then 'CORE_AND_SAFETY_COMPLETE' else 'CORE_COMPLETE' end,
  false
from bundles
where s2 is not null and s41 is not null and s42 is not null
on conflict (snapshot_id) do update set
  source_key=excluded.source_key,
  authority_key='EMC',
  authority_rank=20,
  section_2_sha256=excluded.section_2_sha256,
  section_4_1_sha256=excluded.section_4_1_sha256,
  section_4_2_sha256=excluded.section_4_2_sha256,
  section_4_3_sha256=excluded.section_4_3_sha256,
  section_4_4_sha256=excluded.section_4_4_sha256,
  section_4_5_sha256=excluded.section_4_5_sha256,
  section_4_6_sha256=excluded.section_4_6_sha256,
  evidence_status=excluded.evidence_status,
  publication_eligible=false,
  modeled_at=now();

insert into drx_clinical.source_section_evidence_v1(
  source_document_id,snapshot_id,section_code,section_key,heading,section_text,
  section_sha256,parser_version,extraction_status,source_created_at
)
select d.source_document_id,s.snapshot_id,s.section_code,s.section_key,s.heading,s.section_text,
       s.section_sha256,s.parser_version,s.extraction_status,s.created_at
from drx_clinical.source_documents_v1 d
join public.dose_source_sections_v3 s on s.snapshot_id=d.snapshot_id
where d.source_key in (
  'emc-10038-phase8-clinical-ref',
  'emc-13494-phase8-clinical-ref'
)
on conflict (source_document_id,section_code) do update set
  snapshot_id=excluded.snapshot_id,
  section_key=excluded.section_key,
  heading=excluded.heading,
  section_text=excluded.section_text,
  section_sha256=excluded.section_sha256,
  parser_version=excluded.parser_version,
  extraction_status=excluded.extraction_status,
  source_created_at=excluded.source_created_at;

with target_docs as (
  select source_document_id
  from drx_clinical.source_documents_v1
  where source_key in (
    'emc-10038-phase8-clinical-ref',
    'emc-13494-phase8-clinical-ref'
  )
),
comp as (
  select d.source_document_id,e.section_text
  from target_docs d
  join drx_clinical.source_section_evidence_v1 e
    on e.source_document_id=d.source_document_id and e.section_code='2'
),
preferred as (
  select t.concept_id,t.term,
         regexp_replace(lower(btrim(t.term)),'([\\.^$|()\[\]{}*+?])','\\\1','g') escaped_term
  from public.substance_terms_v1 t
  where t.term_type='CANONICAL' and t.is_preferred=true and length(btrim(t.term))>=5
),
matches as (
  select c.source_document_id,p.concept_id,p.term
  from comp c
  join preferred p
    on lower(c.section_text) ~ ('(^|[^[:alnum:]])'||p.escaped_term||'([^[:alnum:]]|$)')
),
agg as (
  select c.source_document_id,
         coalesce(array_agg(distinct m.concept_id order by m.concept_id)
           filter(where m.concept_id is not null),'{}'::uuid[]) ids,
         coalesce(array_agg(distinct m.term order by m.term)
           filter(where m.term is not null),'{}'::text[]) terms,
         count(distinct m.concept_id) candidate_count
  from comp c left join matches m using(source_document_id)
  group by c.source_document_id
)
insert into drx_clinical.source_identity_candidates_v1(
  source_document_id,candidate_concept_ids,candidate_terms,candidate_count,
  resolution_status,resolution_method,variant_binding_allowed
)
select source_document_id,ids,terms,candidate_count,
       case when candidate_count=1 then 'UNIQUE_CANDIDATE'
            when candidate_count>1 then 'MULTIPLE_CANDIDATES'
            else 'NO_CANDIDATE' end,
       'SECTION2_BOUNDARY_AWARE_PREFERRED_CANONICAL_TERM_MATCH',
       false
from agg
on conflict (source_document_id) do update set
  candidate_concept_ids=excluded.candidate_concept_ids,
  candidate_terms=excluded.candidate_terms,
  candidate_count=excluded.candidate_count,
  resolution_status=excluded.resolution_status,
  resolution_method=excluded.resolution_method,
  variant_binding_allowed=false;

do $$
declare v_docs int; v_core int;
begin
  select count(*) into v_docs
  from drx_clinical.source_documents_v1
  where source_key in ('emc-10038-phase8-clinical-ref','emc-13494-phase8-clinical-ref');

  select count(*) into v_core
  from drx_clinical.source_section_evidence_v1 e
  join drx_clinical.source_documents_v1 d using(source_document_id)
  where d.source_key in ('emc-10038-phase8-clinical-ref','emc-13494-phase8-clinical-ref')
    and e.section_code in ('2','4.1','4.2')
    and e.extraction_status='extracted';

  if v_docs<>2 or v_core<>6 then
    raise exception 'Phase 8W provenance bridge incomplete: docs %, core sections %',v_docs,v_core;
  end if;
end $$;
