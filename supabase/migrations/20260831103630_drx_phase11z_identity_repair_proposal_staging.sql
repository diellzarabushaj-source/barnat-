
-- DRx Phase 11Z: conservative identity-repair proposal staging for the remaining
-- unresolved products. This DOES NOT mutate product ingredient identity.
-- Only products whose source components all resolve to existing PUBLIC concepts
-- are allowed to become review-ready proposals. Nothing is auto-applied.

create table if not exists drx_dose.identity_repair_proposals_v1 (
  proposal_id uuid primary key default gen_random_uuid(),
  drug_id uuid not null unique
    references public.drugs(id) on delete cascade,
  registry_number integer,
  trade_name text,
  source_expression text not null,
  suggested_disposition text not null,
  source_component_count integer not null check (source_component_count > 0),
  proposed_concept_count integer not null default 0 check (proposed_concept_count >= 0),
  proposed_public_concept_ids uuid[] not null default '{}'::uuid[],
  proposed_target_kind text
    check (proposed_target_kind in ('SUBSTANCE','INGREDIENT_SET')),
  blocker_codes text[] not null default '{}'::text[],
  review_ready boolean not null default false,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','APPLIED','RETIRED')),
  reviewed_by text,
  reviewed_at timestamptz,
  auto_apply_allowed boolean not null default false check (auto_apply_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    review_status not in ('APPROVED','APPLIED')
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  ),
  check (
    review_ready=false
    or (
      cardinality(blocker_codes)=0
      and proposed_concept_count=cardinality(proposed_public_concept_ids)
      and proposed_concept_count>0
      and proposed_target_kind is not null
    )
  )
);

create table if not exists drx_dose.identity_repair_proposal_components_v1 (
  proposal_id uuid not null
    references drx_dose.identity_repair_proposals_v1(proposal_id) on delete cascade,
  component_ordinal integer not null check (component_ordinal > 0),
  source_term text not null,
  component_key text not null,
  resolution_source text not null
    check (resolution_source in (
      'IDENTITY_RESOLVER_PUBLIC',
      'REVIEWED_EQUIVALENCE',
      'DIRECT_PUBLIC_CANONICAL',
      'STAGE_ONLY_IDENTITY',
      'UNRESOLVED'
    )),
  identity_concept_id uuid,
  proposed_public_concept_id uuid
    references public.substance_concepts_v1(concept_id) on delete restrict,
  proposed_public_name text,
  evidence_urls text[] not null default '{}'::text[],
  component_blockers text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  primary key (proposal_id,component_ordinal),
  check (
    proposed_public_concept_id is not null
    or cardinality(component_blockers)>0
  )
);

create index if not exists identity_repair_proposals_v1_ready_idx
  on drx_dose.identity_repair_proposals_v1(review_ready,review_status);
create index if not exists identity_repair_components_v1_public_idx
  on drx_dose.identity_repair_proposal_components_v1(proposed_public_concept_id);

create or replace function public.drx_phase11_refresh_identity_repair_proposals_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_identity
as $$
declare
  v_proposals integer := 0;
  v_components integer := 0;
begin
  -- Refresh only unresolved products that fit the ordinary ingredient-identity
  -- model. Vaccines/biologics, homeopathic complexes and parenteral nutrition
  -- remain explicitly outside this repair path.
  insert into drx_dose.identity_repair_proposals_v1(
    drug_id,registry_number,trade_name,source_expression,suggested_disposition,
    source_component_count,proposed_concept_count,proposed_public_concept_ids,
    proposed_target_kind,blocker_codes,review_ready,review_status,updated_at
  )
  with eligible as (
    select q.*
    from drx_dose.unresolved_product_disposition_queue_v1 q
    where q.suggested_disposition in (
      'COMBINATION_COMPONENT_REVIEW',
      'EQUIVALENCE_TEXT_IDENTITY_REVIEW',
      'OTHER_IDENTITY_REVIEW'
    )
      and position(';' in coalesce(q.active_substance,''))>0
  ),
  parts as (
    select
      e.drug_id,e.registry_number,e.trade_name,e.active_substance,e.suggested_disposition,
      x.ordinality::integer as component_ordinal,
      btrim(x.part) as source_term,
      public.medindex_normalize_substance_term_v1(btrim(x.part)) as component_key
    from eligible e
    cross join lateral regexp_split_to_table(e.active_substance,';')
      with ordinality as x(part,ordinality)
    where btrim(x.part)<>''
  ),
  resolved as (
    select
      p.*,
      coalesce(cc.public_concept_id,eqsc.concept_id,direct.concept_id) as public_concept_id,
      case
        when cc.public_concept_id is not null then 'IDENTITY_RESOLVER_PUBLIC'
        when eqsc.concept_id is not null then 'REVIEWED_EQUIVALENCE'
        when direct.concept_id is not null then 'DIRECT_PUBLIC_CANONICAL'
        when cr.canonical_concept_id is not null then 'STAGE_ONLY_IDENTITY'
        else 'UNRESOLVED'
      end as resolution_source
    from parts p
    left join drx_identity.component_resolution_v1 cr
      on cr.component_term_key=p.component_key
    left join drx_identity.canonical_concepts_v1 cc
      on cc.concept_id=cr.canonical_concept_id
    left join public.substance_equivalence_reviewed_v1 er
      on er.source_key=p.component_key
    left join public.substance_concepts_v1 eqsc
      on eqsc.canonical_key=er.canonical_key
    left join public.substance_concepts_v1 direct
      on direct.canonical_key=p.component_key
  ),
  grouped as (
    select
      drug_id,
      min(registry_number) as registry_number,
      min(trade_name) as trade_name,
      min(active_substance) as source_expression,
      min(suggested_disposition) as suggested_disposition,
      count(*)::integer as source_component_count,
      count(*) filter (where public_concept_id is not null)::integer as resolved_component_count,
      count(distinct public_concept_id) filter (where public_concept_id is not null)::integer as distinct_public_count,
      coalesce(
        array_agg(distinct public_concept_id order by public_concept_id)
          filter (where public_concept_id is not null),
        '{}'::uuid[]
      ) as public_ids,
      count(*) filter (where resolution_source='STAGE_ONLY_IDENTITY')::integer as stage_only_count,
      count(*) filter (where resolution_source='UNRESOLVED')::integer as unresolved_count
    from resolved
    group by drug_id
  )
  select
    g.drug_id,g.registry_number,g.trade_name,g.source_expression,g.suggested_disposition,
    g.source_component_count,g.distinct_public_count,g.public_ids,
    case
      when g.distinct_public_count=1 then 'SUBSTANCE'
      when g.distinct_public_count>1 then 'INGREDIENT_SET'
      else null
    end,
    array_remove(array[
      case when g.unresolved_count>0 then 'UNRESOLVED_COMPONENT' end,
      case when g.stage_only_count>0 then 'STAGE_ONLY_COMPONENT_REQUIRES_PUBLIC_IDENTITY_REVIEW' end,
      case when g.resolved_component_count<g.source_component_count
        and g.unresolved_count=0 and g.stage_only_count=0
        then 'COMPONENT_PUBLIC_MAPPING_INCOMPLETE' end,
      case when g.distinct_public_count<g.source_component_count
        and g.resolved_component_count=g.source_component_count
        then 'DUPLICATE_COMPONENT_COLLAPSE_REVIEW' end
    ],null),
    (
      g.resolved_component_count=g.source_component_count
      and g.distinct_public_count=g.source_component_count
      and g.source_component_count>0
    ),
    'PENDING',
    now()
  from grouped g
  on conflict (drug_id) do update set
    registry_number=excluded.registry_number,
    trade_name=excluded.trade_name,
    source_expression=excluded.source_expression,
    suggested_disposition=excluded.suggested_disposition,
    source_component_count=excluded.source_component_count,
    proposed_concept_count=excluded.proposed_concept_count,
    proposed_public_concept_ids=excluded.proposed_public_concept_ids,
    proposed_target_kind=excluded.proposed_target_kind,
    blocker_codes=excluded.blocker_codes,
    review_ready=excluded.review_ready,
    updated_at=now()
  where drx_dose.identity_repair_proposals_v1.review_status='PENDING';

  get diagnostics v_proposals = row_count;

  -- Rebuild component detail only for proposals that remain PENDING.
  delete from drx_dose.identity_repair_proposal_components_v1 c
  using drx_dose.identity_repair_proposals_v1 p
  where p.proposal_id=c.proposal_id and p.review_status='PENDING';

  insert into drx_dose.identity_repair_proposal_components_v1(
    proposal_id,component_ordinal,source_term,component_key,resolution_source,
    identity_concept_id,proposed_public_concept_id,proposed_public_name,
    evidence_urls,component_blockers
  )
  with parts as (
    select
      p.proposal_id,
      p.source_expression,
      x.ordinality::integer as component_ordinal,
      btrim(x.part) as source_term,
      public.medindex_normalize_substance_term_v1(btrim(x.part)) as component_key
    from drx_dose.identity_repair_proposals_v1 p
    cross join lateral regexp_split_to_table(p.source_expression,';')
      with ordinality as x(part,ordinality)
    where p.review_status='PENDING'
      and btrim(x.part)<>''
  ),
  resolved as (
    select
      p.*,
      cr.canonical_concept_id as identity_concept_id,
      coalesce(cc.public_concept_id,eqsc.concept_id,direct.concept_id) as public_concept_id,
      coalesce(pubcc.canonical_name,eqsc.canonical_name,direct.canonical_name) as public_name,
      case
        when cc.public_concept_id is not null then 'IDENTITY_RESOLVER_PUBLIC'
        when eqsc.concept_id is not null then 'REVIEWED_EQUIVALENCE'
        when direct.concept_id is not null then 'DIRECT_PUBLIC_CANONICAL'
        when cr.canonical_concept_id is not null then 'STAGE_ONLY_IDENTITY'
        else 'UNRESOLVED'
      end as resolution_source,
      coalesce(er.evidence_urls,'{}'::text[]) as equivalence_evidence_urls
    from parts p
    left join drx_identity.component_resolution_v1 cr
      on cr.component_term_key=p.component_key
    left join drx_identity.canonical_concepts_v1 cc
      on cc.concept_id=cr.canonical_concept_id
    left join public.substance_concepts_v1 pubcc
      on pubcc.concept_id=cc.public_concept_id
    left join public.substance_equivalence_reviewed_v1 er
      on er.source_key=p.component_key
    left join public.substance_concepts_v1 eqsc
      on eqsc.canonical_key=er.canonical_key
    left join public.substance_concepts_v1 direct
      on direct.canonical_key=p.component_key
  )
  select
    r.proposal_id,r.component_ordinal,r.source_term,r.component_key,r.resolution_source,
    r.identity_concept_id,r.public_concept_id,r.public_name,
    r.equivalence_evidence_urls,
    array_remove(array[
      case when r.resolution_source='STAGE_ONLY_IDENTITY'
        then 'STAGE_IDENTITY_NOT_LINKED_TO_PUBLIC_CONCEPT' end,
      case when r.resolution_source='UNRESOLVED'
        then 'NO_CANONICAL_COMPONENT_RESOLUTION' end
    ],null)
  from resolved r;

  get diagnostics v_components = row_count;

  return jsonb_build_object(
    'proposalRows',(select count(*) from drx_dose.identity_repair_proposals_v1),
    'pendingRows',(select count(*) from drx_dose.identity_repair_proposals_v1 where review_status='PENDING'),
    'reviewReadyRows',(select count(*) from drx_dose.identity_repair_proposals_v1 where review_status='PENDING' and review_ready),
    'blockedRows',(select count(*) from drx_dose.identity_repair_proposals_v1 where review_status='PENDING' and not review_ready),
    'componentRows',(select count(*) from drx_dose.identity_repair_proposal_components_v1),
    'proposalRowsRefreshed',v_proposals,
    'componentRowsRefreshed',v_components,
    'autoApplyAllowed',false
  );
end;
$$;

select public.drx_phase11_refresh_identity_repair_proposals_v1();

create or replace view drx_dose.identity_repair_review_queue_v1 as
select
  p.proposal_id,p.drug_id,p.registry_number,p.trade_name,p.source_expression,
  p.suggested_disposition,p.source_component_count,p.proposed_concept_count,
  p.proposed_public_concept_ids,
  array(
    select s.canonical_name
    from unnest(p.proposed_public_concept_ids) u(concept_id)
    join public.substance_concepts_v1 s on s.concept_id=u.concept_id
    order by s.canonical_name
  ) as proposed_public_names,
  p.proposed_target_kind,p.blocker_codes,p.review_ready,p.review_status,
  p.auto_apply_allowed,
  jsonb_agg(
    jsonb_build_object(
      'ordinal',c.component_ordinal,
      'sourceTerm',c.source_term,
      'componentKey',c.component_key,
      'resolutionSource',c.resolution_source,
      'publicConceptId',c.proposed_public_concept_id,
      'publicName',c.proposed_public_name,
      'blockers',c.component_blockers,
      'evidenceUrls',c.evidence_urls
    )
    order by c.component_ordinal
  ) as components
from drx_dose.identity_repair_proposals_v1 p
join drx_dose.identity_repair_proposal_components_v1 c on c.proposal_id=p.proposal_id
where p.review_status in ('PENDING','IN_REVIEW')
group by
  p.proposal_id,p.drug_id,p.registry_number,p.trade_name,p.source_expression,
  p.suggested_disposition,p.source_component_count,p.proposed_concept_count,
  p.proposed_public_concept_ids,p.proposed_target_kind,p.blocker_codes,
  p.review_ready,p.review_status,p.auto_apply_allowed;

create or replace view drx_dose.identity_repair_summary_v1 as
select
  count(*) as proposal_rows,
  count(*) filter (where review_ready and review_status='PENDING') as review_ready_rows,
  count(*) filter (where not review_ready and review_status='PENDING') as blocked_rows,
  count(*) filter (where proposed_target_kind='SUBSTANCE') as proposed_single_substance_rows,
  count(*) filter (where proposed_target_kind='INGREDIENT_SET') as proposed_ingredient_set_rows,
  false::boolean as auto_apply_allowed
from drx_dose.identity_repair_proposals_v1;

alter table drx_dose.identity_repair_proposals_v1 enable row level security;
alter table drx_dose.identity_repair_proposal_components_v1 enable row level security;
revoke all on drx_dose.identity_repair_proposals_v1 from public,anon,authenticated;
revoke all on drx_dose.identity_repair_proposal_components_v1 from public,anon,authenticated;
revoke all on drx_dose.identity_repair_review_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.identity_repair_summary_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.identity_repair_proposals_v1 to service_role;
grant select,insert,update,delete on drx_dose.identity_repair_proposal_components_v1 to service_role;
grant select on drx_dose.identity_repair_review_queue_v1 to service_role;
grant select on drx_dose.identity_repair_summary_v1 to service_role;

revoke all on function public.drx_phase11_refresh_identity_repair_proposals_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_refresh_identity_repair_proposals_v1() to service_role;
