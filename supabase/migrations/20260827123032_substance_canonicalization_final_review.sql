-- Synced from Supabase production migration history.
-- version: 20260827123032
-- name: substance_canonicalization_final_review

create or replace view public.substance_canonical
with (security_invoker = true) as
with recursive resolve(variant_key,canonical_key,depth) as (
  select k,k,0
  from (
    select distinct active_substance_key as k
    from public.drugs
    where active_substance_key <> ''
    union
    select variant_key from public.substance_aliases
    union
    select canonical_key from public.substance_aliases
  ) keys
  where k is not null and k <> ''
  union all
  select r.variant_key,a.canonical_key,r.depth+1
  from resolve r
  join public.substance_aliases a on a.variant_key=r.canonical_key
  where r.depth < 32
),
final as (
  select distinct on (variant_key) variant_key,canonical_key
  from resolve
  order by variant_key,depth desc
),
naming as (
  select f.canonical_key,
         d.active_substance as name,
         count(*) as n,
         (d.active_substance_key=f.canonical_key) as is_root
  from final f
  join public.drugs d on d.active_substance_key=f.variant_key
  where coalesce(btrim(d.active_substance),'') <> ''
  group by f.canonical_key,d.active_substance,(d.active_substance_key=f.canonical_key)
),
display as (
  select distinct on (canonical_key) canonical_key,name
  from naming
  order by canonical_key,is_root desc,n desc,length(name) desc,name
),
explicit_names as (
  select distinct on (f.canonical_key)
         f.canonical_key,
         a.canonical_name
  from final f
  join public.substance_aliases a on a.variant_key=f.variant_key
  where coalesce(btrim(a.canonical_name),'') <> ''
  order by f.canonical_key,
           a.confidence desc nulls last,
           a.reviewed_at desc nulls last,
           length(a.canonical_name) desc,
           a.canonical_name
)
select f.variant_key,
       f.canonical_key,
       coalesce(e.canonical_name,d.name,f.canonical_key) as canonical_name
from final f
left join explicit_names e on e.canonical_key=f.canonical_key
left join display d on d.canonical_key=f.canonical_key;

create temporary table _final_substance_merges (
  variant_key text primary key,
  canonical_key text not null,
  canonical_name text not null,
  reason text not null,
  review_method text not null,
  confidence numeric(5,4) not null,
  evidence_urls text[] not null
) on commit drop;

insert into _final_substance_merges values
('enoxolonebenzocainechlorhexidinedihydrochloride','chlorhexidinedihydrochloridebenzocaineenoxolone','Chlorhexidine dihydrochloride; Benzocaine; Enoxolone','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('paracetamoltramadolhydrochloride','tramadolhydrochlorideparacetamol','Tramadol hydrochloride; Paracetamol','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('valsartanamlodipinebesilate','amlodipinebesilatevalsartan','Amlodipine besilate; Valsartan','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('paracetamolibuprofen','ibuprofenparacetamol','Ibuprofen; Paracetamol','i njëjti kombinim; rend i ndryshëm përbërësish','deterministic_component_multiset',1.0000,array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']),
('lisinoprildihydratecorrespondingto20mglisinoprilhydrochlorotiazide','lisinoprildihydratecorrespondingto20mglisinoprilhydrochlorothiazide','Lisinopril dihydrate corresponding to 20 mg lisinopril; Hydrochlorothiazide','hydrochlorotiazide është typo i hydrochlorothiazide','official_product_nomenclature_review',1.0000,array['https://www.medicines.org.uk/emc/product/5502/smpc','https://www.hpra.ie/find-a-medicine/for-human-use/authorised-medicines/details/19944']),
('lisinoprildihydratecorrespondingto20mglisinoprilhydrochlorthiazide','lisinoprildihydratecorrespondingto20mglisinoprilhydrochlorothiazide','Lisinopril dihydrate corresponding to 20 mg lisinopril; Hydrochlorothiazide','hydrochlorthiazide është typo i hydrochlorothiazide','official_product_nomenclature_review',1.0000,array['https://www.medicines.org.uk/emc/product/5502/smpc','https://www.hpra.ie/find-a-medicine/for-human-use/authorised-medicines/details/19944']),
('thiaminevitamineb1riboflavinevitamineb2nicotineamidedexpanthenolpyridoxinevitamineb6','thiaminevitaminb1riboflavinvitaminb2nicotinamidedexpanthenolpyridoxinevitaminb6','Thiamine (vitamin B1); Riboflavin (vitamin B2); Nicotinamide; Dexpanthenol; Pyridoxine (vitamin B6)','vitamine/riboflavine janë variante gjuhësore; nicotineamide është typo i nicotinamide','official_product_nomenclature_review',0.9990,array['https://www.ndf.gov.sg/about-drugs/active-ingredient/m01676/','https://www.safetyandquality.gov.au/medicine-finder/biological-therapies-iv-b-dose-2-ml-injection']),
('quifenadinihydrochloride','quifenadinehydrochloride','Quifenadine hydrochloride','quifenadini është formë gjuhësore/latinizuar e quifenadine; hydrochloride i njëjtë','who_atc_nomenclature_review',0.9990,array['https://iris.who.int/bitstream/handle/10665/110353/26_4_2012.pdf?isAllowed=y&sequence=1']);

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select variant_key,canonical_key,canonical_name,reason,
       'gpt-5.6-sol+official-sources-2026-08-27',now(),review_method,confidence,evidence_urls
from _final_substance_merges
on conflict (variant_key) do nothing;

do $$
declare
  rec record;
  target_concept uuid;
  target_count integer;
begin
  for rec in
    select canonical_key,max(canonical_name) as canonical_name
    from _final_substance_merges
    group by canonical_key
  loop
    select (array_agg(distinct m.substance_concept_id))[1],
           count(distinct m.substance_concept_id)
      into target_concept,target_count
    from public.drugs d
    join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
    where d.active_substance_key=rec.canonical_key
      and coalesce(m.substance_resolution_method,'') <> 'PRODUCT_OVERRIDE';

    if target_count=0 then
      select (array_agg(distinct m.substance_concept_id))[1],
             count(distinct m.substance_concept_id)
        into target_concept,target_count
      from public.drugs d
      join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
      join public.substance_canonical c on c.variant_key=d.active_substance_key
      where c.canonical_key=rec.canonical_key
        and coalesce(m.substance_resolution_method,'') <> 'PRODUCT_OVERRIDE';
    end if;

    if target_count <> 1 or target_concept is null then
      raise exception 'Canonical target % does not resolve to exactly one non-product concept (count=%)',
        rec.canonical_key,target_count;
    end if;

    update public.medindex_drug_core_map_v1 m
       set substance_concept_id=target_concept,
           active_substance_override=rec.canonical_name,
           substance_resolution_method='VERIFIED_MAP'
      from public.drugs d
      join public.substance_canonical c on c.variant_key=d.active_substance_key
     where m.source_drug_id=d.id
       and c.canonical_key=rec.canonical_key
       and d.active_substance_key <> rec.canonical_key
       and coalesce(m.substance_resolution_method,'') <> 'PRODUCT_OVERRIDE';
  end loop;
end $$;

update public.substance_merge_candidates q
set status='approved',
    ai_verdict='same',
    ai_confidence=case when q.candidate_type='order_equivalent' then 1.0000 else 0.9990 end,
    ai_reason=case
      when q.candidate_type='order_equivalent' then 'Exact same component multiset; ingredient order is not identity.'
      else 'Reviewed against authoritative nomenclature sources; spelling/language variant only.'
    end,
    evidence_urls=case
      when q.key_a like 'lisinopril%' then array['https://www.medicines.org.uk/emc/product/5502/smpc','https://www.hpra.ie/find-a-medicine/for-human-use/authorised-medicines/details/19944']
      when q.key_a like 'quifenadin%' then array['https://iris.who.int/bitstream/handle/10665/110353/26_4_2012.pdf?isAllowed=y&sequence=1']
      when q.key_a like 'thiamine%' then array['https://www.ndf.gov.sg/about-drugs/active-ingredient/m01676/','https://www.safetyandquality.gov.au/medicine-finder/biological-therapies-iv-b-dose-2-ml-injection']
      else array['https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html']
    end,
    reviewed_by='gpt-5.6-sol+official-sources-2026-08-27',
    reviewed_at=now(),
    updated_at=now()
where q.status='pending'
  and (
    (q.key_a='chlorhexidinedihydrochloridebenzocaineenoxolone' and q.key_b='enoxolonebenzocainechlorhexidinedihydrochloride')
    or (q.key_a='paracetamoltramadolhydrochloride' and q.key_b='tramadolhydrochlorideparacetamol')
    or (q.key_a='amlodipinebesilatevalsartan' and q.key_b='valsartanamlodipinebesilate')
    or (q.key_a='ibuprofenparacetamol' and q.key_b='paracetamolibuprofen')
    or (q.key_a='lisinoprildihydratecorrespondingto20mglisinoprilhydrochlorotiazide' and q.key_b='lisinoprildihydratecorrespondingto20mglisinoprilhydrochlorthiazide')
    or (q.key_a='thiaminevitaminb1riboflavinvitaminb2nicotinamidedexpanthenolpyridoxinevitaminb6' and q.key_b='thiaminevitamineb1riboflavinevitamineb2nicotineamidedexpanthenolpyridoxinevitamineb6')
    or (q.key_a='quifenadinehydrochloride' and q.key_b='quifenadinihydrochloride')
  );

do $$
declare
  remaining_order bigint;
  remaining_fuzzy bigint;
  loops bigint;
  conflicts bigint;
begin
  select count(*) into remaining_order from public.substance_order_equivalence_candidates;
  select count(*) into remaining_fuzzy from public.substance_fuzzy_merge_candidates;
  if remaining_order <> 0 or remaining_fuzzy <> 0 then
    raise exception 'Expected reviewed candidate views to be empty; order %, fuzzy %',remaining_order,remaining_fuzzy;
  end if;

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
  select count(*) into loops from walk where cycle;
  if loops <> 0 then raise exception 'Alias cycles remain: %',loops; end if;

  select count(*) into conflicts
  from public.substance_concept_sync_conflicts c
  where c.canonical_key in (
    select distinct canonical_key from _final_substance_merges
  );
  if conflicts <> 0 then
    raise exception 'Reviewed groups still have concept conflicts: %',conflicts;
  end if;
end $$;
