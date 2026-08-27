-- Synced from Supabase production migration history.
-- version: 20260827142650
-- name: p1_precise_chlorhexidine_and_penicillin

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','chlorhexidinedihydrochloride'),'chlorhexidinedihydrochloride','Chlorhexidine dihydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','penicillingprocaine'),'penicillingprocaine','Penicillin G procaine','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('chlorhexidinedihydrochloride',public.medindex_stable_uuid_v1('substance','chlorhexidinedihydrochloride'),'Chlorhexidine dihydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/13700/smpc']),
('penicillingprocaine',public.medindex_stable_uuid_v1('substance','penicillingprocaine'),'Penicillin G procaine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=PENICILLIN+G+PROCAINE'])
on conflict (term_key) do update
set concept_id=excluded.concept_id,
    term=excluded.term,
    term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,
    confidence=excluded.confidence,
    review_method=excluded.review_method,
    evidence_urls=excluded.evidence_urls,
    updated_at=now();

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,
       'p1-component-safety-guard-2026-08-27',now(),
       'precise_ingredient_guard',1.0000,evidence
from (values
('chlorhexidinedihydrochloride','chlorhexidinegluconate','different chlorhexidine salts; no automatic merge',
 array['https://www.medicines.org.uk/emc/product/13700/smpc']::text[]),
('penicillingprocaine','penicillingbenzathine','different depot penicillin salts; no automatic merge',
 array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=PENICILLIN+G+PROCAINE']::text[])
) v(a,b,reason,evidence)
on conflict (key_a,key_b) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 309 then
    raise exception 'P1.15 precise chlorhexidine/penicillin batch did not improve review coverage: %',n;
  end if;
end $$;
