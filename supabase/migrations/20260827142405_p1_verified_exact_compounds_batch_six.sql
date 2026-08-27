-- Synced from Supabase production migration history.
-- version: 20260827142405
-- name: p1_verified_exact_compounds_batch_six

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','propyphenazone'),'propyphenazone','Propyphenazone','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','mepyraminemaleate'),'mepyraminemaleate','Mepyramine maleate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','hypromellose'),'hypromellose','Hypromellose','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','policresulen'),'policresulen','Policresulen','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('propyphenazone',public.medindex_stable_uuid_v1('substance','propyphenazone'),'Propyphenazone','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.ema.europa.eu/en/medicines/psusa/psusa-00002312-202506']),
('mepyraminemaleate',public.medindex_stable_uuid_v1('substance','mepyraminemaleate'),'Mepyramine maleate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/1633/smpc']),
('hypromellose',public.medindex_stable_uuid_v1('substance','hypromellose'),'Hypromellose','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=43e690e4-b381-46e3-838c-33aef5bdadde']),
('policresulen',public.medindex_stable_uuid_v1('substance','policresulen'),'Policresulen','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.ema.europa.eu/en/medicines/veterinary/mrl/policresulen-maximum-residue-limit'])
on conflict (term_key) do update
set concept_id=excluded.concept_id,
    term=excluded.term,
    term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,
    confidence=excluded.confidence,
    review_method=excluded.review_method,
    evidence_urls=excluded.evidence_urls,
    updated_at=now();

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 319 then
    raise exception 'P1.14 verified exact compounds did not improve review coverage: %',n;
  end if;
end $$;
