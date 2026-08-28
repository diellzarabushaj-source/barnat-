-- Synced from Supabase production migration history.
-- version: 20260827221057
-- name: p1_exit_integrity_and_privileges

revoke insert, update, delete, truncate, references, trigger
  on public.substance_concepts_v1,
     public.substance_terms_v1,
     public.substance_aliases,
     public.substance_merge_rejections,
     public.substance_equivalence_reviewed_v1,
     public.substance_equivalence_cleared_v1,
     public.product_ingredients_v1,
     public.product_ingredient_resolution_v1
  from anon, authenticated;

create table if not exists public.substance_single_expression_override_v1 (
  source_key text primary key,
  canonical_key text not null,
  reason text not null,
  decided_by text not null,
  reviewed_at timestamptz not null default now(),
  evidence_urls text[] not null default '{}'::text[],
  constraint substance_single_expression_override_not_self check (source_key <> canonical_key)
);

alter table public.substance_single_expression_override_v1 enable row level security;

drop policy if exists substance_single_expression_override_read on public.substance_single_expression_override_v1;
create policy substance_single_expression_override_read
  on public.substance_single_expression_override_v1 for select
  to anon, authenticated using (true);

revoke insert, update, delete, truncate, references, trigger
  on public.substance_single_expression_override_v1 from anon, authenticated;

comment on table public.substance_single_expression_override_v1 is
  'Shprehje ku pikëpresja ndan një substancë nga klauzola e vet e ekuivalencës, jo dy përbërës. Ndarësi i lexon si kombinim; këto rreshta e thonë të kundërtën, një nga një.';

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','clopidogrelbisulfate'),'clopidogrelbisulfate','Clopidogrel bisulfate','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,source_method=excluded.source_method,updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
select c.canonical_key,c.concept_id,c.canonical_name,'CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',
       array['https://www.medicines.org.uk/emc/']::text[]
from public.substance_concepts_v1 c
where c.canonical_key = 'clopidogrelbisulfate'
on conflict (term_key) do nothing;

insert into public.substance_single_expression_override_v1
(source_key,canonical_key,reason,decided_by,evidence_urls)
select k,c,r,'p1-single-expression-review-2026-08-27',array['https://www.medicines.org.uk/emc/']::text[]
from (values
('cefiximetrihydrateequivalenttocefixime','cefiximetrihydrate','pikëpresja ndan trihidratin nga ekuivalenca e vet, jo dy përbërës'),
('amlodipinebesilateequivalenttoamlodipine','amlodipinebesilate','pikëpresja ndan besilatin nga ekuivalenca e vet'),
('betamethasonedipropionateequivalnttobetmethasone','betamethasonedipropionate','ekuivalencë e së njëjtës substancë, me dy gabime shtypi'),
('betamethasoneipropionateequivalenttobetamethasone','betamethasonedipropionate','ipropionate është gabim shtypi i dipropionate'),
('clopidogrelbisulfateequivalenttoclopidogrel','clopidogrelbisulfate','pikëpresja ndan bisulfatin nga ekuivalenca e vet'),
('clyndamycinphosphateequivalenttoclindamycin','clindamycinphosphate','clyndamycin është gabim shtypi i clindamycin'),
('dextrosemonohydrateequivtodextroseanhydrous','dextrosemonohydrate','ekuivalencë ndaj formës anhidre, jo substancë e dytë'),
('pantoprazolesodiumsesquihydrateequivalenttopantoprazole','pantoprazolesodiumsesquihydrate','pikëpresja ndan seskuihidratin nga ekuivalenca e vet'),
('salbutamolsulfateequivalenttosalbutamol','salbutamolsulfate','pikëpresja ndan sulfatin nga ekuivalenca e vet'),
('theophyllineethylendiamineanhydrouscorrespondingtheophyllineanhydrous','aminophylline','teofilinë-etilendiaminë është aminofilina; pjesa e dytë është ekuivalencë'),
('moxifloxacinequivalenttomoxifloxacinhydrochloride','moxifloxacinhydrochloride','tri pjesët janë një substancë: moksifloksacin hidroklorid')
) as v(k,c,r)
on conflict (source_key) do update
set canonical_key=excluded.canonical_key,reason=excluded.reason,
    decided_by=excluded.decided_by,reviewed_at=now();

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select o.source_key,o.canonical_key,coalesce(c.canonical_name,''),o.reason,
       'p1-single-expression-review-2026-08-27',now(),'single_expression_override',1.0000,
       array['https://www.medicines.org.uk/emc/']::text[]
from public.substance_single_expression_override_v1 o
left join public.substance_concepts_v1 c on c.canonical_key=o.canonical_key
on conflict (variant_key) do nothing;

delete from public.substance_merge_rejections
where least(key_a,key_b)='formoterolfumaratedehydrous'
  and greatest(key_a,key_b)='formoterolfumaratedihydrate';

create or replace function public.medindex_reject_alias_rejection_conflict()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $conflict$
begin
  if tg_table_name = 'substance_aliases' then
    if exists (
      select 1 from public.substance_merge_rejections r
      where r.key_a = least(new.variant_key,new.canonical_key)
        and r.key_b = greatest(new.variant_key,new.canonical_key)
    ) then
      raise exception 'alias % -> % contradicts an existing merge rejection',
        new.variant_key, new.canonical_key;
    end if;
  else
    if exists (
      select 1 from public.substance_aliases a
      where least(a.variant_key,a.canonical_key) = new.key_a
        and greatest(a.variant_key,a.canonical_key) = new.key_b
    ) then
      raise exception 'merge rejection % / % contradicts an existing alias',
        new.key_a, new.key_b;
    end if;
  end if;
  return new;
end
$conflict$;

drop trigger if exists substance_aliases_no_rejection_conflict on public.substance_aliases;
create trigger substance_aliases_no_rejection_conflict
  before insert or update on public.substance_aliases
  for each row execute function public.medindex_reject_alias_rejection_conflict();

drop trigger if exists substance_rejections_no_alias_conflict on public.substance_merge_rejections;
create trigger substance_rejections_no_alias_conflict
  before insert or update on public.substance_merge_rejections
  for each row execute function public.medindex_reject_alias_rejection_conflict();

create or replace view public.medindex_p1_safe_single_v1
with (security_invoker = true) as
select d.id as source_drug_id,
       d.active_substance as source_expression,
       d.active_substance_key as component_key,
       c.canonical_key,
       c.canonical_name,
       coalesce(a.confidence,1.0000)::numeric(5,4) as confidence
from public.drugs d
join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
join public.substance_canonical c on c.variant_key=d.active_substance_key
left join public.substance_aliases a on a.variant_key=d.active_substance_key
where coalesce(btrim(d.active_substance),'')<>''
  and (
    (
      d.active_substance !~ '(;|\+|&)'
      and d.active_substance !~* '\sand\s'
      and d.active_substance !~ '/'
      and (
        d.active_substance !~* '(equivalent to|corresponding to|\yas\y)'
        or exists (
          select 1 from public.substance_equivalence_cleared_v1 e
          where e.source_key = d.active_substance_key
        )
      )
    )
    or exists (
      select 1 from public.substance_single_expression_override_v1 o
      where o.source_key = d.active_substance_key
    )
  );

create or replace view public.medindex_p1_resolved_delimiter_parts_v2
with (security_invoker = true) as
with eligible as (
  select p.source_drug_id
  from public.medindex_p1_combo_parts_v1 p
  join public.drugs d on d.id=p.source_drug_id
  group by p.source_drug_id,d.active_substance,d.active_substance_key
  having count(*) >= 2
     and count(p.canonical_key)=count(*)
     and not exists (
       select 1 from public.substance_single_expression_override_v1 o
       where o.source_key = d.active_substance_key
     )
     and (
       d.active_substance !~* '(equivalent to|corresponding to|\yas\y)'
       or exists (
         select 1 from public.substance_equivalence_cleared_v1 e
         where e.source_key = d.active_substance_key
       )
     )
),
grouped as (
  select
    p.source_drug_id,
    p.canonical_key,
    max(p.canonical_name) as canonical_name,
    min(p.ingredient_ordinal) as first_ordinal,
    (array_agg(p.source_term order by p.ingredient_ordinal))[1] as source_term,
    (array_agg(p.component_key order by p.ingredient_ordinal))[1] as component_key,
    min(p.confidence)::numeric(5,4) as confidence,
    count(*)::integer as source_occurrence_count,
    array_agg(p.source_term order by p.ingredient_ordinal) as source_terms
  from public.medindex_p1_combo_parts_v1 p
  join eligible e on e.source_drug_id=p.source_drug_id
  group by p.source_drug_id,p.canonical_key
)
select
  g.source_drug_id,
  row_number() over (
    partition by g.source_drug_id
    order by g.first_ordinal,g.canonical_key
  )::integer as ingredient_ordinal,
  g.canonical_key,
  g.canonical_name,
  g.source_term,
  g.component_key,
  g.confidence,
  g.source_occurrence_count,
  g.source_terms
from grouped g;

create or replace function public.medindex_refresh_product_ingredients_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  total_drugs bigint;
  resolved_single bigint;
  resolved_multi bigint;
  needs_review bigint;
  excluded bigint;
  ingredient_rows bigint;
  bad_resolved bigint;
  bad_unresolved bigint;
  bad_source_counts bigint;
begin
  insert into public.substance_concepts_v1
  (concept_id,canonical_key,canonical_name,concept_kind,source_method)
  select public.medindex_stable_uuid_v1('substance',q.canonical_key),
         q.canonical_key,max(q.canonical_name),'INGREDIENT','CANONICAL_GRAPH'
  from (
    select canonical_key,canonical_name
    from public.medindex_p1_safe_single_v1
    union all
    select p.canonical_key,p.canonical_name
    from public.medindex_p1_resolved_delimiter_parts_v2 p
    join public.medindex_p1_safe_delimiter_v2 s
      on s.source_drug_id=p.source_drug_id
  ) q
  where q.canonical_key is not null
  group by q.canonical_key
  on conflict (canonical_key) do update
  set canonical_name=excluded.canonical_name,
      updated_at=now();

  delete from public.product_ingredients_v1;

  insert into public.product_ingredients_v1
  (source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,
   resolution_method,confidence,source_occurrence_count,source_terms)
  select
    s.source_drug_id,1,c.concept_id,s.source_expression,s.component_key,
    'SINGLE_CANONICAL',s.confidence,1,array[s.source_expression]
  from public.medindex_p1_safe_single_v1 s
  join public.substance_concepts_v1 c on c.canonical_key=s.canonical_key;

  insert into public.product_ingredients_v1
  (source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,
   resolution_method,confidence,source_occurrence_count,source_terms)
  select
    p.source_drug_id,p.ingredient_ordinal,c.concept_id,p.source_term,p.component_key,
    case when p.source_occurrence_count>1 then 'DELIMITER_DEDUP' else 'DELIMITER_EXACT' end,
    p.confidence,p.source_occurrence_count,p.source_terms
  from public.medindex_p1_resolved_delimiter_parts_v2 p
  join public.medindex_p1_safe_delimiter_v2 s
    on s.source_drug_id=p.source_drug_id
  join public.substance_concepts_v1 c on c.canonical_key=p.canonical_key;

  insert into public.product_ingredients_v1
  (source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,
   resolution_method,confidence,source_occurrence_count,source_terms)
  select
    p.source_drug_id,p.ingredient_ordinal,p.concept_id,p.source_term,p.term_key,
    'AND_EXACT',p.confidence,1,array[p.source_term]
  from public.medindex_p1_and_parts_v1 p
  join public.medindex_p1_safe_and_v1 s on s.source_drug_id=p.source_drug_id;

  delete from public.product_ingredient_resolution_v1;

  insert into public.product_ingredient_resolution_v1
  (source_drug_id,resolution_status,expected_component_count,resolved_component_count,
   reason_codes,source_expression,reviewed_at,source_component_count,duplicate_component_count)
  select
    d.id,
    case
      when e.source_drug_id is not null then 'EXCLUDED'
      when sd.source_drug_id is not null and sd.identity_count=1 then 'RESOLVED_SINGLE'
      when sd.source_drug_id is not null and sd.identity_count>=2 then 'RESOLVED_MULTI'
      when sa.source_drug_id is not null then 'RESOLVED_MULTI'
      when ss.source_drug_id is not null then 'RESOLVED_SINGLE'
      else 'NEEDS_REVIEW'
    end,
    case
      when e.source_drug_id is not null then 0
      when sd.source_drug_id is not null then sd.identity_count
      when sa.source_drug_id is not null then sa.part_count
      when ss.source_drug_id is not null then 1
      when d.active_substance ~ '(;|\+|&)' then
        (select count(*)::integer from public.medindex_p1_combo_parts_v1 cp where cp.source_drug_id=d.id)
      when d.active_substance !~ '(;|\+|&)' and d.active_substance ~* '\sand\s' then
        (select count(*)::integer from public.medindex_p1_and_parts_v1 ap where ap.source_drug_id=d.id)
      else null
    end,
    case
      when sd.source_drug_id is not null then sd.identity_count
      when sa.source_drug_id is not null then sa.part_count
      when ss.source_drug_id is not null then 1
      else 0
    end,
    case
      when e.source_drug_id is not null then array[e.exception_code]
      when sd.source_drug_id is not null and sd.duplicate_component_count>0 then
        array['DUPLICATE_SOURCE_COMPONENT_COLLAPSED']
      else array_remove(array[
        case when coalesce(btrim(d.active_substance),'')='' then 'MISSING_ACTIVE_SUBSTANCE' end,
        case when d.active_substance ~* '(equivalent to|corresponding to|\yas\y)' then
               case when sd.source_drug_id is not null
                      or sa.source_drug_id is not null
                      or ss.source_drug_id is not null
                    then 'EQUIVALENCE_REVIEWED'
                    else 'EQUIVALENCE_EXPRESSION' end end,
        case when d.active_substance !~ '(;|\+|&)' and d.active_substance ~* '\sand\s' and sa.source_drug_id is null then 'WORD_AND_CONNECTOR' end,
        case when d.active_substance !~ '(;|\+|&)' and d.active_substance ~ '/' then 'SLASH_CONNECTOR' end,
        case when d.active_substance ~ '(;|\+|&)'
               and exists (
                 select 1 from public.medindex_p1_combo_parts_v1 cp
                 where cp.source_drug_id=d.id and cp.canonical_key is null
               ) then 'UNRESOLVED_COMPONENT' end,
        case when m.source_drug_id is not null
               and not exists (
                 select 1 from public.substance_canonical sc
                 where sc.variant_key=d.active_substance_key
               ) then 'NO_CANONICAL_ROOT' end,
        case when m.source_drug_id is null and e.source_drug_id is null then 'NO_CORE_MAP' end
      ],null)
    end,
    d.active_substance,
    case when sd.source_drug_id is not null or sa.source_drug_id is not null or ss.source_drug_id is not null
         then now() else null end,
    case
      when sd.source_drug_id is not null then sd.source_component_count
      when sa.source_drug_id is not null then sa.part_count
      when ss.source_drug_id is not null then 1
      when d.active_substance ~ '(;|\+|&)' then
        (select count(*)::integer from public.medindex_p1_combo_parts_v1 cp where cp.source_drug_id=d.id)
      else null
    end,
    coalesce(sd.duplicate_component_count,0)
  from public.drugs d
  left join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
  left join public.medindex_drug_pipeline_exceptions_v1 e on e.source_drug_id=d.id
  left join public.medindex_p1_safe_delimiter_v2 sd on sd.source_drug_id=d.id
  left join public.medindex_p1_safe_and_v1 sa on sa.source_drug_id=d.id
  left join public.medindex_p1_safe_single_v1 ss on ss.source_drug_id=d.id;

  select count(*) into total_drugs from public.product_ingredient_resolution_v1;
  select count(*) into resolved_single from public.product_ingredient_resolution_v1 where resolution_status='RESOLVED_SINGLE';
  select count(*) into resolved_multi from public.product_ingredient_resolution_v1 where resolution_status='RESOLVED_MULTI';
  select count(*) into needs_review from public.product_ingredient_resolution_v1 where resolution_status='NEEDS_REVIEW';
  select count(*) into excluded from public.product_ingredient_resolution_v1 where resolution_status='EXCLUDED';
  select count(*) into ingredient_rows from public.product_ingredients_v1;

  if total_drugs <> (select count(*) from public.drugs) then
    raise exception 'P1 refresh lost product coverage';
  end if;

  select count(*) into bad_resolved
  from public.product_ingredient_resolution_v1 r
  left join (
    select source_drug_id,count(*)::integer n
    from public.product_ingredients_v1
    group by source_drug_id
  ) i using(source_drug_id)
  where (r.resolution_status='RESOLVED_SINGLE' and coalesce(i.n,0)<>1)
     or (r.resolution_status='RESOLVED_MULTI' and (
           r.expected_component_count<>r.resolved_component_count
           or coalesce(i.n,0)<>r.resolved_component_count
           or r.resolved_component_count<2
         ));

  if bad_resolved <> 0 then
    raise exception 'P1 refresh has % invalid resolved products',bad_resolved;
  end if;

  select count(*) into bad_unresolved
  from public.product_ingredient_resolution_v1 r
  join public.product_ingredients_v1 i using(source_drug_id)
  where r.resolution_status in ('NEEDS_REVIEW','EXCLUDED');

  if bad_unresolved <> 0 then
    raise exception 'P1 refresh assigned ingredients to % unresolved/excluded products',bad_unresolved;
  end if;

  select count(*) into bad_source_counts
  from public.product_ingredient_resolution_v1 r
  join (
    select source_drug_id,
           sum(source_occurrence_count)::integer as source_n,
           count(*)::integer as identity_n
    from public.product_ingredients_v1
    group by source_drug_id
  ) i using(source_drug_id)
  where r.resolution_status in ('RESOLVED_SINGLE','RESOLVED_MULTI')
    and (
      r.resolved_component_count<>i.identity_n
      or (r.source_component_count is not null and r.source_component_count<>i.source_n)
      or r.duplicate_component_count<>greatest(i.source_n-i.identity_n,0)
    );

  if bad_source_counts <> 0 then
    raise exception 'P1 refresh has % invalid source occurrence counts',bad_source_counts;
  end if;

  return jsonb_build_object(
    'total',total_drugs,
    'resolved_single',resolved_single,
    'resolved_multi',resolved_multi,
    'needs_review',needs_review,
    'excluded',excluded,
    'ingredient_rows',ingredient_rows
  );
end $$;

select public.medindex_refresh_product_ingredients_v1();

-- Një koncept pa asnjë term është i paemërtueshëm: emri i vet jeton te koncepti
-- tjetër ku aliasi e çon. `benzocaina` mbeti ashtu kur u bë alias i `benzocaine`.
-- Fshihen vetëm ata që s'i referon asnjë term dhe asnjë përbërës produkti.
delete from public.substance_concepts_v1 c
where not exists (select 1 from public.substance_terms_v1 t where t.concept_id=c.concept_id)
  and not exists (select 1 from public.product_ingredients_v1 i where i.concept_id=c.concept_id);

do $$
declare n bigint;
begin
  select count(*) into n from public.substance_aliases a
  join public.substance_merge_rejections r
    on r.key_a = least(a.variant_key,a.canonical_key)
   and r.key_b = greatest(a.variant_key,a.canonical_key);
  if n <> 0 then raise exception 'P1 exit: % alias/rejection contradictions remain',n; end if;

  select count(*) into n from public.product_ingredient_resolution_v1
  where resolution_status in ('RESOLVED_SINGLE','RESOLVED_MULTI')
    and 'EQUIVALENCE_EXPRESSION' = any(reason_codes);
  if n <> 0 then raise exception 'P1 exit: % resolved products still carry a blocker code',n; end if;

  select count(*) into n from public.substance_concepts_v1 c
  where not exists (select 1 from public.substance_terms_v1 t where t.concept_id=c.concept_id);
  if n <> 0 then raise exception 'P1 exit: % orphan concepts remain',n; end if;

  select count(*) into n from public.product_ingredient_resolution_v1 r
  join public.drugs d on d.id=r.source_drug_id
  join public.substance_single_expression_override_v1 o on o.source_key=d.active_substance_key
  where r.resolution_status='NEEDS_REVIEW';
  if n <> 0 then raise exception 'P1 exit: % overridden expressions still in review',n; end if;

  select count(*) into n
  from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
    and table_name in ('substance_concepts_v1','substance_terms_v1','substance_aliases',
                       'substance_merge_rejections','substance_equivalence_reviewed_v1',
                       'substance_equivalence_cleared_v1','substance_single_expression_override_v1',
                       'product_ingredients_v1','product_ingredient_resolution_v1');
  if n <> 0 then raise exception 'P1 exit: % public write grants remain on curated tables',n; end if;

  select count(*) into n from public.product_ingredient_resolution_v1 where resolution_status='NEEDS_REVIEW';
  if n > 117 then raise exception 'P1 exit: review queue grew to %',n; end if;
end $$;
