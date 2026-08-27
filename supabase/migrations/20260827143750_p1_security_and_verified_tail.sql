-- Synced from Supabase production migration history.
-- version: 20260827143750
-- name: p1_security_and_verified_tail

drop policy if exists substance_merge_candidates_deny_client
  on public.substance_merge_candidates;
create policy substance_merge_candidates_deny_client
  on public.substance_merge_candidates
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.substance_merge_candidates from anon, authenticated;

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','velpatasvir'),'velpatasvir','Velpatasvir','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','tobramycinsulfate'),'tobramycinsulfate','Tobramycin sulfate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','zincacetatedihydrate'),'zincacetatedihydrate','Zinc acetate dihydrate','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('velpatasvir',public.medindex_stable_uuid_v1('substance','velpatasvir'),'Velpatasvir','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=996466df-f236-4804-b10f-838aa83231a1']),
('tobramycinsulfate',public.medindex_stable_uuid_v1('substance','tobramycinsulfate'),'Tobramycin sulfate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=c5a005b0-7b6f-4e30-df92-9a20b1ca66a1']),
('zincacetatedihydrate',public.medindex_stable_uuid_v1('substance','zincacetatedihydrate'),'Zinc acetate dihydrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a2665090-e2dc-4cb9-8c05-95fcc058db5c']),
('articainehcl',public.medindex_stable_uuid_v1('substance','articainehydrochloride'),'Articaine HCl','ALIAS',false,1.0000,'OFFICIAL_ABBREVIATION_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=4f11bb06-c71b-4d96-9baa-2a17ad473a05']),
('vitaminc',public.medindex_stable_uuid_v1('substance','ascorbicacid'),'Vitamin C','ALIAS',false,1.0000,'OFFICIAL_SYNONYM_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d74dd994-2520-4d17-8d9d-fa06e9e8de96'])
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
('articainehcl','articainehydrochloride','Articaine hydrochloride','HCl abbreviation expands to hydrochloride','p1-security-verified-tail-2026-08-27',now(),'official_abbreviation_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=4f11bb06-c71b-4d96-9baa-2a17ad473a05']),
('vitaminc','ascorbicacid','Ascorbic acid','Vitamin C is the accepted common name for ascorbic acid','p1-security-verified-tail-2026-08-27',now(),'official_synonym_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d74dd994-2520-4d17-8d9d-fa06e9e8de96'])
on conflict (variant_key) do nothing;

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,
       'p1-component-safety-guard-2026-08-27',now(),
       'precise_ingredient_guard',1.0000,evidence
from (values
('tobramycin','tobramycinsulfate','base moiety and sulfate salt are related but not the same precise ingredient',
 array['https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=c5a005b0-7b6f-4e30-df92-9a20b1ca66a1']::text[]),
('zincacetate','zincacetatedihydrate','anhydrous/unspecified zinc acetate and explicit dihydrate should not auto-merge',
 array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a2665090-e2dc-4cb9-8c05-95fcc058db5c']::text[])
) v(a,b,reason,evidence)
on conflict (key_a,key_b) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 300 then
    raise exception 'P1.16 verified tail did not improve review coverage: %',n;
  end if;
end $$;
