
-- DRx Phase 11J: evidence-backed active-moiety normalization for dose-rule reuse.
-- Salt/form identities remain intact in product identity; this is a separate
-- clinical dosing-moiety layer used only when explicit evidence exists.

with snap as (
  select snapshot_id
  from public.dose_source_snapshots_v3
  where source_key='EMC-PRODUCT-10877-SMPC'
  order by created_at desc
  limit 1
),
payload as (
  select
    $s2$Each film-coated tablet contains 875mg amoxicillin as amoxicillin trihydrate and 125mg of clavulanic acid as potassium clavulanate diluted.
For a full list of excipients see section 6.1.$s2$::text as section_text
)
insert into public.dose_source_sections_v3(
  snapshot_id,section_code,section_key,heading,section_text,section_sha256,
  extracted_json,parser_version,extraction_status
)
select
  snap.snapshot_id,'2','section-2','Qualitative and quantitative composition',
  payload.section_text,
  encode(digest(payload.section_text,'sha256'),'hex'),
  jsonb_build_object(
    'captureMethod','normalized_public_web_capture',
    'sourceUrl','https://www.medicines.org.uk/emc/product/10877/smpc',
    'sourceLineRange','217-220'
  ),
  'drx-web-normalized-capture-v1','extracted'
from snap cross join payload
on conflict (snapshot_id,section_code) do nothing;

create table if not exists drx_dose.component_moiety_map_v1 (
  source_concept_id uuid primary key
    references public.substance_concepts_v1(concept_id) on delete restrict,
  dose_moiety_concept_id uuid not null
    references public.substance_concepts_v1(concept_id) on delete restrict,
  mapping_kind text not null
    check (mapping_kind in ('IDENTITY','ACTIVE_MOIETY','EQUIVALENT_ACTIVE')),
  source_snapshot_id text not null
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section_code text not null default '2'
    check (source_section_code in ('2','4.2')),
  source_section_sha256 text not null
    check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  mapping_status text not null default 'IN_REVIEW'
    check (mapping_status in ('IN_REVIEW','VERIFIED','REJECTED','RETIRED')),
  verified_by text,
  verified_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    mapping_status<>'VERIFIED'
    or (nullif(btrim(verified_by),'') is not null and verified_at is not null)
  )
);

with snap as (
  select s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-10877-SMPC'
  order by s.created_at desc
  limit 1
),
pairs(source_key,moiety_key,note) as (
  values
    ('amoxicillintrihydrate','amoxicillin','SmPC composition expresses strength as amoxicillin active moiety supplied as amoxicillin trihydrate.'),
    ('clavulanatepotassium','clavulanicacid','SmPC composition expresses strength as clavulanic acid active moiety supplied as potassium clavulanate.')
)
insert into drx_dose.component_moiety_map_v1(
  source_concept_id,dose_moiety_concept_id,mapping_kind,
  source_snapshot_id,source_section_code,source_section_sha256,
  mapping_status,verified_by,verified_at,note
)
select
  src.concept_id,dst.concept_id,'ACTIVE_MOIETY',
  snap.snapshot_id,'2',snap.section_sha256,
  'VERIFIED','system:phase11j-emc-10877-composition',now(),pairs.note
from pairs
join public.substance_concepts_v1 src on src.canonical_key=pairs.source_key
join public.substance_concepts_v1 dst on dst.canonical_key=pairs.moiety_key
cross join snap
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

create or replace function drx_dose.resolve_dose_moiety_ids_v1(p_concept_ids uuid[])
returns uuid[]
language sql
stable
as $$
  select coalesce(
    array_agg(distinct coalesce(m.dose_moiety_concept_id,u.concept_id)
              order by coalesce(m.dose_moiety_concept_id,u.concept_id)),
    '{}'::uuid[]
  )
  from unnest(coalesce(p_concept_ids,'{}'::uuid[])) as u(concept_id)
  left join drx_dose.component_moiety_map_v1 m
    on m.source_concept_id=u.concept_id
   and m.mapping_status='VERIFIED';
$$;

alter table drx_dose.rule_targets_v1
  add column if not exists dose_moiety_key text,
  add column if not exists dose_moiety_concept_ids uuid[] not null default '{}'::uuid[];

create index if not exists rule_targets_v1_moiety_key_idx
  on drx_dose.rule_targets_v1(dose_moiety_key,binding_status);

create or replace function drx_dose.set_rule_target_moiety_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_ids uuid[];
begin
  if new.target_kind='SUBSTANCE' then
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(array[new.substance_concept_id]);
  else
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(new.ingredient_concept_ids);
  end if;

  new.dose_moiety_concept_ids := coalesce(v_ids,'{}'::uuid[]);
  new.dose_moiety_key := case
    when cardinality(new.dose_moiety_concept_ids)>0
      then md5(array_to_string(new.dose_moiety_concept_ids::text[],'|'))
    else null
  end;
  return new;
end;
$$;

drop trigger if exists rule_target_moiety_fill on drx_dose.rule_targets_v1;
create trigger rule_target_moiety_fill
before insert or update of target_kind,substance_concept_id,ingredient_concept_ids
on drx_dose.rule_targets_v1
for each row execute function drx_dose.set_rule_target_moiety_v1();

update drx_dose.rule_targets_v1
set ingredient_concept_ids=ingredient_concept_ids;

create or replace view drx_dose.product_dose_moiety_targets_v1 as
select
  p.*,
  dm.dose_moiety_concept_ids,
  case
    when cardinality(dm.dose_moiety_concept_ids)>0
      then md5(array_to_string(dm.dose_moiety_concept_ids::text[],'|'))
    else null
  end as dose_moiety_key
from drx_dose.product_rule_targets_v1 p
cross join lateral (
  select drx_dose.resolve_dose_moiety_ids_v1(p.ingredient_concept_ids) as dose_moiety_concept_ids
) dm;

create or replace view drx_dose.dose_moiety_reuse_groups_v1 as
select
  dose_moiety_key,
  dose_moiety_concept_ids,
  count(*) as product_count,
  count(distinct ingredient_set_id) as raw_ingredient_set_count,
  array_agg(distinct registry_number order by registry_number) as registry_numbers
from drx_dose.product_dose_moiety_targets_v1
where dose_moiety_key is not null
group by dose_moiety_key,dose_moiety_concept_ids;

create or replace view drx_dose.inherited_rule_matches_v1 as
select
  p.drug_id,
  p.registry_number,
  p.trade_name,
  p.target_kind as product_target_kind,
  t.rule_target_id,
  t.rule_id,
  r.rule_key,
  r.patient_group,
  r.indication_id,
  r.route as rule_route,
  r.pharmaceutical_form as rule_pharmaceutical_form,
  t.strength_match_mode,
  case
    when t.target_kind='SUBSTANCE' then 'substance_moiety_inheritance'
    else 'ingredient_set_moiety_inheritance'
  end as match_method,
  p.dose_moiety_key,
  p.dose_moiety_concept_ids
from drx_dose.product_dose_moiety_targets_v1 p
join drx_dose.rule_targets_v1 t
  on t.binding_status='VERIFIED'
 and t.target_kind=p.target_kind
 and t.dose_moiety_key is not null
 and t.dose_moiety_key=p.dose_moiety_key
join public.dose_rules_v3 r
  on r.rule_id=t.rule_id
 and r.editorial_status='published'
where p.strict_autoinherit_ready
  and (cardinality(t.route_keys)=0 or t.route_keys && p.route_keys)
  and (t.form_family is null or t.form_family=p.form_family)
  and (t.release_key is null or t.release_key=p.release_key)
  and (
    t.strength_match_mode='ANY_COMPATIBLE'
    or (t.strength_match_mode='EXACT_VARIANT' and t.required_clinical_variant_id=p.clinical_variant_id)
    or (t.strength_match_mode='EXACT_STRENGTH' and t.required_strength_hash=p.strength_hash)
  )
  and (
    (r.patient_group='adult_only' and p.population_key in ('ADULT_ONLY','ADULT_AND_PEDIATRIC'))
    or (r.patient_group in ('pediatric_only','age_band') and p.population_key in ('PEDIATRIC_ONLY','ADULT_AND_PEDIATRIC'))
    or (r.patient_group='pediatric_and_adult' and p.population_key='ADULT_AND_PEDIATRIC')
  );

create or replace function public.drx_phase11_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'publishedProducts',(select count(*) from public.drugs where is_published and editorial_status='published'),
  'productTargets',(select count(*) from drx_dose.product_rule_targets_v1),
  'ingredientTargetReady',(select count(*) from drx_dose.product_rule_targets_v1 where ingredient_target_ready),
  'strictAutoInheritReady',(select count(*) from drx_dose.product_rule_targets_v1 where strict_autoinherit_ready),
  'doseMoietyMappings',(select count(*) from drx_dose.component_moiety_map_v1 where mapping_status='VERIFIED'),
  'doseMoietyReuseGroups',(select count(*) from drx_dose.dose_moiety_reuse_groups_v1),
  'doseMoietyGroupsCollapsingRawSets',(select count(*) from drx_dose.dose_moiety_reuse_groups_v1 where raw_ingredient_set_count>1),
  'legacyPublishedRegimensAll',(select count(*) from public.product_dosage_regimens where editorial_status='published'),
  'ruleTargets',(select count(*) from drx_dose.rule_targets_v1),
  'verifiedRuleTargets',(select count(*) from drx_dose.rule_targets_v1 where binding_status='VERIFIED'),
  'candidateRows',(select count(*) from drx_dose.rule_candidate_extractions_v1),
  'candidateContexts',(select count(*) from drx_dose.rule_candidate_contexts_v1),
  'structuredCandidates',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='STRUCTURED_CANDIDATE'),
  'textOnly',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='TEXT_ONLY'),
  'blocked',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='BLOCKED'),
  'needsReview',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='NEEDS_REVIEW'),
  'presentationSpecific',(select count(*) from drx_dose.rule_candidate_extractions_v1 where reason_codes @> array['PRODUCT_PRESENTATION_SPECIFIC']::text[]),
  'restrictionOnly',(select count(*) from drx_dose.rule_candidate_extractions_v1 where reason_codes @> array['RESTRICTION_ONLY_NO_DOSE_RULE']::text[]),
  'indicationPhraseCandidates',(select count(*) from drx_dose.indication_phrase_candidates_v1),
  'verifiedIndicationTextBindings',(select count(*) from drx_dose.indication_text_bindings_v1 where binding_status='VERIFIED'),
  'promotionReady',(select count(*) from drx_dose.rule_candidate_promotion_queue_v1 where promotion_ready),
  'sourceUrlsQueued',(select count(*) from drx_dose.source_ingestion_queue_v1),
  'sourceUrlsIneligible',(select count(*) from drx_dose.source_url_classification_v1 where classification_status='VERIFIED' and dose_source_eligible=false),
  'sourceReplacementRows',(select coalesce(sum(regimen_count),0) from drx_dose.source_replacement_queue_v1),
  'indicationsQueued',(select count(*) from drx_dose.indication_normalization_queue_v1),
  'contextConflicts',(select count(*) from drx_dose.rule_candidate_context_conflicts_v1),
  'coverageProducts',(select count(*) from drx_dose.product_calculator_coverage_v1),
  'inheritedRuleMatches',(select count(*) from drx_dose.inherited_rule_matches_v1),
  'reviewQueueItems',(select count(*) from drx_dose.phase11_review_queue_v1),
  'autoPublishAllowed',false,
  'runtimeServeEnabled',false,
  'model','product ingredient identity -> evidence-backed dose moiety -> reviewed verified rule -> compatible product'
);
$$;

alter table drx_dose.component_moiety_map_v1 enable row level security;
revoke all on drx_dose.component_moiety_map_v1 from public,anon,authenticated;
revoke all on drx_dose.product_dose_moiety_targets_v1 from public,anon,authenticated;
revoke all on drx_dose.dose_moiety_reuse_groups_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.component_moiety_map_v1 to service_role;
grant select on drx_dose.product_dose_moiety_targets_v1 to service_role;
grant select on drx_dose.dose_moiety_reuse_groups_v1 to service_role;

revoke all on function drx_dose.resolve_dose_moiety_ids_v1(uuid[]) from public,anon,authenticated;
revoke all on function drx_dose.set_rule_target_moiety_v1() from public,anon,authenticated;
grant execute on function drx_dose.resolve_dose_moiety_ids_v1(uuid[]) to service_role;
