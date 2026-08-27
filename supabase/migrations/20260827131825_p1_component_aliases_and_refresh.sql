-- Synced from Supabase production migration history.
-- version: 20260827131825
-- name: p1_component_aliases_and_refresh

create temporary table _p12_aliases (
  variant_key text primary key,
  target_key text not null,
  reason text not null,
  review_method text not null,
  confidence numeric(5,4) not null,
  evidence_urls text[] not null
) on commit drop;

insert into _p12_aliases values
('chlorpheniraminemaleate','chlorphenaminemaleate','chlorpheniramine/chlorphenamine are synonyms; maleate salt unchanged','official_synonym_review',1.0000,array['https://www.ema.europa.eu/en/documents/mrl-report/chlorphenamine-summary-report-committee-veterinary-medicinal-products_en.pdf','https://pubchem.ncbi.nlm.nih.gov/compound/Chlorphenamine-maleate']),
('hydrochlorthiazide','hydrochlorothiazide','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('metronidazol','metronidazole','language/spelling variant only','deterministic_typo_review',0.9990,'{}'),
('lysozymhydrochloride','lysozymehydrochloride','spelling typo only; hydrochloride unchanged','deterministic_typo_review',1.0000,'{}'),
('acidacetylsalicylic','acetylsalicylicacid','same ingredient; words reversed','deterministic_word_order_review',1.0000,'{}'),
('gentamicinassulfate','gentamicinsulfate','same ingredient; parenthetical as sulfate expression','deterministic_expression_review',1.0000,'{}'),
('amplodipinebesilate','amlodipinebesilate','spelling typo only; besilate unchanged','deterministic_typo_review',1.0000,'{}'),
('hydrochlorotiazide','hydrochlorothiazide','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('nystatine','nystatin','language/spelling variant only','deterministic_typo_review',0.9990,'{}'),
('chlorphenaminemaleat','chlorphenaminemaleate','maleat/maleate spelling variant only','deterministic_typo_review',1.0000,'{}'),
('potasiumchloride','potassiumchloride','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('benzydaminehydrochloride015','benzydaminehydrochloride','same ingredient; concentration text belongs to strength, not substance identity','ingredient_strength_separation_review',1.0000,'{}'),
('betamethasoneipropionate','betamethasonedipropionate','missing leading d in dipropionate','deterministic_typo_review',0.9990,'{}'),
('tamsulosinehydrochloride','tamsulosinhydrochloride','language/spelling variant only; hydrochloride unchanged','deterministic_typo_review',0.9990,'{}'),
('aminophyline','aminophylline','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('lidocainehydrocloride','lidocainehydrochloride','spelling typo only; hydrochloride unchanged','deterministic_typo_review',1.0000,'{}'),
('hyoscinenbutylbromide','hyoscinebutylbromide','same N-butylbromide ingredient; punctuation marker removed','deterministic_expression_review',1.0000,'{}'),
('hyaloronicacidsodiumsalt','hyaluronicacidsodiumsalt','spelling typo only; sodium salt unchanged','deterministic_typo_review',1.0000,'{}'),
('magnesiumsulfateheptahydrate','magnesiumsulphateheptahydrate','sulfate/sulphate spelling variant; heptahydrate unchanged','orthographic_variant_review',1.0000,'{}'),
('amplodipinebesylate','amlodipinebesylate','spelling typo only; besylate unchanged','deterministic_typo_review',1.0000,'{}'),
('gentamicinesulphate','gentamicinsulphate','language/spelling variant only; sulphate unchanged','deterministic_typo_review',0.9990,'{}'),
('hydrochlorothizide','hydrochlorothiazide','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('hydroclorothiazide','hydrochlorothiazide','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('glycopyrroniumasbromide','glycopyrroniumbromide','same ingredient; parenthetical as bromide expression','deterministic_expression_review',1.0000,'{}'),
('hydrocortizoneacetate','hydrocortisoneacetate','spelling typo only; acetate unchanged','deterministic_typo_review',1.0000,'{}'),
('lyzozymehydrochloride','lysozymehydrochloride','spelling typo only; hydrochloride unchanged','deterministic_typo_review',1.0000,'{}'),
('dexamethasonesodiumphopshate','dexamethasonesodiumphosphate','spelling typo only; sodium phosphate unchanged','deterministic_typo_review',1.0000,'{}'),
('clyndamycinphosphate','clindamycinphosphate','spelling typo only; phosphate unchanged','deterministic_typo_review',1.0000,'{}'),
('paracetamolum','paracetamol','Latinized spelling variant only','orthographic_variant_review',0.9990,'{}'),
('adapalen','adapalene','language/spelling variant only','deterministic_typo_review',0.9990,'{}'),
('indacaterolasmaleate','indacaterolmaleate','same ingredient; parenthetical as maleate expression','deterministic_expression_review',1.0000,'{}'),
('silversulfodiazine','silversulfadiazine','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('amoxicillinintrihydrateform','amoxicillintrihydrate','same ingredient; in trihydrate form wording only','deterministic_expression_review',1.0000,'{}'),
('clopidogrelbisulfate','clopidogrelbisulphate','bisulfate/bisulphate spelling variant; salt unchanged','orthographic_variant_review',1.0000,'{}'),
('pottasiumchloride','potassiumchloride','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('gentamicinedulphate','gentamicinsulphate','spelling typo only; sulphate unchanged','deterministic_typo_review',1.0000,'{}'),
('empaglifozin','empagliflozin','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('chlorpheniraminemaleat','chlorphenaminemaleate','chlorpheniramine/chlorphenamine synonym plus maleat/maleate spelling variant','official_synonym_review',1.0000,array['https://www.ema.europa.eu/en/documents/mrl-report/chlorphenamine-summary-report-committee-veterinary-medicinal-products_en.pdf','https://pubchem.ncbi.nlm.nih.gov/compound/Chlorphenamine-maleate']),
('paracentamol','paracetamol','spelling typo only','deterministic_typo_review',1.0000,'{}'),
('tramadolum','tramadol','Latinized spelling variant only','orthographic_variant_review',0.9990,'{}'),
('lidocainehci','lidocainehydrochloride','HCI is OCR/spelling error for HCl; hydrochloride ingredient intended','deterministic_typo_review',0.9990,'{}'),
('lidocainehcl','lidocainehydrochloride','HCl abbreviation expands to hydrochloride','official_abbreviation_review',1.0000,'{}'),
('simethicone','simeticone','simeticone and simethicone are accepted names for the same ingredient','official_synonym_review',1.0000,array['https://www.nhs.uk/medicines/simeticone/about-simeticone/','https://www.ema.europa.eu/en/documents/psusa/alverine-simeticone-list-nationally-authorised-medicinal-products-psusa00000125202202_en.pdf']),
('alendronatesodiumtrihydrate','sodiumalendronatetrihydrate','same salt/hydrate; word order only','deterministic_word_order_review',1.0000,'{}'),
('lidocainihydrochloridum','lidocainehydrochloride','Latinized spelling variant; hydrochloride unchanged','orthographic_variant_review',0.9990,'{}');

do $$
declare bad_targets bigint;
begin
  select count(*) into bad_targets
  from _p12_aliases a
  left join public.substance_concepts_v1 c on c.canonical_key=a.target_key
  left join public.substance_canonical sc on sc.variant_key=a.target_key
  where c.concept_id is null or sc.canonical_key is distinct from a.target_key;
  if bad_targets <> 0 then
    raise exception 'P1.2 has % aliases without a stable root concept',bad_targets;
  end if;
end $$;

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select a.variant_key,a.target_key,c.canonical_name,a.reason,
       'gpt-5.6-sol+p1-component-review-2026-08-27',now(),
       a.review_method,a.confidence,a.evidence_urls
from _p12_aliases a
join public.substance_concepts_v1 c on c.canonical_key=a.target_key
on conflict (variant_key) do nothing;

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,
       'p1-component-safety-guard-2026-08-27',now(),
       'clinical_difference_guard',1.0000,'{}'::text[]
from (values
('pseudoephedrinehydrochloride','ephedrinehydrochloride','different active substances; similarity must never imply merge'),
('propyphenazone','prophenazone','potentially distinct pyrazolone names; no automatic merge without authoritative identity proof'),
('formoterolfumaratedehydrous','formoterolfumaratedihydrate','hydrate state differs; no automatic merge'),
('isoconazolenitrate','econazolenitrate','different azole active substances'),
('oxytetracyclinehydrochloride','tetracyclinehydrochloride','different tetracycline active substances'),
('betamethasonesodiumphosphate','dexamethasonesodiumphosphate','different corticosteroids'),
('amoxicillinsodium','ampicillinsodium','different penicillin active substances'),
('fludrocortisoneacetate','hydrocortisoneacetate','different corticosteroids'),
('sitagliptinhcl','sitagliptin','salt/base precision differs; no automatic merge'),
('epinephrineastartrate','epinephrinebitartrate','tartrate/bitartrate precision differs; no automatic merge'),
('lercanidipine','lercanidipinehcl','base/salt precision differs; no automatic merge'),
('lidocainehydrochloride1h2o','lidocainehydrochloride','hydrate precision differs; no automatic merge'),
('atorvastatincalciumx3h2o','atorvastatincalcium','hydrate precision differs; no automatic merge'),
('metoclopramidehydrochloridexh2o','metoclopramidehydrochloride','hydrate precision differs; no automatic merge')
) v(a,b,reason)
on conflict (key_a,key_b) do nothing;

create or replace view public.medindex_p1_combo_parts_v1
with (security_invoker = true) as
select d.id as source_drug_id,d.active_substance as source_expression,
       row_number() over (partition by d.id order by part.ordinality)::integer as ingredient_ordinal,
       btrim(part.value) as source_term,
       public.medindex_normalize_substance_term_v1(part.value) as component_key,
       c.canonical_key,c.canonical_name,
       coalesce(a.confidence,1.0000)::numeric(5,4) as confidence
from public.drugs d
join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
cross join lateral regexp_split_to_table(d.active_substance, '\s*(?:;|\+|&)\s*')
  with ordinality as part(value,ordinality)
left join public.substance_canonical c
  on c.variant_key=public.medindex_normalize_substance_term_v1(part.value)
left join public.substance_aliases a
  on a.variant_key=public.medindex_normalize_substance_term_v1(part.value)
where d.active_substance ~ '(;|\+|&)';

create or replace view public.medindex_p1_safe_multi_v1
with (security_invoker = true) as
select p.source_drug_id,count(*)::integer as part_count
from public.medindex_p1_combo_parts_v1 p
join public.drugs d on d.id=p.source_drug_id
group by p.source_drug_id,d.active_substance
having count(*) >= 2
   and count(p.canonical_key)=count(*)
   and count(distinct p.canonical_key)=count(*)
   and d.active_substance !~* '(equivalent to|corresponding to|\bas\b)';

create or replace view public.medindex_p1_safe_single_v1
with (security_invoker = true) as
select d.id as source_drug_id,d.active_substance as source_expression,
       d.active_substance_key as component_key,c.canonical_key,c.canonical_name,
       coalesce(a.confidence,1.0000)::numeric(5,4) as confidence
from public.drugs d
join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
join public.substance_canonical c on c.variant_key=d.active_substance_key
left join public.substance_aliases a on a.variant_key=d.active_substance_key
where coalesce(btrim(d.active_substance),'') <> ''
  and d.active_substance !~ '(;|\+|&)'
  and d.active_substance !~* '\sand\s'
  and d.active_substance !~ '/'
  and d.active_substance !~* '(equivalent to|corresponding to|\bas\b)';

revoke all on public.medindex_p1_combo_parts_v1,
              public.medindex_p1_safe_multi_v1,
              public.medindex_p1_safe_single_v1
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

  insert into public.substance_terms_v1
  (term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
  select c.canonical_key,c.concept_id,c.canonical_name,'CANONICAL',true,1.0000,'CANONICAL_GRAPH','{}'::text[]
  from public.substance_concepts_v1 c
  on conflict (term_key) do update
  set concept_id=excluded.concept_id,term=excluded.term,term_type='CANONICAL',
      is_preferred=true,confidence=1.0000,review_method='CANONICAL_GRAPH',updated_at=now();

  with source_counts as (
    select d.active_substance_key as term_key,c.concept_id,d.active_substance as term,
           case when a.variant_key is null then 'SOURCE' else 'ALIAS' end as term_type,
           coalesce(a.confidence,1.0000)::numeric(5,4) as confidence,
           coalesce(a.review_method,'SOURCE_REGISTRY') as review_method,
           coalesce(a.evidence_urls,'{}'::text[]) as evidence_urls,
           count(*)::bigint as n
    from public.drugs d
    join public.substance_canonical sc on sc.variant_key=d.active_substance_key
    join public.substance_concepts_v1 c on c.canonical_key=sc.canonical_key
    left join public.substance_aliases a on a.variant_key=d.active_substance_key
    where coalesce(btrim(d.active_substance),'') <> ''
    group by d.active_substance_key,c.concept_id,d.active_substance,
             case when a.variant_key is null then 'SOURCE' else 'ALIAS' end,
             coalesce(a.confidence,1.0000)::numeric(5,4),
             coalesce(a.review_method,'SOURCE_REGISTRY'),
             coalesce(a.evidence_urls,'{}'::text[])
  ), source_terms as (
    select *,row_number() over (partition by term_key order by n desc,length(term),term) as rn
    from source_counts
  )
  insert into public.substance_terms_v1
  (term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
  select term_key,concept_id,term,term_type,false,confidence,review_method,evidence_urls
  from source_terms where rn=1
  on conflict (term_key) do update
  set concept_id=excluded.concept_id,term=excluded.term,term_type=excluded.term_type,
      confidence=excluded.confidence,review_method=excluded.review_method,
      evidence_urls=excluded.evidence_urls,updated_at=now()
  where not public.substance_terms_v1.is_preferred;

  insert into public.substance_terms_v1
  (term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
  select distinct on (p.component_key)
    p.component_key,c.concept_id,p.source_term,
    case when a.variant_key is null then 'SOURCE' else 'ALIAS' end,
    false,p.confidence,coalesce(a.review_method,'DELIMITER_SOURCE'),
    coalesce(a.evidence_urls,'{}'::text[])
  from public.medindex_p1_combo_parts_v1 p
  join public.medindex_p1_safe_multi_v1 s on s.source_drug_id=p.source_drug_id
  join public.substance_concepts_v1 c on c.canonical_key=p.canonical_key
  left join public.substance_aliases a on a.variant_key=p.component_key
  where p.component_key is not null
  order by p.component_key,length(p.source_term),p.source_term
  on conflict (term_key) do update
  set concept_id=excluded.concept_id,term=excluded.term,term_type=excluded.term_type,
      confidence=excluded.confidence,review_method=excluded.review_method,
      evidence_urls=excluded.evidence_urls,updated_at=now()
  where not public.substance_terms_v1.is_preferred;

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

  delete from public.product_ingredient_resolution_v1;

  insert into public.product_ingredient_resolution_v1
  (source_drug_id,resolution_status,expected_component_count,resolved_component_count,reason_codes,source_expression,reviewed_at)
  select d.id,
    case when e.source_drug_id is not null then 'EXCLUDED'
         when sm.source_drug_id is not null then 'RESOLVED_MULTI'
         when ss.source_drug_id is not null then 'RESOLVED_SINGLE'
         else 'NEEDS_REVIEW' end,
    case when e.source_drug_id is not null then 0
         when sm.source_drug_id is not null then sm.part_count
         when ss.source_drug_id is not null then 1
         when d.active_substance ~ '(;|\+|&)' then
           (select count(*)::integer from public.medindex_p1_combo_parts_v1 cp where cp.source_drug_id=d.id)
         else null end,
    case when sm.source_drug_id is not null then sm.part_count
         when ss.source_drug_id is not null then 1 else 0 end,
    case when e.source_drug_id is not null then array[e.exception_code]
         else array_remove(array[
           case when coalesce(btrim(d.active_substance),'')='' then 'MISSING_ACTIVE_SUBSTANCE' end,
           case when d.active_substance ~* '(equivalent to|corresponding to|\bas\b)' then 'EQUIVALENCE_EXPRESSION' end,
           case when d.active_substance !~ '(;|\+|&)' and d.active_substance ~* '\sand\s' then 'WORD_AND_CONNECTOR' end,
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
    case when sm.source_drug_id is not null or ss.source_drug_id is not null then now() else null end
  from public.drugs d
  left join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
  left join public.medindex_drug_pipeline_exceptions_v1 e on e.source_drug_id=d.id
  left join public.medindex_p1_safe_multi_v1 sm on sm.source_drug_id=d.id
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

revoke all on function public.medindex_refresh_product_ingredients_v1() from public, anon, authenticated;
grant execute on function public.medindex_refresh_product_ingredients_v1() to service_role;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 532 then
    raise exception 'P1.2 expected review coverage improvement; needs_review=%',n;
  end if;
end $$;
