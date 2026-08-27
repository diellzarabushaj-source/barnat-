-- Synced from Supabase production migration history.
-- version: 20260827133439
-- name: p1_official_component_promotions

create or replace view public.substance_canonical
with (security_invoker = true) as
with recursive resolve(variant_key,canonical_key,depth) as (
  select keys.k,keys.k,0
  from (
    select distinct active_substance_key as k
    from public.drugs
    where active_substance_key <> ''
    union
    select variant_key from public.substance_aliases
    union
    select canonical_key from public.substance_aliases
    union
    select canonical_key from public.substance_concepts_v1
  ) keys
  where keys.k is not null and keys.k <> ''
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
  select f.canonical_key,d.active_substance as name,count(*) as n,
         d.active_substance_key=f.canonical_key as is_root
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
  select distinct on (f.canonical_key) f.canonical_key,a.canonical_name
  from final f
  join public.substance_aliases a on a.variant_key=f.variant_key
  where coalesce(btrim(a.canonical_name),'') <> ''
  order by f.canonical_key,a.confidence desc nulls last,
           a.reviewed_at desc nulls last,
           length(a.canonical_name) desc,a.canonical_name
),
concept_names as (
  select canonical_key,canonical_name from public.substance_concepts_v1
)
select f.variant_key,f.canonical_key,
       coalesce(e.canonical_name,c.canonical_name,d.name,f.canonical_key) as canonical_name
from final f
left join explicit_names e on e.canonical_key=f.canonical_key
left join concept_names c on c.canonical_key=f.canonical_key
left join display d on d.canonical_key=f.canonical_key;

grant select on public.substance_canonical to anon,authenticated;

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','clavulanicacid'),'clavulanicacid','Clavulanic acid','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','neomycinsulfate'),'neomycinsulfate','Neomycin sulfate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','thiaminehydrochloride'),'thiaminehydrochloride','Thiamine hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','benzocaine'),'benzocaine','Benzocaine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','pseudoephedrinehydrochloride'),'pseudoephedrinehydrochloride','Pseudoephedrine hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','sulfamethoxazole'),'sulfamethoxazole','Sulfamethoxazole','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','trimethoprim'),'trimethoprim','Trimethoprim','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('clavulanicacid',public.medindex_stable_uuid_v1('substance','clavulanicacid'),'Clavulanic acid','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e08c1bee-14c8-4bd1-898c-1874251dadf8']),
('neomycinsulfate',public.medindex_stable_uuid_v1('substance','neomycinsulfate'),'Neomycin sulfate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=461f62b9-b9ec-43f2-aee7-0895638105b8']),
('neomycinsulphate',public.medindex_stable_uuid_v1('substance','neomycinsulfate'),'Neomycin sulphate','ALIAS',false,1.0000,'ORTHOGRAPHIC_VARIANT',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=461f62b9-b9ec-43f2-aee7-0895638105b8']),
('thiaminehydrochloride',public.medindex_stable_uuid_v1('substance','thiaminehydrochloride'),'Thiamine hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=4985bf3c-abe5-4bbb-9dcc-6de387d36d6b']),
('benzocaine',public.medindex_stable_uuid_v1('substance','benzocaine'),'Benzocaine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7fbce9a5-00dc-4a4a-8709-ab752bdf2f59']),
('benzocaina',public.medindex_stable_uuid_v1('substance','benzocaine'),'Benzocaina','ALIAS',false,0.9990,'LANGUAGE_VARIANT_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7fbce9a5-00dc-4a4a-8709-ab752bdf2f59']),
('pseudoephedrinehydrochloride',public.medindex_stable_uuid_v1('substance','pseudoephedrinehydrochloride'),'Pseudoephedrine hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0a2672f0-4e6f-48c9-8571-2d09f06253d7']),
('pseudoephedrinehcl',public.medindex_stable_uuid_v1('substance','pseudoephedrinehydrochloride'),'Pseudoephedrine HCl','ALIAS',false,1.0000,'OFFICIAL_ABBREVIATION_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0a2672f0-4e6f-48c9-8571-2d09f06253d7']),
('sulfamethoxazole',public.medindex_stable_uuid_v1('substance','sulfamethoxazole'),'Sulfamethoxazole','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f0e73842-6002-43c2-97fc-0cadc1bf6346']),
('trimethoprim',public.medindex_stable_uuid_v1('substance','trimethoprim'),'Trimethoprim','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f0e73842-6002-43c2-97fc-0cadc1bf6346'])
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
('neomycinsulphate','neomycinsulfate','Neomycin sulfate','sulphate/sulfate orthographic variant; ingredient unchanged','p1-official-component-promotion-2026-08-27',now(),'official_orthographic_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=461f62b9-b9ec-43f2-aee7-0895638105b8']),
('benzocaina','benzocaine','Benzocaine','language spelling variant of benzocaine','p1-official-component-promotion-2026-08-27',now(),'language_variant_review',0.9990,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7fbce9a5-00dc-4a4a-8709-ab752bdf2f59']),
('pseudoephedrinehcl','pseudoephedrinehydrochloride','Pseudoephedrine hydrochloride','HCl abbreviation expands to hydrochloride','p1-official-component-promotion-2026-08-27',now(),'official_abbreviation_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0a2672f0-4e6f-48c9-8571-2d09f06253d7']),
('potassiumclavulanate','clavulanatepotassium','Clavulanate potassium','same potassium salt; word order only','p1-official-component-promotion-2026-08-27',now(),'official_word_order_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e08c1bee-14c8-4bd1-898c-1874251dadf8'])
on conflict (variant_key) do nothing;

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,
       'p1-component-safety-guard-2026-08-27',now(),
       'precise_ingredient_guard',1.0000,evidence
from (values
('clavulanicacid','clavulanatepotassium','base acid and potassium salt are related but not the same precise ingredient',
 array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e08c1bee-14c8-4bd1-898c-1874251dadf8']::text[]),
('pseudoephedrinehydrochloride','ephedrinehydrochloride','different active substances; name similarity must never imply merge',
 array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0a2672f0-4e6f-48c9-8571-2d09f06253d7']::text[])
) v(a,b,reason,evidence)
on conflict (key_a,key_b) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 495 then
    raise exception 'P1.4 official concepts did not improve review coverage: %',n;
  end if;
end $$;
