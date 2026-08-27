-- Synced from Supabase production migration history.
-- version: 20260827132647
-- name: p1_safe_and_connector_resolution

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','desogestrel'),'desogestrel','Desogestrel','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','ethinylestradiol'),'ethinylestradiol','Ethinylestradiol','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','piperacillinsodium'),'piperacillinsodium','Piperacillin sodium','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','tazobactamsodium'),'tazobactamsodium','Tazobactam sodium','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','clavulanatepotassium'),'clavulanatepotassium','Clavulanate potassium','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('desogestrel',public.medindex_stable_uuid_v1('substance','desogestrel'),'Desogestrel','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/9567/smpc']),
('ethinylestradiol',public.medindex_stable_uuid_v1('substance','ethinylestradiol'),'Ethinylestradiol','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/9567/smpc']),
('piperacillinsodium',public.medindex_stable_uuid_v1('substance','piperacillinsodium'),'Piperacillin sodium','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=bc26ffd8-1a6e-4e16-91c1-ec67c928b3bf']),
('tazobactamsodium',public.medindex_stable_uuid_v1('substance','tazobactamsodium'),'Tazobactam sodium','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=bc26ffd8-1a6e-4e16-91c1-ec67c928b3bf']),
('tazobactamsodium81',public.medindex_stable_uuid_v1('substance','tazobactamsodium'),'Tazobactam Sodium (8:1)','ALIAS',false,1.0000,'RATIO_SUFFIX_SEPARATION',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=bc26ffd8-1a6e-4e16-91c1-ec67c928b3bf']),
('clavulanatepotassium',public.medindex_stable_uuid_v1('substance','clavulanatepotassium'),'Clavulanate potassium','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=db25500a-90ee-429f-991f-da511cec7882']),
('clavulantepotassium71',public.medindex_stable_uuid_v1('substance','clavulanatepotassium'),'Clavulante potassium (7:1)','ALIAS',false,0.9990,'TYPO_AND_RATIO_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=db25500a-90ee-429f-991f-da511cec7882']),
('clavulatepotassium71',public.medindex_stable_uuid_v1('substance','clavulanatepotassium'),'Clavulate potassium (7:1)','ALIAS',false,0.9990,'TYPO_AND_RATIO_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=db25500a-90ee-429f-991f-da511cec7882'])
on conflict (term_key) do update
set concept_id=excluded.concept_id,
    term=excluded.term,
    term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,
    confidence=excluded.confidence,
    review_method=excluded.review_method,
    evidence_urls=excluded.evidence_urls,
    updated_at=now();

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
values
('tazobactamsodium81','tazobactamsodium','Tazobactam sodium','ratio suffix belongs to product composition, not ingredient identity','p1-and-review-2026-08-27',now(),'official_ratio_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=bc26ffd8-1a6e-4e16-91c1-ec67c928b3bf']),
('clavulantepotassium71','clavulanatepotassium','Clavulanate potassium','clavulante typo plus 7:1 ratio suffix; official ingredient is clavulanate potassium','p1-and-review-2026-08-27',now(),'official_typo_ratio_review',0.9990,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=db25500a-90ee-429f-991f-da511cec7882']),
('clavulatepotassium71','clavulanatepotassium','Clavulanate potassium','clavulate typo plus 7:1 ratio suffix; official ingredient is clavulanate potassium','p1-and-review-2026-08-27',now(),'official_typo_ratio_review',0.9990,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=db25500a-90ee-429f-991f-da511cec7882'])
on conflict (variant_key) do nothing;

alter table public.product_ingredients_v1
  drop constraint if exists product_ingredients_v1_method_check;
alter table public.product_ingredients_v1
  add constraint product_ingredients_v1_method_check
  check (resolution_method in ('SINGLE_CANONICAL','DELIMITER_EXACT','AND_EXACT'));

create or replace view public.medindex_p1_and_parts_v1
with (security_invoker = true) as
select
  d.id as source_drug_id,
  d.active_substance as source_expression,
  row_number() over (partition by d.id order by p.ordinality)::integer as ingredient_ordinal,
  btrim(p.value) as source_term,
  public.medindex_normalize_substance_term_v1(p.value) as term_key,
  t.concept_id,
  c.canonical_key,
  c.canonical_name,
  t.confidence
from public.drugs d
join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
cross join lateral regexp_split_to_table(d.active_substance, '(?i)\s+and\s+')
  with ordinality as p(value,ordinality)
left join public.substance_terms_v1 t
  on t.term_key=public.medindex_normalize_substance_term_v1(p.value)
left join public.substance_concepts_v1 c on c.concept_id=t.concept_id
where d.active_substance !~ '(;|\+|&)'
  and d.active_substance ~* '\sand\s';

create or replace view public.medindex_p1_safe_and_v1
with (security_invoker = true) as
select p.source_drug_id,count(*)::integer as part_count
from public.medindex_p1_and_parts_v1 p
join public.drugs d on d.id=p.source_drug_id
group by p.source_drug_id,d.active_substance
having count(*)=2
   and count(p.concept_id)=2
   and count(distinct p.concept_id)=2
   and d.active_substance !~* '(equivalent to|corresponding to|extract|mixture|virus|complex factors|factor viii|factor ix|factor x|potency)';

revoke all on public.medindex_p1_and_parts_v1,
              public.medindex_p1_safe_and_v1
from anon, authenticated;

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
begin
  insert into public.substance_concepts_v1
  (concept_id,canonical_key,canonical_name,concept_kind,source_method)
  select public.medindex_stable_uuid_v1('substance',q.canonical_key),
         q.canonical_key,max(q.canonical_name),'INGREDIENT','CANONICAL_GRAPH'
  from (
    select canonical_key,canonical_name from public.medindex_p1_safe_single_v1
    union all
    select p.canonical_key,p.canonical_name
    from public.medindex_p1_combo_parts_v1 p
    join public.medindex_p1_safe_multi_v1 s on s.source_drug_id=p.source_drug_id
  ) q
  where q.canonical_key is not null
  group by q.canonical_key
  on conflict (canonical_key) do update
  set canonical_name=excluded.canonical_name,updated_at=now();

  delete from public.product_ingredients_v1;

  insert into public.product_ingredients_v1
  (source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,resolution_method,confidence)
  select s.source_drug_id,1,c.concept_id,s.source_expression,s.component_key,'SINGLE_CANONICAL',s.confidence
  from public.medindex_p1_safe_single_v1 s
  join public.substance_concepts_v1 c on c.canonical_key=s.canonical_key;

  insert into public.product_ingredients_v1
  (source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,resolution_method,confidence)
  select p.source_drug_id,p.ingredient_ordinal,c.concept_id,p.source_term,p.component_key,'DELIMITER_EXACT',p.confidence
  from public.medindex_p1_combo_parts_v1 p
  join public.medindex_p1_safe_multi_v1 s on s.source_drug_id=p.source_drug_id
  join public.substance_concepts_v1 c on c.canonical_key=p.canonical_key;

  insert into public.product_ingredients_v1
  (source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,resolution_method,confidence)
  select p.source_drug_id,p.ingredient_ordinal,p.concept_id,p.source_term,p.term_key,'AND_EXACT',p.confidence
  from public.medindex_p1_and_parts_v1 p
  join public.medindex_p1_safe_and_v1 s on s.source_drug_id=p.source_drug_id;

  delete from public.product_ingredient_resolution_v1;

  insert into public.product_ingredient_resolution_v1
  (source_drug_id,resolution_status,expected_component_count,resolved_component_count,reason_codes,source_expression,reviewed_at)
  select d.id,
    case when e.source_drug_id is not null then 'EXCLUDED'
         when sm.source_drug_id is not null then 'RESOLVED_MULTI'
         when sa.source_drug_id is not null then 'RESOLVED_MULTI'
         when ss.source_drug_id is not null then 'RESOLVED_SINGLE'
         else 'NEEDS_REVIEW' end,
    case when e.source_drug_id is not null then 0
         when sm.source_drug_id is not null then sm.part_count
         when sa.source_drug_id is not null then sa.part_count
         when ss.source_drug_id is not null then 1
         when d.active_substance ~ '(;|\+|&)' then
           (select count(*)::integer from public.medindex_p1_combo_parts_v1 cp where cp.source_drug_id=d.id)
         when d.active_substance !~ '(;|\+|&)' and d.active_substance ~* '\sand\s' then
           (select count(*)::integer from public.medindex_p1_and_parts_v1 ap where ap.source_drug_id=d.id)
         else null end,
    case when sm.source_drug_id is not null then sm.part_count
         when sa.source_drug_id is not null then sa.part_count
         when ss.source_drug_id is not null then 1 else 0 end,
    case when e.source_drug_id is not null then array[e.exception_code]
         else array_remove(array[
           case when coalesce(btrim(d.active_substance),'')='' then 'MISSING_ACTIVE_SUBSTANCE' end,
           case when d.active_substance ~* '(equivalent to|corresponding to|\bas\b)' then 'EQUIVALENCE_EXPRESSION' end,
           case when d.active_substance !~ '(;|\+|&)' and d.active_substance ~* '\sand\s'
                  and sa.source_drug_id is null then 'WORD_AND_CONNECTOR' end,
           case when d.active_substance !~ '(;|\+|&)' and d.active_substance ~ '/' then 'SLASH_CONNECTOR' end,
           case when d.active_substance ~ '(;|\+|&)'
                  and exists (select 1 from public.medindex_p1_combo_parts_v1 cp
                              where cp.source_drug_id=d.id and cp.canonical_key is null)
                then 'UNRESOLVED_COMPONENT' end,
           case when d.active_substance ~ '(;|\+|&)'
                  and exists (select 1 from public.medindex_p1_combo_parts_v1 cp
                              where cp.source_drug_id=d.id
                              group by cp.source_drug_id
                              having count(distinct cp.canonical_key)<count(cp.canonical_key))
                then 'DUPLICATE_COMPONENT' end,
           case when m.source_drug_id is not null
                  and not exists (select 1 from public.substance_canonical sc
                                  where sc.variant_key=d.active_substance_key)
                then 'NO_CANONICAL_ROOT' end,
           case when m.source_drug_id is null and e.source_drug_id is null then 'NO_CORE_MAP' end
         ],null) end,
    d.active_substance,
    case when sm.source_drug_id is not null or sa.source_drug_id is not null or ss.source_drug_id is not null
         then now() else null end
  from public.drugs d
  left join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
  left join public.medindex_drug_pipeline_exceptions_v1 e on e.source_drug_id=d.id
  left join public.medindex_p1_safe_multi_v1 sm on sm.source_drug_id=d.id
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
  left join (select source_drug_id,count(*)::integer n from public.product_ingredients_v1 group by source_drug_id) i
    using(source_drug_id)
  where (r.resolution_status='RESOLVED_SINGLE' and coalesce(i.n,0)<>1)
     or (r.resolution_status='RESOLVED_MULTI'
         and (r.expected_component_count<>r.resolved_component_count
              or coalesce(i.n,0)<>r.resolved_component_count
              or r.resolved_component_count<2));

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

  return jsonb_build_object(
    'total',total_drugs,'resolved_single',resolved_single,'resolved_multi',resolved_multi,
    'needs_review',needs_review,'excluded',excluded,'ingredient_rows',ingredient_rows
  );
end $$;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 503 then
    raise exception 'P1.3 AND parser did not improve review coverage: %',n;
  end if;
end $$;
