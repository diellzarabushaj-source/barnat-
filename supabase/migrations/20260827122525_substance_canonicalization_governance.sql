-- Synced from Supabase production migration history.
-- version: 20260827122525
-- name: substance_canonicalization_governance

alter table public.substance_aliases
  add column if not exists review_method text not null default 'legacy_reviewed',
  add column if not exists confidence numeric(5,4) not null default 1.0000,
  add column if not exists evidence_urls text[] not null default '{}'::text[];

alter table public.substance_merge_rejections
  add column if not exists review_method text not null default 'legacy_reviewed',
  add column if not exists confidence numeric(5,4) not null default 1.0000,
  add column if not exists evidence_urls text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.substance_aliases'::regclass
      and conname='substance_aliases_confidence_check'
  ) then
    alter table public.substance_aliases
      add constraint substance_aliases_confidence_check
      check (confidence >= 0 and confidence <= 1);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.substance_merge_rejections'::regclass
      and conname='substance_merge_rejections_confidence_check'
  ) then
    alter table public.substance_merge_rejections
      add constraint substance_merge_rejections_confidence_check
      check (confidence >= 0 and confidence <= 1);
  end if;
end $$;

create or replace function public.medindex_prevent_substance_alias_cycle()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_key text := new.canonical_key;
  next_key text;
  hops integer := 0;
begin
  if new.variant_key = new.canonical_key then
    raise exception 'Substance alias cannot point to itself: %', new.variant_key;
  end if;
  loop
    if current_key = new.variant_key then
      raise exception 'Substance alias cycle detected for %', new.variant_key;
    end if;
    select a.canonical_key into next_key
    from public.substance_aliases a
    where a.variant_key = current_key;
    exit when next_key is null;
    current_key := next_key;
    hops := hops + 1;
    if hops > 32 then
      raise exception 'Substance alias chain exceeds 32 hops near %', new.variant_key;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists substance_aliases_cycle_guard on public.substance_aliases;
create trigger substance_aliases_cycle_guard
before insert or update of variant_key, canonical_key
on public.substance_aliases
for each row execute function public.medindex_prevent_substance_alias_cycle();

create or replace function public.medindex_substance_component_signature(value text)
returns text
language sql
immutable
strict
parallel safe
as $$
  with parts as (
    select regexp_replace(lower(btrim(part)), '[^a-z0-9]+', '', 'g') as component_key
    from regexp_split_to_table(value, E'\\s*[;+&]\\s*') as part
  ),
  valid as (
    select component_key from parts where component_key <> ''
  )
  select case
    when count(*) >= 2 then string_agg(component_key, '|' order by component_key)
    else null
  end
  from valid
$$;

create or replace view public.substance_order_equivalence_candidates
with (security_invoker = true) as
with variants as (
  select distinct
    c.canonical_key,
    a.canonical_name,
    public.medindex_substance_component_signature(d.active_substance) as component_signature
  from public.drugs d
  join public.substance_canonical c on c.variant_key=d.active_substance_key
  join public.active_substances a on a.canonical_key=c.canonical_key
  where public.medindex_substance_component_signature(d.active_substance) is not null
),
pairs as (
  select
    v1.canonical_key as key_a,
    v2.canonical_key as key_b,
    v1.canonical_name as name_a,
    v2.canonical_name as name_b,
    v1.component_signature
  from variants v1
  join variants v2
    on v2.component_signature=v1.component_signature
   and v1.canonical_key < v2.canonical_key
)
select distinct
  p.key_a,p.key_b,p.name_a,p.name_b,p.component_signature,
  similarity(p.key_a,p.key_b)::numeric(7,6) as similarity_score
from pairs p
where not exists (
  select 1 from public.substance_merge_rejections r
  where r.key_a=p.key_a and r.key_b=p.key_b
);

create or replace view public.substance_fuzzy_merge_candidates
with (security_invoker = true) as
select
  a.canonical_key as key_a,
  b.canonical_key as key_b,
  a.canonical_name as name_a,
  b.canonical_name as name_b,
  similarity(a.canonical_key,b.canonical_key)::numeric(7,6) as similarity_score,
  nullif(btrim(regexp_replace(a.canonical_key, '[a-z]+', ' ', 'g')), '') as digit_signature_a,
  nullif(btrim(regexp_replace(b.canonical_key, '[a-z]+', ' ', 'g')), '') as digit_signature_b
from public.active_substances a
join public.active_substances b
  on a.canonical_key < b.canonical_key
where length(a.canonical_key) between 5 and 160
  and length(b.canonical_key) between 5 and 160
  and abs(length(a.canonical_key)-length(b.canonical_key)) <= 5
  and similarity(a.canonical_key,b.canonical_key) >= 0.76
  and coalesce(nullif(btrim(regexp_replace(a.canonical_key, '[a-z]+', ' ', 'g')), ''), '')
      = coalesce(nullif(btrim(regexp_replace(b.canonical_key, '[a-z]+', ' ', 'g')), ''), '')
  and not exists (
    select 1 from public.substance_merge_rejections r
    where r.key_a=a.canonical_key and r.key_b=b.canonical_key
  );

create table if not exists public.substance_merge_candidates (
  key_a text not null,
  key_b text not null,
  name_a text not null,
  name_b text not null,
  candidate_type text not null,
  similarity_score numeric(7,6),
  component_signature text,
  status text not null default 'pending',
  ai_verdict text,
  ai_confidence numeric(5,4),
  ai_reason text,
  evidence_urls text[] not null default '{}'::text[],
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key_a,key_b),
  constraint substance_merge_candidates_ordered check (key_a < key_b),
  constraint substance_merge_candidates_type_check
    check (candidate_type in ('order_equivalent','fuzzy_typo','abbreviation','manual')),
  constraint substance_merge_candidates_status_check
    check (status in ('pending','ai_same','ai_different','uncertain','approved','rejected')),
  constraint substance_merge_candidates_ai_confidence_check
    check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1))
);

alter table public.substance_merge_candidates enable row level security;
revoke all on table public.substance_merge_candidates from anon, authenticated;

create index if not exists substance_merge_candidates_status_idx
  on public.substance_merge_candidates(status, updated_at desc);
create index if not exists substance_merge_candidates_type_idx
  on public.substance_merge_candidates(candidate_type, status);

create or replace view public.substance_concept_sync_conflicts
with (security_invoker = true) as
select
  c.canonical_key,
  max(c.canonical_name) as canonical_name,
  count(distinct m.substance_concept_id) filter (
    where coalesce(m.substance_resolution_method,'') <> 'PRODUCT_OVERRIDE'
  ) as non_product_concept_count,
  array_agg(distinct m.substance_concept_id) filter (
    where coalesce(m.substance_resolution_method,'') <> 'PRODUCT_OVERRIDE'
  ) as non_product_concept_ids
from public.substance_canonical c
join public.drugs d on d.active_substance_key=c.variant_key
join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
group by c.canonical_key
having count(distinct m.substance_concept_id) filter (
  where coalesce(m.substance_resolution_method,'') <> 'PRODUCT_OVERRIDE'
) > 1;

revoke all on public.substance_concept_sync_conflicts from anon, authenticated;
revoke all on public.substance_order_equivalence_candidates from anon, authenticated;
revoke all on public.substance_fuzzy_merge_candidates from anon, authenticated;

create temporary table _approved_substance_merges (
  variant_key text primary key,
  canonical_key text not null,
  reason text not null,
  review_method text not null,
  confidence numeric(5,4) not null,
  evidence_urls text[] not null
) on commit drop;

insert into _approved_substance_merges values
('paracetamolpheniraminemaleateascorbicacid','paracetamolascorbicacidpheniraminemaleate','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('valsartanamlodipinebesylatehydrochlorothiazide','amlodipinebesilatevalsartanhydrochlorothiazide','i njëjti kombinim; rend i ndryshëm dhe besylate/besilate','reviewed_nomenclature_and_order',0.9950,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn','https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('levodopabenserazidehydrochloride','benserazidehydrochloridelevodopa','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('neomycinsulfatepolymyxinbsulfatedexamethasone','dexamethasonepolymyxinbsulfateneomycinsulfate','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('tobramycindexamethasone','dexamethasonetobramycin','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('salmeterolfluticasonepropionate','fluticasonepropionatesalmeterol','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('trimethoprimsulfamethoxazole','sulfamethoxazoletrimethoprim','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('chlorhexidinegluconatebenzydaminehydrochloride','benzydaminehydrochloridechlorhexidinegluconate','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('tamsulosinhydrochloridedutasteride','dutasteridetamsulosinhydrochloride','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('timololmaleatedorzolamidehydrochloride','dorzolamidehydrochloridetimololmaleate','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('vildagliptinmetforminhcl','vildagliptinmetforminhydrochloride','HCl është shkurtesë e hydrochloride në të njëjtin kombinim','official_abbreviation_review',1.0000,array['https://www.ema.europa.eu/en/medicines/human/EPAR/vildagliptin-metformin-hydrochloride-accord','https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('metforminhclvildagliptin','vildagliptinmetforminhydrochloride','HCl=hydrochloride dhe rend i ndryshëm në të njëjtin kombinim','official_abbreviation_review',1.0000,array['https://www.ema.europa.eu/en/medicines/human/EPAR/vildagliptin-metformin-hydrochloride-accord','https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('metforminhydrochloridevildagliptin','vildagliptinmetforminhydrochloride','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.ema.europa.eu/en/medicines/human/EPAR/vildagliptin-metformin-hydrochloride-accord']),
('valsartanamplodipinebesilatehydrochlorothiazide','amlodipinebesilatevalsartanhydrochlorothiazide','amplodipine është typo i amlodipine; i njëjti kombinim','ai_online_nomenclature_review',0.9950,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('ibuprofenparacentamol','ibuprofenparacetamol','paracentamol është typo i paracetamol','ai_online_nomenclature_review',0.9990,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('flucinoloneacetonide','fluocinoloneacetonide','flucinolone është typo i fluocinolone','ai_online_nomenclature_review',0.9950,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('clotrimazol','clotrimazole','variant gjuhësor i të njëjtit INN','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('levofloxacinashemihydrate','levofloxacinhemihydrate','as hemihydrate = hemihydrate; e njëjta formë precize','reviewed_expression_equivalence',0.9990,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('progesteron','progesterone','variant gjuhësor i të njëjtit emër','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('lansoprazol','lansoprazole','variant gjuhësor i të njëjtit emër','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('simvastatina','simvastatin','variant gjuhësor i të njëjtit emër','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('pantoprazol','pantoprazole','variant gjuhësor i të njëjtit emër','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('esomeprazol','esomeprazole','variant gjuhësor i të njëjtit emër','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('olopatidinehydrochloride','olopatadinehydrochloride','olopatidine është typo i olopatadine; kripa mbetet e njëjtë','ai_online_nomenclature_review',0.9950,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('ketoprofenlysinsalt','ketoprofenlysinesalt','lysin/lysine spelling; e njëjta kripë','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('trastuzumabemtasine','trastuzumabemtansine','emtasine është typo i emtansine','ai_online_nomenclature_review',0.9950,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('levofloxasinhemihydrate','levofloxacinhemihydrate','levofloxasin është typo i levofloxacin; hemihydrate i njëjtë','ai_online_nomenclature_review',0.9990,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('thiocolchioside','thiocolchicoside','thiocolchioside është typo i thiocolchicoside','ai_online_nomenclature_review',0.9950,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('fusidicacidashemihydrate','fusidicacidhemihydrate','as hemihydrate = hemihydrate; e njëjta formë','reviewed_expression_equivalence',0.9990,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('fluconazol','fluconazole','variant gjuhësor i të njëjtit emër','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('risperidon','risperidone','variant gjuhësor i të njëjtit emër','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('gabapentine','gabapentin','variant gjuhësor i të njëjtit emër','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('cinarizine','cinnarizine','cinarizine është typo i cinnarizine','ai_online_nomenclature_review',0.9950,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('gentamicine','gentamicin','variant gjuhësor i të njëjtit emër','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('pantoprazolsodium','pantoprazolesodium','variant gjuhësor; sodium moiety e pandryshuar','ai_online_nomenclature_review',0.9900,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('glucosemoohydrate','glucosemonohydrate','moohydrate është typo i monohydrate','ai_online_nomenclature_review',0.9990,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']),
('glucosemonhydrate','glucosemonohydrate','monhydrate është typo i monohydrate','ai_online_nomenclature_review',0.9990,array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn']);

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select a.variant_key,a.canonical_key,coalesce(t.canonical_name,a.canonical_key),a.reason,
       'gpt-5.6-sol+official-sources-2026-08-27',now(),a.review_method,a.confidence,a.evidence_urls
from _approved_substance_merges a
left join public.active_substances t on t.canonical_key=a.canonical_key
on conflict (variant_key) do nothing;

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,'clinical-safety-guard-2026-08-27',now(),
       'rule_based_safety_guard',1.0000,
       array['https://www.who.int/teams/health-product-and-policy-standards/inn/guidance-on-inn',
             'https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']
from (values
 ('betahistinedihydrochloride','betahistinehydrochloride','salt stoichiometry differs in source text; no automatic merge'),
 ('cetirizinedihydrochloride','cetirizinehydrochloride','salt stoichiometry differs in source text; no automatic merge'),
 ('olanzapinefluoxetine','olanzapinefluoxetinehcl','precise ingredient/salt differs in source text; no automatic merge'),
 ('pantoprazolesodiumsesquihydrateequivalenttopantoprazole','pantoprazolesodiumsesquihydrateequivalenttopantoprazole40mg','explicit strength differs; no automatic merge'),
 ('amoxicillintrihydrateequivalenttoamoxicillin','amoxicillintrihydrateequivalenttoamoxicillin500mg','explicit strength differs; no automatic merge')
) v(a,b,reason)
on conflict (key_a,key_b) do nothing;

do $$
declare
  rec record;
  target_concept uuid;
  target_count integer;
  target_name text;
begin
  for rec in select distinct canonical_key from _approved_substance_merges
  loop
    select (array_agg(distinct m.substance_concept_id))[1],count(distinct m.substance_concept_id)
      into target_concept,target_count
    from public.drugs d
    join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
    where d.active_substance_key=rec.canonical_key
      and coalesce(m.substance_resolution_method,'') <> 'PRODUCT_OVERRIDE';

    if target_count <> 1 or target_concept is null then
      raise exception 'Canonical target % does not resolve to exactly one non-product concept (count=%)',
        rec.canonical_key,target_count;
    end if;

    select canonical_name into target_name
    from public.active_substances
    where canonical_key=rec.canonical_key;

    update public.medindex_drug_core_map_v1 m
       set substance_concept_id=target_concept,
           active_substance_override=coalesce(target_name,m.active_substance_override),
           substance_resolution_method='VERIFIED_MAP'
      from public.drugs d
      join public.substance_canonical c on c.variant_key=d.active_substance_key
     where m.source_drug_id=d.id
       and c.canonical_key=rec.canonical_key
       and d.active_substance_key <> rec.canonical_key
       and coalesce(m.substance_resolution_method,'') <> 'PRODUCT_OVERRIDE';
  end loop;
end $$;

insert into public.substance_merge_candidates
(key_a,key_b,name_a,name_b,candidate_type,similarity_score,component_signature,status,updated_at)
select key_a,key_b,name_a,name_b,'order_equivalent',similarity_score,component_signature,'pending',now()
from public.substance_order_equivalence_candidates
on conflict (key_a,key_b) do update
set name_a=excluded.name_a,name_b=excluded.name_b,
    candidate_type=case when public.substance_merge_candidates.status='pending' then excluded.candidate_type else public.substance_merge_candidates.candidate_type end,
    similarity_score=excluded.similarity_score,
    component_signature=excluded.component_signature,
    updated_at=now()
where public.substance_merge_candidates.status='pending';

insert into public.substance_merge_candidates
(key_a,key_b,name_a,name_b,candidate_type,similarity_score,status,updated_at)
select key_a,key_b,name_a,name_b,'fuzzy_typo',similarity_score,'pending',now()
from public.substance_fuzzy_merge_candidates
on conflict (key_a,key_b) do update
set name_a=excluded.name_a,name_b=excluded.name_b,
    similarity_score=excluded.similarity_score,
    updated_at=now()
where public.substance_merge_candidates.status='pending';

do $$
declare
  loop_count bigint;
  conflict_count bigint;
begin
  with recursive walk(start_key,current_key,path,cycle) as (
    select variant_key,canonical_key,array[variant_key,canonical_key],false
    from public.substance_aliases
    union all
    select w.start_key,a.canonical_key,w.path || a.canonical_key,
           a.canonical_key=any(w.path)
    from walk w
    join public.substance_aliases a on a.variant_key=w.current_key
    where not w.cycle and cardinality(w.path)<40
  )
  select count(*) into loop_count from walk where cycle;

  if loop_count <> 0 then
    raise exception 'Alias graph contains % cycles',loop_count;
  end if;

  select count(*) into conflict_count
  from public.substance_concept_sync_conflicts c
  where c.canonical_key in (select distinct canonical_key from _approved_substance_merges);

  if conflict_count <> 0 then
    raise exception 'Approved canonical groups still have % non-product concept conflicts', conflict_count;
  end if;
end $$;
