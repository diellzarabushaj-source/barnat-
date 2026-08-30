-- DRx Phase 6A: regulatory source hierarchy and immutable current provenance bundle.

create schema if not exists drx_clinical;
revoke all on schema drx_clinical from public,anon,authenticated;

create table if not exists drx_clinical.source_authority_policy_v1 (
  authority_key text primary key,
  priority_rank integer not null unique check (priority_rank > 0),
  display_name text not null,
  primary_regulatory boolean not null,
  policy_note text not null
);

insert into drx_clinical.source_authority_policy_v1(
  authority_key,priority_rank,display_name,primary_regulatory,policy_note
)
values
 ('EMA',10,'European Medicines Agency',true,'First-priority regulatory source'),
 ('EMC',20,'electronic Medicines Compendium',true,'UK regulated product information'),
 ('AEMPS_CIMA',30,'AEMPS / CIMA',true,'Spanish regulatory product information'),
 ('EU_REGULATOR',40,'Other EU/EEA regulator',true,'Other official European regulator'),
 ('KOSOVO_REGION',50,'Kosovo / regional regulator',true,'Kosovo or regional official regulator'),
 ('OTHER_OFFICIAL',60,'Other official source',false,'Fallback official evidence; not preferred over regulatory hierarchy'),
 ('NON_REGULATORY',90,'Non-regulatory source',false,'Never preferred when regulatory evidence exists')
on conflict (authority_key) do update set
  priority_rank=excluded.priority_rank,
  display_name=excluded.display_name,
  primary_regulatory=excluded.primary_regulatory,
  policy_note=excluded.policy_note;

create table if not exists drx_clinical.source_documents_v1 (
  source_document_id uuid primary key,
  source_key text not null unique,
  snapshot_id text not null unique,
  authority_key text not null
    references drx_clinical.source_authority_policy_v1(authority_key) on delete restrict,
  authority_rank integer not null,
  source_url text not null,
  final_url text,
  source_tier text,
  authority text,
  jurisdiction text,
  document_type text,
  document_version text,
  document_date date,
  fetched_at timestamptz,
  raw_sha256 text not null check (raw_sha256 ~ '^[0-9a-f]{64}$'),
  archive_locator text,
  source_snapshot_created_at timestamptz not null,
  section_2_sha256 text not null check (section_2_sha256 ~ '^[0-9a-f]{64}$'),
  section_4_1_sha256 text not null check (section_4_1_sha256 ~ '^[0-9a-f]{64}$'),
  section_4_2_sha256 text not null check (section_4_2_sha256 ~ '^[0-9a-f]{64}$'),
  section_4_3_sha256 text,
  section_4_4_sha256 text,
  section_4_5_sha256 text,
  section_4_6_sha256 text,
  evidence_status text not null check (evidence_status in ('CORE_COMPLETE','CORE_AND_SAFETY_COMPLETE')),
  publication_eligible boolean not null default false,
  modeled_at timestamptz not null default now(),
  check (publication_eligible=false)
);

delete from drx_clinical.source_documents_v1;

with ranked as (
  select
    s.snapshot_id,s.source_key,s.source_url,s.final_url,s.source_tier,s.authority,
    s.jurisdiction,s.document_type,s.document_version,s.document_date,s.fetched_at,
    s.raw_sha256,s.archive_locator,s.created_at,
    row_number() over(
      partition by s.source_key
      order by s.fetched_at desc nulls last,s.created_at desc,s.snapshot_id desc
    ) rn
  from public.dose_source_snapshots_v3 s
),
latest as (
  select * from ranked where rn=1
),
bundles as (
  select
    l.*,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
      where sec.snapshot_id=l.snapshot_id
        and sec.section_key='qualitative_and_quantitative_composition'
      limit 1) s2,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
      where sec.snapshot_id=l.snapshot_id
        and sec.section_key='therapeutic_indications'
      limit 1) s41,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
      where sec.snapshot_id=l.snapshot_id
        and sec.section_key='posology_and_method_of_administration'
      limit 1) s42,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
      where sec.snapshot_id=l.snapshot_id
        and sec.section_key='contraindications'
      limit 1) s43,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
      where sec.snapshot_id=l.snapshot_id
        and sec.section_key='special_warnings_and_precautions'
      limit 1) s44,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
      where sec.snapshot_id=l.snapshot_id
        and sec.section_key='interactions'
      limit 1) s45,
    (select sec.section_sha256 from public.dose_source_sections_v3 sec
      where sec.snapshot_id=l.snapshot_id
        and sec.section_key='fertility_pregnancy_lactation'
      limit 1) s46
  from latest l
)
insert into drx_clinical.source_documents_v1(
  source_document_id,source_key,snapshot_id,authority_key,authority_rank,
  source_url,final_url,source_tier,authority,jurisdiction,document_type,
  document_version,document_date,fetched_at,raw_sha256,archive_locator,
  source_snapshot_created_at,
  section_2_sha256,section_4_1_sha256,section_4_2_sha256,
  section_4_3_sha256,section_4_4_sha256,section_4_5_sha256,section_4_6_sha256,
  evidence_status,publication_eligible
)
select
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://drx.local/source-document/' || snapshot_id
  ),
  source_key,
  snapshot_id,
  case
    when upper(coalesce(source_tier,''))='EMA' then 'EMA'
    when upper(coalesce(source_tier,''))='EMC' then 'EMC'
    when upper(coalesce(source_tier,'')) in ('AEMPS','CIMA','AEMPS_CIMA') then 'AEMPS_CIMA'
    when upper(coalesce(jurisdiction,'')) in (
      'EU','AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR',
      'HU','IE','IS','IT','LI','LT','LU','LV','MT','NL','NO','PL','PT','RO','SE','SI','SK'
    ) then 'EU_REGULATOR'
    when upper(coalesce(jurisdiction,'')) in ('XK','KOSOVO','AL','MK','ME','RS','BA') then 'KOSOVO_REGION'
    else 'OTHER_OFFICIAL'
  end,
  case
    when upper(coalesce(source_tier,''))='EMA' then 10
    when upper(coalesce(source_tier,''))='EMC' then 20
    when upper(coalesce(source_tier,'')) in ('AEMPS','CIMA','AEMPS_CIMA') then 30
    when upper(coalesce(jurisdiction,'')) in (
      'EU','AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR',
      'HU','IE','IS','IT','LI','LT','LU','LV','MT','NL','NO','PL','PT','RO','SE','SI','SK'
    ) then 40
    when upper(coalesce(jurisdiction,'')) in ('XK','KOSOVO','AL','MK','ME','RS','BA') then 50
    else 60
  end,
  source_url,final_url,source_tier,authority,jurisdiction,document_type,
  document_version,document_date,fetched_at,raw_sha256,archive_locator,created_at,
  s2,s41,s42,s43,s44,s45,s46,
  case
    when s43 is not null and s44 is not null and s45 is not null and s46 is not null
      then 'CORE_AND_SAFETY_COMPLETE'
    else 'CORE_COMPLETE'
  end,
  false
from bundles
where s2 is not null and s41 is not null and s42 is not null;

create table if not exists drx_clinical.source_section_evidence_v1 (
  source_document_id uuid not null
    references drx_clinical.source_documents_v1(source_document_id) on delete cascade,
  snapshot_id text not null,
  section_code text not null,
  section_key text not null,
  heading text,
  section_text text not null,
  section_sha256 text not null check (section_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version text,
  extraction_status text,
  source_created_at timestamptz not null,
  primary key(source_document_id,section_code)
);

delete from drx_clinical.source_section_evidence_v1;

insert into drx_clinical.source_section_evidence_v1(
  source_document_id,snapshot_id,section_code,section_key,heading,section_text,
  section_sha256,parser_version,extraction_status,source_created_at
)
select
  d.source_document_id,s.snapshot_id,s.section_code,s.section_key,s.heading,s.section_text,
  s.section_sha256,s.parser_version,s.extraction_status,s.created_at
from drx_clinical.source_documents_v1 d
join public.dose_source_sections_v3 s on s.snapshot_id=d.snapshot_id;

create table if not exists drx_clinical.source_identity_candidates_v1 (
  source_document_id uuid primary key
    references drx_clinical.source_documents_v1(source_document_id) on delete cascade,
  candidate_concept_ids uuid[] not null default '{}'::uuid[],
  candidate_terms text[] not null default '{}'::text[],
  candidate_count integer not null check (candidate_count>=0),
  resolution_status text not null check (
    resolution_status in ('UNIQUE_CANDIDATE','MULTIPLE_CANDIDATES','NO_CANDIDATE')
  ),
  resolution_method text not null default 'SECTION2_PREFERRED_CANONICAL_TERM_TEXT_MATCH',
  variant_binding_allowed boolean not null default false,
  check (variant_binding_allowed=false)
);

delete from drx_clinical.source_identity_candidates_v1;

with comp as (
  select d.source_document_id,e.section_text
  from drx_clinical.source_documents_v1 d
  join drx_clinical.source_section_evidence_v1 e
    on e.source_document_id=d.source_document_id
   and e.section_key='qualitative_and_quantitative_composition'
),
preferred as (
  select t.concept_id,t.term
  from public.substance_terms_v1 t
  where t.term_type='CANONICAL'
    and t.is_preferred=true
    and length(btrim(t.term))>=5
),
matches as (
  select c.source_document_id,p.concept_id,p.term
  from comp c
  join preferred p
    on lower(c.section_text) like '%' || lower(btrim(p.term)) || '%'
),
agg as (
  select
    c.source_document_id,
    coalesce(
      array_agg(distinct m.concept_id order by m.concept_id)
        filter(where m.concept_id is not null),
      '{}'::uuid[]
    ) ids,
    coalesce(
      array_agg(distinct m.term order by m.term)
        filter(where m.term is not null),
      '{}'::text[]
    ) terms,
    count(distinct m.concept_id) candidate_count
  from comp c
  left join matches m on m.source_document_id=c.source_document_id
  group by c.source_document_id
)
insert into drx_clinical.source_identity_candidates_v1(
  source_document_id,candidate_concept_ids,candidate_terms,candidate_count,
  resolution_status,resolution_method,variant_binding_allowed
)
select
  source_document_id,ids,terms,candidate_count,
  case
    when candidate_count=1 then 'UNIQUE_CANDIDATE'
    when candidate_count>1 then 'MULTIPLE_CANDIDATES'
    else 'NO_CANDIDATE'
  end,
  'SECTION2_PREFERRED_CANONICAL_TERM_TEXT_MATCH',
  false
from agg;

revoke all on all tables in schema drx_clinical from public,anon,authenticated;
revoke all on all sequences in schema drx_clinical from public,anon,authenticated;
revoke execute on all functions in schema drx_clinical from public,anon,authenticated;
revoke all on schema drx_clinical from public,anon,authenticated;

alter default privileges for role postgres in schema drx_clinical
  revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema drx_clinical
  revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema drx_clinical
  revoke execute on functions from public,anon,authenticated;
