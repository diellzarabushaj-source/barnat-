create or replace function public.drx_phase8_refresh_pilot_clinical_provenance_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_clinical
as $$
declare
  v_docs integer;
  v_core integer;
  v_unresolved integer;
begin
  if exists (
    select 1
    from drx_dose.phase8_pilot_clinical_references_v1 cr
    join drx_clinical.source_documents_v1 d on d.source_key=cr.source_key
    where cr.drug_id in (
      'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
      '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
    )
      and d.snapshot_id<>cr.source_snapshot_id
      and cr.evidence_review_status in ('VERIFIED','REJECTED')
  ) then
    raise exception 'Phase 8 clinical provenance refresh blocked: reviewed source snapshot is immutable';
  end if;

  if exists (
    select 1
    from drx_dose.phase8_pilot_clinical_references_v1 cr
    join drx_clinical.source_documents_v1 d on d.source_key=cr.source_key
    where cr.drug_id in (
      'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
      '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
    )
      and d.snapshot_id<>cr.source_snapshot_id
      and (
        exists(select 1 from public.dose_products_v3 p where p.source_snapshot_id=d.snapshot_id)
        or exists(select 1 from public.dose_rules_v3 r where r.source_snapshot_id=d.snapshot_id)
        or exists(select 1 from drx_dose.product_source_bindings_v1 b where b.source_document_id=d.source_document_id)
        or exists(select 1 from drx_clinical.source_identity_resolution_evidence_v1 e where e.source_document_id=d.source_document_id)
      )
  ) then
    raise exception 'Phase 8 clinical provenance refresh blocked: prior modeled evidence is referenced or identity-resolved';
  end if;

  if exists (
    select 1
    from drx_dose.phase8_pilot_clinical_references_v1 cr
    join drx_clinical.source_documents_v1 d on d.source_key=cr.source_key
    join drx_clinical.source_section_evidence_v1 e on e.source_document_id=d.source_document_id
    where cr.drug_id in (
      'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
      '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
    )
      and d.snapshot_id<>cr.source_snapshot_id
      and not exists (
        select 1 from public.dose_source_sections_v3 s
        where s.snapshot_id=cr.source_snapshot_id
          and s.section_code=e.section_code
          and s.extraction_status='extracted'
      )
  ) then
    raise exception 'Phase 8 clinical provenance refresh blocked: new snapshot would drop modeled section evidence';
  end if;

  with current_refs as (
    select cr.*,
           s.final_url,s.source_tier,s.authority,s.jurisdiction,s.document_type,
           s.document_version,s.document_date,s.fetched_at,s.raw_sha256,
           s.archive_locator,s.created_at source_snapshot_created_at,
           (select section_sha256 from public.dose_source_sections_v3 x
             where x.snapshot_id=cr.source_snapshot_id and x.section_code='4.3'
               and x.extraction_status='extracted' limit 1) s43,
           (select section_sha256 from public.dose_source_sections_v3 x
             where x.snapshot_id=cr.source_snapshot_id and x.section_code='4.4'
               and x.extraction_status='extracted' limit 1) s44,
           (select section_sha256 from public.dose_source_sections_v3 x
             where x.snapshot_id=cr.source_snapshot_id and x.section_code='4.5'
               and x.extraction_status='extracted' limit 1) s45,
           (select section_sha256 from public.dose_source_sections_v3 x
             where x.snapshot_id=cr.source_snapshot_id and x.section_code='4.6'
               and x.extraction_status='extracted' limit 1) s46
    from drx_dose.phase8_pilot_clinical_references_v1 cr
    join public.dose_source_snapshots_v3 s
      on s.snapshot_id=cr.source_snapshot_id
     and s.source_key=cr.source_key
     and s.raw_sha256=cr.source_snapshot_id
    where cr.drug_id in (
      'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
      '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
    )
      and cr.source_status='INGESTED'
      and cr.presentation_match_status='MATCHED'
      and cr.section_2_sha256 is not null
      and cr.section_4_1_sha256 is not null
      and cr.section_4_2_sha256 is not null
  )
  update drx_clinical.source_documents_v1 d
  set snapshot_id=c.source_snapshot_id,
      authority_key='EMC',
      authority_rank=20,
      source_url=c.source_url,
      final_url=c.final_url,
      source_tier=c.source_tier,
      authority=c.authority,
      jurisdiction=c.jurisdiction,
      document_type=c.document_type,
      document_version=c.document_version,
      document_date=c.document_date,
      fetched_at=c.fetched_at,
      raw_sha256=c.raw_sha256,
      archive_locator=c.archive_locator,
      source_snapshot_created_at=c.source_snapshot_created_at,
      section_2_sha256=c.section_2_sha256,
      section_4_1_sha256=c.section_4_1_sha256,
      section_4_2_sha256=c.section_4_2_sha256,
      section_4_3_sha256=c.s43,
      section_4_4_sha256=c.s44,
      section_4_5_sha256=c.s45,
      section_4_6_sha256=c.s46,
      evidence_status=case when c.s43 is not null and c.s44 is not null and c.s45 is not null and c.s46 is not null
        then 'CORE_AND_SAFETY_COMPLETE' else 'CORE_COMPLETE' end,
      publication_eligible=false,
      modeled_at=now()
  from current_refs c
  where d.source_key=c.source_key;

  with current_refs as (
    select cr.*,
           s.final_url,s.source_tier,s.authority,s.jurisdiction,s.document_type,
           s.document_version,s.document_date,s.fetched_at,s.raw_sha256,
           s.archive_locator,s.created_at source_snapshot_created_at,
           (select section_sha256 from public.dose_source_sections_v3 x
             where x.snapshot_id=cr.source_snapshot_id and x.section_code='4.3'
               and x.extraction_status='extracted' limit 1) s43,
           (select section_sha256 from public.dose_source_sections_v3 x
             where x.snapshot_id=cr.source_snapshot_id and x.section_code='4.4'
               and x.extraction_status='extracted' limit 1) s44,
           (select section_sha256 from public.dose_source_sections_v3 x
             where x.snapshot_id=cr.source_snapshot_id and x.section_code='4.5'
               and x.extraction_status='extracted' limit 1) s45,
           (select section_sha256 from public.dose_source_sections_v3 x
             where x.snapshot_id=cr.source_snapshot_id and x.section_code='4.6'
               and x.extraction_status='extracted' limit 1) s46
    from drx_dose.phase8_pilot_clinical_references_v1 cr
    join public.dose_source_snapshots_v3 s
      on s.snapshot_id=cr.source_snapshot_id and s.source_key=cr.source_key
    where cr.drug_id in (
      'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
      '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
    )
      and cr.source_status='INGESTED'
      and cr.presentation_match_status='MATCHED'
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
    extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/source-document-key/'||c.source_key),
    c.source_key,c.source_snapshot_id,'EMC',20,c.source_url,c.final_url,c.source_tier,c.authority,c.jurisdiction,
    c.document_type,c.document_version,c.document_date,c.fetched_at,c.raw_sha256,c.archive_locator,
    c.source_snapshot_created_at,c.section_2_sha256,c.section_4_1_sha256,c.section_4_2_sha256,
    c.s43,c.s44,c.s45,c.s46,
    case when c.s43 is not null and c.s44 is not null and c.s45 is not null and c.s46 is not null
      then 'CORE_AND_SAFETY_COMPLETE' else 'CORE_COMPLETE' end,
    false
  from current_refs c
  where not exists(select 1 from drx_clinical.source_documents_v1 d where d.source_key=c.source_key);

  insert into drx_clinical.source_section_evidence_v1(
    source_document_id,snapshot_id,section_code,section_key,heading,section_text,
    section_sha256,parser_version,extraction_status,source_created_at
  )
  select d.source_document_id,s.snapshot_id,s.section_code,s.section_key,s.heading,s.section_text,
         s.section_sha256,s.parser_version,s.extraction_status,s.created_at
  from drx_dose.phase8_pilot_clinical_references_v1 cr
  join drx_clinical.source_documents_v1 d on d.source_key=cr.source_key
  join public.dose_source_sections_v3 s on s.snapshot_id=cr.source_snapshot_id
  where cr.drug_id in (
    'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
    '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
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

  with comp as (
    select d.source_document_id,e.section_text
    from drx_dose.phase8_pilot_clinical_references_v1 cr
    join drx_clinical.source_documents_v1 d on d.source_key=cr.source_key
    join drx_clinical.source_section_evidence_v1 e
      on e.source_document_id=d.source_document_id and e.section_code='2'
    where cr.drug_id in (
      'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
      '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
    )
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

  select count(*) into v_docs
  from drx_dose.phase8_pilot_clinical_references_v1 cr
  join drx_clinical.source_documents_v1 d
    on d.source_key=cr.source_key and d.snapshot_id=cr.source_snapshot_id
  where cr.drug_id in (
    'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
    '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
  );

  select count(*) into v_core
  from drx_dose.phase8_pilot_clinical_references_v1 cr
  join drx_clinical.source_documents_v1 d on d.source_key=cr.source_key
  join drx_clinical.source_section_evidence_v1 e on e.source_document_id=d.source_document_id
  where cr.drug_id in (
    'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
    '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
  )
    and e.snapshot_id=cr.source_snapshot_id
    and e.section_code in ('2','4.1','4.2')
    and e.extraction_status='extracted';

  select count(*) into v_unresolved
  from drx_dose.phase8_pilot_clinical_references_v1 cr
  join drx_clinical.source_documents_v1 d on d.source_key=cr.source_key
  join drx_clinical.source_identity_candidates_v1 c using(source_document_id)
  where cr.drug_id in (
    'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
    '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
  )
    and c.resolution_status<>'UNIQUE_CANDIDATE';

  if v_docs<>2 or v_core<>6 then
    raise exception 'Phase 8 clinical provenance refresh incomplete: docs %, core sections %',v_docs,v_core;
  end if;

  return jsonb_build_object(
    'refreshVersion','drx-phase8-clinical-provenance-refresh-v1',
    'modeledDocuments',v_docs,
    'coreSections',v_core,
    'unresolvedSourceIdentities',v_unresolved,
    'reviewDecisionsChanged',false,
    'publicationAllowed',false,
    'automaticReviewAllowed',false
  );
end;
$$;

revoke all on function public.drx_phase8_refresh_pilot_clinical_provenance_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase8_refresh_pilot_clinical_provenance_v1()
  to service_role;
